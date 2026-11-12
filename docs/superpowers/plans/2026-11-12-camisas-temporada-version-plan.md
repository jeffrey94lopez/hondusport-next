# Camisas: Versión × Temporada × Talla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Camisas Deportivas products from being duplicated by season and
by size: one product page per club+kit, with chained Versión (Fan/Jugador) →
Temporada → Talla variant selectors, and migrate the existing duplicated
catalog into that shape.

**Architecture:** Extend `producto_variantes` with two nullable columns
(`version`, `temporada_id`) instead of a new table — a camisa variant becomes
identified by `(producto_id, version, temporada_id, nombre)`. `temporada` is
a new `categorias.tipo` value, reusing the existing polymorphic
category mechanism. `crear_pedido`, RLS and kardex stay untouched: they
already operate purely on `variante_id`. Admin, storefront, and the Excel
round-trip each read/write the two new columns the same way they already
read/write `imagenes` on `producto_variantes` (migration
`2026-09-24-variante-imagenes.sql` is the literal template). The existing
duplicate-by-season products get merged via an owner-approved, group-by-group
migration — never an unattended bulk merge.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS, PostgREST),
TypeScript, Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-11-11-camisas-temporada-version-design.md`

## Global Constraints

- Scope is Camisas Deportivas only (`categorias.valor = 'Camisas Deportivas'`,
  confirmed in prod: id `46c5a449-e980-40ac-a1a4-1c35e73facb8`, slug
  `camisas-deportivas`). Tenis, Tacos, Accesorios, Personalizados, Ropa keep
  their current single-axis (talla-only) variant model untouched.
- Never touch `crear_pedido`, RLS policies, or kardex calculation
  (`movimientos_inventario`, `registrar_entrada`, `aplicar_costeo`). All
  backend changes are additive nullable columns + the same two RPCs already
  extended once before (`sync_producto_variantes`,
  `importar_productos_variantes`).
- Stock is never written directly — every stock change goes through a
  `movimientos_inventario` row (via `registrar_entrada` or the RPCs), per
  CLAUDE.md.
- Fused-out products are deactivated (`activo = false`), never deleted — they
  keep their order history.
- UI text, commit messages, and admin labels in Spanish; currency in
  Lempiras via `formatPrice()`.
- Every migration is tested in the Supabase SQL Editor before it's pushed to
  `main` (per CLAUDE.md and this project's existing migration files).
- `npm test` after any `lib/store/` change; `npx tsc --noEmit` after any
  Server Action/type change (CLAUDE.md "Al terminar un cambio").

## Review Focus

- **A selected Versión/Temporada/Talla combination has no matching row in
  `producto_variantes`.** Expected: the missing option's chip simply isn't
  offered (design decision 5) — not a crash, not a disabled-but-visible chip
  that silently resolves to the wrong variant. Covered in Task 2
  (`resolverVariante` returns `undefined`) and Task 6 (UI never lets the
  three selections resolve to a variant that doesn't exist).
- **A Camisas Deportivas product mid-migration has some variants with
  `version`/`temporada_id` set and others still `null`** (the 38-products
  case, before Task 9 finishes them). Expected: `tieneEjesTemporada` must not
  silently drop the null-axis variants from the selector, and must not treat
  the product as 3-axis if only some rows carry the axes while the rest are
  legacy single-size rows for the same product. Covered in Task 2.
- **A merged survivor product already had its own flat `producto.tallas`
  stock** (not yet using `producto_variantes` at all) when a duplicate group
  is approved for fusion in Task 9. Expected: that stock is transferred via
  `movimientos_inventario`, never dropped or silently zeroed, and the
  survivor ends up selling by variant like the rest of its merged siblings.
  Covered in Task 9.
- **Excel "Variantes" tab import with a `temporada` cell whose text doesn't
  exactly match any `categorias` row** (extra spaces, different case, a typo,
  or a season not yet created). Expected: that row is rejected with
  `{pestaña: 'Variantes', fila, motivo}`, matching the project's existing
  all-or-nothing validation style, and does **not** silently fall back to "no
  temporada" or auto-create one. Covered in Task 7.
- **A cart saved in `localStorage` before this feature shipped, carrying a
  `varianteId` for a product later deactivated by the Task 9 merge.**
  Expected: checkout still rejects it cleanly with the existing "ya no está
  disponible" message (`validarCompra`/`traducirErrorPedido`), not a crash or
  a silent charge at the wrong price. Covered in Task 9 (regression test
  added, no production code change expected since `activo=false` already
  flows through `validarCompra`).

---

## File Structure

- `supabase/migrations/2026-11-12-camisas-temporada-version.sql` — new
  migration: `categorias.tipo` constraint, seed temporada rows,
  `producto_variantes` columns + unique index replacement, extended
  `sync_producto_variantes` / `importar_productos_variantes`.
- `types/index.ts` — widen `Categoria.tipo`; add `version`/`temporada_id` to
  `ProductoVariante` and `VarianteForm`.
- `types/store.ts` — add `version`/`temporada` to `StoreVariante`.
- `lib/store/variantes.ts` — new pure functions (`tieneEjesTemporada`,
  `versionesDisponibles`, `temporadasDisponibles`, `tallasDisponibles`,
  `resolverVariante`); extend `toStoreVariantes`.
- `lib/store/tests/variantes.test.ts` — tests for the above + builder fix.
- `lib/store/adapters.ts` — `toStoreProducto` gains a `temporadas` parameter.
- `lib/store/tests/adapters.test.ts` — update 5 call sites.
- `app/(store)/page.tsx`, `app/(store)/producto/[slug]/page.tsx` — derive
  `temporadas` from the categorias already fetched; pass to `toStoreProducto`.
- `app/admin/categorias/CategoriasClient.tsx`, `app/admin/categorias/actions.ts`
  — add `'temporada'` to the tipo union/tabs.
- `components/admin/ProductoFields.tsx` — Versión/Temporada columns in the
  variant editor, gated to Camisas Deportivas.
- `app/admin/productos/[id]/ProductoFichaView.tsx` — same two columns in the
  read-only variants table.
- `components/store/ProductDetail.tsx` — 3-chip selector replacing the
  dropdown when `tieneEjesTemporada` is true.
- `lib/store/inventoryRoundtrip.ts` — `version`/`temporada` columns in the
  "Variantes" sheet (parse + export).
- `lib/store/tests/inventoryRoundtrip.test.ts` — new cases for the above.
- `scripts/reporte-duplicados-camisas.mjs` — one-off report generator
  (read-only).
- `scripts/fusionar-grupo-camisas.mjs` — one-off, re-runnable-per-group merge
  executor, run only after the owner approves a specific group.

---

### Task 1: Database migration — temporada type, new columns, extended RPCs

**Files:**
- Create: `supabase/migrations/2026-11-12-camisas-temporada-version.sql`

**Interfaces:**
- Produces: `producto_variantes.version: 'fan' | 'jugador' | null`,
  `producto_variantes.temporada_id: uuid | null` (FK → `categorias.id`);
  `categorias.tipo` now allows `'temporada'`; unique index
  `producto_variantes_combinacion_unica` on
  `(producto_id, coalesce(version,''), coalesce(temporada_id::text,''), nombre)`
  replacing the old `unique (producto_id, nombre)`.

- [ ] **Step 1: Confirm the live constraint name before dropping it**

Run in the Supabase SQL Editor:
```sql
select conname, contype from pg_constraint
where conrelid = 'producto_variantes'::regclass and contype = 'u';
select conname from pg_constraint
where conrelid = 'categorias'::regclass and contype = 'c';
```
Expected: `producto_variantes_producto_id_nombre_key` (unique) and
`categorias_tipo_check` (check) — Postgres's default auto-generated names for
the inline constraints in `supabase/schema.sql:7` and `:112`. If either name
differs, substitute the real one in Step 2.

- [ ] **Step 2: Write the migration file**

```sql
-- Versión × Temporada en producto_variantes (Camisas Deportivas). Aplicar en
-- el SQL Editor de Supabase ANTES del push a main. Ver diseño en
-- docs/superpowers/specs/2026-11-11-camisas-temporada-version-design.md.

-- 1. Tipo 'temporada' en categorias
alter table categorias drop constraint categorias_tipo_check;
alter table categorias add constraint categorias_tipo_check
  check (tipo in ('cat','subcat','talla','genero','temporada'));

-- 2. Seed de temporadas conocidas (orden canónico). Ejecutar una sola vez;
-- temporadas futuras se agregan desde /admin/categorias (ver Task 4).
insert into categorias (tipo, valor, orden, activo) values
  ('temporada', '23/24', 1, true),
  ('temporada', '24/25', 2, true),
  ('temporada', '25/26', 3, true),
  ('temporada', '26/27', 4, true);

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
    version = nullif(x->>'version', ''),
    temporada_id = nullif(x->>'temporada_id', '')::uuid,
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
```

- [ ] **Step 3: Run the migration in the Supabase SQL Editor (dev/staging check first if available, otherwise directly — this project has no separate staging DB)**

Verify after running:
```sql
select tipo, valor, orden from categorias where tipo = 'temporada' order by orden;
-- expect 4 rows: 23/24, 24/25, 25/26, 26/27
select indexdef from pg_indexes where indexname = 'producto_variantes_combinacion_unica';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-11-12-camisas-temporada-version.sql
git commit -m "feat(bd): agrega version y temporada_id a producto_variantes"
```

---

### Task 2: Types and pure functions (`lib/store/variantes.ts`)

**Files:**
- Modify: `types/index.ts:72-81` (`Categoria.tipo`), `types/index.ts:117-131`
  (`ProductoVariante`), `types/index.ts:133-146` (`VarianteForm`)
- Modify: `types/store.ts:3-13` (`StoreVariante`)
- Modify: `lib/store/variantes.ts` (extend `toStoreVariantes`, append new
  functions after `traducirErrorPedido`, line 93)
- Modify: `lib/store/tests/variantes.test.ts` (fix the `variante()` builder,
  add new test blocks)

**Interfaces:**
- Consumes: nothing new.
- Produces (for Task 3, 5, 6 to use):
  - `tieneEjesTemporada(variantes: { version: string | null; temporada_id: string | null }[]): boolean`
  - `versionesDisponibles(variantes: { version: string | null }[]): ('fan' | 'jugador')[]`
  - `temporadasDisponibles(variantes: { version: string | null; temporada: { id: string; etiqueta: string; orden: number } | null }[], version: string | null): { id: string; etiqueta: string; orden: number }[]`
  - `tallasDisponibles(variantes: StoreVariante[], version: string | null, temporadaId: string | null): string[]`
  - `resolverVariante(variantes: StoreVariante[], version: string | null, temporadaId: string | null, talla: string): StoreVariante | undefined`
  - `StoreVariante.version: 'fan' | 'jugador' | null`,
    `StoreVariante.temporada: { id: string; etiqueta: string; orden: number } | null`

- [ ] **Step 1: Widen `Categoria.tipo` in `types/index.ts:74`**

```ts
tipo: 'cat' | 'subcat' | 'talla' | 'genero' | 'temporada'
```

- [ ] **Step 2: Add the two new fields to `ProductoVariante` in `types/index.ts:117-131`**

```ts
version: 'fan' | 'jugador' | null
temporada_id: string | null
```

- [ ] **Step 3: Add the same two fields to `VarianteForm` in `types/index.ts:133-146`**

```ts
version: 'fan' | 'jugador' | null
temporada_id: string | null
```

- [ ] **Step 4: Add `version` and `temporada` to `StoreVariante` in `types/store.ts:3-13`**

```ts
version: 'fan' | 'jugador' | null
temporada: { id: string; etiqueta: string; orden: number } | null
```

- [ ] **Step 5: Fix the test builder so existing tests keep compiling**

In `lib/store/tests/variantes.test.ts:5-10`, add `version: null, temporada_id: null` to the `variante()` defaults.

- [ ] **Step 6: Run tests to confirm the type-only changes don't break anything yet**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (no behavior changed yet).

- [ ] **Step 7: Write the failing tests for `toStoreVariantes` carrying the new fields**

```ts
describe('toStoreVariantes: ejes version/temporada', () => {
  it('copia version y temporada_id a la variante de tienda', () => {
    const out = toStoreVariantes(100, [], [
      variante({ id: 'v1', version: 'fan', temporada_id: 'temp-24-25' }),
    ])
    expect(out[0].version).toBe('fan')
  })
})
```
(`temporada` resolution — the `{id, etiqueta, orden}` object — needs a
`categorias`-keyed lookup; since `toStoreVariantes` currently only takes
`precioPadre`/`imagenesPadre`/`hijas`, add a 4th optional parameter
`temporadas: { id: string; valor: string; orden: number }[] = []` and resolve
`temporada` from it by matching `v.temporada_id`. Write the test with a
`temporadas` array and assert `out[0].temporada` equals
`{ id: 'temp-24-25', etiqueta: '24/25', orden: 2 }`.)

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run lib/store/tests/variantes.test.ts -t "ejes version/temporada"`
Expected: FAIL (`toStoreVariantes` doesn't accept/return these fields yet).

- [ ] **Step 9: Implement the `toStoreVariantes` extension in `lib/store/variantes.ts:16-29`**

Add the 4th parameter and populate `version: v.version` and
`temporada: v.temporada_id ? (temporadas find by id, map to {id, etiqueta: valor, orden}) : null` on each mapped object.

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run lib/store/tests/variantes.test.ts -t "ejes version/temporada"`
Expected: PASS

- [ ] **Step 11: Write failing tests for the five new pure functions**

```ts
describe('tieneEjesTemporada', () => {
  it('false si ninguna variante trae los ejes nuevos', () =>
    expect(tieneEjesTemporada([variante({ version: null, temporada_id: null })])).toBe(false))
  it('true si alguna variante trae version o temporada_id', () =>
    expect(tieneEjesTemporada([variante({ version: 'fan', temporada_id: 'x' })])).toBe(true))
})

describe('versionesDisponibles', () => {
  it('devuelve los valores únicos presentes', () => {
    const out = versionesDisponibles([
      variante({ version: 'fan' }), variante({ version: 'jugador' }), variante({ version: 'fan' }),
    ])
    expect(out).toEqual(['fan', 'jugador'])
  })
})

describe('temporadasDisponibles', () => {
  it('filtra por version y ordena por categorias.orden', () => {
    // construir StoreVariante[] con .version y .temporada ya resueltos
    // (salida de toStoreVariantes), dos temporadas fuera de orden, una de
    // otra version — afirmar que vuelven ordenadas y sin la de otra version.
  })
})

describe('tallasDisponibles', () => {
  it('solo tallas de la combinación version+temporada exacta', () => {
    // igual que arriba: afirmar que una talla que solo existe en otra
    // temporada no aparece.
  })
})

describe('resolverVariante', () => {
  it('encuentra la variante exacta', () => { /* ... */ })
  it('devuelve undefined si la combinación no existe', () => { /* ... */ })
})
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `npx vitest run lib/store/tests/variantes.test.ts`
Expected: FAIL (functions not defined).

- [ ] **Step 13: Implement the five functions in `lib/store/variantes.ts`, appended after `traducirErrorPedido` (line 93)**

```ts
export function tieneEjesTemporada(variantes: { version: string | null; temporada_id: string | null }[]): boolean {
  return variantes.some(v => v.version != null || v.temporada_id != null)
}

export function versionesDisponibles(variantes: { version: string | null }[]): ('fan' | 'jugador')[] {
  // valores únicos de v.version, descartando null, sin un orden particular
  // más allá de primera aparición (solo hay 2 valores posibles)
}

export function temporadasDisponibles(
  variantes: { version: string | null; temporada: { id: string; etiqueta: string; orden: number } | null }[],
  version: string | null,
): { id: string; etiqueta: string; orden: number }[] {
  // filtra por v.version === version, descarta temporada null, deduplica por
  // id, ordena por .orden ascendente
}

export function tallasDisponibles(
  variantes: StoreVariante[],
  version: string | null,
  temporadaId: string | null,
): string[] {
  // filtra por v.version === version && v.temporada?.id === temporadaId,
  // devuelve v.nombre únicos
}

export function resolverVariante(
  variantes: StoreVariante[],
  version: string | null,
  temporadaId: string | null,
  talla: string,
): StoreVariante | undefined {
  // find exacto por los 3 criterios + v.nombre === talla
}
```

(`StoreVariante` import already available via `@/types/store` in this file,
add it to the existing import line.)

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run lib/store/tests/variantes.test.ts`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add types/index.ts types/store.ts lib/store/variantes.ts lib/store/tests/variantes.test.ts
git commit -m "feat(store): agrega ejes version/temporada a variantes"
```

---

### Task 3: Thread `temporadas` through `toStoreProducto`

**Files:**
- Modify: `lib/store/adapters.ts:9-32`
- Modify: `lib/store/tests/adapters.test.ts` (5 call sites: lines 70, 102,
  108, 120, 128)
- Modify: `app/(store)/page.tsx:30, 51`
- Modify: `app/(store)/producto/[slug]/page.tsx:56-59, 82-83`

**Interfaces:**
- Consumes: `toStoreVariantes` (Task 2, now 4-arity).
- Produces: `toStoreProducto(p: Producto, temporadas: { id: string; valor: string; orden: number }[]): StoreProducto`

- [ ] **Step 1: Write the failing test**

In `lib/store/tests/adapters.test.ts`, add a case asserting that when
`BASE_PRODUCTO.producto_variantes` includes a row with a `temporada_id`
matching an entry in a `temporadas` array passed as the new 2nd argument,
`result.variantes[0].temporada` is the resolved `{id, etiqueta, orden}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/store/tests/adapters.test.ts`
Expected: FAIL (`toStoreProducto` doesn't accept a 2nd argument yet).

- [ ] **Step 3: Update `toStoreProducto` signature in `lib/store/adapters.ts:9`**

```ts
export function toStoreProducto(p: Producto, temporadas: { id: string; valor: string; orden: number }[] = []): StoreProducto {
```
Pass `temporadas` through to the `toStoreVariantes(...)` call at line 30
(its new 4th parameter from Task 2).

- [ ] **Step 4: Fix the 5 existing call sites in `lib/store/tests/adapters.test.ts` (lines 70, 102, 108, 120, 128)**

Each currently calls `toStoreProducto(BASE_PRODUCTO)` or similar with one
argument — none of them need the new behavior, so leave them as-is (the
default `= []` parameter covers them); only the new test from Step 1 passes
a `temporadas` argument explicitly.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/store/tests/adapters.test.ts`
Expected: PASS

- [ ] **Step 6: Update `app/(store)/page.tsx`**

After line 30's categorias fetch, derive:
```ts
const temporadas = (categorias ?? []).filter(c => c.tipo === 'temporada')
```
and change line 51 to
`const storeProductos = (productos ?? []).map(p => toStoreProducto(p, temporadas))`.

- [ ] **Step 7: Update `app/(store)/producto/[slug]/page.tsx`**

Next to the existing `tallaFiltros` derivation at line 95, add:
```ts
const temporadas = (categorias ?? []).filter(c => c.tipo === 'temporada')
```
and change lines 82-83 to pass `temporadas` into both `toStoreProducto` calls:
```ts
const storeProducto = toStoreProducto(productoRow, temporadas)
const allProductos = (productos ?? []).map(p => toStoreProducto(p, temporadas))
```

- [ ] **Step 8: Run full test suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/store/adapters.ts lib/store/tests/adapters.test.ts "app/(store)/page.tsx" "app/(store)/producto/[slug]/page.tsx"
git commit -m "feat(store): resuelve temporada en toStoreProducto"
```

---

### Task 4: Admin de categorías — tipo `temporada`

**Files:**
- Modify: `app/admin/categorias/CategoriasClient.tsx:9-16`
- Modify: `app/admin/categorias/actions.ts:8`

**Interfaces:**
- Consumes: `Categoria.tipo` widened (Task 2).
- Produces: nothing new consumed by later tasks (the admin screen is a leaf).

- [ ] **Step 1: Widen the tipo union in `app/admin/categorias/actions.ts:8`**

```ts
tipo: 'cat' | 'subcat' | 'talla' | 'genero' | 'temporada'
```

- [ ] **Step 2: Add `'temporada'` to `TIPOS` and `TIPO_LABEL` in `app/admin/categorias/CategoriasClient.tsx:9-16`**

```ts
const TIPOS = ['cat', 'subcat', 'talla', 'genero', 'temporada'] as const
// ...
const TIPO_LABEL: Record<TipoTab, string> = {
  cat: 'Categorías',
  subcat: 'Subcategorías',
  talla: 'Tallas',
  genero: 'Géneros',
  temporada: 'Temporadas',
}
```

- [ ] **Step 3: Manual check in dev**

Run: `npm run dev`, open `/admin/categorias`, confirm a new "Temporadas" tab
appears, lists the 4 seeded rows (Task 1) in order, and a new one can be
created/edited/deactivated through the existing form (no code path is
category-specific beyond `tipo`, so this should work with zero other
changes — verify it does).

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/categorias/CategoriasClient.tsx app/admin/categorias/actions.ts
git commit -m "feat(admin): agrega tipo temporada al admin de categorias"
```

---

### Task 5: Admin de producto — columnas Versión/Temporada (solo Camisas Deportivas)

**Files:**
- Modify: `components/admin/ProductoFields.tsx` (`productoAForm` L10-52,
  `bloqueVariantes` L487-623)
- Modify: `app/admin/productos/[id]/ProductoFichaView.tsx` (read-only
  variants table, L252-284)

**Interfaces:**
- Consumes: `VarianteForm.version`/`temporada_id` (Task 2); `categorias` prop
  already passed to `ProductoFields` (`{ id, valor }[]`, see Props at line
  57) — add a second lookup list for temporada options (tipo `'temporada'`),
  passed the same way the existing `categorias`/`subcategorias` props are.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Thread `temporadas` into `ProductoFields`' `Props`**

Add `temporadas: { id: string; valor: string; orden: number }[]` to the
`Props` interface (`components/admin/ProductoFields.tsx:54-75`), next to
`categorias`/`subcategorias`. Update every call site of `<ProductoFields />`
(search the repo for `<ProductoFields`) to pass a `temporadas` prop sourced
the same way the existing `categorias`/`subcategorias` props already are
(each caller already fetches the full `categorias` table — filter
`tipo === 'temporada'` there, same pattern as Task 3 Step 6/7).

- [ ] **Step 2: Carry `version`/`temporada_id` through `productoAForm` (L10-52)**

In the `.map(v => ({...}))` at L36-47, add:
```ts
version: v.version,
temporada_id: v.temporada_id,
```

- [ ] **Step 3: Carry the same two fields in `agregarVariante` (L205-209)**

```ts
version: null, temporada_id: null,
```
added to the new-variant object literal.

- [ ] **Step 4: Gate and render the two new fields in `bloqueVariantes` (L487-623)**

Compute once near the top of the component body (after `completo`/`sectioned`,
around L140):
```ts
const esCamisasDeportivas = categorias.find(c => c.id === form.categoria_id)?.valor === 'Camisas Deportivas'
```
Inside the `form.variantes.map((v, i) => { ... })` block (L497), when
`esCamisasDeportivas` is true, render two more fields in `varianteGridTop`
(L508-525, next to Nombre/SKU):
```tsx
{esCamisasDeportivas && (
  <>
    <label className={styles.varianteField}>
      Versión
      <select value={v.version ?? ''} onChange={e => setVariante(i, { version: e.target.value || null })}>
        <option value="">—</option>
        <option value="fan">Fan</option>
        <option value="jugador">Jugador</option>
      </select>
    </label>
    <label className={styles.varianteField}>
      Temporada
      <select value={v.temporada_id ?? ''} onChange={e => setVariante(i, { temporada_id: e.target.value || null })}>
        <option value="">—</option>
        {temporadas.map(t => <option key={t.id} value={t.id}>{t.valor}</option>)}
      </select>
    </label>
  </>
)}
```
(Use the `styles.varianteField` class already in scope; no new CSS needed —
`varianteGridTop` is a CSS grid that already accommodates a variable number
of fields per the existing Nombre/SKU pair.)

- [ ] **Step 5: Add the "aplicar a toda la temporada" shortcut button**

Below the variant card list (after the `.map(...)` close, before the
"+ Agregar variante" button, L620-621), when `esCamisasDeportivas` and at
least one variant has both `version` and `temporada_id` set, render a small
per-combination button (grouped by `version`+`temporada_id`) labeled
"Aplicar precio/imágenes de esta fila a toda la temporada" that copies the
clicked row's `precio` and `imagenes` onto every other row sharing the same
`version`+`temporada_id`. This writes only to local form state via
`setForm` (same mechanism as `setVariante`) — no new Server Action.

- [ ] **Step 6: Extend `ProductoFichaView.tsx`'s read-only variants table (L252-284)**

Add two `<th>`/`<td>` columns (Versión, Temporada) between Nombre and SKU,
shown only when the product's `categoria_id` matches Camisas Deportivas (same
`valor === 'Camisas Deportivas'` check as Step 4, computed against whatever
categorias list this page already has in scope). Render `v.version ?? '—'`
and the temporada's `valor` resolved by `v.temporada_id` (or `'—'`).

- [ ] **Step 7: Manual check in dev**

Run: `npm run dev`, open a Camisas Deportivas product in `/admin/productos`,
confirm the two new selects appear per variant row and persist on save
(`sync_producto_variantes` from Task 1 already accepts the fields). Open a
Tenis/Accesorios product and confirm the two columns do **not** appear.

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add components/admin/ProductoFields.tsx "app/admin/productos/[id]/ProductoFichaView.tsx"
git commit -m "feat(admin): version y temporada en variantes de Camisas Deportivas"
```

---

### Task 6: Tienda — selector de 3 ejes en `ProductDetail`

**Files:**
- Modify: `components/store/ProductDetail.tsx` (imports L14, state L76-81,
  derived values L102-118, render L268-293)
- Modify: `components/store/ProductDetail.module.css` (new chip-row styles,
  reusing existing `.tallaChip`/`.tallaGroup`/`.label`/`.section` classes
  where possible)

**Interfaces:**
- Consumes: `tieneEjesTemporada`, `versionesDisponibles`,
  `temporadasDisponibles`, `tallasDisponibles`, `resolverVariante` (Task 2).

- [ ] **Step 1: Import the new pure functions (extend line 14's import)**

```ts
import { estaAgotado, tieneEjesTemporada, versionesDisponibles, temporadasDisponibles, tallasDisponibles, resolverVariante } from '@/lib/store/variantes'
```

- [ ] **Step 2: Replace the single `selectedVarianteId` state with 3-axis selection state**

Near L76-81, add:
```ts
const conEjesTemporada = tieneEjesTemporada(variantes)
const [selectedVersion, setSelectedVersion] = useState<string | null>(
  () => versionesDisponibles(variantes)[0] ?? null
)
const [selectedTemporadaId, setSelectedTemporadaId] = useState<string | null>(
  () => temporadasDisponibles(variantes, versionesDisponibles(variantes)[0] ?? null)[0]?.id ?? null
)
const [selectedTallaTemporada, setSelectedTallaTemporada] = useState<string>(
  () => tallasDisponibles(variantes, selectedVersion, selectedTemporadaId)[0] ?? ''
)
```
Keep the existing `selectedVarianteId`/`setSelectedVarianteId` state for the
`conVariantes && !conEjesTemporada` path (old dropdown, unchanged — see Step
5). When `conEjesTemporada` is true, derive the active variant instead via:
```ts
const varianteTresEjes = conEjesTemporada
  ? resolverVariante(variantes, selectedVersion, selectedTemporadaId, selectedTallaTemporada)
  : undefined
```

- [ ] **Step 3: Update `selectedVariante` derivation (L102)**

```ts
const selectedVariante = conEjesTemporada
  ? (varianteTresEjes ?? null)
  : (variantes.find(v => v.id === selectedVarianteId) ?? null)
```
Everything downstream (`imagenesActuales` L105, `precioActual` L106,
`stockDisponible`/`maxCantidad` L113-114, `handleAddToCart` L144-164) already
reads from `selectedVariante` and needs no further change.

- [ ] **Step 4: Replace the dropdown block (L268-293) with the 3-chip-row selector when `conEjesTemporada`**

```tsx
{conEjesTemporada && (
  <div className={styles.section}>
    <label className={styles.label}>VERSIÓN</label>
    <div className={styles.tallaGroup}>
      {versionesDisponibles(variantes).map(v => (
        <button key={v} type="button"
          className={`${styles.tallaChip} ${selectedVersion === v ? styles.tallaChipActive : ''}`}
          onClick={() => {
            setSelectedVersion(v)
            const temporadas = temporadasDisponibles(variantes, v)
            const nuevaTemporada = temporadas[0]?.id ?? null
            setSelectedTemporadaId(nuevaTemporada)
            setSelectedTallaTemporada(tallasDisponibles(variantes, v, nuevaTemporada)[0] ?? '')
            setSelectedImageIdx(0)
          }}
        >{v === 'fan' ? 'Fan' : 'Jugador'}</button>
      ))}
    </div>
    <label className={styles.label}>TEMPORADA</label>
    <div className={styles.tallaGroup}>
      {temporadasDisponibles(variantes, selectedVersion).map(t => (
        <button key={t.id} type="button"
          className={`${styles.tallaChip} ${selectedTemporadaId === t.id ? styles.tallaChipActive : ''}`}
          onClick={() => {
            setSelectedTemporadaId(t.id)
            setSelectedTallaTemporada(tallasDisponibles(variantes, selectedVersion, t.id)[0] ?? '')
            setSelectedImageIdx(0)
          }}
        >{t.etiqueta}</button>
      ))}
    </div>
    <label className={styles.label}>TALLA</label>
    <div className={styles.tallaGroup}>
      {tallasDisponibles(variantes, selectedVersion, selectedTemporadaId).map(talla => (
        <button key={talla} type="button"
          className={`${styles.tallaChip} ${selectedTallaTemporada === talla ? styles.tallaChipActive : ''}`}
          onClick={() => { setSelectedTallaTemporada(talla); setSelectedImageIdx(0) }}
        >{talla}</button>
      ))}
    </div>
  </div>
)}
{conVariantes && !conEjesTemporada && (
  /* bloque <select> existente L268-293, sin cambios */
)}
```
(The visual reference is the artifact mockup the owner already approved —
match its chip look-and-feel; `.tallaChip`/`.tallaChipActive` classes already
carry that styling from the existing talla-chip block at L303-313, so no new
CSS is strictly required unless the 3 stacked rows need extra vertical
spacing, in which case add a `.ejesTemporadaWrap { display: flex; flex-direction: column; gap: 0.75rem }`
wrapper rule to the CSS module.)

- [ ] **Step 5: Update `handleAddToCart` (L144-164) to disable adding when a 3-axis combination doesn't resolve**

L146's guard `if (conVariantes && (!selectedVariante || selectedVariante.agotada)) return` already covers this unchanged (`selectedVariante` is `null` whenever `resolverVariante` returns `undefined`, from Step 3) — confirm no separate check is needed in this step, no code change.

- [ ] **Step 6: Write a browser smoke test (manual, not Vitest — this component has no existing RTL test suite)**

Run: `npm run dev`, open a camisa product that has `producto_variantes` rows
with `version`/`temporada_id` set (seed one manually via the admin screen
from Task 5 first, since the Task 9 migration hasn't run yet). Confirm:
switching Versión narrows the Temporada chip list; switching Temporada
narrows the Talla chip list; price/image update immediately; a product with
no 3-axis variants still shows the old dropdown unchanged.

- [ ] **Step 7: Run full test suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/store/ProductDetail.tsx components/store/ProductDetail.module.css
git commit -m "feat(tienda): selector de version/temporada/talla en ficha de producto"
```

---

### Task 7: Excel round-trip — columnas `version`/`temporada`

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts` (`VARIANTES_COLUMNAS` L11-14,
  `VarianteRow` L247-259, `VarianteData`/`VarianteUpdate`/`VarianteCreate`
  L261-271, `ParseContext` L210-215, `buildExportData` L154-174, Variantes-tab
  parsing loop L692-759)
- Modify: `lib/store/tests/inventoryRoundtrip.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is pure parsing logic
  independent of the DB — the Server Action layer that calls
  `importar_productos_variantes`/`sync_producto_variantes` with the parsed
  `version`/`temporada_id` is out of scope for this task if it doesn't exist
  yet as a distinct file; if the existing round-trip Server Action already
  forwards `VarianteUpdate`/`VarianteCreate` fields 1:1 into the RPC call,
  the two new fields flow through with no extra wiring — verify this in Step
  7 before assuming it needs a separate change).
- Produces: `VarianteData` (and thus `VarianteUpdate`/`VarianteCreate`) gain
  `version: 'fan' | 'jugador' | null` and `temporada_id: string | null`.

- [ ] **Step 1: Add the two columns to `VARIANTES_COLUMNAS` (L11-14) and `VarianteRow` (L247-259)**

```ts
export const VARIANTES_COLUMNAS = [
  'producto_id', 'producto', 'variante_id', 'variante', 'sku', 'precio', 'stock',
  'costo', 'precio_revendedor', 'costo_entrada', 'version', 'temporada', 'activo',
] as const
```
Add `version?: string` and `temporada?: string` to `VarianteRow`.

- [ ] **Step 2: Add the two fields to `VarianteData` (L261-268)**

```ts
version: 'fan' | 'jugador' | null
temporada_id: string | null
```

- [ ] **Step 3: Add a `temporadas` list to `ParseContext` (L210-215)**

```ts
export interface ParseContext {
  existentes: Producto[]
  categorias: CategoriaRef[]
  subcategorias: SubcategoriaRef[]
  variantesExistentes: ProductoVariante[]
  temporadas: CategoriaRef[]
}
```

- [ ] **Step 4: Write the failing tests**

```ts
describe('parseInventoryUpload: variantes con version/temporada', () => {
  it('resuelve una temporada por nombre exacto', () => {
    const ctx = { ...baseCtx, temporadas: [{ id: 'tmp-1', valor: '24/25' }] }
    const result = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: 'p1', variante: 'M', version: 'fan', temporada: '24/25' },
    ] }, ctx)
    expect(result.variantes.creates[0].temporada_id).toBe('tmp-1')
    expect(result.variantes.creates[0].version).toBe('fan')
  })

  it('rechaza una temporada que no existe', () => {
    const ctx = { ...baseCtx, temporadas: [{ id: 'tmp-1', valor: '24/25' }] }
    const result = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: 'p1', variante: 'M', version: 'fan', temporada: '25/26' },
    ] }, ctx)
    expect(result.errors).toContainEqual({ pestaña: 'Variantes', fila: 2, motivo: expect.stringContaining('temporada') })
    expect(result.variantes.creates).toHaveLength(0)
  })

  it('vacío = no cambia, en un update existente', () => {
    // fila con variante_id existente, celdas version/temporada vacías ->
    // conserva base.version/base.temporada_id (mismo patrón que precio/stock)
  })

  it('rechaza version/temporada en un producto que no es Camisas Deportivas', () => {
    const ctx = { ...baseCtx, temporadas: [{ id: 'tmp-1', valor: '24/25' }] }
    // producto_id de un Tenis en ctx.existentes/ctx.categorias
    const result = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: 'p-tenis', variante: '42', version: 'fan', temporada: '24/25' },
    ] }, ctx)
    expect(result.errors).toContainEqual({ pestaña: 'Variantes', fila: 2, motivo: expect.stringContaining('Camisas Deportivas') })
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run lib/store/tests/inventoryRoundtrip.test.ts -t "version/temporada"`
Expected: FAIL

- [ ] **Step 6: Implement the resolution + validation in the Variantes-tab loop (L692-759)**

Add, mirroring the existing `catByNombre`/`subByNombre` pattern (L385-386):
```ts
const temporadaByNombre = new Map(ctx.temporadas.map(t => [normNombre(t.valor), t]))
```
Inside the per-row block (after the existing `rowErrors` collection, before
the `if (rowErrors.length)` check at L728 — same "validate-then-reserve"
placement as the other parsers), add:
```ts
const versionCell = cellText(row.version)
const version = versionCell !== undefined
  ? ((['fan', 'jugador'] as const).includes(versionCell as 'fan' | 'jugador') ? versionCell as 'fan' | 'jugador' : (rowErrors.push(`la version "${versionCell}" no es válida`), null))
  : (base ? base.version : null)

const temporadaCell = cellText(row.temporada)
let temporada_id: string | null = base ? base.temporada_id : null
if (temporadaCell !== undefined) {
  const match = temporadaByNombre.get(normNombre(temporadaCell))
  if (!match) {
    rowErrors.push(`la temporada "${temporadaCell}" no existe`)
  } else {
    temporada_id = match.id
  }
}
```
Thread `version`/`temporada_id` into both the `varUpdates.push(...)` (L743)
and `varCreates.push(...)` (L751) object literals.

**Preflight ruling (scope guard):** the parser has no existing concept of
"which category can use which axis" — any `producto_id` is accepted
regardless of category today. Without a check, an Excel row could set
`version`/`temporada_id` on a Tenis/Tacos/Accesorios/Personalizados/Ropa
product, which the admin UI (Task 5) never shows and which would wrongly
flip `tieneEjesTemporada` on for that product's storefront page — a direct
violation of this plan's Global Constraint that only Camisas Deportivas gets
the 3-axis model. Add a row-level guard: when `versionCell`/`temporadaCell`
is present and the row's resolved product's `categoria_id` doesn't match the
"Camisas Deportivas" category's id (looked up once from `ctx.categorias` by
`valor === 'Camisas Deportivas'`, same name-match convention Task 5 uses),
push `rowErrors.push('version/temporada solo aplican a Camisas Deportivas')`
instead of accepting the value.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run lib/store/tests/inventoryRoundtrip.test.ts`
Expected: PASS

- [ ] **Step 8: Extend `buildExportData` (L154-174) to export the two columns**

Add a `temporadas: CategoriaRef[]` parameter to `buildExportData` (next to
the existing `subcategorias` parameter), build a `temporadaById` map the same
way `catById`/`subById` are built (L119-120), and add to each row object in
the `filasVariantes.push({...})` literal (L160-172):
```ts
version: v.version ?? '',
temporada: v.temporada_id ? (temporadaById.get(v.temporada_id) ?? '') : '',
```
Update the function's call site(s) to pass the already-fetched temporadas
list (search the repo for `buildExportData(` to find them — same pattern as
`categorias`/`subcategorias` are already threaded there).

- [ ] **Step 9: Add a test for the export side**

```ts
it('exporta version y temporada resueltos', () => {
  const data = buildExportData(productos, categorias, subcategorias,
    [variante({ version: 'jugador', temporada_id: 'tmp-1' })], [{ id: 'tmp-1', valor: '24/25' }])
  expect(data.variantes[0].version).toBe('jugador')
  expect(data.variantes[0].temporada).toBe('24/25')
})
```

- [ ] **Step 10: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 11: Add the two columns to the `INSTRUCCIONES` text (L23-51)**

```
- version y temporada: solo aplican a Camisas Deportivas. version: "fan" o "jugador". temporada: nombre exacto ya existente en /admin/categorias (no se crea una temporada nueva desde aquí).
```

- [ ] **Step 12: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add lib/store/inventoryRoundtrip.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(excel): version y temporada en el round-trip de variantes"
```

---

### Task 8: Script de reporte de candidatos a fusión (solo lectura)

**Files:**
- Create: `scripts/reporte-duplicados-camisas.mjs`

**Interfaces:**
- Produces: a JSON file (printed to stdout and optionally saved) describing
  candidate groups, for the owner to review before Task 9 touches anything.

- [ ] **Step 1: Write the script, following the existing `scripts/import-categorias-tallas.mjs` pattern (plain `.mjs`, manual `.env.local` parse, `fetch` against PostgREST with the service-role key)**

```js
import fs from 'fs'
import path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
})
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }

// 1. Trae la categoría "Camisas Deportivas" y sus productos activos + variantes.
const catRes = await fetch(`${SUPABASE_URL}/rest/v1/categorias?tipo=eq.cat&valor=eq.Camisas%20Deportivas&select=id`, { headers })
const [{ id: camisasId }] = await catRes.json()

const prodRes = await fetch(
  `${SUPABASE_URL}/rest/v1/productos?categoria_id=eq.${camisasId}&activo=eq.true&select=id,nombre,precio,tallas,subcategoria_id,producto_variantes(id,nombre,precio,stock)`,
  { headers },
)
const productos = await prodRes.json()

// 2. Normaliza el nombre quitando "TEMP. NN/NN" y patrones sueltos de año/temporada.
function normalizar(nombre) {
  return nombre
    .replace(/temp\.?\s*\d{2}\/\d{2}/gi, '')
    .replace(/\b(20)?\d{2}\s*[\/-]\s*(20)?\d{2}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toUpperCase()
}

// 3. Agrupa por (nombre normalizado, subcategoria_id).
const grupos = new Map()
for (const p of productos) {
  const key = `${normalizar(p.nombre)}::${p.subcategoria_id ?? ''}`
  const lista = grupos.get(key) ?? []
  lista.push(p)
  grupos.set(key, lista)
}

// 4. Solo reporta grupos con 2+ productos (candidatos reales a fusión).
const candidatos = [...grupos.entries()]
  .filter(([, lista]) => lista.length > 1)
  .map(([key, lista]) => ({ nombreNormalizado: key.split('::')[0], productos: lista }))

console.log(JSON.stringify(candidatos, null, 2))
console.error(`\n${candidatos.length} grupos candidatos de ${productos.length} productos activos en Camisas Deportivas.`)
```

- [ ] **Step 2: Run it and redirect output to a reviewable file**

Run: `node scripts/reporte-duplicados-camisas.mjs > /tmp/claude-1000/-home-jeffrey94lopez/3636814b-3979-4d8a-91ed-44844618668d/scratchpad/reporte-duplicados-camisas.json`

(Use this session's actual scratchpad path when running for real — the one
above is this conversation's; a later session gets a different one.)

- [ ] **Step 3: Read the output and sanity-check a few groups by hand against the known examples (Real Madrid Local, Barcelona, Francia, Inter Miami from the design doc's Contexto section)**

Expected: those four clubs' kits appear as groups with 3 members each
(matching the confirmed L.550/750/1265 Real Madrid example). Flag anything
that looks like a false positive (two genuinely different designs that
happen to normalize to the same name) for the owner to reject in Task 9.

- [ ] **Step 4: Commit the script (not its output — that's a one-off artifact, not part of the repo)**

```bash
git add scripts/reporte-duplicados-camisas.mjs
git commit -m "feat(scripts): reporte de candidatos a fusion por temporada"
```

---

### Task 9: Migración de datos existentes (fusión aprobada + 38 productos sin variante)

**Files:**
- Create: `scripts/fusionar-grupo-camisas.mjs`
- Modify: `lib/store/tests/variantes.test.ts` (regression test, Review Focus
  item 5)

**Interfaces:**
- Consumes: the report from Task 8, and the owner's explicit per-group
  approval (human-in-the-loop — this task cannot be fully automated end to
  end, by design decision 7).
- Produces: merged/deactivated rows in `productos`, migrated rows in
  `producto_variantes`, `movimientos_inventario` entries recording every
  stock transfer.

- [ ] **Step 1: Present the Task 8 report to the owner, group by group**

For each candidate group, ask: "fusionar" (same shirt, different season) or
"mantener separados" (genuinely different design). Record the answer plus,
for groups to merge, which product is the **survivor** (or whether a clean
new one should be created) and its new de-seasoned name (design decision 8,
e.g. "Real Madrid Local").

- [ ] **Step 2: Write `scripts/fusionar-grupo-camisas.mjs`, taking one approved group as input**

Same `.env.local`/`fetch` pattern as Task 8. Input: a small JSON/inline
object `{ survivorId, survivorNombre, losers: [{ productoId, temporadaValor }] }`
(temporadaValor identifies which seeded `categorias` row each losing
product's size run belongs to — the owner states this when approving the
group in Step 1; it's not inferrable from the product name alone once
normalized).

For the **survivor**, resolve its own pre-existing stock (whether it's a
flat `producto.tallas` product per Review Focus item 3, or already has
`producto_variantes` rows without the temporada axis):
- If the survivor has flat `tallas`/`stock` (no `producto_variantes` rows):
  create one `producto_variantes` row per talla in `producto.tallas`, with
  `version = 'fan'` and `temporada_id` = the survivor's own stated season,
  carrying over `producto.stock` split across sizes is **not possible from
  data alone** — flag this case for the owner to state per-size stock
  manually (same manual-capture convention as everywhere else in this admin).
- If the survivor already has `producto_variantes` rows without the two new
  axes: `PATCH` each to set `version = 'fan'` and `temporada_id` = the
  survivor's own season (Review Focus item 2 / design decision 3's survivor
  clause).

For each **loser**:
- `PATCH` its `producto_variantes` rows (or the flat talla rows, same
  either/or as the survivor) to move them under `survivorId`, setting
  `version = 'fan'` and `temporada_id` resolved from `temporadaValor`.
- For every row whose `stock` is a number (not null/unlimited), insert two
  `movimientos_inventario` rows via direct `POST` (never write `stock`
  directly, per CLAUDE.md): one `tipo: 'ajuste'` with `cantidad: -stock` on
  the loser's `producto_id`/`variante_id`, one `tipo: 'ajuste'` with
  `cantidad: +stock` on the survivor's new `variante_id`. Then `PATCH` the
  moved `producto_variantes` row's `producto_id` to `survivorId`.
- `PATCH` the loser's `productos` row to `activo: false`.
- Rename the survivor (`PATCH productos.nombre`) to the de-seasoned name from
  Step 1.

- [ ] **Step 3: Dry-run the script against one approved group with `--dry-run` (print the planned `PATCH`/`POST` calls without sending them)**

Add a simple `const DRY_RUN = process.argv.includes('--dry-run')` guard
around every mutating `fetch` call, logging the payload instead when true.

- [ ] **Step 4: Run it for real against the first approved group, then verify in the admin UI**

Run: `node scripts/fusionar-grupo-camisas.mjs` (with that group's approved
data filled in). Open `/admin/productos`, confirm: the survivor shows all
seasons' sizes as variants with Versión/Temporada set (Task 5's columns),
the losers are inactive, and `/admin/pos` kardex for both old and new
variant ids shows the transfer movements.

- [ ] **Step 5: Repeat Step 4 for every remaining approved group**

Each group is independent — no need to batch them in one script run; running
one group at a time limits the blast radius of a mistake.

- [ ] **Step 6: Migrate the 38 Camisas Deportivas products that still only have `tallas text[]` (no `producto_variantes` rows at all)**

For each: create one `producto_variantes` row per talla (reusing the stock
split the owner already has, since these never had per-size stock tracked
separately — ask the owner per product, same manual constraint as Step 2),
with `version = null, temporada_id = null` (design doc Migración step 4: "sin
eje de temporada si nunca la tuvieron"). This can reuse
`sync_producto_variantes` directly (call it once per product with the new
variant rows) instead of raw `PATCH`/`POST`, since there's no existing
variant history to preserve stock continuity around.

- [ ] **Step 7: Write the Review Focus regression test (old carts surviving a deactivation)**

In `lib/store/tests/variantes.test.ts`:
```ts
describe('validarCompra: producto fusionado-fuera (Review Focus)', () => {
  it('rechaza un carrito con varianteId de un producto ya desactivado', () => {
    const producto = { id: 'loser-1', nombre: 'Real Madrid Local (viejo)', activo: false }
    const result = validarCompra(producto, [], 'cualquier-variante-id')
    expect(result).toEqual({ ok: false, motivo: `"${producto.nombre}" ya no está disponible` })
  })
})
```

- [ ] **Step 8: Run test to verify it passes (this should already pass with existing code — confirms no regression, not new behavior)**

Run: `npx vitest run lib/store/tests/variantes.test.ts -t "fusionado-fuera"`
Expected: PASS

- [ ] **Step 9: Run the full suite one more time**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add scripts/fusionar-grupo-camisas.mjs lib/store/tests/variantes.test.ts
git commit -m "feat(migracion): fusiona camisas duplicadas por temporada"
```

---

## Self-Review Notes

- **Spec coverage:** every "Incluye" bullet of the design doc maps to a task
  (DB → Task 1; types/pure logic → Task 2; admin categorías → Task 4; admin
  producto → Task 5; tienda → Task 6; Excel → Task 7; migración aprobada →
  Tasks 8-9). The "No incluye" list (other categories, SEO redirects,
  `crear_pedido`/RLS/kardex) is reflected in Global Constraints and touched
  nowhere in the tasks.
- **Proportion check:** Task 1's migration SQL is given in full because this
  codebase's own convention is to write complete RPC bodies in migration
  files (verified against both existing migrations read for this plan); every
  other task gives signatures/assertions and leaves bodies to the
  implementer except where an exact small snippet removes ambiguity (e.g. the
  `esCamisasDeportivas` one-liner, the temporada-matching block in Task 7).
- **Task 9 is intentionally not fully scriptable end-to-end** — the design
  doc itself requires human approval group-by-group (decision 7) and flags
  per-size stock splits for pre-migration flat-stock products as something
  only the owner can state. The task's steps make this explicit rather than
  papering over it with a fake "automatic" migration.
