-- Posicion comercial por producto, ventas netas de los ultimos 90 dias.
--
-- Expone SOLO producto_id y posicion, deliberadamente. El orden de la portada
-- ya es publico (se ve en la propia pagina), pero las cantidades vendidas no, y
-- esta vista se concede a anon para que la tienda publica pueda leerla. Las
-- otras cuatro vistas del proyecto (compra_saldos, documento_saldos,
-- saldo_favor_clientes) son authenticated-only; esta es la excepcion, y por eso
-- no lleva importes ni unidades.
--
-- Las vistas de Postgres 15+ corren con permisos del DUENO por defecto
-- (security_invoker off), asi que puede leer pedidos y documentos aunque anon
-- no tenga politica de SELECT sobre ellos. Eso es lo que se quiere: anon ve el
-- agregado, no las filas.

create or replace view producto_ventas_rank as
with mostrador as (
  -- Facturas y comprobantes suman. Notas de credito y devoluciones RESTAN:
  -- son mercancia que vuelve, y contarlas como venta invertiria el signo justo
  -- en los productos con mas problemas.
  select
    di.producto_id,
    sum(
      case when d.tipo in ('factura', 'comprobante') then di.cantidad
           else -di.cantidad
      end
    ) as unidades
  from documento_items di
  join documentos d on d.id = di.documento_id
  where d.estado = 'emitido'
    and d.created_at >= now() - interval '90 days'
    and di.producto_id is not null
  group by di.producto_id
),
tienda as (
  -- Solo pedidos NO facturados. documentos.pedido_id enlaza la venta web que
  -- luego se factura en el mostrador: si ya tiene documento emitido, sus
  -- unidades estan en `mostrador` y sumarlas aqui las contaria DOS VECES.
  select
    pi.producto_id,
    sum(pi.cantidad) as unidades
  from pedido_items pi
  join pedidos p on p.id = pi.pedido_id
  where p.estado <> 'cancelado'
    and p.created_at >= now() - interval '90 days'
    and pi.producto_id is not null
    and not exists (
      select 1 from documentos d
      where d.pedido_id = p.id and d.estado = 'emitido'
    )
  group by pi.producto_id
),
netas as (
  select producto_id, sum(unidades) as unidades
  from (select * from mostrador union all select * from tienda) t
  group by producto_id
  -- Simplificacion aceptada: una devolucion dentro de la ventana cuya venta
  -- original quedo fuera puede dejar el neto en cero o negativo. Ese producto
  -- se queda sin posicion, o sea tratado como "sin ventas", que es la lectura
  -- conservadora correcta.
  having sum(unidades) > 0
)
select
  producto_id,
  dense_rank() over (order by unidades desc) as posicion
from netas;

grant select on producto_ventas_rank to anon, authenticated;
