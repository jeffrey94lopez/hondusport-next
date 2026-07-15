# Proyecto 1 — Rediseño de navegación y filtros de la tienda

**Fecha:** 2026-07-14
**Estado:** Diseño aprobado (pendiente revisión de spec)

## Contexto y problema

El sistema de categorías/tallas/subcategorías/género de la tienda tiene hoy
varias superficies que escriben en **dos estados de selección distintos que se
sobrescriben** en lugar de combinarse:

- `CategoryBar` (barra superior), `CategoryGallery`, `StoreHeader` y `Footer`
  fijan `activeCat`/`activeSubcat` (selección **única**).
- `FilterSidebar` fija `filters.cats/subcats/generos/tallas/maxPrice` (selección
  **múltiple**).
- En `StoreClient`: `effectiveCats = activeCat ? [activeCat] : filters.cats`, es
  decir, la barra superior **anula** los filtros del sidebar. No hay sincronía
  ni chips que muestren lo aplicado.

Además hay dos defectos:

1. **Filtro de talla incorrecto:** `filters.ts` hace match de talla comprobando
   si la categoría del producto es "padre" de la talla, **no** si el producto
   realmente viene en esa talla.
2. No hay estado de filtros en la URL: no se puede compartir ni volver atrás.

## Objetivo

Un **único modelo de filtros multi-selección que se combina**, con la **URL como
fuente de verdad**, chips de filtros activos, y el filtro de talla corregido.

## Decisiones (del brainstorming)

- **Todo son filtros multi-selección** que se combinan. La barra superior deja de
  ser "navegación exclusiva" y pasa a ser accesos rápidos que hacen toggle.
- **Superficies que se conservan:** sidebar de filtros (panel principal), barra de
  categorías superior (accesos rápidos), y chips de filtros activos.
- **`CategoryGallery` se elimina por completo** del flujo.
- **Filtro de talla = tallas efectivas:** un producto cumple si la intersección
  entre las tallas seleccionadas y `getTallas(producto, tallaFiltros)` no es vacía
  (incluye la herencia de tallas por categoría, consistente con la ficha).
- **Estado de filtros en la URL**, con **nombres legibles (slugs), nunca IDs ni
  códigos** (ej. `/?cat=camisetas&genero=hombre&talla=M,L&max=2500`).
- **Drawer en móvil** para el sidebar (se mantiene el patrón actual).

## Fuera de alcance (Proyecto 2)

- Relacionar categorías por **ID** en vez de texto (`categorias_padre`).
- Jerarquía robusta y UX del admin de categorías.
- **URLs de producto por nombre** (`/producto/<slug>` en vez de `/producto/<uuid>`).

En el Proyecto 1 se mantiene el matching por texto actual (`categorias_padre`,
comparación case-insensitive), solo que ordenado y sincronizado.

## Arquitectura

### 1. Fuente de verdad: la URL (`useStoreFilters`)

Un hook nuevo **`lib/store/useStoreFilters.ts`** envuelve `useSearchParams` +
`useRouter` (App Router) y expone:

```ts
interface UseStoreFilters {
  filters: FilterState
  toggle: (tipo: FilterTipo, valor: string) => void   // cat | subcat | genero | talla
  setMaxPrice: (n: number) => void
  clearOne: (tipo: FilterTipo, valor: string) => void
  clearAll: () => void
  activeCount: number
}
```

- Escribe con `router.replace(pathname + '?' + query, { scroll: false })`.
- Todas las superficies (sidebar, barra, chips, header, footer) usan este hook, por
  lo que **es imposible que se desincronicen**: leen y escriben la misma URL.
- Requiere envolver el consumidor en un `<Suspense>` (requisito de
  `useSearchParams` en Next.js). El home ya es SSR + `StoreClient` cliente.

### 2. Lógica pura y testeable (`lib/store/`)

**`filterParams.ts` (nuevo):**

- `parseFilters(params: URLSearchParams, ctx): FilterState`
- `filtersToQuery(filters: FilterState, ctx): string`
- `slugify(valor)` / resolución slug↔valor contra la lista de `categorias` en
  memoria (sin tocar la BD). Multi-valor separado por comas.
- `ctx` aporta `categorias` y `maxPriceLimit` (para omitir `max` cuando es el
  máximo y para resolver slugs a `valor`).
- Round-trip testeable: `parseFilters(filtersToQuery(f)) === f`.

**`filters.ts` (arreglo de talla):** `matchesTalla` pasa a:

```ts
const efectivas = getTallas(producto, tallaFiltros)
matchesTalla = tallas.length === 0 || tallas.some(t => efectivas.includes(t))
```

Se actualizan sus tests (`filters.test.ts`) y se añaden casos de talla efectiva.

### 3. Componentes

| Componente | Cambio |
|---|---|
| `FilterSidebar` | **Controlado**: recibe `filters` + `onToggle/onMaxPrice/onClear`; sin estado interno. Grupos: género, categoría, subcategoría, talla, precio. |
| `CategoryBar` | Accesos rápidos: resalta cats activas (`filters.cats`); al tocar hace toggle; el dropdown togglea subcats. |
| `ActiveFilterChips` | **Nuevo**: un chip por valor activo (cat/subcat/género/talla + precio si `< maxPriceLimit`), cada uno removible (`clearOne`), más botón "Limpiar todo" (`clearAll`). |
| `CategoryGallery` | **Se elimina** del render (y del repo si no se usa en otro lado). |
| `StoreHeader` / `Footer` | Enlaces de categoría escriben en el mismo estado (navegan a `/?cat=…`). |
| `StoreClient` | Reemplaza el estado dual por `useStoreFilters()`; inserta `ActiveFilterChips` entre la barra y el grid; `filtered = filterProductos({ productos, ...filters, search:'', tallaFiltros })`. |
| `ProductGrid` | Estado vacío: "No hay productos con estos filtros" + botón "Limpiar filtros". |

### 4. Móvil / UX

- Sidebar como **drawer** (patrón `isOpen` actual). El botón "FILTROS" muestra un
  **badge con `activeCount`**.
- Chips y barra de categorías con **scroll horizontal** en móvil.
- El **pulido visual fino** (dropdowns, chips, animaciones) se aborda en
  implementación con el skill de diseño frontend.

## Modelo de datos

Sin cambios en la BD. Se sigue leyendo `categorias` (tipos `cat/subcat/talla/genero`)
y `productos.tallas[]`. La resolución slug↔`valor` es en memoria.

## Estrategia de pruebas

- **Unitarias (Vitest, `lib/store/tests/`):**
  - `filterParams`: round-trip parse/serialize, slugs con acentos/espacios,
    multi-valor, omisión de `max` en el máximo, valores desconocidos ignorados.
  - `filters`: filtro de talla por tallas efectivas (producto con `tallas[]` y
    producto con `tallas[]` vacío que hereda de categoría); combinación de filtros.
- **Manual:** aplicar/quitar filtros desde barra, sidebar y chips; verificar
  sincronía; compartir URL y recargar; estado vacío; drawer móvil con badge.

## Riesgos

- `useSearchParams` exige `Suspense`; ubicar el límite correctamente para no romper
  el SSR del home.
- Slugs no únicos entre categorías con nombres colisionantes: la resolución usa la
  lista de `categorias` del tipo correspondiente; documentar que nombres duplicados
  dentro de un mismo `tipo` no están soportados (poco probable).
