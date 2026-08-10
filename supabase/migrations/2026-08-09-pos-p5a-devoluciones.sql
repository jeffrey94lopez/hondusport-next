-- POS P5a: devoluciones y notas de credito.

-- 1. Columnas de referencia al origen.
alter table documentos add column if not exists documento_origen_id uuid references documentos(id) on delete restrict;
alter table documento_items add column if not exists origen_item_id uuid references documento_items(id) on delete restrict;

-- 2. Tipos nuevos de documento (recrear el check inline por lookup).
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid='documentos'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%tipo%' and pg_get_constraintdef(oid) like '%factura%'
     and pg_get_constraintdef(oid) not like '%correlativo%';
  if v_con is not null then execute format('alter table documentos drop constraint %I', v_con); end if;
  alter table documentos add constraint documentos_tipo_chk
    check (tipo in ('factura','comprobante','nota_credito','devolucion'));
end $$;

-- 3. Correlativo: nota_credito como factura (cai+correlativo), devolucion como comprobante (numero).
alter table documentos drop constraint if exists documentos_correlativo_chk;
alter table documentos add constraint documentos_correlativo_chk check (
  (tipo in ('factura','nota_credito') and correlativo is not null and cai_id is not null and numero_comprobante is null)
  or (tipo in ('comprobante','devolucion') and correlativo is null and cai_id is null and numero_comprobante is not null)
);

create sequence if not exists devolucion_numero_seq;

insert into configuracion (key, value) values ('devoluciones_sin_efectivo', 'false')
on conflict (key) do nothing;

-- 4. Reembolsos de una devolucion (efectivo/saldo_favor/cxc).
create table if not exists nota_credito_reembolsos (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  tipo         text not null check (tipo in ('efectivo','saldo_favor','cxc')),
  metodo_id    uuid references metodos_pago(id) on delete restrict,
  monto        numeric(12,2) not null check (monto > 0)
);
create index if not exists ncr_documento_idx on nota_credito_reembolsos (documento_id);

-- 5. Saldo a favor (ledger). En P5a solo se acumula (monto > 0, tipo 'devolucion').
create table if not exists saldo_favor_movimientos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete restrict,
  monto        numeric(12,2) not null check (monto > 0),
  tipo         text not null check (tipo in ('devolucion')),
  documento_id uuid references documentos(id) on delete set null,
  notas        text,
  usuario      text,
  created_at   timestamptz default now()
);
create index if not exists sfm_cliente_idx on saldo_favor_movimientos (cliente_id);
create or replace view saldo_favor_clientes as
  select cliente_id, sum(monto) as saldo from saldo_favor_movimientos group by cliente_id;
grant select on saldo_favor_clientes to authenticated;

-- 6. documento_saldos (P4c) extendida: resta las devoluciones aplicadas a CxC.
create or replace view documento_saldos as
select
  d.id as documento_id, d.cliente_id, cl.nombre as cliente_nombre,
  d.tipo, d.correlativo, d.numero_comprobante, d.created_at::date as fecha,
  (d.created_at::date + (coalesce(cl.dias_credito,0) || ' days')::interval)::date as fecha_vencimiento,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) as credito_total,
  coalesce(max(ca.cobrado), 0) as cobrado,
  coalesce(max(ncx.nc_cxc), 0) as nc_cxc,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0)
    - coalesce(max(ca.cobrado), 0) - coalesce(max(ncx.nc_cxc), 0) as saldo
from documentos d
join clientes cl on cl.id = d.cliente_id
join documento_pagos dp on dp.documento_id = d.id
join metodos_pago m on m.id = dp.metodo_id
left join (select documento_id, sum(monto) as cobrado from cobro_aplicaciones group by documento_id) ca
  on ca.documento_id = d.id
left join (
  select doc.documento_origen_id, sum(ncr.monto) as nc_cxc
  from documentos doc
  join nota_credito_reembolsos ncr on ncr.documento_id = doc.id
  where doc.estado <> 'anulado' and ncr.tipo = 'cxc'
  group by doc.documento_origen_id
) ncx on ncx.documento_origen_id = d.id
where d.estado <> 'anulado' and d.tipo in ('factura','comprobante')
group by d.id, cl.nombre, cl.dias_credito, ca.cobrado, ncx.nc_cxc
having coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) > 0;
grant select on documento_saldos to authenticated;

-- 7. RPC atomica: emitir nota de credito / devolucion.
create or replace function emitir_nota_credito(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_origen documentos%rowtype;
  v_caja cajas%rowtype;
  v_sesion_id uuid;
  v_tipo text;
  v_cai cai_autorizaciones%rowtype;
  v_correlativo text; v_numero integer;
  v_total numeric := (p->'totales'->>'total')::numeric;
  v_suma_items numeric := 0;
  v_suma_reemb numeric := 0;
  v_doc_id uuid;
  v_item record; v_reemb jsonb;
  v_origen_item documento_items%rowtype;
  v_ya_devuelto integer;
  v_sin_efectivo boolean;
  v_saldo_cxc numeric;
  v_cxc_reemb numeric := 0;
begin
  -- Origen bloqueado: serializa devoluciones concurrentes.
  select * into v_origen from documentos where id = (p->>'documento_origen_id')::uuid for update;
  if not found then raise exception using message = 'HS_DOC|documento origen no encontrado'; end if;
  if v_origen.estado <> 'emitido' then raise exception using message = 'HS_DOC|el documento origen no está emitido'; end if;
  if v_origen.tipo not in ('factura','comprobante') then raise exception using message = 'HS_DOC|el origen no admite devolución'; end if;
  if coalesce(trim(p->>'motivo'),'') = '' then raise exception using message = 'HS_DOC|motivo requerido'; end if;

  select * into v_caja from cajas where id = (p->>'caja_id')::uuid and activo = true;
  if not found then raise exception using message = 'HS_CAJA|caja no encontrada'; end if;
  select s.id into v_sesion_id from sesiones_caja s where s.caja_id = v_caja.id and s.estado = 'abierta';
  if not found then raise exception using message = 'HS_CAJA|' || v_caja.nombre; end if;

  v_tipo := case when v_origen.tipo = 'factura' then 'nota_credito' else 'devolucion' end;

  -- Validar cantidades devolvibles por linea (agrupado por origen_item_id: una
  -- misma linea de origen repetida en el payload no debe poder burlar el limite
  -- devolvible). El origen ya está bloqueado.
  for v_item in
    select (e->>'origen_item_id')::uuid as oiid, sum((e->>'cantidad')::integer) as cant
    from jsonb_array_elements(p->'items') e group by (e->>'origen_item_id')::uuid
  loop
    select * into v_origen_item from documento_items where id = v_item.oiid;
    if not found or v_origen_item.documento_id <> v_origen.id then
      raise exception using message = 'HS_DOC|línea de origen inválida';
    end if;
    if v_item.cant <= 0 then raise exception using message = 'HS_DOC|cantidad inválida'; end if;
    select coalesce(sum(di.cantidad),0) into v_ya_devuelto
      from documento_items di join documentos dd on dd.id = di.documento_id
      where di.origen_item_id = v_origen_item.id and dd.estado <> 'anulado';
    if v_item.cant > v_origen_item.cantidad - v_ya_devuelto then
      raise exception using message = 'HS_DEVOLVIBLE|' || v_origen_item.descripcion;
    end if;
  end loop;

  select coalesce(sum((it->>'importe')::numeric), 0) into v_suma_items
    from jsonb_array_elements(p->'items') it;

  if abs(v_suma_items - v_total) > 0.01 then raise exception using message = 'HS_TOTAL'; end if;

  -- Correlativo.
  if v_tipo = 'nota_credito' then
    select * into v_cai from cai_autorizaciones c
      where c.activo = true and c.punto_emision = v_caja.punto_emision and c.tipo_documento = '03'
      for update;
    if not found then raise exception using message = 'HS_CAI|sin_cai|' || v_caja.punto_emision; end if;
    if v_cai.fecha_limite < current_date then raise exception using message = 'HS_CAI|vencido|' || v_cai.fecha_limite; end if;
    if v_cai.correlativo_actual >= v_cai.rango_hasta then raise exception using message = 'HS_CAI|agotado|' || v_cai.rango_hasta; end if;
    update cai_autorizaciones set correlativo_actual = correlativo_actual + 1 where id = v_cai.id
      returning correlativo_actual into v_cai.correlativo_actual;
    v_correlativo := v_cai.establecimiento || '-' || v_cai.punto_emision || '-' || v_cai.tipo_documento
      || '-' || lpad(v_cai.correlativo_actual::text, 8, '0');
  else
    v_numero := nextval('devolucion_numero_seq');
  end if;

  -- Documento de devolucion (cliente heredado del origen).
  insert into documentos (
    tipo, correlativo, numero_comprobante, cai_id, caja_id, sesion_id, vendedor_id,
    cliente_id, cliente_nombre, cliente_rtn, cliente_identidad,
    exonerado, orden_compra_exenta, constancia_exonerado, registro_sag,
    documento_origen_id, total_exento, total_exonerado, total_gravado15, total_gravado18,
    isv15, isv18, descuento_total, total, total_letras, tasa_usd, notas, usuario
  ) values (
    v_tipo, v_correlativo, v_numero,
    case when v_tipo = 'nota_credito' then v_cai.id end,
    v_caja.id, v_sesion_id, v_origen.vendedor_id,
    v_origen.cliente_id, v_origen.cliente_nombre, v_origen.cliente_rtn, v_origen.cliente_identidad,
    v_origen.exonerado, v_origen.orden_compra_exenta, v_origen.constancia_exonerado, v_origen.registro_sag,
    v_origen.id,
    (p->'totales'->>'total_exento')::numeric, (p->'totales'->>'total_exonerado')::numeric,
    (p->'totales'->>'total_gravado15')::numeric, (p->'totales'->>'total_gravado18')::numeric,
    (p->'totales'->>'isv15')::numeric, (p->'totales'->>'isv18')::numeric,
    (p->'totales'->>'descuento_total')::numeric, v_total,
    p->'totales'->>'total_letras', v_origen.tasa_usd, nullif(p->>'motivo',''), nullif(p->>'usuario','')
  ) returning id into v_doc_id;

  -- producto_id/variante_id/descripcion se derivan SIEMPRE de la linea de origen
  -- (oi), no del payload: el cliente no puede reasignar la devolucion a otro
  -- producto/variante enviando un producto_id/variante_id distinto en el payload.
  insert into documento_items (
    documento_id, producto_id, variante_id, descripcion, cantidad,
    precio_unitario, descuento, isv, importe, base, isv_monto, origen_item_id
  )
  select v_doc_id, oi.producto_id, oi.variante_id,
    oi.descripcion, (it->>'cantidad')::integer, (it->>'precio_unitario')::numeric,
    coalesce((it->>'descuento')::numeric,0), it->>'isv',
    (it->>'importe')::numeric, (it->>'base')::numeric, coalesce((it->>'isv_monto')::numeric,0),
    oi.id
  from jsonb_array_elements(p->'items') it
  join documento_items oi on oi.id = (it->>'origen_item_id')::uuid;

  -- Reponer stock (items con producto y stock finito). Agrupado por producto/variante,
  -- derivados de la linea de origen (oi), no del payload.
  update producto_variantes pv set stock = pv.stock + agg.cantidad
    from (select oi.variante_id as vid, sum((it->>'cantidad')::integer) as cantidad
          from jsonb_array_elements(p->'items') it
          join documento_items oi on oi.id = (it->>'origen_item_id')::uuid
          where oi.variante_id is not null
          group by oi.variante_id) agg
    where agg.vid = pv.id and pv.stock is not null;
  update productos pr set stock = pr.stock + agg.cantidad
    from (select oi.producto_id as pid, sum((it->>'cantidad')::integer) as cantidad
          from jsonb_array_elements(p->'items') it
          join documento_items oi on oi.id = (it->>'origen_item_id')::uuid
          where oi.producto_id is not null and oi.variante_id is null
          group by oi.producto_id) agg
    where agg.pid = pr.id and pr.stock is not null;

  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
  select oi.producto_id, oi.variante_id,
    'devolucion', (it->>'cantidad')::integer,
    coalesce(pv.costo, pr.costo), 'nota_credito:' || v_doc_id, nullif(p->>'usuario','')
  from jsonb_array_elements(p->'items') it
  join documento_items oi on oi.id = (it->>'origen_item_id')::uuid
  left join producto_variantes pv on pv.id = oi.variante_id
  join productos pr on pr.id = oi.producto_id
  where oi.producto_id is not null
    and (case when oi.variante_id is not null then pv.stock else pr.stock end) is not null;

  -- Reembolsos.
  select value::boolean into v_sin_efectivo from configuracion where key = 'devoluciones_sin_efectivo';
  v_sin_efectivo := coalesce(v_sin_efectivo, false);
  select coalesce(saldo,0) into v_saldo_cxc from documento_saldos where documento_id = v_origen.id;
  v_saldo_cxc := coalesce(v_saldo_cxc, 0);

  for v_reemb in select * from jsonb_array_elements(coalesce(p->'reembolsos','[]'::jsonb)) loop
    if (v_reemb->>'monto')::numeric <= 0 then raise exception using message = 'HS_REEMB|monto inválido'; end if;
    if (v_reemb->>'tipo') = 'efectivo' and v_sin_efectivo then
      raise exception using message = 'HS_REEMB|efectivo deshabilitado';
    end if;
    if (v_reemb->>'tipo') = 'saldo_favor' and v_origen.cliente_id is null then
      raise exception using message = 'HS_REEMB|saldo a favor requiere cliente';
    end if;
    if (v_reemb->>'tipo') = 'cxc' then
      v_cxc_reemb := v_cxc_reemb + (v_reemb->>'monto')::numeric;
    end if;
    v_suma_reemb := v_suma_reemb + (v_reemb->>'monto')::numeric;

    insert into nota_credito_reembolsos (documento_id, tipo, metodo_id, monto)
    values (v_doc_id, v_reemb->>'tipo', nullif(v_reemb->>'metodo_id','')::uuid, (v_reemb->>'monto')::numeric);

    if (v_reemb->>'tipo') = 'saldo_favor' then
      insert into saldo_favor_movimientos (cliente_id, monto, tipo, documento_id, usuario)
      values (v_origen.cliente_id, (v_reemb->>'monto')::numeric, 'devolucion', v_doc_id, nullif(p->>'usuario',''));
    end if;
  end loop;

  if abs(v_suma_reemb - v_total) > 0.01 then raise exception using message = 'HS_REEMB|no coincide con el total'; end if;
  if v_cxc_reemb > v_saldo_cxc + 0.01 then raise exception using message = 'HS_REEMB|excede el saldo de CxC'; end if;

  return v_doc_id;
end; $$;
revoke all on function emitir_nota_credito(jsonb) from public, anon;
grant execute on function emitir_nota_credito(jsonb) to authenticated;

alter table nota_credito_reembolsos enable row level security;
alter table saldo_favor_movimientos enable row level security;
do $$ begin
  create policy ncr_admin on nota_credito_reembolsos for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy sfm_admin on saldo_favor_movimientos for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

-- 8. Fix de integración cross-task (review final de rama):
--
-- C1 (crítico): `anular_comprobante` (2026-08-07-pos-p2-rpcs.sql) repone la
-- cantidad ORIGINAL completa de documento_items. P5a permite devolver
-- PARCIALMENTE un comprobante dejándolo estado='emitido' (la reposición de la
-- devolución ya movió la porción devuelta); anularlo después repondría esa
-- porción una segunda vez (doble conteo de stock + kardex corrupto). Se
-- re-crea COMPLETA (mismo cuerpo vigente) agregando solo un guard al inicio.
create or replace function anular_comprobante(p_documento_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_doc documentos%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception using message = 'HS_DOC|motivo requerido';
  end if;
  select * into v_doc from documentos where id = p_documento_id for update;
  if not found then raise exception using message = 'HS_DOC|documento no encontrado'; end if;
  if v_doc.tipo <> 'comprobante' then
    raise exception using message = 'HS_DOC|solo los comprobantes se anulan (facturas: nota de crédito)';
  end if;
  if v_doc.estado <> 'emitido' then
    raise exception using message = 'HS_DOC|ya está anulado';
  end if;

  -- [P5a] Guard: si existe alguna devolución/nota de crédito NO anulada con
  -- documento_origen_id = este comprobante, no se puede anular (ver C1 arriba).
  perform 1 from documentos dv where dv.documento_origen_id = v_doc.id and dv.estado <> 'anulado';
  if found then
    raise exception using message = 'HS_DOC|el comprobante tiene devoluciones registradas';
  end if;

  -- Reponer stock solo si el documento descontó (mostrador, no pedido web).
  -- Se agrega por producto/variante ANTES del update: un UPDATE ... FROM con
  -- varias filas coincidentes por fila objetivo solo aplica una de ellas
  -- (semántica de Postgres), así que dos líneas del mismo producto/variante
  -- repondrían solo una si se hiciera el join directo contra documento_items.
  if v_doc.pedido_id is null then
    update producto_variantes pv
      set stock = pv.stock + agg.cantidad
      from (
        select variante_id, sum(cantidad) as cantidad
        from documento_items
        where documento_id = v_doc.id and variante_id is not null
        group by variante_id
      ) agg
      where agg.variante_id = pv.id and pv.stock is not null;
    update productos pr
      set stock = pr.stock + agg.cantidad
      from (
        select producto_id, sum(cantidad) as cantidad
        from documento_items
        where documento_id = v_doc.id and variante_id is null and producto_id is not null
        group by producto_id
      ) agg
      where agg.producto_id = pr.id and pr.stock is not null;

    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
    select di.producto_id, di.variante_id, 'devolucion', di.cantidad,
      coalesce(pv.costo, pr.costo), 'documento:' || v_doc.id
    from documento_items di
    left join producto_variantes pv on pv.id = di.variante_id
    left join productos pr on pr.id = di.producto_id
    where di.documento_id = v_doc.id and di.producto_id is not null
      and (case when di.variante_id is not null then pv.stock else pr.stock end) is not null;
  end if;

  update documentos set estado = 'anulado', anulado_motivo = trim(p_motivo), anulado_at = now()
    where id = v_doc.id;
end;
$$;
grant execute on function anular_comprobante(uuid, text) to authenticated;
revoke execute on function anular_comprobante(uuid, text) from public, anon;

-- I1 (importante): P5a redefinió documento_saldos.saldo = credito_total −
-- cobrado − nc_cxc (punto 6), pero `registrar_cobro` (2026-08-09-pos-p4c-
-- cuentas-por-cobrar.sql) validaba el techo del cobro por documento con
-- v_saldo := v_credito − v_cobrado, sin nc_cxc. Se re-crea COMPLETA (mismo
-- cuerpo vigente) restando también las devoluciones cxc no anuladas del
-- documento antes de validar r.monto > v_saldo.
create or replace function registrar_cobro(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_cli uuid := (p->>'cliente_id')::uuid;
  v_fecha date := coalesce((p->>'fecha')::date, current_date);
  v_metodo text := p->>'metodo';
  v_ref text := p->>'referencia';
  v_notas text := p->>'notas';
  v_sesion uuid := nullif(p->>'sesion_id','')::uuid;
  v_usuario text := p->>'usuario';
  r record;
  v_cli_doc uuid; v_estado text; v_credito numeric; v_cobrado numeric; v_saldo numeric;
  v_nc_cxc numeric;
  v_suma numeric := 0; v_cobro_id uuid; v_numero text;
begin
  if v_cli is null then raise exception 'Falta el cliente'; end if;
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then
    raise exception 'El cobro no tiene aplicaciones';
  end if;

  for r in
    select (e->>'documento_id')::uuid as documento_id, sum((e->>'monto')::numeric) as monto
    from jsonb_array_elements(p->'aplicaciones') e
    group by (e->>'documento_id')::uuid
    order by (e->>'documento_id')::uuid
  loop
    if r.monto is null or r.monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;
    select cliente_id, estado into v_cli_doc, v_estado from documentos where id = r.documento_id for update;
    if not found then raise exception 'Documento no encontrado'; end if;
    if v_cli_doc <> v_cli then raise exception 'El documento no pertenece al cliente'; end if;
    if v_estado = 'anulado' then raise exception 'El documento esta anulado'; end if;

    select coalesce(sum(dp.monto) filter (where m.tipo = 'credito'),0)
      into v_credito
      from documento_pagos dp join metodos_pago m on m.id = dp.metodo_id
      where dp.documento_id = r.documento_id;
    if v_credito <= 0 then raise exception 'El documento no tiene credito por cobrar'; end if;
    select coalesce(sum(monto),0) into v_cobrado from cobro_aplicaciones where documento_id = r.documento_id;
    -- [P5a] documento_saldos.saldo también resta nc_cxc (devoluciones
    -- acreditadas a la cuenta por cobrar del documento); el techo de
    -- validación debe reflejar el mismo saldo, o un cobro podría exceder lo
    -- realmente pendiente tras una devolución parcial.
    select coalesce(sum(ncr.monto),0) into v_nc_cxc
      from documentos doc join nota_credito_reembolsos ncr on ncr.documento_id = doc.id
      where doc.documento_origen_id = r.documento_id and doc.estado <> 'anulado' and ncr.tipo = 'cxc';
    v_saldo := v_credito - v_cobrado - v_nc_cxc;
    if r.monto > v_saldo then raise exception 'El cobro excede el saldo del documento'; end if;
    v_suma := v_suma + r.monto;
  end loop;

  v_numero := 'COBRO-' || lpad(nextval('cobro_numero_seq')::text, 8, '0');
  insert into cobros (numero, cliente_id, fecha, monto, metodo, referencia, notas, sesion_id, usuario)
  values (v_numero, v_cli, v_fecha, v_suma, v_metodo, v_ref, v_notas, v_sesion, v_usuario)
  returning id into v_cobro_id;

  insert into cobro_aplicaciones (cobro_id, documento_id, monto)
  select v_cobro_id, (e->>'documento_id')::uuid, sum((e->>'monto')::numeric)
  from jsonb_array_elements(p->'aplicaciones') e
  group by (e->>'documento_id')::uuid;

  return v_cobro_id;
end; $$;
revoke all on function registrar_cobro(jsonb) from public, anon;
grant execute on function registrar_cobro(jsonb) to authenticated;
