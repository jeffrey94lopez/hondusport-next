-- Versión × Temporada en producto_variantes (Camisas Deportivas). Aplicar en
-- el SQL Editor de Supabase ANTES del push a main. Ver diseño en
-- docs/superpowers/specs/2026-11-11-camisas-temporada-version-design.md.

-- 1. Tipo 'temporada' en categorias
alter table categorias drop constraint categorias_tipo_check;
alter table categorias add constraint categorias_tipo_check
  check (tipo in ('cat','subcat','talla','genero','temporada'));

-- 2. Seed de temporadas conocidas (orden canónico). categorias.slug es
-- NOT NULL con índice único global (categorias_slug_key, de una migración
-- anterior) — la app genera sus slugs a mano (ver slugify/uniqueSlug en
-- app/admin/categorias/actions.ts), así que este seed también necesita uno
-- explícito por fila. Idempotente (where not exists) para poder re-ejecutar
-- el archivo sin duplicar filas; temporadas futuras se agregan desde
-- /admin/categorias (ver Task 4).
insert into categorias (tipo, valor, slug, orden, activo)
select 'temporada', '23/24', 'temporada-23-24', 1, true
where not exists (select 1 from categorias where tipo = 'temporada' and valor = '23/24')
union all
select 'temporada', '24/25', 'temporada-24-25', 2, true
where not exists (select 1 from categorias where tipo = 'temporada' and valor = '24/25')
union all
select 'temporada', '25/26', 'temporada-25-26', 3, true
where not exists (select 1 from categorias where tipo = 'temporada' and valor = '25/26')
union all
select 'temporada', '26/27', 'temporada-26-27', 4, true
where not exists (select 1 from categorias where tipo = 'temporada' and valor = '26/27');

-- 3. Columnas nuevas en producto_variantes
alter table producto_variantes add column if not exists version text
  check (version in ('fan','jugador'));
alter table producto_variantes add column if not exists temporada_id uuid
  references categorias(id);

-- 4. Reemplazar unique(producto_id, nombre): coalesce porque Postgres no
-- considera iguales dos NULL, así que sin esto dos variantes de distinta
-- temporada con la misma talla ("M") violarían el unique original.
alter table producto_variantes drop constraint producto_variantes_producto_id_nombre_key;
create unique index producto_variantes_combinacion_unica
  on producto_variantes (producto_id, coalesce(version, ''), coalesce(temporada_id::text, ''), nombre);

-- ── sync_producto_variantes: + version, temporada_id (mismo patrón que imagenes) ──
create or replace function sync_producto_variantes(p_producto_id uuid, p_variantes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
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

  insert into producto_variantes (id, producto_id, nombre, sku, precio, stock, costo, precio_revendedor, imagenes, version, temporada_id, activo, orden)
  select
    coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()),
    p_producto_id,
    x->>'nombre',
    nullif(x->>'sku', ''),
    (x->>'precio')::numeric,
    (x->>'stock')::integer,
    (x->>'costo')::numeric,
    (x->>'precio_revendedor')::numeric,
    case when jsonb_typeof(x->'imagenes') = 'array'
      then array(select jsonb_array_elements_text(x->'imagenes')) end,
    nullif(x->>'version', ''),
    nullif(x->>'temporada_id', '')::uuid,
    coalesce((x->>'activo')::boolean, true),
    coalesce((x->>'orden')::integer, 0)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  on conflict (id) do update set
    nombre = excluded.nombre,
    sku    = excluded.sku,
    precio = excluded.precio,
    precio_revendedor = excluded.precio_revendedor,
    imagenes = excluded.imagenes,
    version = excluded.version,
    temporada_id = excluded.temporada_id,
    activo = excluded.activo,
    orden  = excluded.orden,
    costo = case
      when not exists (select 1 from movimientos_inventario m where m.variante_id = producto_variantes.id)
        then excluded.costo
      else producto_variantes.costo
    end
  where producto_variantes.producto_id = p_producto_id;
end;
$$;

grant execute on function sync_producto_variantes(uuid, jsonb) to authenticated;

-- ── importar_productos_variantes: + version, temporada_id en altas y updates ──
create or replace function importar_productos_variantes(
  p_productos jsonb, p_variantes jsonb, p_movimientos jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mov jsonb;
  v_nuevo numeric;
  v_variante_id uuid;
begin
  insert into productos (
    id, nombre, slug, descripcion, precio, precio_original, categoria_id,
    subcategoria_id, stock, genero, badge, tallas, colores, marca, sku,
    personalizable, activo, canal, isv, precio_revendedor, stock_minimo
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
    coalesce((x->>'activo')::boolean, true),
    coalesce(x->>'canal', 'ambas'),
    coalesce(x->>'isv', '15'),
    (x->>'precio_revendedor')::numeric,
    (x->>'stock_minimo')::integer
  from jsonb_array_elements(coalesce(p_productos, '[]'::jsonb)) x
  on conflict (id) do update set
    nombre = excluded.nombre, slug = excluded.slug, descripcion = excluded.descripcion,
    precio = excluded.precio, precio_original = excluded.precio_original,
    categoria_id = excluded.categoria_id, subcategoria_id = excluded.subcategoria_id,
    stock = excluded.stock, genero = excluded.genero, badge = excluded.badge,
    tallas = excluded.tallas, colores = excluded.colores, marca = excluded.marca,
    sku = excluded.sku, personalizable = excluded.personalizable, activo = excluded.activo,
    canal = excluded.canal, isv = excluded.isv,
    precio_revendedor = excluded.precio_revendedor, stock_minimo = excluded.stock_minimo;

  update producto_variantes v set
    nombre = x->>'nombre',
    sku    = nullif(x->>'sku', ''),
    precio = (x->>'precio')::numeric,
    stock  = (x->>'stock')::integer,
    activo = coalesce((x->>'activo')::boolean, true),
    precio_revendedor = (x->>'precio_revendedor')::numeric,
    -- version/temporada_id: solo se tocan si la clave está PRESENTE en el
    -- JSON (operador `?` de jsonb, no solo no-vacía). El round-trip (Task 7)
    -- siempre manda la clave con el valor efectivo ("sin cambio" ya resuelto
    -- por su parser), así que esto es un no-op para ese camino. El import
    -- externo (lib/store/externalImport.ts) nunca manda estas 2 claves (su
    -- formato de origen no tiene version/temporada) — sin este guard, su
    -- UPDATE las pondría en null en cada import externo de una variante de
    -- camisa, borrando el eje que el admin o el round-trip ya le asignaron.
    version = case when x ? 'version' then nullif(x->>'version', '') else v.version end,
    temporada_id = case when x ? 'temporada_id' then nullif(x->>'temporada_id', '')::uuid else v.temporada_id end,
    imagenes = case when jsonb_typeof(x->'imagenes') = 'array'
      then array(select jsonb_array_elements_text(x->'imagenes')) else v.imagenes end
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  where x->>'id' is not null and v.id = (x->>'id')::uuid;

  create temporary table if not exists tmp_variantes_nuevas (
    id uuid, producto_id uuid, orden integer
  ) on commit drop;
  truncate tmp_variantes_nuevas;

  with ins as (
    insert into producto_variantes (producto_id, nombre, sku, precio, stock, activo, orden, precio_revendedor, imagenes, version, temporada_id)
    select
      (x->>'producto_id')::uuid,
      x->>'nombre',
      nullif(x->>'sku', ''),
      (x->>'precio')::numeric,
      (x->>'stock')::integer,
      coalesce((x->>'activo')::boolean, true),
      coalesce((x->>'orden')::integer, 0),
      (x->>'precio_revendedor')::numeric,
      case when jsonb_typeof(x->'imagenes') = 'array'
        then array(select jsonb_array_elements_text(x->'imagenes')) end,
      nullif(x->>'version', ''),
      nullif(x->>'temporada_id', '')::uuid
    from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
    where x->>'id' is null
    returning id, producto_id, orden
  )
  insert into tmp_variantes_nuevas (id, producto_id, orden)
  select id, producto_id, orden from ins;

  for v_mov in select * from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) loop
    if v_mov ? 'orden' and v_mov->>'orden' is not null then
      select t.id into v_variante_id from tmp_variantes_nuevas t
        where t.producto_id = (v_mov->>'producto_id')::uuid
          and t.orden = (v_mov->>'orden')::integer;
      if v_variante_id is null then
        raise exception 'No se encontró la variante nueva (producto_id=%, orden=%) para su movimiento de kardex',
          v_mov->>'producto_id', v_mov->>'orden';
      end if;
    else
      v_variante_id := nullif(v_mov->>'variante_id', '')::uuid;
    end if;

    if (v_mov->>'tipo') = 'entrada' then
      v_nuevo := aplicar_costeo(
        (v_mov->>'stock_anterior')::integer,
        (select case when v_variante_id is not null then pv.costo else p.costo end
           from productos p
           left join producto_variantes pv on pv.id = v_variante_id
           where p.id = (v_mov->>'producto_id')::uuid),
        (v_mov->>'cantidad')::integer,
        (v_mov->>'costo_unitario')::numeric);
      if v_variante_id is not null then
        update producto_variantes set costo = v_nuevo where id = v_variante_id;
      else
        update productos set costo = v_nuevo where id = (v_mov->>'producto_id')::uuid;
      end if;
    else
      v_nuevo := null;
    end if;
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario)
    values ((v_mov->>'producto_id')::uuid, v_variante_id,
            v_mov->>'tipo', (v_mov->>'cantidad')::integer,
            (v_mov->>'costo_unitario')::numeric, v_nuevo, v_mov->>'referencia', v_mov->>'usuario');
  end loop;
end;
$$;

grant execute on function importar_productos_variantes(jsonb, jsonb, jsonb) to authenticated;
revoke execute on function importar_productos_variantes(jsonb, jsonb, jsonb) from public, anon;
