# Categorías por ID + slug estable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relacionar categorías por ID (no por nombre) y darles un slug único y estable, usado por las URLs de filtro; mejorar el admin.

**Architecture:** `categorias_padre` (text[]) pasa a guardar IDs. Nueva columna `categorias.slug` (única global). Los lectores (getTallas, CategoryBar) emparejan por ID; `filterParams` resuelve por `slug`. El admin usa un selector de padres y un campo slug. Una migración SQL convierte los datos existentes y debe aplicarse ANTES del deploy.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Supabase (Postgres), Vitest.

## Global Constraints

- Lógica de negocio pura en `lib/store/` con tests en `lib/store/tests/` (Vitest).
- `categorias_padre` permanece como `text[]`; sus elementos son **IDs** (comparación como string). Multi-padre soportado.
- `categorias.slug` es **único global** (no por tipo).
- Las URLs de filtro usan `categoria.slug` (nunca IDs ni el slugify del nombre).
- La migración SQL debe aplicarse en Supabase **antes** de desplegar el código.
- Idioma español; commits convencionales.
- Tras cada tarea: `npx tsc --noEmit` y `npm test`; en las tareas de UI/páginas, además `npm run build`.
- Tipos actuales: `Categoria = { id, tipo:'cat'|'subcat'|'talla'|'genero', valor, imagen, categorias_padre: string[]|null, orden, activo }` (en `types/index.ts`); `StoreProducto` en `types/store.ts`; `Producto` tiene `categoria_id`/`subcategoria_id` (en `types/index.ts`).

---

### Task 1: Módulo de slug (`lib/store/slug.ts`, puro + tests)

**Files:**
- Create: `lib/store/slug.ts`
- Create: `lib/store/tests/slug.test.ts`
- Modify: `lib/store/filterParams.ts` (importar `slugify` desde `./slug`, re-exportarlo)

**Interfaces:**
- Produces: `slugify(valor: string): string`; `uniqueSlug(base: string, existentes: string[]): string`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/store/tests/slug.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { slugify, uniqueSlug } from '../slug'

describe('slugify', () => {
  test('lowercases, strips accents and non-alphanumerics', () => {
    expect(slugify('Camisetas de Algodón')).toBe('camisetas-de-algodon')
  })
  test('trims leading/trailing separators', () => {
    expect(slugify('  ¡Ofertas!  ')).toBe('ofertas')
  })
})

describe('uniqueSlug', () => {
  test('returns the base when unused', () => {
    expect(uniqueSlug('camisetas', ['shorts', 'zapatos'])).toBe('camisetas')
  })
  test('appends -2, -3 when the base collides', () => {
    expect(uniqueSlug('camisetas', ['camisetas'])).toBe('camisetas-2')
    expect(uniqueSlug('camisetas', ['camisetas', 'camisetas-2'])).toBe('camisetas-3')
  })
})
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `npx vitest run lib/store/tests/slug.test.ts`
Expected: FAIL con "Cannot find module '../slug'".

- [ ] **Step 3: Implementar `slug.ts`**

Crear `lib/store/slug.ts`:

```ts
export function slugify(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueSlug(base: string, existentes: string[]): string {
  if (!existentes.includes(base)) return base
  let n = 2
  while (existentes.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
```

- [ ] **Step 4: Reusar `slugify` en `filterParams.ts`**

En `lib/store/filterParams.ts`: eliminar la definición local de `slugify` (líneas 19-27) y en su lugar, tras los imports existentes, añadir:

```ts
import { slugify } from './slug'
```

Y al final del archivo añadir la re-exportación (para no romper `filterParams.test.ts`, que importa `slugify` desde `../filterParams`):

```ts
export { slugify }
```

- [ ] **Step 5: Correr los tests para verlos pasar**

Run: `npx vitest run lib/store/tests/slug.test.ts lib/store/tests/filterParams.test.ts`
Expected: PASS (slug nuevo + filterParams sin cambios de comportamiento).

- [ ] **Step 6: Commit**

```bash
git add lib/store/slug.ts lib/store/tests/slug.test.ts lib/store/filterParams.ts
git commit -m "feat(store): modulo slug (slugify + uniqueSlug) reutilizado por filterParams"
```

---

### Task 2: Migración SQL (categorías por ID + slug)

**Files:**
- Create: `supabase/migrations/2026-07-14-categorias-por-id-y-slug.sql`

No hay test unitario (es SQL). Se aplica en la Task 6 (rollout). Esta tarea solo produce y revisa el archivo.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-07-14-categorias-por-id-y-slug.sql`:

```sql
-- Proyecto 2a: categorias por ID + slug estable
-- Correr UNA vez, antes de desplegar el codigo nuevo.

-- 1. Funcion de slugify equivalente a lib/store/slug.ts
create or replace function slugify_es(txt text) returns text as $$
  select trim(both '-' from
    regexp_replace(
      lower(unaccent(coalesce(txt, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$ language sql immutable;

-- Requiere la extension unaccent
create extension if not exists unaccent;

-- 2. Columna slug (nullable durante el backfill)
alter table categorias add column if not exists slug text;

-- 3. Backfill de slug unico global, resolviendo colisiones con sufijo -2, -3...
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in select id, valor from categorias where slug is null order by orden, valor loop
    base := slugify_es(r.valor);
    if base = '' then base := 'cat'; end if;
    candidate := base;
    n := 2;
    while exists (select 1 from categorias where slug = candidate) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update categorias set slug = candidate where id = r.id;
  end loop;
end $$;

-- 4. Unicidad y NOT NULL
create unique index if not exists categorias_slug_key on categorias (slug);
alter table categorias alter column slug set not null;

-- 5. Convertir categorias_padre de NOMBRES a IDs (case-insensitive), descartando sin match
update categorias c
set categorias_padre = sub.ids
from (
  select c2.id,
         array_agg(p.id::text order by p.id) as ids
  from categorias c2
  cross join lateral unnest(c2.categorias_padre) as nombre
  join categorias p on lower(p.valor) = lower(nombre)
  where c2.categorias_padre is not null
  group by c2.id
) sub
where c.id = sub.id;

-- Filas cuyos nombres no matchearon quedan con su array viejo; limpiarlas manualmente si hace falta.
```

- [ ] **Step 2: Revisar el SQL a mano**

Verificar: (a) `unaccent` disponible en Supabase (lo está por defecto); (b) el backfill de slug no colisiona; (c) la conversión de `categorias_padre` solo toca filas con match. NO ejecutar aquí (se aplica en Task 6).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-07-14-categorias-por-id-y-slug.sql
git commit -m "feat(db): migracion categorias por ID + slug unico"
```

---

### Task 3: Tipos + adapter + selects + fixtures (añadir campos)

**Files:**
- Modify: `types/index.ts` (`Categoria` gana `slug`)
- Modify: `types/store.ts` (`StoreProducto` gana `catId`, `subcatId`)
- Modify: `lib/store/adapters.ts`
- Modify: `app/(store)/page.tsx` y `app/(store)/producto/[id]/page.tsx` (incluir `slug` en el select de categorias)
- Modify (fixtures): `lib/store/tests/getTallas.test.ts`, `lib/store/tests/filters.test.ts`, `lib/store/tests/search.test.ts`, `lib/store/tests/adapters.test.ts`, `lib/store/tests/orderTotals.test.ts`, `lib/store/tests/cart.test.ts`

**Interfaces:**
- Produces: `Categoria.slug: string`; `StoreProducto.catId: string`, `StoreProducto.subcatId: string | null`.

Nota: esta tarea SOLO añade campos (sin cambiar aún la lógica de emparejamiento). Deja todo compilando y en verde. La lógica por ID se hace en la Task 4.

- [ ] **Step 1: Añadir `slug` a `Categoria`**

En `types/index.ts`, en `interface Categoria`, tras `imagen: string | null`:
```ts
  slug: string
```

- [ ] **Step 2: Añadir `catId`/`subcatId` a `StoreProducto`**

En `types/store.ts`, en `interface StoreProducto`, tras `cat: string`:
```ts
  catId: string
```
y tras `subcat: string | null`:
```ts
  subcatId: string | null
```

- [ ] **Step 3: Exponerlos en el adapter**

En `lib/store/adapters.ts`, dentro de `toStoreProducto`, añadir tras `cat: p.categorias?.valor ?? ''`:
```ts
    catId: p.categoria_id ?? '',
```
y tras `subcat: p.subcategorias?.valor ?? null`:
```ts
    subcatId: p.subcategoria_id ?? null,
```

- [ ] **Step 4: Incluir `slug` en los selects de categorias**

En `app/(store)/page.tsx` y `app/(store)/producto/[id]/page.tsx`, en el `.from('categorias').select(...)`, cambiar
`'id, tipo, valor, imagen, categorias_padre, orden, activo'`
por
`'id, tipo, valor, slug, imagen, categorias_padre, orden, activo'`.

- [ ] **Step 5: Actualizar fixtures de tests (añadir los campos nuevos)**

En CADA fixture de `Categoria` de los tests, añadir `slug` (usa el slug del valor). En CADA fixture de `StoreProducto`, añadir `catId` y `subcatId`. Archivos y cambios exactos:

`lib/store/tests/getTallas.test.ts`:
- `BASE_PRODUCTO`: añadir `catId: 'c-camisetas', subcatId: null,`.
- `TALLA_FILTROS`: a cada objeto añadir `slug` (`'s'`, `'m'`, `'38'`). (Los `categorias_padre` siguen por NOMBRE en esta tarea.)

`lib/store/tests/filters.test.ts`:
- `makeProducto` default: añadir `catId: 'c-camisetas', subcatId: null,`.
- `tallaFiltros`: a cada objeto añadir `slug` (`'m'`, `'42'`).

`lib/store/tests/search.test.ts`:
- `makeProducto` default: añadir `catId: 'c1', subcatId: null,`.

`lib/store/tests/adapters.test.ts`:
- En el objeto esperado de `toStoreProducto`, añadir `catId` y `subcatId` con los valores que produzca el input del test (revisar el `Producto` de entrada: usar su `categoria_id`/`subcategoria_id`, o `''`/`null` si son null).

`lib/store/tests/orderTotals.test.ts` y `lib/store/tests/cart.test.ts`:
- Usan `CartItem`, no `StoreProducto` → NO requieren cambios salvo que algún fixture construya `StoreProducto`. Verificar; si no, dejar igual.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: tsc 0 errores; todos los tests PASS (la lógica no cambió, solo se añadieron campos).

- [ ] **Step 7: Commit**

```bash
git add types/index.ts types/store.ts lib/store/adapters.ts "app/(store)/page.tsx" "app/(store)/producto/[id]/page.tsx" lib/store/tests/
git commit -m "feat(store): Categoria.slug y StoreProducto.catId/subcatId (sin cambio de logica)"
```

---

### Task 4: Cutover de lectores a ID/slug

**Files:**
- Modify: `lib/store/getTallas.ts`
- Modify: `components/store/CategoryBar.tsx`
- Modify: `lib/store/filterParams.ts`
- Modify (tests): `lib/store/tests/getTallas.test.ts`, `lib/store/tests/filters.test.ts`, `lib/store/tests/filterParams.test.ts`

**Interfaces:**
- Consumes: `StoreProducto.catId`, `Categoria.slug`, `categorias_padre` con IDs.

- [ ] **Step 1: `getTallas` empareja por ID**

Reemplazar el cuerpo de `lib/store/getTallas.ts`:

```ts
import type { StoreProducto, Categoria } from '@/types/store'

export function getTallas(producto: StoreProducto, tallaFiltros: Categoria[]): string[] {
  if (producto.tallas.length > 0) return producto.tallas

  return tallaFiltros
    .filter(filtro => (filtro.categorias_padre ?? []).includes(producto.catId))
    .map(filtro => filtro.valor)
}
```

- [ ] **Step 2: Actualizar `getTallas.test.ts` a IDs**

En `lib/store/tests/getTallas.test.ts`:
- `TALLA_FILTROS`: cambiar cada `categorias_padre` de nombres a IDs. Usa IDs coherentes: `'c-camisetas'`, `'c-shorts'`, `'c-zapatos'`. Es decir:
  - `S`: `categorias_padre: ['c-camisetas', 'c-shorts']`
  - `M`: `categorias_padre: ['c-camisetas']`
  - `38`: `categorias_padre: ['c-zapatos']`
- `BASE_PRODUCTO.catId` ya es `'c-camisetas'` (de la Task 3).
- Reemplazar el test `'matches category names case-insensitively'` por uno de match por ID:

```ts
  it('matches by category id, not name', () => {
    const result = getTallas({ ...BASE_PRODUCTO, cat: 'Camisetas', catId: 'c-camisetas' }, TALLA_FILTROS)
    expect(result).toEqual(['S', 'M'])
  })
```

- El test `'returns an empty array when no talla filter matches the category'`: cambiar el override a `{ ...BASE_PRODUCTO, catId: 'c-accesorios' }` (en vez de `cat: 'Accesorios'`). Expected sigue `[]`.
- El test `'derives tallas from category filters when product has none'` sigue esperando `['S', 'M']` (BASE_PRODUCTO.catId = 'c-camisetas').

- [ ] **Step 2b: Actualizar `filters.test.ts` a IDs**

En `lib/store/tests/filters.test.ts` (el filtro de talla ahora empareja por `catId` vía `getTallas`):
- `tallaFiltros`: cambiar `categorias_padre` de nombres a IDs:
  - `M`: `categorias_padre: ['c-camisetas']`
  - `42`: `categorias_padre: ['c-zapatos']`
- En el array `productos` del `describe('filterProductos')`, fijar el `catId` de cada uno para que concuerde con su categoría:
  - producto `'1'` y `'2'` (cat `'Camisetas'`): añadir override `catId: 'c-camisetas'`
  - producto `'3'` (cat `'Zapatos'`): añadir override `catId: 'c-zapatos'`
- El test `'filters by talla using tallaFiltros categorias_padre'` (talla `['42']` → espera `['3']`) sigue pasando: producto `3` tiene `tallas: []` y `catId: 'c-zapatos'`, la talla `42` tiene `categorias_padre: ['c-zapatos']`.
- El test `'excludes a product whose explicit tallas do not include the selected size'` usa productos con `tallas` explícitas, así que no depende del `catId` (getTallas devuelve las propias) — no requiere cambios más allá del `catId` default ya añadido en la Task 3.

- [ ] **Step 3: `CategoryBar` agrupa subcats por ID**

En `components/store/CategoryBar.tsx`, reemplazar el cálculo de `subcatsForCat`:

```tsx
          const subcatsForCat = subcats.filter(s =>
            (s.categorias_padre ?? []).includes(cat.id)
          )
```

(elimina el `.some(parent => parent.toLowerCase() === cat.valor.toLowerCase())`).

- [ ] **Step 4: `filterParams` resuelve por `slug`**

Reemplazar `lib/store/filterParams.ts` por (mantiene la re-exportación de `slugify`):

```ts
import type { FilterState } from './filters'
import type { Categoria } from '@/types/store'
import { slugify } from './slug'

export type FilterTipo = 'cat' | 'subcat' | 'genero' | 'talla'

export interface FilterParamsCtx {
  categorias: Categoria[]
  maxPriceLimit: number
}

const MAP: Record<FilterTipo, { key: string; field: keyof Omit<FilterState, 'maxPrice'>; catTipo: Categoria['tipo'] }> = {
  cat: { key: 'cat', field: 'cats', catTipo: 'cat' },
  subcat: { key: 'subcat', field: 'subcats', catTipo: 'subcat' },
  genero: { key: 'genero', field: 'generos', catTipo: 'genero' },
  talla: { key: 'talla', field: 'tallas', catTipo: 'talla' },
}

// valor (nombre) -> slug estable de la categoria de ese tipo
function slugDeValor(ctx: FilterParamsCtx, catTipo: Categoria['tipo'], valor: string): string | undefined {
  return ctx.categorias.find(c => c.tipo === catTipo && c.valor === valor)?.slug
}

// slug -> valor (nombre) de la categoria de ese tipo
function valorDeSlug(ctx: FilterParamsCtx, catTipo: Categoria['tipo'], slug: string): string | undefined {
  return ctx.categorias.find(c => c.tipo === catTipo && c.slug === slug)?.valor
}

export function filtersToQuery(filters: FilterState, ctx: FilterParamsCtx): string {
  const params = new URLSearchParams()
  for (const tipo of Object.keys(MAP) as FilterTipo[]) {
    const { key, field, catTipo } = MAP[tipo]
    const slugs = filters[field]
      .map(valor => slugDeValor(ctx, catTipo, valor))
      .filter((s): s is string => s != null)
    if (slugs.length > 0) params.set(key, slugs.join(','))
  }
  if (filters.maxPrice < ctx.maxPriceLimit) params.set('max', String(filters.maxPrice))
  return params.toString()
}

export function parseFilters(params: URLSearchParams, ctx: FilterParamsCtx): FilterState {
  const result: FilterState = { maxPrice: ctx.maxPriceLimit, generos: [], cats: [], tallas: [], subcats: [] }

  for (const tipo of Object.keys(MAP) as FilterTipo[]) {
    const { key, field, catTipo } = MAP[tipo]
    const raw = params.get(key)
    if (!raw) continue
    const slugs = raw.split(',').map(s => s.trim()).filter(Boolean)
    result[field] = slugs
      .map(slug => valorDeSlug(ctx, catTipo, slug))
      .filter((v): v is string => v != null)
  }

  const max = Number(params.get('max'))
  if (Number.isFinite(max) && max > 0) result.maxPrice = max

  return result
}

export { slugify }
```

- [ ] **Step 5: Actualizar `filterParams.test.ts` para `slug`**

En `lib/store/tests/filterParams.test.ts`:
- El helper `cat(...)` debe incluir `slug`. Cambiar su firma a incluir slug derivado del valor:

```ts
function cat(tipo: Categoria['tipo'], valor: string, slug?: string): Categoria {
  return { id: valor, tipo, valor, slug: slug ?? slugify(valor), imagen: null, categorias_padre: null, orden: 0, activo: true }
}
```
(añadir `import { slugify } from '../slug'` al inicio del test.)

- El test de round-trip sigue válido (los slugs por defecto coinciden con los slugify de antes). Añadir un test que demuestre que dos categorías con nombres colisionantes pero slugs distintos NO se confunden:

```ts
  test('resolves by stable slug, not by name-collision', () => {
    const cats = [cat('cat', 'Niño', 'nino'), cat('cat', 'Nino', 'nino-2')]
    const ctx2 = { categorias: cats, maxPriceLimit: 5000 }
    const query = filtersToQuery({ maxPrice: 5000, generos: [], cats: ['Nino'], tallas: [], subcats: [] }, ctx2)
    expect(query).toBe('cat=nino-2')
    expect(parseFilters(new URLSearchParams(query), ctx2).cats).toEqual(['Nino'])
  })
```

- Si algún assert previo esperaba `slugify(valor)` como parámetro, sigue valiendo porque el slug por defecto ES `slugify(valor)`.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tsc 0; todos los tests PASS; build OK.

- [ ] **Step 7: Commit**

```bash
git add lib/store/getTallas.ts components/store/CategoryBar.tsx lib/store/filterParams.ts lib/store/tests/
git commit -m "feat(store): lectores emparejan por ID y URLs de filtro por slug"
```

---

### Task 5: Admin de categorías (selector de padres + slug)

**Files:**
- Modify: `app/admin/categorias/actions.ts`
- Modify: `app/admin/categorias/CategoriasClient.tsx`

**Interfaces:**
- Consumes: `slugify`/`uniqueSlug` de `lib/store/slug.ts`; `Categoria.slug`.

- [ ] **Step 1: Actualizar el Server Action**

En `app/admin/categorias/actions.ts`:
- Cambiar `CategoriaForm` para que `categorias_padre` sea `string[]` (IDs) y añadir `slug: string`:

```ts
interface CategoriaForm {
  tipo: 'cat' | 'subcat' | 'talla' | 'genero'
  valor: string
  slug: string
  imagen: string
  categorias_padre: string[]
  orden: number
  activo: boolean
}
```

- Añadir import: `import { slugify, uniqueSlug } from '@/lib/store/slug'`.
- En `createCategoria`: calcular slug único contra los existentes y guardar IDs:

```ts
export async function createCategoria(form: CategoriaForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('categorias').select('slug')
  const existentes = (rows ?? []).map(r => r.slug as string)
  const base = slugify(form.slug || form.valor)
  const slug = uniqueSlug(base || 'cat', existentes)

  const { error } = await supabase.from('categorias').insert({
    tipo: form.tipo,
    valor: form.valor.trim(),
    slug,
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre.length > 0 ? form.categorias_padre : null,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}
```

- En `updateCategoria`: calcular slug único excluyendo la propia fila:

```ts
export async function updateCategoria(id: string, form: CategoriaForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('categorias').select('id, slug')
  const existentes = (rows ?? []).filter(r => r.id !== id).map(r => r.slug as string)
  const base = slugify(form.slug || form.valor)
  const slug = uniqueSlug(base || 'cat', existentes)

  const { error } = await supabase.from('categorias').update({
    tipo: form.tipo,
    valor: form.valor.trim(),
    slug,
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre.length > 0 ? form.categorias_padre : null,
    orden: form.orden,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}
```

- `deleteCategoria` no cambia.

- [ ] **Step 2: Actualizar el cliente del admin**

En `app/admin/categorias/CategoriasClient.tsx`:
- `EMPTY` y el estado `form`: `categorias_padre` pasa a `string[]` (`[]`) y añadir `slug: ''`.
- `openCreate`: `setForm({ ...EMPTY, tipo: tab })` (ya vale con el nuevo EMPTY).
- `openEdit(c)`: `categorias_padre: c.categorias_padre ?? []`, `slug: c.slug`.
- `handleToggle`: pasar `categorias_padre: c.categorias_padre ?? []`, `slug: c.slug`.
- Tabla, columna "Categorías padre": resolver IDs→nombres:
  ```tsx
  <td>{(c.categorias_padre ?? []).map(id => categorias.find(x => x.id === id)?.valor ?? id).join(', ') || '—'}</td>
  ```
- Formulario: añadir campo **slug** (autogenerado desde el valor, editable):
  ```tsx
  <label className={styles.formLabel}>
    Slug (URL)
    <input type="text" value={form.slug}
      onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
      placeholder="se genera del valor si lo dejas vacio" />
  </label>
  ```
  (No es obligatorio; el Server Action lo genera desde `valor` si viene vacío.)
- Reemplazar el input de texto "Categorías padre" por checkboxes de las categorías `tipo === 'cat'`:
  ```tsx
  {(form.tipo === 'subcat' || form.tipo === 'talla') && (
    <fieldset className={styles.formLabel}>
      <legend>Categorías padre</legend>
      {categorias.filter(x => x.tipo === 'cat').map(padre => (
        <label key={padre.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <input type="checkbox"
            checked={form.categorias_padre.includes(padre.id)}
            onChange={e => setForm(p => ({
              ...p,
              categorias_padre: e.target.checked
                ? [...p.categorias_padre, padre.id]
                : p.categorias_padre.filter(id => id !== padre.id),
            }))} />
          {padre.valor}
        </label>
      ))}
    </fieldset>
  )}
  ```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc 0; build OK. (No hay tests unitarios del admin; la verificación funcional es manual.)

- [ ] **Step 4: Commit**

```bash
git add app/admin/categorias/actions.ts app/admin/categorias/CategoriasClient.tsx
git commit -m "feat(admin): selector de categorias padre por ID y campo slug"
```

---

### Task 6: Rollout (aplicar migración) + verificación

**Files:** ninguno (operación + verificación).

- [ ] **Step 1: Buscar forma de aplicar la migración por herramienta**

Comprobar si existe una vía programática:
- `npx supabase --version` (CLI de Supabase instalada?).
- ¿Hay una cadena de conexión Postgres / `DATABASE_URL` en `.env.local`? (Solo hay `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — la service role key es para PostgREST, NO ejecuta DDL directo.)
- Si hay CLI + link al proyecto: `npx supabase db execute -f supabase/migrations/2026-07-14-categorias-por-id-y-slug.sql` (o el comando equivalente de la versión instalada).

- [ ] **Step 2: Aplicar la migración**

- Si hay vía programática disponible: ejecutarla y verificar (consultar unas filas de `categorias` para confirmar `slug` no nulo y `categorias_padre` con IDs).
- Si NO hay vía disponible: entregar el contenido del `.sql` al usuario para que lo pegue en el **SQL editor de Supabase** y lo ejecute, y esperar su confirmación antes de continuar. (Este paso puede requerir intervención del usuario — es esperado.)

- [ ] **Step 3: Verificación final (post-migración)**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: todo verde.

Verificación manual (tras el merge/deploy, o en `npm run dev` apuntando a la BD ya migrada):
1. Admin → Categorías: crear/editar una subcategoría o talla y asignar padres con los **checkboxes**; el slug se autogenera; la tabla muestra los nombres de los padres.
2. Tienda: los filtros de talla y el dropdown de subcategorías de la barra siguen funcionando (ahora por ID).
3. Renombrar una categoría en el admin y confirmar que **su slug NO cambia** y que un enlace de filtro compartido previo sigue funcionando.

- [ ] **Step 4: Cierre**

Con todo verde y la migración aplicada, pasar a `superpowers:finishing-a-development-branch` para fusionar y desplegar.

---

## Notas de cierre

- **Orden crítico:** la migración (Task 6) debe aplicarse en Supabase ANTES de que el código nuevo sirva tráfico en producción.
- **Proyecto 2b (siguiente):** URLs de producto por nombre (`/producto/<slug>`).
