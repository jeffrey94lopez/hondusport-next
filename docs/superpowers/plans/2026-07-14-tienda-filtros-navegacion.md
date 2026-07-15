# Rediseño de navegación y filtros de la tienda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar categorías/tallas/subcategorías/género en un único modelo de filtros multi-selección con la URL como fuente de verdad, chips de filtros activos, y el filtro de talla corregido.

**Architecture:** La URL (`useSearchParams`) es la fuente de verdad. Un hook `useStoreFilters` lee/escribe filtros como slugs legibles. Toda la lógica de serialización y filtrado vive pura en `lib/store/` con tests. Los componentes (`FilterSidebar`, `CategoryBar`, nuevo `ActiveFilterChips`) son controlados y escriben en el mismo estado vía callbacks. Se elimina `CategoryGallery`.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Vitest, CSS Modules.

## Global Constraints

- Lógica de negocio con peso va **pura en `lib/store/` con test en `lib/store/tests/`** (Vitest).
- **Sin cambios en la base de datos.** Se resuelve slug↔`valor` en memoria contra la lista de `categorias`.
- URLs de filtro usan **nombres legibles (slugs), nunca IDs ni códigos**: `?cat=camisetas&genero=hombre&talla=M,L&max=2500`.
- Idioma español; moneda en Lempiras (`formatPrice`).
- Tras cada tarea que toque tipos o Server Components: `npm test` y `npx tsc --noEmit`.
- Commits en español, formato convencional.
- Tipos existentes: `FilterState = { maxPrice: number; generos: string[]; cats: string[]; tallas: string[]; subcats: string[] }` (en `lib/store/filters.ts`). `StoreProducto` tiene `cat: string`, `subcat: string | null`, `genero: string | null`, `tallas: string[]`. `Categoria = { id, tipo: 'cat'|'subcat'|'talla'|'genero', valor: string, imagen, categorias_padre: string[] | null, orden, activo }`.

---

### Task 1: Arreglar el filtro de talla (tallas efectivas)

**Files:**
- Modify: `lib/store/filters.ts` (función `filterProductos`, bloque `matchesTalla`)
- Test: `lib/store/tests/filters.test.ts`

**Interfaces:**
- Consumes: `getTallas(producto, tallaFiltros)` de `lib/store/getTallas.ts` (ya existe).
- Produces: sin cambios de firma en `filterProductos`.

- [ ] **Step 1: Escribir el test que falla**

Añadir en `lib/store/tests/filters.test.ts`, dentro de `describe('filterProductos', …)`, después del test `'filters by talla using tallaFiltros categorias_padre'`:

```ts
  test('excludes a product whose explicit tallas do not include the selected size', () => {
    const conTallas = [
      makeProducto({ id: '1', cat: 'Camisetas', tallas: ['S'] }),
      makeProducto({ id: '2', cat: 'Camisetas', tallas: ['M', 'L'] }),
    ]
    const result = filterProductos({
      productos: conTallas,
      maxPrice: 5000,
      generos: [],
      cats: [],
      tallas: ['M'],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['2'])
  })
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run lib/store/tests/filters.test.ts -t "explicit tallas"`
Expected: FAIL — con la lógica actual el producto `1` (tallas `['S']`) también pasa porque `M` es hija de `Camisetas`, así que `result` sería `['1','2']`.

- [ ] **Step 3: Implementar el arreglo**

En `lib/store/filters.ts`, añadir el import y reemplazar el bloque `matchesTalla`.

Añadir al inicio del archivo (junto a los imports existentes):

```ts
import { getTallas } from './getTallas'
```

Reemplazar este bloque dentro de `filterProductos`:

```ts
    let matchesTalla = true
    if (tallas.length > 0) {
      const validSizeFilters = tallaFiltros.filter(f => tallas.includes(f.valor))
      matchesTalla = validSizeFilters.some(f =>
        (f.categorias_padre ?? []).some(padre => padre.toLowerCase() === p.cat.toLowerCase())
      )
    }
```

por:

```ts
    let matchesTalla = true
    if (tallas.length > 0) {
      const efectivas = getTallas(p, tallaFiltros)
      matchesTalla = tallas.some(t => efectivas.includes(t))
    }
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `npx vitest run lib/store/tests/filters.test.ts`
Expected: PASS — el test nuevo pasa y `'filters by talla using tallaFiltros categorias_padre'` sigue pasando (el producto `3` tiene `tallas: []`, hereda `['42']` de su categoría vía `getTallas`).

- [ ] **Step 5: Commit**

```bash
git add lib/store/filters.ts lib/store/tests/filters.test.ts
git commit -m "fix(store): filtro de talla usa tallas efectivas del producto"
```

---

### Task 2: Serialización de filtros ↔ URL (`filterParams.ts`, puro)

**Files:**
- Create: `lib/store/filterParams.ts`
- Test: `lib/store/tests/filterParams.test.ts`

**Interfaces:**
- Consumes: `FilterState` de `./filters`; `Categoria` de `@/types/store`.
- Produces:
  - `type FilterTipo = 'cat' | 'subcat' | 'genero' | 'talla'`
  - `slugify(valor: string): string`
  - `interface FilterParamsCtx { categorias: Categoria[]; maxPriceLimit: number }`
  - `parseFilters(params: URLSearchParams, ctx: FilterParamsCtx): FilterState`
  - `filtersToQuery(filters: FilterState, ctx: FilterParamsCtx): string`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/store/tests/filterParams.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { slugify, parseFilters, filtersToQuery } from '../filterParams'
import type { FilterState } from '../filters'
import type { Categoria } from '@/types/store'

function cat(tipo: Categoria['tipo'], valor: string): Categoria {
  return { id: valor, tipo, valor, imagen: null, categorias_padre: null, orden: 0, activo: true }
}

const categorias: Categoria[] = [
  cat('cat', 'Camisetas'),
  cat('cat', 'Zapatos'),
  cat('subcat', 'Manga Larga'),
  cat('genero', 'Hombre'),
  cat('genero', 'Mujer'),
  cat('talla', 'M'),
  cat('talla', 'L'),
]
const ctx = { categorias, maxPriceLimit: 5000 }

describe('slugify', () => {
  test('lowercases, strips accents and spaces', () => {
    expect(slugify('Camisetas de Algodón')).toBe('camisetas-de-algodon')
  })
})

describe('filtersToQuery / parseFilters round-trip', () => {
  test('serializes readable slugs and parses them back to valores', () => {
    const filters: FilterState = {
      maxPrice: 2500,
      generos: ['Hombre'],
      cats: ['Camisetas'],
      tallas: ['M', 'L'],
      subcats: ['Manga Larga'],
    }
    const query = filtersToQuery(filters, ctx)
    expect(query).toContain('cat=camisetas')
    expect(query).toContain('genero=hombre')
    expect(query).toContain('talla=m%2Cl')
    expect(query).toContain('subcat=manga-larga')
    expect(query).toContain('max=2500')

    const parsed = parseFilters(new URLSearchParams(query), ctx)
    expect(parsed).toEqual(filters)
  })

  test('omits max when at the price limit', () => {
    const filters: FilterState = { maxPrice: 5000, generos: [], cats: [], tallas: [], subcats: [] }
    expect(filtersToQuery(filters, ctx)).toBe('')
  })

  test('parse defaults maxPrice to the limit when absent', () => {
    const parsed = parseFilters(new URLSearchParams(''), ctx)
    expect(parsed).toEqual({ maxPrice: 5000, generos: [], cats: [], tallas: [], subcats: [] })
  })

  test('ignores unknown slugs', () => {
    const parsed = parseFilters(new URLSearchParams('cat=camisetas,inexistente'), ctx)
    expect(parsed.cats).toEqual(['Camisetas'])
  })
})
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `npx vitest run lib/store/tests/filterParams.test.ts`
Expected: FAIL con "Cannot find module '../filterParams'".

- [ ] **Step 3: Implementar `filterParams.ts`**

Crear `lib/store/filterParams.ts`:

```ts
import type { FilterState } from './filters'
import type { Categoria } from '@/types/store'

export type FilterTipo = 'cat' | 'subcat' | 'genero' | 'talla'

export interface FilterParamsCtx {
  categorias: Categoria[]
  maxPriceLimit: number
}

// tipo de filtro -> (clave de query, campo de FilterState, tipo de categoria)
const MAP: Record<FilterTipo, { key: string; field: keyof Omit<FilterState, 'maxPrice'>; catTipo: Categoria['tipo'] }> = {
  cat: { key: 'cat', field: 'cats', catTipo: 'cat' },
  subcat: { key: 'subcat', field: 'subcats', catTipo: 'subcat' },
  genero: { key: 'genero', field: 'generos', catTipo: 'genero' },
  talla: { key: 'talla', field: 'tallas', catTipo: 'talla' },
}

export function slugify(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function valoresDeTipo(ctx: FilterParamsCtx, catTipo: Categoria['tipo']): string[] {
  return ctx.categorias.filter(c => c.tipo === catTipo).map(c => c.valor)
}

export function filtersToQuery(filters: FilterState, ctx: FilterParamsCtx): string {
  const params = new URLSearchParams()
  for (const tipo of Object.keys(MAP) as FilterTipo[]) {
    const { key, field } = MAP[tipo]
    const values = filters[field]
    if (values.length > 0) params.set(key, values.map(slugify).join(','))
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
    const valores = valoresDeTipo(ctx, catTipo)
    result[field] = slugs
      .map(slug => valores.find(v => slugify(v) === slug))
      .filter((v): v is string => v != null)
  }

  const max = Number(params.get('max'))
  if (Number.isFinite(max) && max > 0) result.maxPrice = max

  return result
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `npx vitest run lib/store/tests/filterParams.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/store/filterParams.ts lib/store/tests/filterParams.test.ts
git commit -m "feat(store): serializacion de filtros a URL con slugs legibles"
```

---

### Task 3: Hook `useStoreFilters`

**Files:**
- Create: `lib/store/useStoreFilters.ts`

**Interfaces:**
- Consumes: `parseFilters`, `filtersToQuery`, `FilterTipo`, `FilterParamsCtx` de `./filterParams`; `FilterState` de `./filters`; `useSearchParams`, `useRouter`, `usePathname` de `next/navigation`.
- Produces:
  ```ts
  interface UseStoreFilters {
    filters: FilterState
    toggle: (tipo: FilterTipo, valor: string) => void
    setMaxPrice: (n: number) => void
    clearOne: (tipo: FilterTipo, valor: string) => void
    clearAll: () => void
    activeCount: number
  }
  function useStoreFilters(ctx: FilterParamsCtx): UseStoreFilters
  ```

- [ ] **Step 1: Implementar el hook**

Crear `lib/store/useStoreFilters.ts`:

```ts
'use client'
import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { FilterState } from './filters'
import { parseFilters, filtersToQuery, type FilterTipo, type FilterParamsCtx } from './filterParams'

const FIELD: Record<FilterTipo, keyof Omit<FilterState, 'maxPrice'>> = {
  cat: 'cats',
  subcat: 'subcats',
  genero: 'generos',
  talla: 'tallas',
}

export interface UseStoreFilters {
  filters: FilterState
  toggle: (tipo: FilterTipo, valor: string) => void
  setMaxPrice: (n: number) => void
  clearOne: (tipo: FilterTipo, valor: string) => void
  clearAll: () => void
  activeCount: number
}

export function useStoreFilters(ctx: FilterParamsCtx): UseStoreFilters {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString()), ctx),
    [searchParams, ctx],
  )

  const write = useCallback(
    (next: FilterState) => {
      const query = filtersToQuery(next, ctx)
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, ctx],
  )

  const toggle = useCallback(
    (tipo: FilterTipo, valor: string) => {
      const field = FIELD[tipo]
      const current = filters[field]
      const nextValues = current.includes(valor)
        ? current.filter(v => v !== valor)
        : [...current, valor]
      write({ ...filters, [field]: nextValues })
    },
    [filters, write],
  )

  const clearOne = useCallback(
    (tipo: FilterTipo, valor: string) => {
      const field = FIELD[tipo]
      write({ ...filters, [field]: filters[field].filter(v => v !== valor) })
    },
    [filters, write],
  )

  const setMaxPrice = useCallback((n: number) => write({ ...filters, maxPrice: n }), [filters, write])

  const clearAll = useCallback(() => write({ ...filters, generos: [], cats: [], tallas: [], subcats: [], maxPrice: ctx.maxPriceLimit }), [filters, write, ctx])

  const activeCount =
    filters.cats.length + filters.subcats.length + filters.generos.length + filters.tallas.length +
    (filters.maxPrice < ctx.maxPriceLimit ? 1 : 0)

  return { filters, toggle, setMaxPrice, clearOne, clearAll, activeCount }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0 (sin errores).

- [ ] **Step 3: Commit**

```bash
git add lib/store/useStoreFilters.ts
git commit -m "feat(store): hook useStoreFilters con la URL como fuente de verdad"
```

---

### Task 4: Componente `ActiveFilterChips`

**Files:**
- Create: `components/store/ActiveFilterChips.tsx`
- Create: `components/store/ActiveFilterChips.module.css`

**Interfaces:**
- Consumes: `FilterState` de `@/lib/store/filters`; `FilterTipo` de `@/lib/store/filterParams`; `formatPrice` de `@/lib/store/format`.
- Produces:
  ```ts
  interface ActiveFilterChipsProps {
    filters: FilterState
    maxPriceLimit: number
    onClearOne: (tipo: FilterTipo, valor: string) => void
    onClearAll: () => void
  }
  ```

- [ ] **Step 1: Crear el CSS**

Crear `components/store/ActiveFilterChips.module.css`:

```css
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.75rem 1rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--text);
  border-radius: 999px;
  font-size: 0.8rem;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.chip:hover {
  opacity: 0.7;
}

.clearAll {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text);
  font-size: 0.8rem;
  text-decoration: underline;
  cursor: pointer;
}
```

- [ ] **Step 2: Crear el componente**

Crear `components/store/ActiveFilterChips.tsx`:

```tsx
'use client'
import styles from './ActiveFilterChips.module.css'
import { formatPrice } from '@/lib/store/format'
import type { FilterState } from '@/lib/store/filters'
import type { FilterTipo } from '@/lib/store/filterParams'

interface ActiveFilterChipsProps {
  filters: FilterState
  maxPriceLimit: number
  onClearOne: (tipo: FilterTipo, valor: string) => void
  onClearAll: () => void
}

interface Chip {
  tipo: FilterTipo
  valor: string
}

export default function ActiveFilterChips({ filters, maxPriceLimit, onClearOne, onClearAll }: ActiveFilterChipsProps) {
  const chips: Chip[] = [
    ...filters.cats.map(valor => ({ tipo: 'cat' as const, valor })),
    ...filters.subcats.map(valor => ({ tipo: 'subcat' as const, valor })),
    ...filters.generos.map(valor => ({ tipo: 'genero' as const, valor })),
    ...filters.tallas.map(valor => ({ tipo: 'talla' as const, valor })),
  ]

  const hasPrice = filters.maxPrice < maxPriceLimit
  if (chips.length === 0 && !hasPrice) return null

  return (
    <div className={styles.row}>
      {chips.map(({ tipo, valor }) => (
        <button
          key={`${tipo}-${valor}`}
          className={styles.chip}
          onClick={() => onClearOne(tipo, valor)}
          aria-label={`Quitar filtro ${valor}`}
        >
          {valor} <span aria-hidden>✕</span>
        </button>
      ))}
      {hasPrice && (
        <span className={styles.chip}>Hasta {formatPrice(filters.maxPrice)}</span>
      )}
      <button className={styles.clearAll} onClick={onClearAll}>
        Limpiar todo
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/store/ActiveFilterChips.tsx components/store/ActiveFilterChips.module.css
git commit -m "feat(store): componente ActiveFilterChips (chips de filtros activos)"
```

---

### Task 5: `FilterSidebar` controlado

**Files:**
- Modify: `components/store/FilterSidebar.tsx`

**Interfaces:**
- Consumes: `FilterState` de `@/lib/store/filters`; `FilterTipo` de `@/lib/store/filterParams`.
- Produces (nueva firma de props):
  ```ts
  interface FilterSidebarProps {
    categorias: Categoria[]
    filters: FilterState
    maxPriceLimit?: number
    isOpen?: boolean
    onClose?: () => void
    onToggle: (tipo: FilterTipo, valor: string) => void
    onMaxPrice: (n: number) => void
    onClearAll: () => void
  }
  ```

- [ ] **Step 1: Reemplazar el archivo completo**

Reemplazar todo `components/store/FilterSidebar.tsx` por:

```tsx
'use client'
import styles from './FilterSidebar.module.css'
import { formatPrice } from '@/lib/store/format'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { FilterState } from '@/lib/store/filters'
import type { FilterTipo } from '@/lib/store/filterParams'
import type { Categoria } from '@/types/store'

const PRICE_MIN = 500
const PRICE_STEP = 100

interface FilterSidebarProps {
  categorias: Categoria[]
  filters: FilterState
  maxPriceLimit?: number
  isOpen?: boolean
  onClose?: () => void
  onToggle: (tipo: FilterTipo, valor: string) => void
  onMaxPrice: (n: number) => void
  onClearAll: () => void
}

export default function FilterSidebar({
  categorias,
  filters,
  maxPriceLimit = 5000,
  isOpen,
  onClose,
  onToggle,
  onMaxPrice,
  onClearAll,
}: FilterSidebarProps) {
  useEscapeKey(isOpen ?? false, () => onClose?.())

  const generoFiltros = categorias.filter(c => c.tipo === 'genero')
  const catFiltros = categorias.filter(c => c.tipo === 'cat')
  const tallaFiltros = categorias.filter(c => c.tipo === 'talla')
  const subcatFiltros = categorias.filter(c => c.tipo === 'subcat')

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarActive : ''}`}>
      <button className={styles.closeBtn} onClick={() => onClose?.()} aria-label="Cerrar filtros">
        ✕
      </button>

      {generoFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>GÉNERO</h4>
          {generoFiltros.map(f => (
            <label key={f.id} className={styles.checkLabel}>
              <input
                type="checkbox"
                className={styles.filterCheck}
                checked={filters.generos.includes(f.valor)}
                onChange={() => onToggle('genero', f.valor)}
              />
              {f.valor}
            </label>
          ))}
        </div>
      )}

      {catFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>CATEGORÍA</h4>
          {catFiltros.map(f => (
            <label key={f.id} className={styles.checkLabel}>
              <input
                type="checkbox"
                className={styles.filterCheck}
                checked={filters.cats.includes(f.valor)}
                onChange={() => onToggle('cat', f.valor)}
              />
              {f.valor}
            </label>
          ))}
        </div>
      )}

      {tallaFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>TALLA</h4>
          <div className={styles.tallaBtnGroup}>
            {tallaFiltros.map(f => (
              <button
                key={f.id}
                className={`${styles.tallaBtn} ${filters.tallas.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => onToggle('talla', f.valor)}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </div>
      )}

      {subcatFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>SUBCATEGORÍA</h4>
          <div className={styles.tallaBtnGroup}>
            {subcatFiltros.map(f => (
              <button
                key={f.id}
                className={`${styles.tallaBtn} ${filters.subcats.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => onToggle('subcat', f.valor)}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.filterGroup}>
        <h4>
          PRECIO MÁXIMO: <span>{formatPrice(filters.maxPrice)}</span>
        </h4>
        <input
          type="range"
          className={styles.priceRange}
          min={PRICE_MIN}
          max={maxPriceLimit}
          step={PRICE_STEP}
          value={filters.maxPrice}
          onChange={e => onMaxPrice(Number(e.target.value))}
        />
      </div>

      <button className={styles.clearBtn} onClick={onClearAll}>
        <i className="fa-solid fa-trash-can" /> LIMPIAR FILTROS
      </button>
    </aside>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: fallará en `app/(store)/StoreClient.tsx` porque aún pasa las props viejas (`onChange`). Eso se corrige en la Task 7. El archivo `FilterSidebar.tsx` en sí no debe tener errores propios.

- [ ] **Step 3: Commit**

```bash
git add components/store/FilterSidebar.tsx
git commit -m "refactor(store): FilterSidebar controlado por props de filtros"
```

---

### Task 6: `CategoryBar` como accesos rápidos sincronizados

**Files:**
- Modify: `components/store/CategoryBar.tsx`

**Interfaces:**
- Produces (nueva firma):
  ```ts
  interface CategoryBarProps {
    cats: Categoria[]
    subcats: Categoria[]
    activeCats: string[]
    activeSubcats: string[]
    onToggleCat: (valor: string) => void
    onToggleSubcat: (valor: string) => void
  }
  ```

- [ ] **Step 1: Reemplazar el archivo completo**

Reemplazar todo `components/store/CategoryBar.tsx` por:

```tsx
'use client'
import styles from './CategoryBar.module.css'
import type { Categoria } from '@/types/store'

interface CategoryBarProps {
  cats: Categoria[]
  subcats: Categoria[]
  activeCats: string[]
  activeSubcats: string[]
  onToggleCat: (valor: string) => void
  onToggleSubcat: (valor: string) => void
}

export default function CategoryBar({ cats, subcats, activeCats, activeSubcats, onToggleCat, onToggleSubcat }: CategoryBarProps) {
  const noneActive = activeCats.length === 0

  return (
    <div className={styles.bar}>
      <div className={styles.barInner}>
        <button
          className={`${styles.filterBtn} ${noneActive ? styles.filterBtnActive : ''}`}
          onClick={() => activeCats.forEach(c => onToggleCat(c))}
        >
          Todos
        </button>

        {cats.map(cat => {
          const isActive = activeCats.includes(cat.valor)
          const subcatsForCat = subcats.filter(s =>
            (s.categorias_padre ?? []).some(parent => parent.toLowerCase() === cat.valor.toLowerCase())
          )

          if (subcatsForCat.length > 0) {
            return (
              <div key={cat.id} className={styles.dropdownWrapper}>
                <button
                  className={`${styles.filterBtn} ${isActive ? styles.filterBtnActive : ''}`}
                  onClick={() => onToggleCat(cat.valor)}
                >
                  {cat.valor.toUpperCase()}
                </button>
                <div className={styles.dropdown}>
                  {subcatsForCat.map(sub => (
                    <button
                      key={sub.id}
                      className={`${styles.subItem} ${activeSubcats.includes(sub.valor) ? styles.filterBtnActive : ''}`}
                      onClick={() => onToggleSubcat(sub.valor)}
                    >
                      {sub.valor.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <button
              key={cat.id}
              className={`${styles.filterBtn} ${isActive ? styles.filterBtnActive : ''}`}
              onClick={() => onToggleCat(cat.valor)}
            >
              {cat.valor.toUpperCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

Nota: "Todos" desactiva las categorías activas (hace toggle de cada una); no toca los demás filtros.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: seguirá fallando en `StoreClient.tsx` (Task 7). `CategoryBar.tsx` sin errores propios.

- [ ] **Step 3: Commit**

```bash
git add components/store/CategoryBar.tsx
git commit -m "refactor(store): CategoryBar como accesos rapidos sincronizados"
```

---

### Task 7: Rewiring de `StoreClient` + eliminar galería + Suspense

**Files:**
- Modify: `app/(store)/StoreClient.tsx`
- Modify: `app/(store)/page.tsx` (envolver en `<Suspense>`)
- Delete: `components/store/CategoryGallery.tsx`, `components/store/CategoryGallery.module.css`

**Interfaces:**
- Consumes: `useStoreFilters` (Task 3), `ActiveFilterChips` (Task 4), `FilterSidebar` (Task 5), `CategoryBar` (Task 6).

- [ ] **Step 1: Reemplazar `StoreClient.tsx`**

Reemplazar todo `app/(store)/StoreClient.tsx` por:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import StoreHeader from '@/components/store/StoreHeader'
import HeroCarousel from '@/components/store/HeroCarousel'
import CategoryBar from '@/components/store/CategoryBar'
import ActiveFilterChips from '@/components/store/ActiveFilterChips'
import FilterSidebar from '@/components/store/FilterSidebar'
import ProductGrid from '@/components/store/ProductGrid'
import CartDrawer from '@/components/store/CartDrawer'
import WishlistDrawer from '@/components/store/WishlistDrawer'
import CheckoutModal from '@/components/store/CheckoutModal'
import MegaSearch from '@/components/store/MegaSearch'
import ExitPopup from '@/components/store/ExitPopup'
import Footer from '@/components/store/Footer'
import { useCart } from '@/lib/store/cart-context'
import { filterProductos } from '@/lib/store/filters'
import { getTallas } from '@/lib/store/getTallas'
import { useStoreFilters } from '@/lib/store/useStoreFilters'
import styles from './page.module.css'
import type { StoreProducto, Categoria, Banner, ConfigMap, Envio, Cupon } from '@/types/store'

const DEFAULT_MAX_PRICE = 5000
const DEFAULT_FREE_SHIPPING_THRESHOLD = 999
const SIN_PERSONALIZACION = 'Sin personalización'
const TALLA_UNICA = 'Única'

interface StoreClientProps {
  productos: StoreProducto[]
  categorias: Categoria[]
  banners: Banner[]
  envios: Envio[]
  cupones: Cupon[]
  config: ConfigMap
}

function isConfigActivo(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toUpperCase() !== 'FALSE'
}

export default function StoreClient({ productos, categorias, banners, envios, cupones, config }: StoreClientProps) {
  const router = useRouter()
  const { addToCart } = useCart()

  const maxPriceLimit = useMemo(() => Math.max(DEFAULT_MAX_PRICE, ...productos.map(p => p.precio)), [productos])
  const ctx = useMemo(() => ({ categorias, maxPriceLimit }), [categorias, maxPriceLimit])
  const { filters, toggle, setMaxPrice, clearOne, clearAll, activeCount } = useStoreFilters(ctx)

  const [cartOpen, setCartOpen] = useState(false)
  const [wishlistOpen, setWishlistOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false)

  const catsNav = categorias.filter(c => c.tipo === 'cat')
  const subcats = categorias.filter(c => c.tipo === 'subcat')
  const tallaFiltros = categorias.filter(c => c.tipo === 'talla')

  const filtered = filterProductos({ productos, ...filters, search: '', tallaFiltros })

  function openProduct(id: string) {
    router.push(`/producto/${id}`)
  }

  // StoreHeader/Footer envían valores especiales además de categorías reales:
  // '' o null = "todos" (limpiar), 'OFERTAS' = filtro de ofertas (fuera de alcance P1).
  function handleCatLink(valor: string | null) {
    if (!valor) {
      clearAll()
      return
    }
    if (valor === 'OFERTAS') return // ofertas no es una categoría; se ignora en P1
    toggle('cat', valor)
  }

  function quickAdd(id: string) {
    const producto = productos.find(p => p.id === id)
    if (!producto) return
    const tallas = getTallas(producto, tallaFiltros)
    addToCart({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      imagen: producto.imagenes[0] ?? '',
      size: tallas[0] ?? TALLA_UNICA,
      custom: SIN_PERSONALIZACION,
      personalizable: producto.personalizable,
    })
  }

  const freeShippingActivo = isConfigActivo(config.free_shipping_activo, true)
  const parsedThreshold = Number(config.free_shipping_minimo)
  const freeShippingThreshold = config.free_shipping_minimo && Number.isFinite(parsedThreshold) ? parsedThreshold : DEFAULT_FREE_SHIPPING_THRESHOLD
  const cuponesPopupActivo = isConfigActivo(config.cupones_popup_activo, true)
  const hasOfertas = productos.some(p => p.precioOriginal !== null && p.precioOriginal > p.precio)

  return (
    <>
      {config.promo_bar_texto && <div className={styles.promoBar}>{config.promo_bar_texto}</div>}
      <StoreHeader
        logoUrl={config.logo_url}
        categorias={catsNav}
        onSelectCat={handleCatLink}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCart={() => setCartOpen(true)}
        onOpenWishlist={() => setWishlistOpen(true)}
      />
      <HeroCarousel banners={banners} />
      <CategoryBar
        cats={catsNav}
        subcats={subcats}
        activeCats={filters.cats}
        activeSubcats={filters.subcats}
        onToggleCat={valor => toggle('cat', valor)}
        onToggleSubcat={valor => toggle('subcat', valor)}
      />
      <ActiveFilterChips
        filters={filters}
        maxPriceLimit={maxPriceLimit}
        onClearOne={clearOne}
        onClearAll={clearAll}
      />
      <main className={styles.main}>
        <button className={styles.mobileFilterTrigger} onClick={() => setFilterSidebarOpen(true)}>
          🔍 FILTROS{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        <div className={styles.catalogLayout}>
          <FilterSidebar
            categorias={categorias}
            filters={filters}
            maxPriceLimit={maxPriceLimit}
            isOpen={filterSidebarOpen}
            onClose={() => setFilterSidebarOpen(false)}
            onToggle={toggle}
            onMaxPrice={setMaxPrice}
            onClearAll={clearAll}
          />
          <ProductGrid productos={filtered} totalProductos={productos.length} onQuickAdd={quickAdd} onOpen={openProduct} onClearFilters={clearAll} />
        </div>
      </main>
      <Footer config={config} categorias={catsNav} hasOfertas={hasOfertas} onFilterClick={handleCatLink} />
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false)
          setCheckoutOpen(true)
        }}
        onOpenProduct={openProduct}
        freeShippingActivo={freeShippingActivo}
        freeShippingThreshold={freeShippingThreshold}
        cupones={cupones}
      />
      <WishlistDrawer
        productos={productos}
        tallaFiltros={tallaFiltros}
        isOpen={wishlistOpen}
        onClose={() => setWishlistOpen(false)}
        onOpenProduct={openProduct}
      />
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        envios={envios}
        cupones={cupones}
        whatsappNumber={config.whatsapp_principal ?? ''}
        freeShippingActivo={freeShippingActivo}
        freeShippingThreshold={freeShippingThreshold}
      />
      <MegaSearch productos={productos} categorias={catsNav} isOpen={searchOpen} onClose={() => setSearchOpen(false)} onOpenProduct={openProduct} />
      <ExitPopup cupones={cupones} activo={cuponesPopupActivo} />
    </>
  )
}
```

Cambios clave: se eliminó `CategoryGallery` y el estado `activeCat/activeSubcat/filters`; ahora todo viene de `useStoreFilters`. `ProductGrid` recibe un `onClearFilters` nuevo (Task 8). `StoreHeader.onSelectCat` (firma `(cat: string | null) => void`) y `Footer.onFilterClick` (firma `(value: string) => void`) se enrutan por `handleCatLink`, que traduce los valores especiales (`''`/`null` → limpiar, `'OFERTAS'` → ignorar) y togglea el resto como filtro `cat`. Nota: `StoreHeader` mantiene su propio `activeCat` interno para resaltar su nav; ese resaltado no refleja la URL (limitación menor aceptada en P1).

- [ ] **Step 2: Envolver `StoreClient` en `<Suspense>` en `page.tsx`**

En `app/(store)/page.tsx`, añadir el import de `Suspense` en la primera línea:

```tsx
import { Suspense } from 'react'
import type { Metadata } from 'next'
```

Y reemplazar el bloque `return (…)` de `StorePage` (líneas ~37-46) por:

```tsx
  return (
    <Suspense fallback={null}>
      <StoreClient
        productos={storeProductos}
        categorias={categorias ?? []}
        banners={banners ?? []}
        envios={envios ?? []}
        cupones={cupones ?? []}
        config={configMap}
      />
    </Suspense>
  )
```

`useSearchParams` (que usa `useStoreFilters`) requiere un límite de `<Suspense>` por encima; sin él, `next build` falla con un error de prerender.

- [ ] **Step 3: Eliminar la galería**

```bash
git rm components/store/CategoryGallery.tsx components/store/CategoryGallery.module.css
```

- [ ] **Step 4: Verificar tipos y tests**

Run: `npx tsc --noEmit && npm test`
Expected: `tsc` exit 0 (si `ProductGrid` aún no tiene `onClearFilters`, dará error — completar Task 8 antes de este check o hacer Task 8 primero). Todos los tests PASS.

> Nota de orden: la Task 8 (ProductGrid) introduce `onClearFilters`. Si se ejecuta este check antes, `tsc` marcará esa prop. Ejecutar Task 8 y volver a correr.

- [ ] **Step 5: Commit**

```bash
git add app/(store)/StoreClient.tsx app/(store)/page.tsx
git commit -m "feat(store): StoreClient usa useStoreFilters + chips; elimina galeria"
```

---

### Task 8: Estado vacío en `ProductGrid`

**Files:**
- Modify: `components/store/ProductGrid.tsx`
- Modify: `components/store/ProductGrid.module.css` (añadir estilos del estado vacío)

**Interfaces:**
- Produces: nueva prop opcional `onClearFilters?: () => void` en `ProductGridProps`.

Contexto: `ProductGrid.tsx` **ya tiene** un estado vacío en las líneas 116-118
(`if (productos.length === 0) return <p className={styles.noResults}>🚫 NO SE ENCONTRARON PRODUCTOS.</p>`).
Esta tarea lo enriquece con el botón "Limpiar filtros"; no añade un bloque nuevo.

- [ ] **Step 1: Añadir la prop a la interfaz**

En `components/store/ProductGrid.tsx`, reemplazar la interfaz (líneas 10-15):

```tsx
interface ProductGridProps {
  productos: StoreProducto[]
  totalProductos: number
  onQuickAdd?: (id: string) => void
  onOpen?: (id: string) => void
}
```

por:

```tsx
interface ProductGridProps {
  productos: StoreProducto[]
  totalProductos: number
  onQuickAdd?: (id: string) => void
  onOpen?: (id: string) => void
  onClearFilters?: () => void
}
```

- [ ] **Step 2: Recibir la prop en la desestructuración**

Reemplazar la firma de la función (línea 103):

```tsx
export default function ProductGrid({ productos, totalProductos, onQuickAdd, onOpen }: ProductGridProps) {
```

por:

```tsx
export default function ProductGrid({ productos, totalProductos, onQuickAdd, onOpen, onClearFilters }: ProductGridProps) {
```

- [ ] **Step 3: Enriquecer el estado vacío existente**

Reemplazar el bloque (líneas 116-118):

```tsx
  if (productos.length === 0) {
    return <p className={styles.noResults}>🚫 NO SE ENCONTRARON PRODUCTOS.</p>
  }
```

por:

```tsx
  if (productos.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.noResults}>🚫 NO SE ENCONTRARON PRODUCTOS.</p>
        {onClearFilters && (
          <button className={styles.emptyClearBtn} onClick={onClearFilters}>
            Limpiar filtros
          </button>
        )}
      </div>
    )
  }
```

- [ ] **Step 4: Añadir estilos**

Añadir al final de `components/store/ProductGrid.module.css`:

```css
.emptyState {
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text);
}

.emptyClearBtn {
  margin-top: 1rem;
  padding: 0.5rem 1.2rem;
  border: 1px solid var(--text);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
```

- [ ] **Step 5: Verificar tipos y tests**

Run: `npx tsc --noEmit && npm test`
Expected: `tsc` exit 0; todos los tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/store/ProductGrid.tsx components/store/ProductGrid.module.css
git commit -m "feat(store): estado vacio en ProductGrid con limpiar filtros"
```

---

### Task 9: Verificación manual end-to-end

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar el dev server**

Run: `npm run dev`
Abrir `http://localhost:3000`.

- [ ] **Step 2: Verificar el flujo**

Comprobar cada punto:
1. Tocar una categoría en la **barra superior** → se marca activa, aparece un **chip**, la URL cambia a `?cat=<slug>`, y el checkbox correspondiente en el **sidebar** queda marcado (sincronía).
2. Marcar **género** y **talla** en el sidebar → se combinan (no se sobrescriben), aparecen chips y la URL acumula `&genero=...&talla=...`.
3. **Filtro de talla:** elegir una talla y confirmar que solo aparecen productos que realmente la tienen (o la heredan de su categoría).
4. Quitar un **chip** → se quita ese filtro en barra y sidebar.
5. **"Limpiar todo"** → sin filtros, URL limpia.
6. **Compartir URL:** copiar la URL con filtros, abrir en pestaña nueva/recargar → los filtros se mantienen; botón atrás funciona.
7. **Estado vacío:** aplicar filtros sin resultados → mensaje + "Limpiar filtros".
8. **Móvil** (DevTools responsive): botón "FILTROS (n)" con conteo, drawer abre/cierra, chips y barra con scroll horizontal.

- [ ] **Step 3: Verificación final de build**

Run: `npm run build`
Expected: build exitoso sin errores de Suspense/`useSearchParams`.

- [ ] **Step 4: (Opcional) Pulido visual**

Si se desea refinar la estética de chips/dropdowns/drawer, invocar el skill `frontend-design` como pasada de pulido sobre los CSS Modules tocados. No bloquea la funcionalidad.

---

## Notas de cierre

- **Proyecto 2 (fuera de alcance):** relaciones de categoría por ID, UX del admin, y **URLs de producto por nombre** (`/producto/<slug>`; ver memoria `proyecto-slug-urls-productos`).
- El matching por texto (`categorias_padre`, case-insensitive) se mantiene tal cual en este proyecto.
