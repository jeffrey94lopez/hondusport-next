-- Imágenes propias por variante: null/[] = hereda las de productos.imagenes
-- (ver lib/store/variantes.ts:imagenesEfectivas). Aplicar en el SQL Editor de
-- Supabase ANTES del push a main.

alter table producto_variantes add column if not exists imagenes text[];

-- ── sync_producto_variantes (alta/edición manual desde el admin) ──
-- Mismo cuerpo de 2026-08-07-pos-p1-kardex-rpcs.sql, + columna imagenes en el
-- insert y en el upsert (se puede editar libremente, no la gobierna ninguna
-- regla de costeo/kardex como sí pasa con costo).
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

  insert into producto_variantes (id, producto_id, nombre, sku, precio, stock, costo, precio_revendedor, imagenes, activo, orden)
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
    coalesce((x->>'activo')::boolean, true),
    coalesce((x->>'orden')::integer, 0)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  on conflict (id) do update set
    nombre = excluded.nombre,
    sku    = excluded.sku,
    precio = excluded.precio,
    -- [Fix carrera] stock NO se toca en el UPDATE de variantes existentes:
    -- el caller (syncVariantes/updateProducto) lee el stock al inicio del
    -- request y lo manda de vuelta sin cambios; si en la ventana crear_pedido
    -- descontó stock por una venta concurrente, este upsert lo restauraría al
    -- valor viejo sin generar kardex (oversell silencioso). Los cambios reales
    -- de stock de variantes existentes van por aplicarCambioStock/registrar_entrada.
    -- Las variantes NUEVAS (rama insert de este mismo statement) sí insertan
    -- su stock inicial con normalidad.
    precio_revendedor = excluded.precio_revendedor,
    imagenes = excluded.imagenes,
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

-- ── importar_productos_variantes (import masivo de inventario) ──
-- Mismo cuerpo de 2026-08-07-pos-p1-kardex-rpcs.sql, + columna imagenes en el
-- update de variantes existentes y en el insert de altas nuevas. El resto
-- (movimientos/kardex) queda intacto: imagenes no participa en costeo.
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
  -- [P1] canal/isv/precio_revendedor/stock_minimo: columnas nuevas que el
  -- parser de Excel (Task 9) ya produce en p_productos — persistidas aquí
  -- para que el import no las descarte silenciosamente.
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

  -- [P1] precio_revendedor: columna nueva que el parser ya produce en p_variantes.
  -- [Variante-imagenes] imagenes: idem, solo se toca si el parser la manda.
  update producto_variantes v set
    nombre = x->>'nombre',
    sku    = nullif(x->>'sku', ''),
    precio = (x->>'precio')::numeric,
    stock  = (x->>'stock')::integer,
    activo = coalesce((x->>'activo')::boolean, true),
    precio_revendedor = (x->>'precio_revendedor')::numeric,
    imagenes = case when jsonb_typeof(x->'imagenes') = 'array'
      then array(select jsonb_array_elements_text(x->'imagenes')) else v.imagenes end
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  where x->>'id' is not null and v.id = (x->>'id')::uuid;

  -- Altas de variante: RETURNING captura (producto_id, orden) -> id en una
  -- tabla temporal. El insert masivo no puede usar RETURNING directo hacia
  -- fuera de la función; los movimientos de kardex de una alta de variante
  -- (ver loop abajo) necesitan el id real recién generado y lo resuelven por
  -- esta clave (producto_id, orden) — NUNCA por posición del array, porque el
  -- parser puede haber descartado altas individuales (ver contrato en
  -- lib/store/inventoryRoundtrip.ts, MovimientoImport.orden).
  create temporary table if not exists tmp_variantes_nuevas (
    id uuid, producto_id uuid, orden integer
  ) on commit drop;
  truncate tmp_variantes_nuevas;

  with ins as (
    insert into producto_variantes (producto_id, nombre, sku, precio, stock, activo, orden, precio_revendedor, imagenes)
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
        then array(select jsonb_array_elements_text(x->'imagenes')) end
    from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
    where x->>'id' is null
    returning id, producto_id, orden
  )
  insert into tmp_variantes_nuevas (id, producto_id, orden)
  select id, producto_id, orden from ins;

  -- [P1] Movimientos calculados por el parse (diffs de stock del import).
  -- `producto_id` ya viene resuelto a un uuid real (la ruta liga los
  -- `productoSlugTemp` de altas de producto antes de llamar esta función).
  -- `orden` presente = alta de variante nueva: variante_id se resuelve aquí
  -- por (producto_id, orden) contra tmp_variantes_nuevas.
  for v_mov in select * from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) loop
    if v_mov ? 'orden' and v_mov->>'orden' is not null then
      select t.id into v_variante_id from tmp_variantes_nuevas t
        where t.producto_id = (v_mov->>'producto_id')::uuid
          and t.orden = (v_mov->>'orden')::integer;
      -- Defensivo: un movimiento con `orden` es SIEMPRE una alta de variante;
      -- si no se resuelve, no debe caer silenciosamente como movimiento de
      -- producto (mismo estilo defensivo que registrar_entrada/crear_pedido).
      if v_variante_id is null then
        raise exception 'No se encontró la variante nueva (producto_id=%, orden=%) para su movimiento de kardex',
          v_mov->>'producto_id', v_mov->>'orden';
      end if;
    else
      v_variante_id := nullif(v_mov->>'variante_id', '')::uuid;
    end if;

    if (v_mov->>'tipo') = 'entrada' then
      -- [Fix costeo] Misma semántica que registrar_entrada: el costo actual de
      -- una variante es su pv.costo crudo (puede ser null); NO se hereda el
      -- costo del padre aquí. Si es null, aplicar_costeo toma el costo de
      -- entrada como nuevo costo. Solo para productos sin variante se usa
      -- p.costo (no hay variante de la que heredar).
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
