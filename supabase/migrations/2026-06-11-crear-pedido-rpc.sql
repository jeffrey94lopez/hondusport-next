-- RPC para crear pedidos desde la tienda (rol anon).
--
-- pedidos/pedido_items no tienen política de SELECT pública (contienen datos
-- del cliente), por lo que un INSERT ... RETURNING desde el cliente anon no
-- devuelve la fila creada. Esta función SECURITY DEFINER inserta el pedido y
-- sus items en una sola transacción y devuelve id/numero.
create or replace function crear_pedido(
  p_nombre_cliente text,
  p_telefono text,
  p_ciudad text,
  p_envio_id uuid,
  p_envio_nombre text,
  p_cupon_codigo text,
  p_subtotal numeric,
  p_descuento_cupon numeric,
  p_costo_envio numeric,
  p_total numeric,
  p_notas text,
  p_items jsonb
)
returns table (id uuid, numero integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero integer;
begin
  insert into pedidos (
    nombre_cliente, telefono, ciudad, envio_id, envio_nombre, cupon_codigo,
    subtotal, descuento_cupon, costo_envio, total, estado, notas
  )
  values (
    p_nombre_cliente, p_telefono, p_ciudad, p_envio_id, p_envio_nombre, p_cupon_codigo,
    p_subtotal, p_descuento_cupon, p_costo_envio, p_total, 'recibido', p_notas
  )
  returning pedidos.id, pedidos.numero into v_id, v_numero;

  insert into pedido_items (
    pedido_id, producto_id, nombre_producto, precio, cantidad, talla, personalizado_nombre, imagen_url
  )
  select
    v_id,
    (item->>'producto_id')::uuid,
    item->>'nombre_producto',
    (item->>'precio')::numeric,
    (item->>'cantidad')::integer,
    item->>'talla',
    item->>'personalizado_nombre',
    item->>'imagen_url'
  from jsonb_array_elements(p_items) as item;

  return query select v_id, v_numero;
end;
$$;

grant execute on function crear_pedido(
  text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, text, jsonb
) to anon, authenticated;
