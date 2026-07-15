# URLs de producto por slug — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir el detalle de producto en `/producto/<slug>` (legible y estable) en vez de `/producto/<uuid>`, redirigiendo permanentemente los UUID viejos.

**Architecture:** Se añade una columna `slug` única a `productos` (backfill desde `nombre`, mismo patrón que las categorías del 2a). La ruta pasa a `producto/[slug]`, consulta por slug y, si el parámetro es un UUID, busca por id y hace `permanentRedirect` a la URL con slug. Los enlaces internos y el admin usan/gestionan el slug reutilizando `lib/store/slug.ts`.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Supabase (Postgres), Vitest.

## Global Constraints

- Idioma español; moneda en Lempiras (`L.`); commits convencionales en español.
- La lógica de negocio pura vive en `lib/store/` con test en `lib/store/tests/` (Vitest). Server Components/Actions no están cubiertos por tests (verificar con `npx tsc --noEmit` y `npm run build`).
- El slug es **estable**: se genera al crear y NO se recalcula al renombrar; editable manualmente en el admin.
- Colisiones de slug se resuelven con sufijo `-2`, `-3`, … vía `uniqueSlug(base, existentes)`.
- Unicidad global respaldada por índice único `productos_slug_key`.
- Redirect de UUID→slug **permanente** (308) con `permanentRedirect` de `next/navigation`, NO `redirect` (307).
- Firmas existentes a reutilizar (de `lib/store/slug.ts`):
  - `slugify(valor: string): string`
  - `uniqueSlug(base: string, existentes: string[]): string`
- La función SQL `slugify_es(txt text)` ya existe (creada en la migración del 2a).
- Rollout obligatorio: aplicar la migración SQL en Supabase **antes** de desplegar el código.

---

## Estructura de archivos

- **Crear** `supabase/migrations/2026-07-14-productos-slug.sql` — migración de BD (T1).
- **Crear** `lib/store/productoSlug.ts` — `esUuid(param)` puro (T2).
- **Crear** `lib/store/tests/productoSlug.test.ts` — tests de `esUuid` (T2).
- **Modificar** `types/index.ts` — `Producto.slug`, `ProductoForm.slug` (T3, T6).
- **Modificar** `types/store.ts` — `StoreProducto.slug` (T3).
- **Modificar** `lib/store/adapters.ts` — `toStoreProducto` expone `slug` (T3).
- **Modificar** `lib/store/tests/adapters.test.ts` — fixture con `slug` (T3).
- **Renombrar/Modificar** `app/(store)/producto/[id]/page.tsx` → `app/(store)/producto/[slug]/page.tsx` (T4).
- **Modificar** `app/(store)/StoreClient.tsx`, `components/store/ProductPageShell.tsx`, `components/store/ProductCard.tsx`, `components/store/WishlistDrawer.tsx`, `components/store/MegaSearch.tsx`, `components/store/ProductDetail.tsx` — enlaces por slug (T5).
- **Modificar** `app/admin/productos/actions.ts`, `app/admin/productos/ProductosClient.tsx` — campo slug + validación (T6).

---

### Task 1: Migración SQL — columna slug en productos

**Files:**
- Create: `supabase/migrations/2026-07-14-productos-slug.sql`

**Interfaces:**
- Consumes: función SQL `slugify_es(txt text)` (ya existe del 2a).
- Produces: columna `productos.slug text not null`, índice único `productos_slug_key`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-07-14-productos-slug.sql` con exactamente:

```sql
-- Proyecto 2b: slug estable y unico en productos.
-- Correr UNA vez, antes de desplegar el codigo nuevo.
-- Todo dentro de una transaccion: si algo falla, no queda estado parcial.

begin;

-- 1. Columna slug (nullable durante el backfill)
alter table productos add column if not exists slug text;

-- 2. Backfill de slug unico global desde el nombre, resolviendo colisiones
--    con sufijo -2, -3... slugify_es ya existe (migracion del 2a).
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in select id, nombre from productos where slug is null order by created_at, id loop
    base := slugify_es(r.nombre);
    if base = '' then base := 'producto'; end if;
    candidate := base;
    n := 2;
    while exists (select 1 from productos where slug = candidate) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update productos set slug = candidate where id = r.id;
  end loop;
end $$;

-- 3. Unicidad y NOT NULL
create unique index if not exists productos_slug_key on productos (slug);
alter table productos alter column slug set not null;

commit;
```

- [ ] **Step 2: Verificar sintaxis mentalmente**

Confirmar: `begin;`/`commit;` envuelven todo; `slugify_es` se referencia sin recrearla; el `while` garantiza unicidad antes de `create unique index`; `if base = '' then base := 'producto'`. No hay `create extension` (unaccent ya existe del 2a).

Este archivo NO se aplica todavía (se aplica en la Task 7, en el rollout). No hay comando que correr aquí.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-07-14-productos-slug.sql
git commit -m "feat(db): migracion slug unico en productos (backfill desde nombre)"
```

---

### Task 2: Módulo `productoSlug.ts` — detección de UUID

**Files:**
- Create: `lib/store/productoSlug.ts`
- Test: `lib/store/tests/productoSlug.test.ts`

**Interfaces:**
- Produces: `esUuid(param: string): boolean`.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/store/tests/productoSlug.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { esUuid } from '../productoSlug'

describe('esUuid', () => {
  it('reconoce un UUID v4 en minusculas', () => {
    expect(esUuid('5c5a519b-02ce-430d-8c46-03b04a45c0ea')).toBe(true)
  })

  it('reconoce un UUID en mayusculas', () => {
    expect(esUuid('5C5A519B-02CE-430D-8C46-03B04A45C0EA')).toBe(true)
  })

  it('un slug legible no es UUID', () => {
    expect(esUuid('camiseta-roja')).toBe(false)
  })

  it('un slug con sufijo numerico no es UUID', () => {
    expect(esUuid('camiseta-roja-2')).toBe(false)
  })

  it('cadena vacia no es UUID', () => {
    expect(esUuid('')).toBe(false)
  })

  it('un UUID con texto extra no matchea (anclado)', () => {
    expect(esUuid('5c5a519b-02ce-430d-8c46-03b04a45c0ea-extra')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- productoSlug`
Expected: FAIL — "Cannot find module '../productoSlug'" o `esUuid is not a function`.

- [ ] **Step 3: Implementar el módulo**

Crear `lib/store/productoSlug.ts`:

```ts
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// True si el parametro de ruta es un UUID (enlace viejo /producto/<uuid>).
export function esUuid(param: string): boolean {
  return UUID_RE.test(param)
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- productoSlug`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/store/productoSlug.ts lib/store/tests/productoSlug.test.ts
git commit -m "feat(store): modulo productoSlug (esUuid) para distinguir slug de UUID"
```

---

### Task 3: Tipos + adapter — `slug` en Producto/StoreProducto

**Files:**
- Modify: `types/index.ts` (interface `Producto`, ~línea 12-36)
- Modify: `types/store.ts` (interface `StoreProducto`, ~línea 3-21)
- Modify: `lib/store/adapters.ts` (`toStoreProducto`, ~línea 8-28)
- Test: `lib/store/tests/adapters.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `Producto.slug: string`, `StoreProducto.slug: string`, `toStoreProducto(p).slug === p.slug`.

- [ ] **Step 1: Escribir/ampliar el test que falla**

En `lib/store/tests/adapters.test.ts`, en el fixture de `Producto` usado por el test de `toStoreProducto`, añadir `slug` y una aserción. Localizar el objeto `Producto` de prueba (tiene `id`, `nombre`, `precio`, …) y añadirle `slug: 'camiseta-roja'`, luego añadir esta aserción al test existente de `toStoreProducto`:

```ts
expect(result.slug).toBe('camiseta-roja')
```

Si el fixture se construye con un helper, añadir `slug: 'camiseta-roja'` al objeto base.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- adapters`
Expected: FAIL — `result.slug` es `undefined` (o error de tipo si el fixture ya se typa como `Producto`).

- [ ] **Step 3: Añadir `slug` a los tipos y al adapter**

En `types/index.ts`, dentro de `interface Producto` (después de `nombre: string`):

```ts
  nombre: string
  slug: string
```

En `types/store.ts`, dentro de `interface StoreProducto` (después de `nombre: string`):

```ts
  nombre: string
  slug: string
```

En `lib/store/adapters.ts`, dentro de `toStoreProducto`, añadir `slug` justo tras `nombre`:

```ts
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcion: p.descripcion ?? '',
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test -- adapters`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0. Si aparecen errores en fixtures de otros tests que construyen `Producto`/`StoreProducto` sin `slug`, añadirles `slug: '<algo>'` para satisfacer el tipo.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts types/store.ts lib/store/adapters.ts lib/store/tests/adapters.test.ts
git commit -m "feat(store): Producto.slug y StoreProducto.slug (adapter + fixtures)"
```

---

### Task 4: Ruta `producto/[slug]` — resolución por slug + redirect de UUID

**Files:**
- Rename: `app/(store)/producto/[id]/page.tsx` → `app/(store)/producto/[slug]/page.tsx`
- Modify: el contenido del `page.tsx` renombrado.

**Interfaces:**
- Consumes: `esUuid` (Task 2), `StoreProducto.slug` (Task 3), `toStoreProducto`, `toConfigMap`.
- Produces: ruta que sirve por slug y redirige UUID→slug.

- [ ] **Step 1: Renombrar la carpeta**

```bash
git mv "app/(store)/producto/[id]" "app/(store)/producto/[slug]"
```

- [ ] **Step 2: Reescribir `generateMetadata` y `ProductPage` para resolver por slug**

En `app/(store)/producto/[slug]/page.tsx`:

1. Añadir `permanentRedirect` al import de `next/navigation` y `esUuid`:

```ts
import { notFound, permanentRedirect } from 'next/navigation'
import { esUuid } from '@/lib/store/productoSlug'
```

2. Cambiar la firma de props:

```ts
interface ProductPageProps {
  params: Promise<{ slug: string }>
}
```

3. En `generateMetadata`, reemplazar la resolución por id por resolución por slug (con fallback a id para el caso UUID, sin redirigir aquí):

```ts
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  const columna = esUuid(slug) ? 'id' : 'slug'
  const [{ data: config }, { data: producto }] = await Promise.all([
    supabase.from('configuracion').select('key,value'),
    supabase.from('productos').select('nombre, descripcion, imagenes').eq(columna, slug).maybeSingle(),
  ])

  if (!producto) return {}

  const configMap = toConfigMap(config ?? [])
  const title = `${producto.nombre} | ${configMap.site_name || 'Hondu Sport'}`
  const ogImage = producto.imagenes?.[0]

  return {
    title,
    description: producto.descripcion ?? undefined,
    openGraph: {
      title,
      description: producto.descripcion ?? undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}
```

4. En `ProductPage`, resolver por slug; si no hay match y es UUID, buscar por id y redirigir. Reemplazar el bloque de consulta del producto y el `notFound()`:

```ts
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const [{ data: config }, { data: categorias }, { data: producto }, { data: productos }, { data: envios }, { data: cupones }] =
    await Promise.all([
      supabase.from('configuracion').select('key,value'),
      supabase
        .from('categorias')
        .select('id, tipo, valor, slug, imagen, categorias_padre, orden, activo')
        .eq('activo', true)
        .order('orden'),
      supabase.from('productos').select(PRODUCTO_SELECT).eq('slug', slug).eq('activo', true).maybeSingle(),
      supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true),
      supabase.from('envios').select('id, nombre, descripcion, tipo, costo, descuento, activo').eq('activo', true),
      supabase.from('cupones').select('id, codigo, descuento, tipo, activo, created_at').eq('activo', true),
    ])

  let productoRow = producto
  if (!productoRow && esUuid(slug)) {
    const { data: porId } = await supabase
      .from('productos')
      .select('slug')
      .eq('id', slug)
      .eq('activo', true)
      .maybeSingle()
    if (porId?.slug) permanentRedirect(`/producto/${porId.slug}`)
  }

  if (!productoRow) notFound()

  const configMap = toConfigMap(config ?? [])
  const storeProducto = toStoreProducto(productoRow)
  const allProductos = (productos ?? []).map(toStoreProducto)
  const relacionados = allProductos
    .filter(p => p.cat === storeProducto.cat && p.id !== storeProducto.id)
    .slice(0, RELACIONADOS_LIMIT)

  const catsNav = (categorias ?? []).filter(c => c.tipo === 'cat')
  const tallaFiltros = (categorias ?? []).filter(c => c.tipo === 'talla')

  return (
    <ProductPageShell
      logoUrl={configMap.logo_url}
      catsNav={catsNav}
      tallaFiltros={tallaFiltros}
      allProductos={allProductos}
      envios={envios ?? []}
      cupones={cupones ?? []}
      config={configMap}
    >
      <main style={{ padding: '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
        <ProductDetail
          key={storeProducto.id}
          producto={storeProducto}
          relacionados={relacionados}
          tallaFiltros={tallaFiltros}
          allProductos={allProductos}
          siteName={configMap.site_name}
        />
      </main>
      <Footer config={configMap} categorias={catsNav} />
    </ProductPageShell>
  )
}
```

Nota: `permanentRedirect` lanza (nunca retorna), por eso el `if (!productoRow) notFound()` posterior sólo se alcanza cuando no hubo redirect.

- [ ] **Step 3: Typecheck y build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: build OK; en la lista de rutas aparece `/producto/[slug]` (ya no `[id]`).

- [ ] **Step 4: Commit**

```bash
git add "app/(store)/producto"
git commit -m "feat(store): ruta /producto/[slug] con resolucion por slug y redirect 308 de UUID"
```

---

### Task 5: Enlaces internos por slug

**Files:**
- Modify: `app/(store)/StoreClient.tsx:62-63`
- Modify: `components/store/ProductPageShell.tsx:45-46`
- Modify: `components/store/ProductCard.tsx:66,82,99`
- Modify: `components/store/WishlistDrawer.tsx:62`
- Modify: `components/store/MegaSearch.tsx:72`
- Modify: `components/store/ProductDetail.tsx:85,221,240`

**Interfaces:**
- Consumes: `StoreProducto.slug` (Task 3).
- Produces: todos los enlaces de navegación a producto usan el slug.

Contexto: hoy los callbacks de navegación reciben `producto.id` y el padre hace `router.push('/producto/${id}')`. Se cambia para pasar/usar `producto.slug`. Los callbacks de carrito (`onQuickAdd`, `toggle` de wishlist) siguen usando `id` — NO se tocan.

- [ ] **Step 1: `StoreClient.tsx` — `openProduct` recibe slug**

Reemplazar (línea ~62-63):

```ts
  function openProduct(id: string) {
    router.push(`/producto/${id}`)
  }
```

por:

```ts
  function openProduct(slug: string) {
    router.push(`/producto/${slug}`)
  }
```

- [ ] **Step 2: `ProductPageShell.tsx` — `openProduct` recibe slug**

Reemplazar (línea ~45-46):

```ts
  function openProduct(id: string) {
    router.push(`/producto/${id}`)
```

por:

```ts
  function openProduct(slug: string) {
    router.push(`/producto/${slug}`)
```

(mantener el resto de la función y el cierre `}` intactos).

- [ ] **Step 3: `ProductCard.tsx` — pasar slug al abrir**

En las 3 llamadas de apertura, cambiar `producto.id` por `producto.slug`:

- Línea ~66: `onClick={() => onOpen?.(producto.slug)}`
- Línea ~82: `<div onClick={() => onOpen?.(producto.slug)} style={{ cursor: 'pointer' }}>`
- Línea ~99: `<button className={...} onClick={() => onOpen?.(producto.slug)}>`

NO tocar `onQuickAdd?.(producto.id)` (líneas ~104, ~109) ni `toggle(producto.id)` (línea ~60): el carrito y la wishlist siguen por id.

- [ ] **Step 4: `WishlistDrawer.tsx` — abrir por slug**

Línea ~62: cambiar `onClick={() => onOpenProduct?.(producto.id)}` por `onClick={() => onOpenProduct?.(producto.slug)}`. NO tocar `toggle(producto.id)` (~70) ni el `id` del CartItem (~30).

- [ ] **Step 5: `MegaSearch.tsx` — seleccionar por slug**

Línea ~72: cambiar `onClick={() => handleSelect(producto.id)}` por `onClick={() => handleSelect(producto.slug)}`.
Verificar que `handleSelect(x)` sólo hace `onOpenProduct?.(x)` (navegación). Si `handleSelect` usa el valor para algo que necesite el id, ajustar para navegar con slug. (En la práctica sólo navega.)

- [ ] **Step 6: `ProductDetail.tsx` — compartir/relacionados/recientes por slug**

- Línea ~85: `return \`${window.location.origin}/producto/${producto.slug}\``
- Línea ~221: `<Link key={rel.id} href={\`/producto/${rel.slug}\`} className={styles.relatedItem}>`
- Línea ~240: `<Link key={rec.id} href={\`/producto/${rec.slug}\`} className={styles.recentItem}>`

NO tocar `id: producto.id` del CartItem (~74) ni los `key={rel.id}`/`key={rec.id}` (siguen siendo el id como key de React).

- [ ] **Step 7: Typecheck y build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 8: Commit**

```bash
git add "app/(store)/StoreClient.tsx" components/store/ProductPageShell.tsx components/store/ProductCard.tsx components/store/WishlistDrawer.tsx components/store/MegaSearch.tsx components/store/ProductDetail.tsx
git commit -m "feat(store): enlaces de producto usan slug en vez de id"
```

---

### Task 6: Admin de productos — campo slug + validación única

**Files:**
- Modify: `types/index.ts` (interface `ProductoForm`, ~línea 38-60)
- Modify: `app/admin/productos/actions.ts` (`createProducto`, `updateProducto`)
- Modify: `app/admin/productos/ProductosClient.tsx` (`EMPTY_FORM`, `openEdit`, formulario)

**Interfaces:**
- Consumes: `slugify`, `uniqueSlug` de `lib/store/slug.ts`.
- Produces: `ProductoForm.slug: string`; el admin persiste un slug único.

- [ ] **Step 1: Añadir `slug` a `ProductoForm`**

En `types/index.ts`, dentro de `interface ProductoForm`, tras `nombre: string`:

```ts
  nombre: string
  slug: string
```

- [ ] **Step 2: `actions.ts` — generar/validar slug único (crear)**

En `app/admin/productos/actions.ts`, añadir el import y calcular el slug en `createProducto` antes del `insert`:

```ts
import { slugify, uniqueSlug } from '@/lib/store/slug'
```

Al inicio de `createProducto`, tras `const supabase = await createClient()`:

```ts
  const { data: rows } = await supabase.from('productos').select('slug')
  const existentes = (rows ?? []).map(r => r.slug as string)
  const slug = uniqueSlug(slugify(form.slug || form.nombre) || 'producto', existentes)
```

Y añadir `slug,` al objeto del `.insert({ ... })` (por ejemplo tras `nombre: form.nombre,`).

- [ ] **Step 3: `actions.ts` — generar/validar slug único (editar)**

En `updateProducto`, tras `const supabase = await createClient()`:

```ts
  const { data: rows } = await supabase.from('productos').select('id, slug')
  const existentes = (rows ?? []).filter(r => r.id !== id).map(r => r.slug as string)
  const slug = uniqueSlug(slugify(form.slug || form.nombre) || 'producto', existentes)
```

Y añadir `slug,` al objeto del `.update({ ... })`.

- [ ] **Step 4: `ProductosClient.tsx` — campo slug en el form**

1. En `EMPTY_FORM`, añadir tras `nombre: ''`:

```ts
  nombre: '',
  slug: '',
```

2. En `openEdit`, en el objeto de `setForm`, añadir tras `nombre: p.nombre,`:

```ts
      nombre: p.nombre,
      slug: p.slug,
```

3. En el formulario (modal), añadir un campo de texto para el slug, autogenerado desde el nombre mientras el usuario no lo haya editado a mano. Añadir junto al input de nombre. El input de nombre debe, además de setear `nombre`, autogenerar el slug si el slug está vacío o coincide con el slugify del nombre anterior. Implementación mínima con un handler dedicado:

```tsx
import { slugify } from '@/lib/store/slug'
```

Handler para el nombre (reemplaza el `onChange` genérico del input de nombre):

```tsx
function handleNombreChange(e: React.ChangeEvent<HTMLInputElement>) {
  const nombre = e.target.value
  setForm(prev => {
    const autoPrev = slugify(prev.nombre)
    // si el slug estaba vacio o seguia al nombre, se re-autogenera
    const slug = !prev.slug || prev.slug === autoPrev ? slugify(nombre) : prev.slug
    return { ...prev, nombre, slug }
  })
}
```

Input de nombre: `onChange={handleNombreChange}`.

Campo de slug (editable), colocado tras el de nombre:

```tsx
<label className={styles.field}>
  <span>Slug (URL)</span>
  <input
    type="text"
    value={form.slug}
    onChange={f('slug')}
    placeholder="camiseta-roja"
  />
  <small>Se usa en la URL del producto: /producto/{form.slug || '…'}</small>
</label>
```

(Ajustar `className`/estructura al patrón de los demás campos del formulario en este archivo.)

- [ ] **Step 5: Typecheck y build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Correr toda la suite (nada roto)**

Run: `npm test`
Expected: todos los tests pasan.

- [ ] **Step 7: Commit**

```bash
git add types/index.ts app/admin/productos/actions.ts app/admin/productos/ProductosClient.tsx
git commit -m "feat(admin): campo slug autogenerado y unico en el editor de productos"
```

---

### Task 7: Rollout — aplicar migración y desplegar

**Files:** ninguno (operativo).

**Interfaces:**
- Consumes: la migración de la Task 1.

- [ ] **Step 1: Verificación final del código en la rama**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm test` → todos pasan.
Run: `npm run build` → OK, ruta `/producto/[slug]` presente.

- [ ] **Step 2: Aplicar la migración en Supabase**

Entregar al usuario el contenido de `supabase/migrations/2026-07-14-productos-slug.sql` para ejecutarlo en el **SQL Editor de Supabase** (se puede correr todo de una vez; está envuelto en `begin;`/`commit;`). Advertir que DEBE aplicarse **antes** del deploy (el push a `main` dispara el deploy automático de producción).

Verificación sugerida tras aplicar (query de control):

```sql
select id, nombre, slug from productos order by created_at limit 30;
```

Esperado: `slug` lleno y único en todas las filas.

- [ ] **Step 3: Revisión final de toda la rama**

Antes de fusionar, correr la revisión whole-branch de subagent-driven-development (modelo capaz) sobre `merge-base main..HEAD`.

- [ ] **Step 4: Fusionar y desplegar**

Con todo verde y la migración aplicada, pasar a `superpowers:finishing-a-development-branch` para fusionar a `main`, push (dispara el deploy de producción en Vercel) y verificar que el deployment llega a READY. Borrar la rama.

---

## Notas de verificación manual (post-deploy)

- Abrir un producto desde la home → URL `/producto/<slug>` legible.
- Pegar un enlace viejo `/producto/<uuid>` → redirige (308) al slug.
- Compartir por WhatsApp desde el detalle → el enlace lleva el slug.
- En el admin: crear un producto con nombre duplicado → el slug recibe sufijo `-2`; editar el nombre de un producto existente NO cambia su slug salvo edición manual del campo.
