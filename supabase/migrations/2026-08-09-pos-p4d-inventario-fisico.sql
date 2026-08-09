-- POS P4d: inventario fisico + kardex completo.

-- 1. Nuevos tipos de movimiento (recrear el check idempotente).
do $$
declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid = 'movimientos_inventario'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table movimientos_inventario drop constraint %I', v_con); end if;
  alter table movimientos_inventario add constraint movimientos_inventario_tipo_chk
    check (tipo in ('entrada','ajuste','venta_web','reposicion_cancelacion','venta_pos','devolucion','compra','inicial','conteo'));
end $$;

insert into configuracion (key, value) values ('inventario_conteo_ciego', 'true')
on conflict (key) do nothing;

-- 2. fijar_stock: unifica alta inicial y cambio de modalidad como movimiento.
--   p_es_ilimitado=true  -> deja stock null (cierre -N como 'ajuste' si habia N).
--   p_es_ilimitado=false -> stock = p_stock_nuevo; el delta contra el actual
--     genera 'inicial' (si venia de null), 'entrada' (delta>0 con costo) o 'ajuste'.
create or replace function fijar_stock(
  p_producto_id uuid, p_variante_id uuid,
  p_stock_nuevo integer, p_es_ilimitado boolean,
  p_costo numeric, p_referencia text, p_usuario text
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_stock integer; v_costo numeric; v_delta integer; v_tipo text; v_nuevo_costo numeric;
begin
  if p_variante_id is not null then
    select stock, costo into v_stock, v_costo from producto_variantes
      where id = p_variante_id and producto_id = p_producto_id for update;
    if not found then raise exception 'Variante no encontrada'; end if;
  else
    select stock, costo into v_stock, v_costo from productos where id = p_producto_id for update;
    if not found then raise exception 'Producto no encontrado'; end if;
  end if;

  if p_es_ilimitado then
    if v_stock is null then return; end if;                 -- ya ilimitado
    if v_stock <> 0 then
      insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
      values (p_producto_id, p_variante_id, 'ajuste', -v_stock, v_costo, coalesce(p_referencia, 'modalidad'), p_usuario);
    end if;
    if p_variante_id is not null then update producto_variantes set stock = null where id = p_variante_id;
    else update productos set stock = null where id = p_producto_id; end if;
    return;
  end if;

  v_delta := p_stock_nuevo - coalesce(v_stock, 0);
  if v_delta = 0 and v_stock is not null then return; end if; -- sin cambio real
  v_tipo := case when v_stock is null then 'inicial'
                 when p_costo is not null and v_delta > 0 then 'entrada'
                 else 'ajuste' end;
  v_nuevo_costo := case when v_tipo in ('inicial','entrada') and p_costo is not null
                       then aplicar_costeo(coalesce(v_stock, 0), v_costo, v_delta, p_costo)
                       else v_costo end;
  if v_delta <> 0 then
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario)
    values (p_producto_id, p_variante_id, v_tipo, v_delta,
            case when v_tipo in ('inicial','entrada') then p_costo else null end, v_nuevo_costo, p_referencia, p_usuario);
  end if;
  if p_variante_id is not null then
    update producto_variantes set stock = p_stock_nuevo, costo = v_nuevo_costo where id = p_variante_id;
  else
    update productos set stock = p_stock_nuevo, costo = v_nuevo_costo where id = p_producto_id;
  end if;
end; $$;
revoke all on function fijar_stock(uuid, uuid, integer, boolean, numeric, text, text) from public, anon;
grant execute on function fijar_stock(uuid, uuid, integer, boolean, numeric, text, text) to authenticated;

-- 3. Tablas de conteo.
create sequence if not exists conteo_numero_seq;
create or replace function nextval_conteo()
returns bigint language sql security definer set search_path = public as $$
  select nextval('conteo_numero_seq');
$$;
revoke all on function nextval_conteo() from public, anon;
grant execute on function nextval_conteo() to authenticated;

create table if not exists conteos_fisicos (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  estado       text not null default 'en_conteo' check (estado in ('en_conteo','aplicada','anulada')),
  alcance_tipo text not null check (alcance_tipo in ('todo','categoria','subcategoria','seleccion')),
  alcance_ref  uuid,
  descripcion  text,
  notas        text,
  usuario      text,
  created_at   timestamptz default now(),
  aplicada_at  timestamptz
);

create table if not exists conteo_lineas (
  id               uuid primary key default gen_random_uuid(),
  conteo_id        uuid not null references conteos_fisicos(id) on delete cascade,
  producto_id      uuid not null references productos(id) on delete restrict,
  variante_id      uuid references producto_variantes(id) on delete restrict,
  sku              text,
  nombre           text not null,
  stock_snapshot   integer not null,
  contado          integer,
  stock_al_aplicar integer,
  ajuste           integer,
  aplicada         boolean not null default false,
  aviso_movimiento boolean not null default false
);
create index if not exists conteo_lineas_conteo_idx on conteo_lineas (conteo_id);
create index if not exists conteo_lineas_producto_idx on conteo_lineas (producto_id);
create unique index if not exists conteo_lineas_unica on conteo_lineas (conteo_id, producto_id, coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4. aplicar_conteo: ajuste = contado - snapshot, atomico, preserva concurrentes.
create or replace function aplicar_conteo(p_conteo_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_estado text; v_numero text; r record; v_stock integer; v_costo numeric; v_ajuste integer; v_ok boolean;
begin
  select estado, numero into v_estado, v_numero from conteos_fisicos where id = p_conteo_id for update;
  if not found then raise exception 'Toma no encontrada'; end if;
  if v_estado <> 'en_conteo' then raise exception 'La toma no esta en conteo'; end if;

  for r in select * from conteo_lineas
           where conteo_id = p_conteo_id and contado is not null and not aplicada
           order by producto_id, variante_id
  loop
    if r.variante_id is not null then
      select stock, costo into v_stock, v_costo from producto_variantes where id = r.variante_id for update;
    else
      select stock, costo into v_stock, v_costo from productos where id = r.producto_id for update;
    end if;
    v_ok := found;

    if not v_ok or v_stock is null then
      update conteo_lineas set aplicada = true, stock_al_aplicar = v_stock, ajuste = null, aviso_movimiento = true
        where id = r.id;
      continue;
    end if;

    v_ajuste := r.contado - r.stock_snapshot;
    if v_ajuste <> 0 then
      insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
      values (r.producto_id, r.variante_id, 'conteo', v_ajuste,
              case when r.variante_id is not null
                then coalesce(v_costo, (select costo from productos where id = r.producto_id))
                else v_costo end,
              'conteo:' || v_numero);
      if r.variante_id is not null then update producto_variantes set stock = v_stock + v_ajuste where id = r.variante_id;
      else update productos set stock = v_stock + v_ajuste where id = r.producto_id; end if;
    end if;
    update conteo_lineas set aplicada = true, stock_al_aplicar = v_stock, ajuste = v_ajuste,
      aviso_movimiento = (v_stock <> r.stock_snapshot) where id = r.id;
  end loop;

  update conteos_fisicos set estado = 'aplicada', aplicada_at = now() where id = p_conteo_id;
end; $$;
revoke all on function aplicar_conteo(uuid) from public, anon;
grant execute on function aplicar_conteo(uuid) to authenticated;

-- 5. sync_producto_variantes: cuerpo vigente (2026-08-07-pos-p1-kardex-rpcs.sql)
--   + asiento de apertura 'inicial' de las variantes nuevas con stock rastreado.
--   El emparejamiento por nombre+orden puede ser ambiguo (nombres duplicados,
--   orden repetido por default); en vez de eso se usa el mismo patron
--   tmp_variantes_nuevas (con id pre-generado + RETURNING/join) que ya usa
--   importar_productos_variantes, correlacionando por posicion (ordinality)
--   del propio jsonb de entrada. Se renombra a tmp_sync_variantes_nuevas para
--   no colisionar con la tabla temporal (distinta forma) de esa otra funcion
--   si ambas corrieran en la misma sesion/transaccion.
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

  -- [P4d] ids pre-generados para las variantes nuevas de este batch (elem->>'id'
  -- es null), correlacionados por posicion (ordinality) del jsonb de entrada:
  -- el insert de abajo los usa como id real y el asiento de apertura los
  -- identifica por ese id sin ambiguedad de nombre/orden.
  create temporary table if not exists tmp_sync_variantes_nuevas (
    ord bigint, id uuid
  ) on commit drop;
  truncate tmp_sync_variantes_nuevas;
  insert into tmp_sync_variantes_nuevas (ord, id)
  select t.ord, gen_random_uuid()
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) with ordinality as t(elem, ord)
  where nullif(t.elem->>'id', '') is null;

  insert into producto_variantes (id, producto_id, nombre, sku, precio, stock, costo, precio_revendedor, activo, orden)
  select
    coalesce(nullif(t.elem->>'id', '')::uuid, tv.id, gen_random_uuid()),
    p_producto_id,
    t.elem->>'nombre',
    nullif(t.elem->>'sku', ''),
    (t.elem->>'precio')::numeric,
    (t.elem->>'stock')::integer,
    (t.elem->>'costo')::numeric,
    (t.elem->>'precio_revendedor')::numeric,
    coalesce((t.elem->>'activo')::boolean, true),
    coalesce((t.elem->>'orden')::integer, 0)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) with ordinality as t(elem, ord)
  left join tmp_sync_variantes_nuevas tv on tv.ord = t.ord
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

  -- [P4d] Asiento de apertura de las variantes nuevas con stock rastreado.
  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia)
  select p_producto_id, v.id, 'inicial', v.stock, v.costo, v.costo, 'alta'
  from producto_variantes v
  join tmp_sync_variantes_nuevas tv on tv.id = v.id
  where v.producto_id = p_producto_id and v.stock is not null and v.stock <> 0;
end;
$$;

grant execute on function sync_producto_variantes(uuid, jsonb) to authenticated;

-- 6. importar_productos_variantes: cuerpo vigente (2026-08-07-pos-p1-kardex-rpcs.sql)
--   + admite tipo 'inicial' en el kardex (mismo tratamiento de costeo que 'entrada').
drop function if exists importar_productos_variantes(jsonb, jsonb);

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
  update producto_variantes v set
    nombre = x->>'nombre',
    sku    = nullif(x->>'sku', ''),
    precio = (x->>'precio')::numeric,
    stock  = (x->>'stock')::integer,
    activo = coalesce((x->>'activo')::boolean, true),
    precio_revendedor = (x->>'precio_revendedor')::numeric
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
    insert into producto_variantes (producto_id, nombre, sku, precio, stock, activo, orden, precio_revendedor)
    select
      (x->>'producto_id')::uuid,
      x->>'nombre',
      nullif(x->>'sku', ''),
      (x->>'precio')::numeric,
      (x->>'stock')::integer,
      coalesce((x->>'activo')::boolean, true),
      coalesce((x->>'orden')::integer, 0),
      (x->>'precio_revendedor')::numeric
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

    -- [P4d] 'inicial' recibe el mismo tratamiento de costeo que 'entrada'
    -- (asiento de apertura con costo trae aplicar_costeo igual que una entrada).
    if (v_mov->>'tipo') in ('entrada','inicial') then
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

-- 7. RLS.
alter table conteos_fisicos enable row level security;
alter table conteo_lineas enable row level security;
do $$ begin
  create policy conteos_admin on conteos_fisicos for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy conteo_lineas_admin on conteo_lineas for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
