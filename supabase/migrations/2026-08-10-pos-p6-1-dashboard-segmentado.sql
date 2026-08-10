-- POS P6.1 — dashboard_resumen extendida (SOLO LECTURA). Se recrea con columnas
-- nuevas: cambiar el returns table exige DROP + CREATE (create or replace no
-- puede cambiar el tipo de retorno). Las otras 3 funciones de P6 no se tocan.
drop function if exists dashboard_resumen(timestamptz, timestamptz);

create function dashboard_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table (
  ventas_netas numeric,
  num_documentos integer,
  pedidos_web integer,
  pedidos_sin_procesar integer,
  cxc_pendiente numeric,
  cxp_pendiente numeric,
  cotizaciones_abiertas integer,
  cotizaciones_monto numeric,
  ventas_sin_isv numeric,
  costo_ventas numeric,
  facturas integer,
  comprobantes integer,
  cotizaciones_ganadas integer,
  cotizaciones_perdidas integer,
  cxc_nuevo numeric,
  cxc_cobrado numeric,
  cxp_nuevo numeric,
  cxp_pagado numeric,
  productos_nuevos integer
)
language sql
security invoker
set search_path = public
as $$
  select
    -- === P6 (se conservan) ===
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then d.total else -d.total end)
      from documentos d
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as ventas_netas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as num_documentos,
    coalesce((select count(*) from pedidos p where p.created_at >= p_desde and p.created_at < p_hasta), 0)::integer as pedidos_web,
    coalesce((select count(*) from pedidos p where p.estado = 'recibido'), 0)::integer as pedidos_sin_procesar,
    coalesce((select sum(s.saldo) from documento_saldos s where s.saldo > 0), 0)::numeric as cxc_pendiente,
    coalesce((select sum(s.saldo) from compra_saldos s where s.saldo > 0), 0)::numeric as cxp_pendiente,
    -- cotizaciones_abiertas: AHORA por creadas en el rango (antes era snapshot en P6)
    coalesce((
      select count(*) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::integer as cotizaciones_abiertas,
    coalesce((
      select sum(c.total) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::numeric as cotizaciones_monto,
    -- === P6.1 nuevas ===
    -- Ventas SIN ISV: base por línea (neto: venta − NC/devolución).
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then di.base else -di.base end)
      from documento_items di join documentos d on d.id = di.documento_id
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as ventas_sin_isv,
    -- Costo de ventas: kardex venta_pos (doc no anulado) menos devoluciones de venta (NC).
    -- Consistente con ventas: excluye ventas cuyo documento está anulado (join por referencia).
    (
      coalesce((
        select sum(m.costo_resultante * (-m.cantidad))
        from movimientos_inventario m
        join documentos d on d.id = split_part(m.referencia, ':', 2)::uuid
        where m.tipo = 'venta_pos' and m.referencia like 'documento:%'
          and d.estado <> 'anulado'
          and m.created_at >= p_desde and m.created_at < p_hasta
      ), 0)
      -
      coalesce((
        select sum(m.costo_resultante * m.cantidad)
        from movimientos_inventario m
        where m.tipo = 'devolucion' and m.referencia like 'nota_credito:%'
          and m.created_at >= p_desde and m.created_at < p_hasta
      ), 0)
    )::numeric as costo_ventas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo = 'factura'
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as facturas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo = 'comprobante'
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as comprobantes,
    coalesce((
      select count(*) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'ganada' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::integer as cotizaciones_ganadas,
    coalesce((
      select count(*) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'perdida' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::integer as cotizaciones_perdidas,
    -- CxC nuevo: crédito otorgado en el rango. Replica credito_total de
    -- documento_saldos (sum(dp.monto) filter tipo='credito') pero filtrando por
    -- created_at (timestamptz) en vez de documento_saldos.fecha (d.created_at::date,
    -- que usa el TimeZone de sesión = UTC, no Honduras).
    coalesce((
      select sum(dp.monto)
      from documento_pagos dp
      join documentos d on d.id = dp.documento_id
      join metodos_pago m on m.id = dp.metodo_id
      where m.tipo = 'credito'
        and d.estado <> 'anulado'
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as cxc_nuevo,
    coalesce((
      select sum(co.monto) from cobros co
      where co.fecha >= (p_desde at time zone 'America/Tegucigalpa')::date
        and co.fecha <  (p_hasta at time zone 'America/Tegucigalpa')::date
    ), 0)::numeric as cxc_cobrado,
    coalesce((
      select sum(c.total) from compras c
      where c.condicion_pago = 'credito' and c.estado <> 'anulada'
        and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::numeric as cxp_nuevo,
    coalesce((
      select sum(pp.monto) from pagos_proveedor pp
      where pp.fecha >= (p_desde at time zone 'America/Tegucigalpa')::date
        and pp.fecha <  (p_hasta at time zone 'America/Tegucigalpa')::date
    ), 0)::numeric as cxp_pagado,
    (
      coalesce((select count(*) from productos p where p.created_at >= p_desde and p.created_at < p_hasta), 0)
      + coalesce((select count(*) from producto_variantes v where v.created_at >= p_desde and v.created_at < p_hasta), 0)
    )::integer as productos_nuevos;
$$;

revoke execute on function dashboard_resumen(timestamptz, timestamptz) from public, anon;
grant execute on function dashboard_resumen(timestamptz, timestamptz) to authenticated;
