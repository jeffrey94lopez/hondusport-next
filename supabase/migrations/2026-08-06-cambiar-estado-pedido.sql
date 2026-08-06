-- Cambiar estado de pedido con ajuste atómico de stock:
-- a 'cancelado' repone; desde 'cancelado' re-descuenta validando (HS_STOCK).
-- Borrados/ilimitados se saltan en ambas direcciones. Mismo estado = no-op.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

create or replace function cambiar_estado_pedido(p_pedido_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual text;
  v_item record;
  v_stock integer;
begin
  select p.estado into v_estado_actual
    from pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception using message = 'HS_PEDIDO|' || p_pedido_id;
  end if;
  if v_estado_actual = p_estado then
    return;
  end if;

  if p_estado = 'cancelado' then
    -- Reponer: los WHERE con "stock is not null" saltan ilimitados y,
    -- al no matchear filas, también variantes/productos borrados.
    for v_item in
      select pi.producto_id, pi.variante_id, pi.cantidad
      from pedido_items pi where pi.pedido_id = p_pedido_id
    loop
      if v_item.variante_id is not null then
        update producto_variantes pv
          set stock = pv.stock + v_item.cantidad
          where pv.id = v_item.variante_id and pv.stock is not null;
      elsif v_item.producto_id is not null then
        update productos pr
          set stock = pr.stock + v_item.cantidad
          where pr.id = v_item.producto_id and pr.stock is not null;
      end if;
    end loop;

  elsif v_estado_actual = 'cancelado' then
    -- Re-descontar validando; FOR UPDATE serializa contra crear_pedido.
    for v_item in
      select pi.producto_id, pi.variante_id, pi.cantidad,
             pi.nombre_producto, pi.variante_nombre
      from pedido_items pi where pi.pedido_id = p_pedido_id
    loop
      if v_item.variante_id is not null then
        select pv.stock into v_stock from producto_variantes pv
          where pv.id = v_item.variante_id for update;
        if found and v_stock is not null then
          if v_stock < v_item.cantidad then
            raise exception using message = 'HS_STOCK|' || v_item.nombre_producto
              || ' (' || coalesce(v_item.variante_nombre, '') || ')|' || v_stock;
          end if;
          update producto_variantes
            set stock = stock - v_item.cantidad
            where producto_variantes.id = v_item.variante_id;
        end if;
      elsif v_item.producto_id is not null then
        select pr.stock into v_stock from productos pr
          where pr.id = v_item.producto_id for update;
        if found and v_stock is not null then
          if v_stock < v_item.cantidad then
            raise exception using message = 'HS_STOCK|' || v_item.nombre_producto
              || '|' || v_stock;
          end if;
          update productos
            set stock = stock - v_item.cantidad
            where productos.id = v_item.producto_id;
        end if;
      end if;
    end loop;
  end if;

  update pedidos set estado = p_estado where pedidos.id = p_pedido_id;
end;
$$;

grant execute on function cambiar_estado_pedido(uuid, text) to authenticated;
