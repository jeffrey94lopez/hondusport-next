-- Variantes padre/hijo: tabla hija, columnas en pedido_items, crear_pedido v2
-- (valida y descuenta stock) y función transaccional para los imports.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

create table if not exists producto_variantes (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  nombre      text not null,
  sku         text,
  precio      numeric check (precio is null or precio > 0),
  stock       integer check (stock is null or stock >= 0),
  activo      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (producto_id, nombre)
);

create index if not exists producto_variantes_producto_id_idx
  on producto_variantes (producto_id);
create unique index if not exists producto_variantes_sku_unico
  on producto_variantes (sku) where sku is not null;

drop trigger if exists producto_variantes_updated_at on producto_variantes;
create trigger producto_variantes_updated_at
  before update on producto_variantes
  for each row execute function update_updated_at();

alter table producto_variantes enable row level security;

drop policy if exists "public_read_variantes" on producto_variantes;
create policy "public_read_variantes" on producto_variantes for select
  using (
    activo = true
    and exists (select 1 from productos p where p.id = producto_id and p.activo = true)
  );

drop policy if exists "admin_all_variantes" on producto_variantes;
create policy "admin_all_variantes" on producto_variantes for all
  using (auth.role() = 'authenticated');

alter table pedido_items
  add column if not exists variante_id uuid references producto_variantes(id) on delete set null;
alter table pedido_items
  add column if not exists variante_nombre text;

-- ── crear_pedido v2: valida y descuenta stock (variantes y productos planos) ──
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

  return query select v_id, v_numero;
end;
$$;

grant execute on function crear_pedido(
  text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, text, jsonb
) to anon, authenticated;

-- ── Import atómico de productos + variantes (rutas de inventario, admin) ──
-- SECURITY INVOKER: corre con la sesión autenticada del admin y respeta RLS.
create or replace function importar_productos_variantes(p_productos jsonb, p_variantes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
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
end;
$$;

grant execute on function importar_productos_variantes(jsonb, jsonb) to authenticated;
