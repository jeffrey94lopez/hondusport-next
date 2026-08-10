-- POS P5b: gasto del saldo a favor.

-- 1. Ledger con signo: abrir monto a negativos y agregar tipos venta/cobro.
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid='saldo_favor_movimientos'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%monto%';
  if v_con is not null then execute format('alter table saldo_favor_movimientos drop constraint %I', v_con); end if;
  alter table saldo_favor_movimientos add constraint saldo_favor_movimientos_monto_chk check (monto <> 0);

  select conname into v_con from pg_constraint
   where conrelid='saldo_favor_movimientos'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table saldo_favor_movimientos drop constraint %I', v_con); end if;
  alter table saldo_favor_movimientos add constraint saldo_favor_movimientos_tipo_chk
    check (tipo in ('devolucion','venta','cobro'));
end $$;

alter table saldo_favor_movimientos add column if not exists cobro_id uuid references cobros(id) on delete set null;

-- 2. Metodo de pago 'saldo_favor'.
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint where conrelid='metodos_pago'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table metodos_pago drop constraint %I', v_con); end if;
  alter table metodos_pago add constraint metodos_pago_tipo_chk
    check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro','credito','saldo_favor'));
end $$;
insert into metodos_pago (nombre, tipo, activo, orden)
select 'Saldo a favor', 'saldo_favor', true, 95
where not exists (select 1 from metodos_pago where tipo = 'saldo_favor');

-- 3. cobros.metodo acepta 'saldo_favor' (abono a CxC desde el saldo).
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint where conrelid='cobros'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%metodo%';
  if v_con is not null then execute format('alter table cobros drop constraint %I', v_con); end if;
  alter table cobros add constraint cobros_metodo_chk
    check (metodo in ('efectivo','transferencia','tarjeta','cheque','otro','saldo_favor'));
end $$;

-- 4. aplicar_saldo_favor_cxc: abona saldo a favor a la deuda, atomico.
create or replace function aplicar_saldo_favor_cxc(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_cli uuid := (p->>'cliente_id')::uuid;
  v_usuario text := p->>'usuario'; v_notas text := p->>'notas';
  r record; v_cli_doc uuid; v_estado text; v_credito numeric; v_cobrado numeric; v_nc_cxc numeric; v_saldo numeric;
  v_suma numeric := 0; v_balance numeric; v_cobro_id uuid; v_numero text;
begin
  if v_cli is null then raise exception 'Falta el cliente'; end if;
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then raise exception 'No hay aplicaciones'; end if;
  perform 1 from clientes where id = v_cli for update;  -- serializa gastos del saldo del cliente

  for r in
    select (e->>'documento_id')::uuid as documento_id, sum((e->>'monto')::numeric) as monto
    from jsonb_array_elements(p->'aplicaciones') e
    group by (e->>'documento_id')::uuid order by (e->>'documento_id')::uuid
  loop
    if r.monto is null or r.monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;
    select cliente_id, estado into v_cli_doc, v_estado from documentos where id = r.documento_id for update;
    if not found then raise exception 'Documento no encontrado'; end if;
    if v_cli_doc <> v_cli then raise exception 'El documento no pertenece al cliente'; end if;
    if v_estado = 'anulado' then raise exception 'El documento esta anulado'; end if;
    select coalesce(sum(dp.monto) filter (where m.tipo = 'credito'),0) into v_credito
      from documento_pagos dp join metodos_pago m on m.id = dp.metodo_id where dp.documento_id = r.documento_id;
    if v_credito <= 0 then raise exception 'El documento no tiene credito por cobrar'; end if;
    select coalesce(sum(monto),0) into v_cobrado from cobro_aplicaciones where documento_id = r.documento_id;
    select coalesce(sum(ncr.monto),0) into v_nc_cxc
      from documentos doc join nota_credito_reembolsos ncr on ncr.documento_id = doc.id
      where doc.documento_origen_id = r.documento_id and doc.estado <> 'anulado' and ncr.tipo = 'cxc';
    v_saldo := v_credito - v_cobrado - v_nc_cxc;
    if r.monto > v_saldo then raise exception 'El cobro excede el saldo del documento'; end if;
    v_suma := v_suma + r.monto;
  end loop;

  select coalesce(sum(monto),0) into v_balance from saldo_favor_movimientos where cliente_id = v_cli;
  if v_suma > v_balance + 0.01 then raise exception using message = 'HS_SALDO|insuficiente'; end if;

  v_numero := 'COBRO-' || lpad(nextval('cobro_numero_seq')::text, 8, '0');
  insert into cobros (numero, cliente_id, fecha, monto, metodo, referencia, notas, sesion_id, usuario)
  values (v_numero, v_cli, current_date, v_suma, 'saldo_favor', null, v_notas, null, v_usuario)
  returning id into v_cobro_id;

  insert into cobro_aplicaciones (cobro_id, documento_id, monto)
  select v_cobro_id, (e->>'documento_id')::uuid, sum((e->>'monto')::numeric)
  from jsonb_array_elements(p->'aplicaciones') e group by (e->>'documento_id')::uuid;

  insert into saldo_favor_movimientos (cliente_id, monto, tipo, cobro_id, usuario)
  values (v_cli, -v_suma, 'cobro', v_cobro_id, v_usuario);

  return v_cobro_id;
end; $$;
revoke all on function aplicar_saldo_favor_cxc(jsonb) from public, anon;
grant execute on function aplicar_saldo_favor_cxc(jsonb) to authenticated;

-- 5. emitir_documento: re-crear COMPLETA con el descuento del saldo a favor.
-- Cuerpo vigente copiado de supabase/migrations/2026-08-07-pos-p2-rpcs.sql,
-- + 3 variables nuevas en el declare + el bloque de descuento de saldo antes
-- de `return v_doc_id;`. Nada mas del cuerpo cambia.
create or replace function emitir_documento(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo text := p->>'tipo';
  v_caja cajas%rowtype;
  v_sesion_id uuid;
  v_pedido_id uuid := nullif(p->>'pedido_id','')::uuid;
  v_cai cai_autorizaciones%rowtype;
  v_correlativo text;
  v_numero_comp integer;
  v_doc_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_variante_id uuid;
  v_cantidad integer;
  v_stock integer;
  v_activo boolean;
  v_canal text;
  v_nombre_prod text;
  v_nombre_var text;
  v_tiene_variantes boolean;
  v_suma_items numeric := 0;
  v_suma_pagos numeric := 0;
  v_total numeric := (p->'totales'->>'total')::numeric;
  v_saldo_favor numeric;
  v_balance_sf numeric;
  v_cli_sf uuid;
begin
  if v_tipo not in ('factura','comprobante') then
    raise exception using message = 'HS_DOC|tipo inválido';
  end if;

  select * into v_caja from cajas where id = (p->>'caja_id')::uuid and activo = true;
  if not found then raise exception using message = 'HS_CAJA|caja no encontrada'; end if;

  -- Venta de mostrador exige sesión abierta y pagos que cubran el total.
  if v_pedido_id is null then
    select s.id into v_sesion_id from sesiones_caja s
      where s.caja_id = v_caja.id and s.estado = 'abierta';
    if not found then raise exception using message = 'HS_CAJA|' || v_caja.nombre; end if;
    select coalesce(sum((pg->>'monto')::numeric), 0) into v_suma_pagos
      from jsonb_array_elements(coalesce(p->'pagos','[]'::jsonb)) pg;
    if v_suma_pagos < v_total - 0.01 then
      raise exception using message = 'HS_TOTAL';
    end if;
  else
    -- Pedido web: existe, no cancelado, sin documento vigente.
    perform 1 from pedidos where id = v_pedido_id and estado <> 'cancelado';
    if not found then raise exception using message = 'HS_PEDIDO|' || v_pedido_id; end if;
    perform 1 from documentos d where d.pedido_id = v_pedido_id and d.estado = 'emitido';
    if found then
      raise exception using message = 'HS_PEDIDO_DOC|' ||
        (select numero::text from pedidos where id = v_pedido_id);
    end if;
  end if;

  -- Re-verificación de totales (defensa: la suma de importes debe cuadrar).
  select coalesce(sum((it->>'importe')::numeric), 0) into v_suma_items
    from jsonb_array_elements(p->'items') it;
  if abs(v_suma_items - v_total) > 0.01 then
    raise exception using message = 'HS_TOTAL';
  end if;

  -- Correlativo fiscal o número de comprobante.
  if v_tipo = 'factura' then
    select * into v_cai from cai_autorizaciones c
      where c.activo = true and c.punto_emision = v_caja.punto_emision
        and c.tipo_documento = '01'
      for update;
    if not found then raise exception using message = 'HS_CAI|sin_cai|' || v_caja.punto_emision; end if;
    if v_cai.fecha_limite < current_date then
      raise exception using message = 'HS_CAI|vencido|' || v_cai.fecha_limite;
    end if;
    if v_cai.correlativo_actual >= v_cai.rango_hasta then
      raise exception using message = 'HS_CAI|agotado|' || v_cai.rango_hasta;
    end if;
    update cai_autorizaciones set correlativo_actual = correlativo_actual + 1
      where id = v_cai.id
      returning correlativo_actual into v_cai.correlativo_actual;
    v_correlativo := v_cai.establecimiento || '-' || v_cai.punto_emision || '-' ||
                     v_cai.tipo_documento || '-' || lpad(v_cai.correlativo_actual::text, 8, '0');
  else
    v_numero_comp := nextval('comprobante_numero_seq');
  end if;

  -- Stock (solo mostrador; ítems libres producto_id null no tocan stock).
  if v_pedido_id is null then
    for v_item in select * from jsonb_array_elements(p->'items') loop
      v_producto_id := nullif(v_item->>'producto_id','')::uuid;
      v_variante_id := nullif(v_item->>'variante_id','')::uuid;
      v_cantidad    := (v_item->>'cantidad')::integer;
      if v_producto_id is null then continue; end if;

      select pr.activo, pr.canal, pr.nombre into v_activo, v_canal, v_nombre_prod
        from productos pr where pr.id = v_producto_id;
      if not found or not v_activo or v_canal = 'tienda' then
        raise exception using message = 'HS_INACTIVO|' || coalesce(v_nombre_prod, 'producto');
      end if;

      if v_variante_id is not null then
        select pv.stock, pv.nombre into v_stock, v_nombre_var
          from producto_variantes pv
          where pv.id = v_variante_id and pv.producto_id = v_producto_id and pv.activo = true
          for update;
        if not found then raise exception using message = 'HS_VARIANTE|' || v_nombre_prod; end if;
        if v_stock is not null then
          if v_stock < v_cantidad then
            raise exception using message = 'HS_STOCK|' || v_nombre_prod || ' (' || v_nombre_var || ')|' || v_stock;
          end if;
          update producto_variantes set stock = stock - v_cantidad
            where producto_variantes.id = v_variante_id;
        end if;
      else
        select exists(select 1 from producto_variantes pv
          where pv.producto_id = v_producto_id and pv.activo = true) into v_tiene_variantes;
        if v_tiene_variantes then
          raise exception using message = 'HS_REQUIERE_VARIANTE|' || v_nombre_prod;
        end if;
        select pr.stock into v_stock from productos pr where pr.id = v_producto_id for update;
        if v_stock is not null then
          if v_stock < v_cantidad then
            raise exception using message = 'HS_STOCK|' || v_nombre_prod || '|' || v_stock;
          end if;
          update productos set stock = stock - v_cantidad where productos.id = v_producto_id;
        end if;
      end if;
    end loop;
  end if;

  begin
    insert into documentos (
      tipo, correlativo, numero_comprobante, cai_id, caja_id, sesion_id, vendedor_id,
      cliente_id, cliente_nombre, cliente_rtn, cliente_identidad,
      exonerado, orden_compra_exenta, constancia_exonerado, registro_sag,
      pedido_id, total_exento, total_exonerado, total_gravado15, total_gravado18,
      isv15, isv18, descuento_total, total, total_letras, tasa_usd, notas, usuario
    ) values (
      v_tipo, v_correlativo, v_numero_comp,
      case when v_tipo = 'factura' then v_cai.id end,
      v_caja.id, v_sesion_id, nullif(p->>'vendedor_id','')::uuid,
      nullif(p->>'cliente_id','')::uuid,
      coalesce(nullif(p->>'cliente_nombre',''), 'CONSUMIDOR FINAL'),
      nullif(p->>'cliente_rtn',''), nullif(p->>'cliente_identidad',''),
      coalesce((p->>'exonerado')::boolean, false),
      nullif(p->>'orden_compra_exenta',''), nullif(p->>'constancia_exonerado',''),
      nullif(p->>'registro_sag',''), v_pedido_id,
      (p->'totales'->>'total_exento')::numeric, (p->'totales'->>'total_exonerado')::numeric,
      (p->'totales'->>'total_gravado15')::numeric, (p->'totales'->>'total_gravado18')::numeric,
      (p->'totales'->>'isv15')::numeric, (p->'totales'->>'isv18')::numeric,
      (p->'totales'->>'descuento_total')::numeric, v_total,
      p->'totales'->>'total_letras', nullif(p->>'tasa_usd','')::numeric,
      nullif(p->>'notas',''), nullif(p->>'usuario','')
    ) returning id into v_doc_id;
  exception when unique_violation then
    if v_pedido_id is not null then
      raise exception using message = 'HS_PEDIDO_DOC|' ||
        (select numero::text from pedidos where id = v_pedido_id);
    end if;
    raise;
  end;

  insert into documento_items (
    documento_id, producto_id, variante_id, descripcion, cantidad,
    precio_unitario, descuento, isv, importe, base, isv_monto
  )
  select v_doc_id, nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
    it->>'descripcion', (it->>'cantidad')::integer, (it->>'precio_unitario')::numeric,
    coalesce((it->>'descuento')::numeric, 0), it->>'isv',
    (it->>'importe')::numeric, (it->>'base')::numeric, coalesce((it->>'isv_monto')::numeric, 0)
  from jsonb_array_elements(p->'items') it;

  insert into documento_pagos (documento_id, metodo_id, monto, monto_usd, tasa, referencia)
  select v_doc_id, (pg->>'metodo_id')::uuid, (pg->>'monto')::numeric,
    nullif(pg->>'monto_usd','')::numeric, nullif(pg->>'tasa','')::numeric,
    nullif(pg->>'referencia','')
  from jsonb_array_elements(coalesce(p->'pagos','[]'::jsonb)) pg;

  -- Kardex venta_pos (solo mostrador, solo items con producto y stock finito).
  if v_pedido_id is null then
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
    select nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
      'venta_pos', -(it->>'cantidad')::integer,
      coalesce(pv.costo, pr.costo), 'documento:' || v_doc_id, nullif(p->>'usuario','')
    from jsonb_array_elements(p->'items') it
    left join producto_variantes pv on pv.id = nullif(it->>'variante_id','')::uuid
    join productos pr on pr.id = nullif(it->>'producto_id','')::uuid
    where nullif(it->>'producto_id','') is not null
      and (case when nullif(it->>'variante_id','') is not null then pv.stock else pr.stock end) is not null;
  end if;

  -- [P5b] Descuento del saldo a favor pagado en esta venta.
  v_cli_sf := nullif(p->>'cliente_id','')::uuid;
  select coalesce(sum((pg->>'monto')::numeric),0) into v_saldo_favor
    from jsonb_array_elements(coalesce(p->'pagos','[]'::jsonb)) pg
    join metodos_pago m on m.id = (pg->>'metodo_id')::uuid
    where m.tipo = 'saldo_favor';
  if v_saldo_favor > 0 then
    if v_cli_sf is null then raise exception using message = 'HS_SALDO|requiere cliente'; end if;
    if v_saldo_favor > v_total + 0.01 then raise exception using message = 'HS_SALDO|excede total'; end if;
    perform 1 from clientes where id = v_cli_sf for update;
    select coalesce(sum(monto),0) into v_balance_sf from saldo_favor_movimientos where cliente_id = v_cli_sf;
    if v_saldo_favor > v_balance_sf + 0.01 then raise exception using message = 'HS_SALDO|insuficiente'; end if;
    insert into saldo_favor_movimientos (cliente_id, monto, tipo, documento_id, usuario)
    values (v_cli_sf, -v_saldo_favor, 'venta', v_doc_id, nullif(p->>'usuario',''));
  end if;

  return v_doc_id;
end;
$$;
grant execute on function emitir_documento(jsonb) to authenticated;
revoke execute on function emitir_documento(jsonb) from public, anon;
