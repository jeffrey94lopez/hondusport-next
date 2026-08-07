-- POS P1: kardex en las RPCs. Aplicar DESPUÉS de 2026-08-07-pos-p1-catalogos.sql.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

-- Costeo interno: devuelve el nuevo costo según el método configurado.
create or replace function aplicar_costeo(
  p_stock_actual integer, p_costo_actual numeric, p_cantidad integer, p_costo_entrada numeric
) returns numeric language plpgsql as $$
declare v_metodo text;
begin
  select value into v_metodo from configuracion where key = 'metodo_costeo';
  if p_costo_entrada is null then return p_costo_actual; end if;
  if coalesce(v_metodo, 'promedio') = 'ultimo' then return round(p_costo_entrada, 4); end if;
  if p_stock_actual is null or p_stock_actual <= 0 or p_costo_actual is null then
    return round(p_costo_entrada, 4);
  end if;
  return round(((p_stock_actual * p_costo_actual) + (p_cantidad * p_costo_entrada))
               / (p_stock_actual + p_cantidad), 4);
end; $$;

-- Entrada/ajuste manual de stock con costeo, atómica.
create or replace function registrar_entrada(
  p_producto_id uuid, p_variante_id uuid, p_cantidad integer, p_costo numeric,
  p_referencia text, p_usuario text, p_notas text
) returns numeric
language plpgsql security invoker set search_path = public as $$
declare
  v_stock integer; v_costo numeric; v_nuevo_costo numeric; v_tipo text;
begin
  if p_cantidad = 0 then raise exception 'La cantidad no puede ser 0'; end if;
  if p_costo is not null and p_cantidad < 0 then
    raise exception 'Una salida/ajuste negativo no lleva costo';
  end if;
  if p_variante_id is not null then
    select pv.stock, pv.costo into v_stock, v_costo
      from producto_variantes pv
      where pv.id = p_variante_id and pv.producto_id = p_producto_id for update;
    if not found then raise exception 'Variante no encontrada'; end if;
  else
    select p.stock, p.costo into v_stock, v_costo
      from productos p where p.id = p_producto_id for update;
    if not found then raise exception 'Producto no encontrado'; end if;
  end if;

  v_tipo := case when p_costo is not null and p_cantidad > 0 then 'entrada' else 'ajuste' end;
  v_nuevo_costo := case when v_tipo = 'entrada'
    then aplicar_costeo(v_stock, v_costo, p_cantidad, p_costo) else v_costo end;

  if p_variante_id is not null then
    update producto_variantes set
      stock = coalesce(stock, 0) + p_cantidad,
      costo = v_nuevo_costo
      where producto_variantes.id = p_variante_id;
  else
    update productos set
      stock = coalesce(stock, 0) + p_cantidad,
      costo = v_nuevo_costo
      where productos.id = p_producto_id;
  end if;

  insert into movimientos_inventario
    (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario, notas)
  values
    (p_producto_id, p_variante_id, v_tipo, p_cantidad, p_costo, v_nuevo_costo, p_referencia, p_usuario, p_notas);

  return v_nuevo_costo;
end; $$;
grant execute on function registrar_entrada(uuid, uuid, integer, numeric, text, text, text) to authenticated;
revoke execute on function registrar_entrada(uuid, uuid, integer, numeric, text, text, text) from public, anon;

-- ── crear_pedido v2: valida y descuenta stock (variantes y productos planos) ──
-- Cuerpo vigente (2026-08-04-producto-variantes.sql) + kardex de salida por venta web.
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
  v_item jsonb;
  v_producto_id uuid;
  v_variante_id uuid;
  v_cantidad integer;
  v_stock integer;
  v_nombre_prod text;
  v_nombre_var text;
  v_activo boolean;
  v_tiene_variantes boolean;
begin
  -- Validación y descuento de stock ANTES de insertar (misma transacción:
  -- cualquier raise revierte todo). FOR UPDATE evita carreras entre pedidos.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_variante_id := nullif(v_item->>'variante_id', '')::uuid;
    v_cantidad    := (v_item->>'cantidad')::integer;

    select p.activo, p.nombre into v_activo, v_nombre_prod
      from productos p where p.id = v_producto_id;
    if not found or not v_activo then
      raise exception using message = 'HS_INACTIVO|' || coalesce(v_nombre_prod, 'producto');
    end if;

    if v_variante_id is not null then
      select pv.stock, pv.nombre into v_stock, v_nombre_var
        from producto_variantes pv
        where pv.id = v_variante_id and pv.producto_id = v_producto_id and pv.activo = true
        for update;
      if not found then
        raise exception using message = 'HS_VARIANTE|' || v_nombre_prod;
      end if;
      if v_stock is not null then
        if v_stock < v_cantidad then
          raise exception using message =
            'HS_STOCK|' || v_nombre_prod || ' (' || v_nombre_var || ')|' || v_stock;
        end if;
        update producto_variantes set stock = stock - v_cantidad where producto_variantes.id = v_variante_id;
      end if;
    else
      select exists(
        select 1 from producto_variantes pv
        where pv.producto_id = v_producto_id and pv.activo = true
      ) into v_tiene_variantes;
      if v_tiene_variantes then
        raise exception using message = 'HS_REQUIERE_VARIANTE|' || v_nombre_prod;
      end if;
      select p.stock into v_stock from productos p where p.id = v_producto_id for update;
      if v_stock is not null then
        if v_stock < v_cantidad then
          raise exception using message = 'HS_STOCK|' || v_nombre_prod || '|' || v_stock;
        end if;
        update productos set stock = stock - v_cantidad where productos.id = v_producto_id;
      end if;
    end if;
  end loop;

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
    pedido_id, producto_id, nombre_producto, precio, cantidad, talla,
    personalizado_nombre, imagen_url, variante_id, variante_nombre
  )
  select
    v_id,
    (item->>'producto_id')::uuid,
    item->>'nombre_producto',
    (item->>'precio')::numeric,
    (item->>'cantidad')::integer,
    nullif(item->>'talla', ''),
    item->>'personalizado_nombre',
    item->>'imagen_url',
    nullif(item->>'variante_id', '')::uuid,
    nullif(item->>'variante_nombre', '')
  from jsonb_array_elements(p_items) as item;

  -- [P1] Kardex: una salida por cada item que descontó stock.
  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
  select (item->>'producto_id')::uuid,
         nullif(item->>'variante_id','')::uuid,
         'venta_web',
         -(item->>'cantidad')::integer,
         coalesce(pv.costo, p.costo),
         'pedido:' || v_id
  from jsonb_array_elements(p_items) as item
  left join producto_variantes pv on pv.id = nullif(item->>'variante_id','')::uuid
  join productos p on p.id = (item->>'producto_id')::uuid
  where (case when nullif(item->>'variante_id','') is not null then pv.stock else p.stock end) is not null;

  return query select v_id, v_numero;
end;
$$;

grant execute on function crear_pedido(
  text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, text, jsonb
) to anon, authenticated;

-- ── cambiar_estado_pedido: ajuste atómico de stock + kardex de reposición/re-descuento ──
-- Cuerpo vigente (2026-08-06-cambiar-estado-pedido.sql) + movimientos por cada branch.
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
      select pi.producto_id, pi.variante_id, pi.cantidad, pi.variante_nombre
      from pedido_items pi where pi.pedido_id = p_pedido_id
      order by pi.producto_id, pi.variante_id
    loop
      if v_item.variante_id is not null then
        update producto_variantes pv
          set stock = pv.stock + v_item.cantidad
          where pv.id = v_item.variante_id and pv.stock is not null;
      elsif v_item.producto_id is not null and v_item.variante_nombre is null then
        update productos pr
          set stock = pr.stock + v_item.cantidad
          where pr.id = v_item.producto_id and pr.stock is not null;
      end if;
    end loop;

    -- [P1] Kardex reposición (mismos filtros del loop: borrados/ilimitados/huérfanas fuera)
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
    select pi.producto_id, pi.variante_id, 'reposicion_cancelacion', pi.cantidad,
           coalesce(pv.costo, p.costo), 'pedido:' || p_pedido_id
    from pedido_items pi
    left join producto_variantes pv on pv.id = pi.variante_id
    left join productos p on p.id = pi.producto_id
    where pi.pedido_id = p_pedido_id
      and ((pi.variante_id is not null and pv.stock is not null)
        or (pi.variante_id is null and pi.variante_nombre is null and p.stock is not null));

  elsif v_estado_actual = 'cancelado' then
    -- Re-descontar validando; FOR UPDATE serializa contra crear_pedido.
    for v_item in
      select pi.producto_id, pi.variante_id, pi.cantidad,
             pi.nombre_producto, pi.variante_nombre
      from pedido_items pi where pi.pedido_id = p_pedido_id
      order by pi.producto_id, pi.variante_id
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
      elsif v_item.producto_id is not null and v_item.variante_nombre is null then
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

    -- [P1] Kardex re-descuento (mismos filtros del loop: borrados/ilimitados/huérfanas fuera)
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
    select pi.producto_id, pi.variante_id, 'venta_web', -pi.cantidad,
           coalesce(pv.costo, p.costo), 'pedido:' || p_pedido_id
    from pedido_items pi
    left join producto_variantes pv on pv.id = pi.variante_id
    left join productos p on p.id = pi.producto_id
    where pi.pedido_id = p_pedido_id
      and ((pi.variante_id is not null and pv.stock is not null)
        or (pi.variante_id is null and pi.variante_nombre is null and p.stock is not null));
  end if;

  update pedidos set estado = p_estado where pedidos.id = p_pedido_id;
end;
$$;

grant execute on function cambiar_estado_pedido(uuid, text) to authenticated;
revoke execute on function cambiar_estado_pedido(uuid, text) from public, anon;

-- ── Sync atómico de las variantes de un producto (form del admin) ──
-- Cuerpo vigente (2026-08-04-producto-variantes.sql) + guarda de historial.
-- SECURITY INVOKER: corre con la sesión autenticada del admin y respeta RLS.
-- Borra las hijas ausentes del payload e inserta/actualiza las presentes,
-- todo en una transacción. El WHERE del ON CONFLICT ignora ids ajenos:
-- una variante de otro producto jamás se modifica desde aquí.
create or replace function sync_producto_variantes(p_producto_id uuid, p_variantes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- [P1] Guarda de integridad: variantes con historial no se eliminan.
  perform 1
  from producto_variantes v
  where v.producto_id = p_producto_id
    and v.id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p_variantes,'[]'::jsonb)) x where x->>'id' is not null)
    and (exists (select 1 from pedido_items pi where pi.variante_id = v.id)
      or exists (select 1 from movimientos_inventario m where m.variante_id = v.id))
  limit 1;
  if found then
    raise exception 'No se puede eliminar una variante con historial de ventas o inventario; desactívala en su lugar.';
  end if;

  delete from producto_variantes v
  where v.producto_id = p_producto_id
    and v.id not in (
      select (x->>'id')::uuid
      from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
      where x->>'id' is not null
    );

  insert into producto_variantes (id, producto_id, nombre, sku, precio, stock, costo, precio_revendedor, activo, orden)
  select
    coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()),
    p_producto_id,
    x->>'nombre',
    nullif(x->>'sku', ''),
    (x->>'precio')::numeric,
    (x->>'stock')::integer,
    (x->>'costo')::numeric,
    (x->>'precio_revendedor')::numeric,
    coalesce((x->>'activo')::boolean, true),
    coalesce((x->>'orden')::integer, 0)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  on conflict (id) do update set
    nombre = excluded.nombre,
    sku    = excluded.sku,
    precio = excluded.precio,
    stock  = excluded.stock,
    precio_revendedor = excluded.precio_revendedor,
    activo = excluded.activo,
    orden  = excluded.orden,
    -- costo: editable mientras la variante no tenga movimientos (se trata
    -- como "costo inicial", igual que al insertarla); después lo gobierna
    -- registrar_entrada y este UPDATE deja de tocarlo.
    costo = case
      when not exists (select 1 from movimientos_inventario m where m.variante_id = producto_variantes.id)
        then excluded.costo
      else producto_variantes.costo
    end
  where producto_variantes.producto_id = p_producto_id;
end;
$$;

grant execute on function sync_producto_variantes(uuid, jsonb) to authenticated;

-- ── Import atómico de productos + variantes (rutas de inventario, admin) ──
-- Cuerpo vigente (2026-08-04-producto-variantes.sql) + firma ampliada con
-- p_movimientos (diffs de stock calculados por el parser de import) y kardex.
-- SECURITY INVOKER: corre con la sesión autenticada del admin y respeta RLS.
drop function if exists importar_productos_variantes(jsonb, jsonb);

create or replace function importar_productos_variantes(
  p_productos jsonb, p_variantes jsonb, p_movimientos jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_mov jsonb; v_nuevo numeric;
begin
  insert into productos (
    id, nombre, slug, descripcion, precio, precio_original, categoria_id,
    subcategoria_id, stock, genero, badge, tallas, colores, marca, sku,
    personalizable, activo
  )
  select
    (x->>'id')::uuid,
    x->>'nombre',
    x->>'slug',
    x->>'descripcion',
    (x->>'precio')::numeric,
    (x->>'precio_original')::numeric,
    (x->>'categoria_id')::uuid,
    (x->>'subcategoria_id')::uuid,
    (x->>'stock')::integer,
    x->>'genero',
    x->>'badge',
    case when jsonb_typeof(x->'tallas') = 'array'
      then array(select jsonb_array_elements_text(x->'tallas')) end,
    case when jsonb_typeof(x->'colores') = 'array'
      then array(select jsonb_array_elements_text(x->'colores')) end,
    x->>'marca',
    x->>'sku',
    coalesce((x->>'personalizable')::boolean, false),
    coalesce((x->>'activo')::boolean, true)
  from jsonb_array_elements(coalesce(p_productos, '[]'::jsonb)) x
  on conflict (id) do update set
    nombre = excluded.nombre, slug = excluded.slug, descripcion = excluded.descripcion,
    precio = excluded.precio, precio_original = excluded.precio_original,
    categoria_id = excluded.categoria_id, subcategoria_id = excluded.subcategoria_id,
    stock = excluded.stock, genero = excluded.genero, badge = excluded.badge,
    tallas = excluded.tallas, colores = excluded.colores, marca = excluded.marca,
    sku = excluded.sku, personalizable = excluded.personalizable, activo = excluded.activo;

  update producto_variantes v set
    nombre = x->>'nombre',
    sku    = nullif(x->>'sku', ''),
    precio = (x->>'precio')::numeric,
    stock  = (x->>'stock')::integer,
    activo = coalesce((x->>'activo')::boolean, true)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  where x->>'id' is not null and v.id = (x->>'id')::uuid;

  insert into producto_variantes (producto_id, nombre, sku, precio, stock, activo, orden)
  select
    (x->>'producto_id')::uuid,
    x->>'nombre',
    nullif(x->>'sku', ''),
    (x->>'precio')::numeric,
    (x->>'stock')::integer,
    coalesce((x->>'activo')::boolean, true),
    coalesce((x->>'orden')::integer, 0)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  where x->>'id' is null;

  -- [P1] Movimientos calculados por el parse (diffs de stock del import).
  for v_mov in select * from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) loop
    if (v_mov->>'tipo') = 'entrada' then
      v_nuevo := aplicar_costeo(
        (v_mov->>'stock_anterior')::integer,
        (select coalesce(pv.costo, p.costo) from productos p
           left join producto_variantes pv on pv.id = nullif(v_mov->>'variante_id','')::uuid
           where p.id = (v_mov->>'producto_id')::uuid),
        (v_mov->>'cantidad')::integer,
        (v_mov->>'costo_unitario')::numeric);
      if nullif(v_mov->>'variante_id','') is not null then
        update producto_variantes set costo = v_nuevo where id = (v_mov->>'variante_id')::uuid;
      else
        update productos set costo = v_nuevo where id = (v_mov->>'producto_id')::uuid;
      end if;
    else
      v_nuevo := null;
    end if;
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia)
    values ((v_mov->>'producto_id')::uuid, nullif(v_mov->>'variante_id','')::uuid,
            v_mov->>'tipo', (v_mov->>'cantidad')::integer,
            (v_mov->>'costo_unitario')::numeric, v_nuevo, v_mov->>'referencia');
  end loop;
end;
$$;

grant execute on function importar_productos_variantes(jsonb, jsonb, jsonb) to authenticated;
revoke execute on function importar_productos_variantes(jsonb, jsonb, jsonb) from public, anon;
