# Proyecto 2b — URLs de producto por slug

**Fecha:** 2026-07-14
**Estado:** Diseño aprobado (pendiente revisión de spec)

## Contexto y problema

Hoy el detalle de producto vive en `app/(store)/producto/[id]/page.tsx` y la URL
usa el **UUID** del producto (`/producto/5c5a519b-02ce-...`). Es feo, no aporta
SEO y no dice nada al usuario que recibe el enlace por WhatsApp.

El Proyecto 2a ya dejó el patrón reutilizable para slugs: `lib/store/slug.ts`
(`slugify` + `uniqueSlug`), la función SQL `slugify_es`, y el flujo de
migración con backfill + índice único. 2b aplica ese mismo patrón a `productos`.

## Objetivo

Servir el detalle de producto en `/producto/<slug>` (p. ej.
`/producto/camiseta-roja`), con slugs **legibles, únicos y estables**, sin
romper los enlaces `/producto/<uuid>` ya compartidos.

## Decisiones (del brainstorming)

- **Enlaces UUID viejos:** se **redirigen** (permanente, 308) a la URL con slug.
  La página detecta si el param es un UUID, busca por `id` y redirige a
  `/producto/<slug>`. Consolida SEO y no rompe enlaces existentes.
- **Slug estable:** se genera al crear el producto y **no cambia al renombrar**.
  Editable manualmente en el admin. Mismo criterio que las categorías del 2a.
- **Colisiones:** sufijo `-2`, `-3`, … reutilizando `uniqueSlug()`
  (`camiseta-roja`, `camiseta-roja-2`). URL limpia.
- **Migración de BD antes del deploy** (el código nuevo espera `slug` no nulo).

## Fuera de alcance

- URLs de categorías/filtros (ya resuelto en 2a).
- Breadcrumbs, `sitemap.xml`, canonical tags más allá del redirect.

## Arquitectura

### 1. Migración de base de datos

Archivo `supabase/migrations/2026-07-14-productos-slug.sql`, con el mismo patrón
seguro que 2a (transaccional, idempotente):

1. `alter table productos add column if not exists slug text;`
2. Backfill de `slug` desde `nombre` con la función `slugify_es` (ya existe del
   2a), resolviendo colisiones con sufijo `-2`, `-3`, … en un bloque `DO`
   equivalente al de 2a. Si `slugify_es(nombre)` da vacío, usar base `producto`.
3. `create unique index if not exists productos_slug_key on productos (slug);`
4. `alter table productos alter column slug set not null;` (tras el backfill).

Todo dentro de `begin; … commit;`.

### 2. Módulo de resolución (`lib/store/productoSlug.ts`, puro + tests)

Una función pura para decidir cómo interpretar el parámetro de ruta, testeable
sin BD:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function esUuid(param: string): boolean
```

La lógica de "buscar por slug; si no hay match y es UUID, buscar por id y
redirigir" vive en la página (necesita el cliente Supabase), pero usa `esUuid`.

### 3. Tipos y adapter

- `Producto` (types): añadir `slug: string`.
- `StoreProducto` (types/store): añadir `slug: string`.
- `adapters.toStoreProducto`: exponer `slug = p.slug`.
- Los `select` de productos ya usan `*` o `PRODUCTO_SELECT` (que empieza con
  `*`), así que `slug` entra sin tocar los selects.

### 4. Ruta `app/(store)/producto/[slug]/page.tsx`

La carpeta `producto/[id]` se **renombra** a `producto/[slug]`.

- `params` pasa a `Promise<{ slug: string }>`.
- **Resolución del producto:**
  1. `supabase.from('productos').select(PRODUCTO_SELECT).eq('slug', param).eq('activo', true).maybeSingle()`
  2. Si hay match → render normal.
  3. Si no hay match y `esUuid(param)` → buscar por `id`
     (`.eq('id', param).eq('activo', true).maybeSingle()`); si existe,
     `permanentRedirect('/producto/' + producto.slug)` (Next
     `permanentRedirect()` emite **308** permanente; `redirect()` sería 307
     temporal y no consolidaría SEO).
  4. Si nada → `notFound()`.
- `generateMetadata` usa la misma resolución (por slug primero; para el caso
  UUID puede resolver por slug/id sin emitir el redirect, ya que el redirect lo
  hará el render de la página).
- Relacionados y demás lógica se mantienen: filtran por `catId` (interno, por
  id), no por slug.

### 5. Enlaces internos → `producto.slug`

Reemplazar `` `/producto/${id}` `` por `` `/producto/${slug}` `` en:

- `app/(store)/StoreClient.tsx` — el handler de click de producto recibe/usa el
  slug en vez del id.
- `components/store/ProductDetail.tsx` — URL de compartir (línea ~85),
  relacionados (~221) y recientes (~240).
- `components/store/ProductPageShell.tsx` — `router.push` (~46).
- `ProductCard` / grid — el enlace de cada tarjeta.

Como `StoreProducto` ahora lleva `slug`, todos estos componentes ya trabajan con
`StoreProducto` y tienen el dato disponible.

### 6. Admin de productos

- `app/admin/productos/ProductosClient.tsx`:
  - Añadir campo **slug** (autogenerado desde `nombre` al teclear, editable),
    igual que el admin de categorías del 2a.
- `app/admin/productos/actions.ts`:
  - Aceptar `slug` en `ProductoForm`; generar/validar slug único con
    `uniqueSlug` contra los slugs existentes de `productos`, excluyendo la propia
    fila al editar. Respaldo final: el índice único `productos_slug_key`.
- `ProductoForm` (types) gana `slug: string`.

## Modelo de datos (resumen)

`productos`: `+ slug text not null unique`. Sin tablas nuevas.

## Estrategia de pruebas

- **Unitarias (Vitest, `lib/store/tests/`):**
  - `productoSlug`: `esUuid` (UUID válido → true; slug legible → false; cadena
    vacía → false).
  - `slug` (`slugify` / `uniqueSlug`): ya cubierto en `slug.test.ts`; añadir un
    caso de colisión de nombres de producto si aporta.
  - `adapters`: fixture de `Producto` con `slug` → `StoreProducto.slug` poblado.
- **Manual:** admin (crear/editar producto con slug autogenerado y editable;
  colisión de nombres → sufijo), y tienda (abrir `/producto/<slug>`, compartir
  el enlace, y verificar que `/producto/<uuid>` viejo redirige al slug).

## Seguridad del rollout

Orden obligatorio: **(1)** aplicar la migración SQL en Supabase → **(2)** push /
deploy del código. Si se despliega el código antes de migrar, `slug` sería null
y el detalle de producto fallaría (consulta por slug inexistente → todos 404).

La migración se entrega para ejecutarla en el SQL editor de Supabase **antes**
del deploy (mismo flujo que 2a; no hay acceso programático a la BD desde el
entorno).

## Riesgos

- Nombres de producto duplicados → slugs con sufijo `-2`; revisar que los slugs
  resultantes del backfill sean aceptables antes de compartir URLs.
- Enlaces UUID en cachés externas seguirán funcionando vía redirect, pero los
  motores de búsqueda tardarán en consolidar la URL canónica con slug.
