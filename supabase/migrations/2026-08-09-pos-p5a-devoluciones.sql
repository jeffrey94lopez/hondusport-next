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
  monto        numeric(12,2) not null,
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
  v_item jsonb; v_reemb jsonb;
  v_origen_item documento_items%rowtype;
  v_ya_devuelto integer;
  v_cant integer;
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

  -- Validar cantidades devolvibles por linea (el origen ya está bloqueado).
  for v_item in select * from jsonb_array_elements(p->'items') loop
    select * into v_origen_item from documento_items where id = (v_item->>'origen_item_id')::uuid;
    if not found or v_origen_item.documento_id <> v_origen.id then
      raise exception using message = 'HS_DOC|línea de origen inválida';
    end if;
    v_cant := (v_item->>'cantidad')::integer;
    if v_cant <= 0 then raise exception using message = 'HS_DOC|cantidad inválida'; end if;
    select coalesce(sum(di.cantidad),0) into v_ya_devuelto
      from documento_items di join documentos dd on dd.id = di.documento_id
      where di.origen_item_id = v_origen_item.id and dd.estado <> 'anulado';
    if v_cant > v_origen_item.cantidad - v_ya_devuelto then
      raise exception using message = 'HS_DEVOLVIBLE|' || v_origen_item.descripcion;
    end if;
    v_suma_items := v_suma_items + (v_item->>'importe')::numeric;
  end loop;

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

  insert into documento_items (
    documento_id, producto_id, variante_id, descripcion, cantidad,
    precio_unitario, descuento, isv, importe, base, isv_monto, origen_item_id
  )
  select v_doc_id, nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
    it->>'descripcion', (it->>'cantidad')::integer, (it->>'precio_unitario')::numeric,
    coalesce((it->>'descuento')::numeric,0), it->>'isv',
    (it->>'importe')::numeric, (it->>'base')::numeric, coalesce((it->>'isv_monto')::numeric,0),
    (it->>'origen_item_id')::uuid
  from jsonb_array_elements(p->'items') it;

  -- Reponer stock (items con producto y stock finito). Agrupado por producto/variante.
  update producto_variantes pv set stock = pv.stock + agg.cantidad
    from (select nullif(it->>'variante_id','')::uuid as vid, sum((it->>'cantidad')::integer) as cantidad
          from jsonb_array_elements(p->'items') it where nullif(it->>'variante_id','') is not null
          group by nullif(it->>'variante_id','')::uuid) agg
    where agg.vid = pv.id and pv.stock is not null;
  update productos pr set stock = pr.stock + agg.cantidad
    from (select nullif(it->>'producto_id','')::uuid as pid, sum((it->>'cantidad')::integer) as cantidad
          from jsonb_array_elements(p->'items') it
          where nullif(it->>'producto_id','') is not null and nullif(it->>'variante_id','') is null
          group by nullif(it->>'producto_id','')::uuid) agg
    where agg.pid = pr.id and pr.stock is not null;

  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
  select nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
    'devolucion', (it->>'cantidad')::integer,
    coalesce(pv.costo, pr.costo), 'nota_credito:' || v_doc_id, nullif(p->>'usuario','')
  from jsonb_array_elements(p->'items') it
  left join producto_variantes pv on pv.id = nullif(it->>'variante_id','')::uuid
  join productos pr on pr.id = nullif(it->>'producto_id','')::uuid
  where nullif(it->>'producto_id','') is not null
    and (case when nullif(it->>'variante_id','') is not null then pv.stock else pr.stock end) is not null;

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
