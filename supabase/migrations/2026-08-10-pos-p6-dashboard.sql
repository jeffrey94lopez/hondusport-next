-- POS P6 — Funciones de agregación del dashboard (SOLO LECTURA).
-- Venta neta = factura+comprobante (no anulados) menos nota_credito+devolucion
-- (no anulados). Fechas: los bordes llegan ya calculados (hora Honduras) desde
-- el server (lib/dashboard/rango.ts). El día local se recupera con
-- at time zone 'America/Tegucigalpa' (Honduras UTC-6, sin DST).

-- 1) Resumen (KPIs). Los campos "snapshot" (cxc/cxp/cotizaciones/sin_procesar)
--    NO dependen del rango; se devuelven en la misma fila por conveniencia.
create or replace function dashboard_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table (
  ventas_netas numeric,
  num_documentos integer,
  pedidos_web integer,
  pedidos_sin_procesar integer,
  cxc_pendiente numeric,
  cxp_pendiente numeric,
  cotizaciones_abiertas integer,
  cotizaciones_monto numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then d.total else -d.total end)
      from documentos d
      where d.estado <> 'anulado'
        and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as ventas_netas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as num_documentos,
    coalesce((
      select count(*) from pedidos p
      where p.created_at >= p_desde and p.created_at < p_hasta
    ), 0)::integer as pedidos_web,
    coalesce((
      select count(*) from pedidos p where p.estado = 'recibido'
    ), 0)::integer as pedidos_sin_procesar,
    coalesce((
      select sum(s.saldo) from documento_saldos s where s.saldo > 0
    ), 0)::numeric as cxc_pendiente,
    coalesce((
      select sum(s.saldo) from compra_saldos s where s.saldo > 0
    ), 0)::numeric as cxp_pendiente,
    coalesce((
      select count(*) from cotizaciones c
      join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta'
    ), 0)::integer as cotizaciones_abiertas,
    coalesce((
      select sum(c.total) from cotizaciones c
      join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta'
    ), 0)::numeric as cotizaciones_monto;
$$;

-- 2) Ventas netas por día (sin huecos: generate_series sobre los días del rango).
create or replace function dashboard_ventas_por_dia(p_desde timestamptz, p_hasta timestamptz)
returns table (dia date, ventas numeric)
language sql
security invoker
set search_path = public
as $$
  select g.dia,
    coalesce(sum(
      case when d.tipo in ('factura','comprobante') then d.total else -d.total end
    ), 0)::numeric as ventas
  from generate_series(
         (p_desde at time zone 'America/Tegucigalpa')::date,
         ((p_hasta at time zone 'America/Tegucigalpa') - interval '1 day')::date,
         interval '1 day'
       ) as g(dia)
  left join documentos d
    on (d.created_at at time zone 'America/Tegucigalpa')::date = g.dia
   and d.estado <> 'anulado'
   and d.tipo in ('factura','comprobante','nota_credito','devolucion')
  group by g.dia
  order by g.dia;
$$;

-- 3) Top ítems (neto). Ítems libres (producto_id null) cuentan por su descripción.
create or replace function dashboard_top_items(
  p_desde timestamptz, p_hasta timestamptz, p_limite integer
)
returns table (
  producto_id uuid, variante_id uuid, nombre text, cantidad numeric, monto numeric
)
language sql
security invoker
set search_path = public
as $$
  with lineas as (
    select di.producto_id, di.variante_id, di.descripcion,
      case when d.tipo in ('factura','comprobante') then 1 else -1 end as signo,
      di.cantidad, di.importe
    from documento_items di
    join documentos d on d.id = di.documento_id
    where d.estado <> 'anulado'
      and d.tipo in ('factura','comprobante','nota_credito','devolucion')
      and d.created_at >= p_desde and d.created_at < p_hasta
  )
  select producto_id, variante_id, max(descripcion) as nombre,
    sum(signo * cantidad)::numeric as cantidad,
    sum(signo * importe)::numeric as monto
  from lineas
  group by producto_id, variante_id, descripcion
  order by monto desc
  limit p_limite;
$$;

-- 4) Top clientes (neto), excluye CONSUMIDOR FINAL (cliente_id null).
create or replace function dashboard_top_clientes(
  p_desde timestamptz, p_hasta timestamptz, p_limite integer
)
returns table (
  cliente_id uuid, nombre text, num_compras integer, monto numeric
)
language sql
security invoker
set search_path = public
as $$
  with ventas as (
    select d.cliente_id,
      case when d.tipo in ('factura','comprobante') then 1 else -1 end as signo,
      d.total
    from documentos d
    where d.estado <> 'anulado'
      and d.tipo in ('factura','comprobante','nota_credito','devolucion')
      and d.created_at >= p_desde and d.created_at < p_hasta
      and d.cliente_id is not null
  )
  select v.cliente_id, c.nombre,
    count(*) filter (where v.signo = 1)::integer as num_compras,
    sum(v.signo * v.total)::numeric as monto
  from ventas v
  join clientes c on c.id = v.cliente_id
  group by v.cliente_id, c.nombre
  order by monto desc
  limit p_limite;
$$;

revoke execute on function dashboard_resumen(timestamptz, timestamptz) from public, anon;
revoke execute on function dashboard_ventas_por_dia(timestamptz, timestamptz) from public, anon;
revoke execute on function dashboard_top_items(timestamptz, timestamptz, integer) from public, anon;
revoke execute on function dashboard_top_clientes(timestamptz, timestamptz, integer) from public, anon;
grant execute on function dashboard_resumen(timestamptz, timestamptz) to authenticated;
grant execute on function dashboard_ventas_por_dia(timestamptz, timestamptz) to authenticated;
grant execute on function dashboard_top_items(timestamptz, timestamptz, integer) to authenticated;
grant execute on function dashboard_top_clientes(timestamptz, timestamptz, integer) to authenticated;
