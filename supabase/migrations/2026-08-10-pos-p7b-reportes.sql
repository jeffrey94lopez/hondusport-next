-- POS P7b — Funciones de agregación de reportes (SOLO LECTURA).
-- Ganancias: ventas SIN ISV (documento_items.base) vs costo del kardex (venta_pos
-- neto de devoluciones NC), por producto/variante. Ítems libres (producto_id null)
-- colapsan en una sola fila. Contactos: totales de rango + saldos snapshot.

create or replace function reporte_ganancias_items(p_desde timestamptz, p_hasta timestamptz)
returns table (producto_id uuid, variante_id uuid, cantidad numeric, ventas numeric, costo numeric)
language sql
security invoker
set search_path = public
as $$
  with ventas as (
    select di.producto_id, di.variante_id,
      sum(case when d.tipo in ('factura','comprobante') then di.cantidad else -di.cantidad end) as cantidad,
      sum(case when d.tipo in ('factura','comprobante') then di.base else -di.base end) as ventas
    from documento_items di
    join documentos d on d.id = di.documento_id
    where d.estado <> 'anulado'
      and d.tipo in ('factura','comprobante','nota_credito','devolucion')
      and d.created_at >= p_desde and d.created_at < p_hasta
    group by di.producto_id, di.variante_id
  ),
  costos as (
    select m.producto_id, m.variante_id, sum(m.c) as costo
    from (
      select mi.producto_id, mi.variante_id, (mi.costo_resultante * (-mi.cantidad)) as c
      from movimientos_inventario mi
      join documentos d on d.id = split_part(mi.referencia, ':', 2)::uuid
      where mi.tipo = 'venta_pos' and mi.referencia like 'documento:%'
        and d.estado <> 'anulado'
        and mi.created_at >= p_desde and mi.created_at < p_hasta
      union all
      select mi.producto_id, mi.variante_id, -(mi.costo_resultante * mi.cantidad) as c
      from movimientos_inventario mi
      where mi.tipo = 'devolucion' and mi.referencia like 'nota_credito:%'
        and mi.created_at >= p_desde and mi.created_at < p_hasta
    ) m
    group by m.producto_id, m.variante_id
  )
  select
    coalesce(v.producto_id, c.producto_id) as producto_id,
    coalesce(v.variante_id, c.variante_id) as variante_id,
    coalesce(v.cantidad, 0)::numeric as cantidad,
    coalesce(v.ventas, 0)::numeric as ventas,
    coalesce(c.costo, 0)::numeric as costo
  from ventas v
  full outer join costos c
    on v.producto_id is not distinct from c.producto_id
   and v.variante_id is not distinct from c.variante_id
  order by coalesce(v.ventas, 0) desc;
$$;

create or replace function reporte_contactos(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id uuid, nombre text, rtn text, identidad text,
  es_cliente boolean, es_proveedor boolean,
  total_ventas numeric, total_compras numeric, saldo_cxc numeric, saldo_cxp numeric
)
language sql
security invoker
set search_path = public
as $$
  select cl.id, cl.nombre, cl.rtn, cl.identidad, cl.es_cliente, cl.es_proveedor,
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then d.total else -d.total end)
      from documentos d
      where d.cliente_id = cl.id and d.estado <> 'anulado'
        and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as total_ventas,
    coalesce((
      select sum(c.total) from compras c
      where c.proveedor_id = cl.id and c.estado <> 'anulada'
        and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::numeric as total_compras,
    coalesce((select sum(s.saldo) from documento_saldos s where s.cliente_id = cl.id and s.saldo > 0), 0)::numeric as saldo_cxc,
    coalesce((select sum(s.saldo) from compra_saldos s where s.proveedor_id = cl.id and s.saldo > 0), 0)::numeric as saldo_cxp
  from clientes cl
  where cl.activo = true
  order by total_ventas desc;
$$;

revoke execute on function reporte_ganancias_items(timestamptz, timestamptz) from public, anon;
revoke execute on function reporte_contactos(timestamptz, timestamptz) from public, anon;
grant execute on function reporte_ganancias_items(timestamptz, timestamptz) to authenticated;
grant execute on function reporte_contactos(timestamptz, timestamptz) to authenticated;
