# Proyecto 2a — Categorías por ID + slug estable + admin

**Fecha:** 2026-07-14
**Estado:** Diseño aprobado (pendiente revisión de spec)

## Contexto y problema

La relación **subcategoría/talla → categoría(s) padre** se guarda hoy en
`categorias.categorias_padre` como un `text[]` de **nombres** de categorías,
capturados como texto libre separado por comas en el admin, y comparados por
string (case-insensitive) en `getTallas`, `filters` y `CategoryBar`. Es frágil:

- Renombrar una categoría rompe silenciosamente los vínculos.
- Un typo en el admin no falla, simplemente no empareja.
- Es la raíz de las colisiones de slug detectadas en el Proyecto 1 (#6).

Además, las URLs de filtro del Proyecto 1 derivan el slug del **nombre** de la
categoría, así que renombrar una categoría **rompe los enlaces compartidos** por
WhatsApp.

Los productos ya se relacionan con su categoría/subcategoría por **ID** (FKs
`productos_categoria_id_fkey` / `productos_subcategoria_id_fkey`); lo único frágil
es la relación de parentesco entre categorías.

## Objetivo

Relacionar las categorías por **ID** y darles un **slug estable y único**, para
eliminar la fragilidad ante renombres/typos y las colisiones de slug, con una
mejor UX en el admin.

## Decisiones (del brainstorming)

- **Relación por array de IDs:** `categorias_padre` sigue siendo `text[]` pero
  guarda **IDs** de categorías (no nombres). Se mantiene multi-padre (una talla
  puede pertenecer a varias categorías). Se conserva el tipo `text[]` para evitar
  una migración de tipo a `uuid[]` riesgosa; el código compara IDs como strings.
- **Slug estable por categoría:** nueva columna `slug` en `categorias`, **única
  global** (ningún par de categorías comparte slug, sin importar el tipo).
- **Las URLs de filtro usan el `slug` de la categoría** (no el slugify del
  nombre) → elimina colisiones (#6 del P1) y hace las URLs estables ante
  renombres.
- **Admin:** selector multi-check de categorías padre (IDs) en vez de texto
  libre; campo slug autogenerado y editable.
- **Migración de BD antes del deploy** (el código nuevo espera IDs + slug).

## Fuera de alcance (Proyecto 2b)

- URLs de producto por nombre (`/producto/<slug>` en vez de UUID).

## Arquitectura

### 1. Migración de base de datos

Archivo `supabase/migrations/2026-07-14-categorias-por-id-y-slug.sql`:

1. `alter table categorias add column slug text;`
2. Backfill de `slug` desde `valor` (slugify), resolviendo colisiones con sufijo
   `-2`, `-3`, … Índice único global: `create unique index categorias_slug_key on categorias (slug);`
3. Convertir `categorias_padre` de nombres a IDs: para cada fila con
   `categorias_padre`, reemplazar cada nombre por el `id` de la categoría cuyo
   `lower(valor)` coincide; descartar nombres sin match.
4. `alter table categorias alter column slug set not null;` (tras el backfill).

El SQL debe ser idempotente donde sea posible y seguro de correr una vez.

### 2. Módulo de slug (`lib/store/slug.ts`, puro + tests)

- Mover `slugify(valor: string): string` desde `filterParams.ts` a `slug.ts`
  (reexportar o actualizar imports).
- `uniqueSlug(base: string, existentes: string[]): string` — devuelve `base`, o
  `base-2`, `base-3`… si ya existe.

### 3. Tipos y adapter

- `Categoria` (types): añadir `slug: string`.
- `StoreProducto` (types/store): añadir `catId: string` y `subcatId: string | null`.
- `adapters.toStoreProducto`: exponer `catId = p.categoria_id`, `subcatId = p.subcategoria_id`.
- Las queries de `categorias` en `page.tsx` y `producto/[id]/page.tsx` deben
  incluir `slug` en el `select`.

### 4. Lectores (por ID / por slug)

- **`getTallas.ts`**: emparejar `talla.categorias_padre` (IDs) con `producto.catId`.
- **`CategoryBar.tsx`**: `subcatsForCat = subcats.filter(s => (s.categorias_padre ?? []).includes(cat.id))`.
- **`filters.ts`**: `matchesTalla` ya delega en `getTallas` → hereda el arreglo.
- **`filterParams.ts`**: resolver slug↔categoría por la columna `slug`
  (`categorias.find(c => c.tipo === catTipo && c.slug === slug)`), y serializar
  usando `c.slug`. Elimina `slugify(valor)` como fuente del parámetro de URL.

### 5. Admin de categorías

- `CategoriasClient.tsx`:
  - Reemplazar el input de texto "Categorías padre" por un grupo de checkboxes de
    las categorías `tipo === 'cat'` (guardando IDs). La tabla resuelve IDs→nombres
    para mostrarlos.
  - Añadir campo **slug** (autogenerado desde el valor al teclear, editable).
- `actions.ts`: aceptar `categorias_padre` como IDs y `slug`; generar/validar
  slug único (usar `uniqueSlug` contra los slugs existentes, excluyendo la propia
  fila al editar).

## Modelo de datos (resumen)

`categorias`: `+ slug text not null unique`. `categorias_padre text[]` ahora
contiene IDs. Sin tablas nuevas.

## Estrategia de pruebas

- **Unitarias (Vitest, `lib/store/tests/`):**
  - `slug`: `slugify` (acentos/espacios) y `uniqueSlug` (colisiones → sufijos).
  - `getTallas` y `filters`: fixtures con `categorias_padre` por **ID** y
    `StoreProducto.catId`; verificar emparejamiento por ID.
  - `filterParams`: fixtures de `Categoria` con `slug`; round-trip resolviendo por
    `slug` (incluyendo dos categorías cuyos nombres colisionarían pero cuyos slugs
    son distintos → ya no se confunden).
- **Manual:** admin (crear/editar subcat/talla con selector de padres y slug),
  y tienda (filtros, URLs estables tras renombrar una categoría).

## Seguridad del rollout

Orden obligatorio: **(1)** aplicar la migración SQL en Supabase → **(2)** push /
deploy del código. Si se despliega el código antes de migrar, `slug` sería null y
`categorias_padre` tendría nombres → los filtros de talla y el agrupado de
subcategorías fallarían.

Aplicación de la migración: se intentará vía CLI/herramienta de Supabase; si no
hay una disponible en el entorno, el SQL se entrega para ejecutarlo manualmente en
el SQL editor de Supabase **antes** del deploy. Esto se decide y ejecuta en la
fase de implementación (última tarea del plan, antes del merge/deploy).

## Riesgos

- Nombres en `categorias_padre` sin categoría correspondiente se pierden en la
  migración (ya estaban rotos); conviene revisar el resultado del backfill.
- Si dos categorías tienen nombres que slugifican igual, el backfill de `slug`
  les asigna sufijos distintos (`-2`); revisar que los slugs resultantes sean los
  deseados antes de compartir URLs.
