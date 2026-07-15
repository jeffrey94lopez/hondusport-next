# Editor carrusel de inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un editor secuencial ("carrusel") en el admin que, con filtros combinables, recorra los productos que matchean y permita editarlos uno por uno con "guardar y siguiente".

**Architecture:** Lógica de filtros pura en `lib/store/inventoryFilters.ts` (con tests). Los campos del formulario del modal actual se extraen a un componente compartido `components/admin/ProductoFields.tsx` (modo completo/rápido), consumido por el modal existente y por el nuevo carrusel. El carrusel es una ruta client `/admin/productos/carrusel` que filtra en cliente sobre los productos ya cargados y guarda con el Server Action `updateProducto` existente.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Vitest, CSS Modules.

## Global Constraints

- Idioma español; moneda en Lempiras (`L.`); commits convencionales en español.
- Lógica de negocio pura en `lib/store/` con test en `lib/store/tests/` (Vitest). Server Components/Actions y UI no se testean; se verifican con `npx tsc --noEmit` y `npm run build`.
- El carrusel **solo actualiza** productos existentes; usa `updateProducto(id, form)` de `app/admin/productos/actions.ts` (frontera de confianza intacta). No se crea Server Action nueva ni ruta de escritura.
- Extraer `ProductoFields` NO debe cambiar el comportamiento del modal actual de "Nuevo/Editar producto".
- `UMBRAL_STOCK_BAJO = 5`.
- Sin cambios de esquema de BD. Sin filtro por marca.
- Tipos existentes (de `types/index.ts`): `Producto` (BD, con `categoria_id`, `subcategoria_id`, `imagenes: string[] | null`, `descripcion: string | null`, `precio: number`, `sku: string | null`, `stock: number | null`, `activo`, `genero: string | null`, `slug`) y `ProductoForm` (`nombre, slug, descripcion, precio, precio_original, categoria_id, subcategoria_id, stock, genero, badge, tallas, colores, marca, sku, imagenes, personalizable, activo`).

---

## Estructura de archivos

- **Crear** `lib/store/inventoryFilters.ts` — predicados de faltantes + `filtrarInventario` (T1).
- **Crear** `lib/store/tests/inventoryFilters.test.ts` — tests (T1).
- **Crear** `components/admin/ProductoFields.tsx` — campos del form compartidos + helper `productoAForm` (T2).
- **Modificar** `app/admin/productos/ProductosClient.tsx` — consumir `ProductoFields` en el modal; añadir botón "Modo carrusel" (T2, T3).
- **Crear** `app/admin/productos/carrusel/page.tsx` — server component que carga datos (T3).
- **Crear** `app/admin/productos/CarruselClient.tsx` — pantalla del carrusel (T3).
- **Crear** `app/admin/productos/carrusel.module.css` — estilos del carrusel (T3).

---

### Task 1: Lógica de filtros — `lib/store/inventoryFilters.ts`

**Files:**
- Create: `lib/store/inventoryFilters.ts`
- Test: `lib/store/tests/inventoryFilters.test.ts`

**Interfaces:**
- Consumes: `Producto` de `@/types`.
- Produces:
  - `UMBRAL_STOCK_BAJO = 5`
  - `CriteriosInventario` (interface, ver abajo)
  - `sinCategoria(p)`, `sinImagen(p)`, `sinDescripcion(p)`, `sinPrecio(p)`, `sinSku(p)` → `boolean`
  - `filtrarInventario(productos: Producto[], criterios: CriteriosInventario): Producto[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/store/tests/inventoryFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Producto } from '@/types'
import {
  sinCategoria, sinImagen, sinDescripcion, sinPrecio, sinSku,
  filtrarInventario, UMBRAL_STOCK_BAJO,
} from '../inventoryFilters'

function make(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    nombre: 'Producto', slug: 'producto', descripcion: 'desc',
    precio: 100, precio_original: null,
    categoria_id: 'cat-1', subcategoria_id: null,
    stock: 10, genero: null, badge: null,
    tallas: null, colores: null, imagenes: ['http://x/img.jpg'],
    marca: null, sku: 'SKU1', personalizable: false,
    oferta_fin: null, activo: true, rating: 5,
    created_at: '', updated_at: '',
    ...overrides,
  }
}

describe('predicados de faltantes', () => {
  it('sinCategoria: true cuando categoria_id es null/vacio', () => {
    expect(sinCategoria(make({ categoria_id: null }))).toBe(true)
    expect(sinCategoria(make({ categoria_id: '' }))).toBe(true)
    expect(sinCategoria(make({ categoria_id: 'cat-1' }))).toBe(false)
  })
  it('sinImagen: true cuando no hay imagenes no vacias', () => {
    expect(sinImagen(make({ imagenes: null }))).toBe(true)
    expect(sinImagen(make({ imagenes: [] }))).toBe(true)
    expect(sinImagen(make({ imagenes: [''] }))).toBe(true)
    expect(sinImagen(make({ imagenes: ['http://x/i.jpg'] }))).toBe(false)
  })
  it('sinDescripcion: true cuando descripcion vacia/espacios/null', () => {
    expect(sinDescripcion(make({ descripcion: null }))).toBe(true)
    expect(sinDescripcion(make({ descripcion: '   ' }))).toBe(true)
    expect(sinDescripcion(make({ descripcion: 'algo' }))).toBe(false)
  })
  it('sinPrecio: true cuando precio 0 o menor', () => {
    expect(sinPrecio(make({ precio: 0 }))).toBe(true)
    expect(sinPrecio(make({ precio: -1 }))).toBe(true)
    expect(sinPrecio(make({ precio: 100 }))).toBe(false)
  })
  it('sinSku: true cuando sku vacio/null', () => {
    expect(sinSku(make({ sku: null }))).toBe(true)
    expect(sinSku(make({ sku: '  ' }))).toBe(true)
    expect(sinSku(make({ sku: 'SKU1' }))).toBe(false)
  })
})

describe('filtrarInventario', () => {
  it('sin criterios devuelve todos', () => {
    const ps = [make(), make(), make()]
    expect(filtrarInventario(ps, {})).toHaveLength(3)
  })
  it('AND entre dos faltantes: sin categoria Y sin imagen', () => {
    const soloSinCat = make({ categoria_id: null, imagenes: ['http://x/i.jpg'] })
    const ambos = make({ categoria_id: null, imagenes: [] })
    const res = filtrarInventario([soloSinCat, ambos], { sinCategoria: true, sinImagen: true })
    expect(res).toEqual([ambos])
  })
  it('filtra por categoriaIds', () => {
    const a = make({ categoria_id: 'cat-A' })
    const b = make({ categoria_id: 'cat-B' })
    expect(filtrarInventario([a, b], { categoriaIds: ['cat-A'] })).toEqual([a])
  })
  it('filtra por generos', () => {
    const h = make({ genero: 'Hombre' })
    const m = make({ genero: 'Mujer' })
    expect(filtrarInventario([h, m], { generos: ['Mujer'] })).toEqual([m])
  })
  it('stockBajo OR sinStock dentro de la dimension stock', () => {
    const bajo = make({ stock: 3 })
    const cero = make({ stock: 0 })
    const nulo = make({ stock: null })
    const ok = make({ stock: 50 })
    const res = filtrarInventario([bajo, cero, nulo, ok], { stockBajo: true, sinStock: true })
    expect(res).toEqual([bajo, cero, nulo])
  })
  it('stockBajo respeta el umbral (0 < stock < UMBRAL)', () => {
    expect(UMBRAL_STOCK_BAJO).toBe(5)
    const res = filtrarInventario([make({ stock: 0 }), make({ stock: 4 }), make({ stock: 5 })], { stockBajo: true })
    expect(res.map(p => p.stock)).toEqual([4])
  })
  it('activo filtra por estado', () => {
    const on = make({ activo: true })
    const off = make({ activo: false })
    expect(filtrarInventario([on, off], { activo: true })).toEqual([on])
    expect(filtrarInventario([on, off], { activo: false })).toEqual([off])
    expect(filtrarInventario([on, off], {})).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- inventoryFilters`
Expected: FAIL — "Cannot find module '../inventoryFilters'".

- [ ] **Step 3: Implementar el módulo**

Crear `lib/store/inventoryFilters.ts`:

```ts
import type { Producto } from '@/types'

export const UMBRAL_STOCK_BAJO = 5

export interface CriteriosInventario {
  // Faltantes (true = exigir que falte)
  sinCategoria?: boolean
  sinImagen?: boolean
  sinDescripcion?: boolean
  sinPrecio?: boolean
  sinSku?: boolean
  // Pertenencia (array no vacio = exigir includes)
  categoriaIds?: string[]
  subcategoriaIds?: string[]
  generos?: string[]
  // Stock / estado
  stockBajo?: boolean
  sinStock?: boolean
  activo?: boolean
}

export function sinCategoria(p: Producto): boolean {
  return !p.categoria_id
}
export function sinImagen(p: Producto): boolean {
  return (p.imagenes ?? []).filter(Boolean).length === 0
}
export function sinDescripcion(p: Producto): boolean {
  return !(p.descripcion ?? '').trim()
}
export function sinPrecio(p: Producto): boolean {
  return !p.precio || p.precio <= 0
}
export function sinSku(p: Producto): boolean {
  return !(p.sku ?? '').trim()
}

function pasaStock(p: Producto, c: CriteriosInventario): boolean {
  if (!c.stockBajo && !c.sinStock) return true
  const bajo = c.stockBajo === true && p.stock != null && p.stock > 0 && p.stock < UMBRAL_STOCK_BAJO
  const sin = c.sinStock === true && (p.stock == null || p.stock === 0)
  return bajo || sin
}

export function filtrarInventario(productos: Producto[], c: CriteriosInventario): Producto[] {
  return productos.filter(p => {
    if (c.sinCategoria && !sinCategoria(p)) return false
    if (c.sinImagen && !sinImagen(p)) return false
    if (c.sinDescripcion && !sinDescripcion(p)) return false
    if (c.sinPrecio && !sinPrecio(p)) return false
    if (c.sinSku && !sinSku(p)) return false
    if (c.categoriaIds?.length && !c.categoriaIds.includes(p.categoria_id ?? '')) return false
    if (c.subcategoriaIds?.length && !c.subcategoriaIds.includes(p.subcategoria_id ?? '')) return false
    if (c.generos?.length && !c.generos.includes(p.genero ?? '')) return false
    if (!pasaStock(p, c)) return false
    if (c.activo !== undefined && p.activo !== c.activo) return false
    return true
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- inventoryFilters`
Expected: PASS (todos los casos).

- [ ] **Step 5: Commit**

```bash
git add lib/store/inventoryFilters.ts lib/store/tests/inventoryFilters.test.ts
git commit -m "feat(store): filtros de inventario puros (faltantes, categoria, stock, estado)"
```

---

### Task 2: Componente compartido `ProductoFields` + refactor del modal

**Files:**
- Create: `components/admin/ProductoFields.tsx`
- Modify: `app/admin/productos/ProductosClient.tsx` (reemplazar los campos inline del `<form>` por `<ProductoFields …>`; usar `productoAForm` en `openEdit`)

**Interfaces:**
- Consumes: `ProductoForm`, `Producto`, `Categoria` de `@/types`; `ImageUpload`, `Toggle` de `components/admin`; `slugify` de `@/lib/store/slug`.
- Produces:
  - Componente `ProductoFields` con props `{ form, setForm, categorias, subcategorias, modo?: 'completo' | 'rapido' }`.
  - `export function productoAForm(p: Producto): ProductoForm`.

**Contexto:** hoy `ProductosClient.tsx` tiene, inline en el `<form>` del modal (líneas ~273–420), todos los campos, y las funciones auxiliares `f` (~143-145), `handleNombreChange` (~155-165, autogenera slug), `handleCategoriaChange` (~166-177) y el `useMemo` `subcategoriasDisponibles` (~147-151). `openEdit` (~85-107) construye `ProductoForm` desde `Producto`. Este task **mueve** esos campos y helpers a `ProductoFields` sin cambiar el comportamiento.

- [ ] **Step 1: Crear `components/admin/ProductoFields.tsx`**

Crear el componente con las funciones auxiliares y los campos. En `modo='rapido'` se renderizan SOLO: Categoría/Subcategoría, Imágenes, Precio, Stock, Descripción. En `modo='completo'` (default) se renderizan TODOS los campos (idéntico al modal actual). Estructura:

```tsx
'use client'
import { useMemo } from 'react'
import ImageUpload from './ImageUpload'
import Toggle from './Toggle'
import type { Producto, ProductoForm, Categoria } from '@/types'
import { slugify } from '@/lib/store/slug'
import styles from '@/app/admin/productos/productos.module.css'

export function productoAForm(p: Producto): ProductoForm {
  return {
    nombre: p.nombre,
    slug: p.slug,
    descripcion: p.descripcion ?? '',
    precio: p.precio,
    precio_original: p.precio_original,
    categoria_id: p.categoria_id,
    subcategoria_id: p.subcategoria_id,
    stock: p.stock,
    genero: p.genero ?? '',
    badge: p.badge ?? '',
    tallas: p.tallas?.join(', ') ?? '',
    colores: p.colores?.join(', ') ?? '',
    marca: p.marca ?? '',
    sku: p.sku ?? '',
    imagenes: p.imagenes ?? [],
    personalizable: p.personalizable,
    activo: p.activo,
  }
}

interface Props {
  form: ProductoForm
  setForm: React.Dispatch<React.SetStateAction<ProductoForm>>
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
  modo?: 'completo' | 'rapido'
}

export default function ProductoFields({ form, setForm, categorias, subcategorias, modo = 'completo' }: Props) {
  const completo = modo === 'completo'

  const f = (field: keyof ProductoForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const subcategoriasDisponibles = useMemo(() => {
    if (!form.categoria_id) return []
    return subcategorias.filter(s => s.categorias_padre?.includes(form.categoria_id!))
  }, [subcategorias, form.categoria_id])

  function handleNombreChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nombre = e.target.value
    setForm(prev => {
      const autoPrev = slugify(prev.nombre)
      const slug = !prev.slug || prev.slug === autoPrev ? slugify(nombre) : prev.slug
      return { ...prev, nombre, slug }
    })
  }

  function handleCategoriaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const categoria_id = e.target.value || null
    setForm(prev => ({
      ...prev,
      categoria_id,
      subcategoria_id: subcategorias.some(
        s => s.id === prev.subcategoria_id && s.categorias_padre?.includes(categoria_id ?? '')
      )
        ? prev.subcategoria_id
        : null,
    }))
  }

  return (
    <>
      {completo && (
        <>
          {/* Nombre + SKU */}
          {/* Slug */}
        </>
      )}
      {/* Categoría + Subcategoría (siempre) */}
      {/* Precio + (completo: Precio original) */}
      {/* Stock (siempre) */}
      {completo && (
        <>
          {/* Género + Badge */}
          {/* Marca */}
          {/* Tallas */}
          {/* Colores */}
        </>
      )}
      {/* Imágenes (siempre) */}
      {/* Descripción (siempre) */}
      {completo && (
        <>
          {/* Toggles Personalizable + Activo */}
        </>
      )}
    </>
  )
}
```

Rellenar cada comentario con el JSX EXACTO que hoy está en `ProductosClient.tsx` para ese campo (mismas clases `styles.formRow`/`styles.formLabel`, mismos `onChange`), moviéndolo tal cual:
- **Nombre + SKU**: el `<div className={styles.formRow}>` con Nombre (`onChange={handleNombreChange}`, `required`) y SKU (`f('sku')`).
- **Slug**: el `formRow` con el input de slug (`f('slug')`) y su `<small>`.
- **Precio + Precio original**: el `formRow`; en `modo='rapido'` mostrar SOLO Precio (el input `precio` con su `onChange` inline), sin Precio original.
- **Categoría + Subcategoría**: el `formRow` con ambos `<select>` (`handleCategoriaChange` y el `onChange` inline de subcategoría, usando `subcategoriasDisponibles`).
- **Stock**: el `formRow` con el input de stock (`onChange` inline con `parseInt`).
- **Género + Badge**, **Marca**, **Tallas**, **Colores**: sus labels/inputs actuales.
- **Imágenes**: el `<div className={styles.formLabel}>` con el grid de miniaturas y `<ImageUpload bucket="productos" … />`.
- **Descripción**: el `<label>` con el `<textarea>` (`f('descripcion')`).
- **Toggles**: el `<div className={styles.formChecks}>` con Personalizable y Activo.

Para el precio en modo rápido, el input es el mismo pero se renderiza suelto (no dentro del `formRow` de dos columnas). Usar:

```tsx
<label className={styles.formLabel}>
  Precio (L.) *
  <input type="number" value={form.precio} min="0" step="0.01" required
    onChange={e => setForm(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))} />
</label>
```

- [ ] **Step 2: Refactorizar `ProductosClient.tsx` para consumir `ProductoFields`**

1. Importar: `import ProductoFields, { productoAForm } from '@/components/admin/ProductoFields'`.
2. En `openEdit`, reemplazar el objeto literal de `setForm({...})` por `setForm(productoAForm(p))`.
3. Borrar de `ProductosClient` las funciones ahora en `ProductoFields`: `f`, `handleNombreChange`, `handleCategoriaChange`, y el `useMemo` `subcategoriasDisponibles` (ya no se usan aquí).
4. En el `<form>` del modal, reemplazar TODO el bloque de campos (desde el `<div className={styles.formRow}>` de Nombre/SKU hasta el `<div className={styles.formChecks}>` de los toggles, inclusive) por:

```tsx
<ProductoFields form={form} setForm={setForm} categorias={categorias} subcategorias={subcategorias} modo="completo" />
```

Mantener intactos: el `<form onSubmit={handleSubmit}>`, el `{formError && …}`, y el `<div className={styles.formFooter}>` con los botones Cancelar/Guardar. `handleSubmit`, `EMPTY_FORM`, `openCreate`, `openEdit` (ahora con `productoAForm`), `closeModal` siguen en `ProductosClient`.

- [ ] **Step 3: Typecheck y build**

Run: `npx tsc --noEmit`
Expected: exit 0. (Si quedan referencias a `f`/`subcategoriasDisponibles`/`handleCategoriaChange`/`handleNombreChange` en `ProductosClient`, eliminarlas.)

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Correr toda la suite**

Run: `npm test`
Expected: todos los tests pasan (sin cambios respecto al baseline).

- [ ] **Step 5: Commit**

```bash
git add components/admin/ProductoFields.tsx app/admin/productos/ProductosClient.tsx
git commit -m "refactor(admin): extraer ProductoFields (modo completo/rapido) y productoAForm"
```

---

### Task 3: Ruta y pantalla del carrusel + botón de entrada

**Files:**
- Create: `app/admin/productos/carrusel/page.tsx`
- Create: `app/admin/productos/CarruselClient.tsx`
- Create: `app/admin/productos/carrusel.module.css`
- Modify: `app/admin/productos/ProductosClient.tsx` (botón "Modo carrusel")

**Interfaces:**
- Consumes: `filtrarInventario`, `CriteriosInventario`, `UMBRAL_STOCK_BAJO` (T1); `ProductoFields`, `productoAForm` (T2); `updateProducto` de `./actions`; `Producto`, `ProductoForm`, `Categoria` de `@/types`.
- Produces: ruta `/admin/productos/carrusel`.

- [ ] **Step 1: Crear el server component `carrusel/page.tsx`**

Crear `app/admin/productos/carrusel/page.tsx` (mismas queries que `app/admin/productos/page.tsx`):

```tsx
import { createClient } from '@/lib/supabase-server'
import CarruselClient from '../CarruselClient'

export default async function CarruselPage() {
  const supabase = await createClient()
  const [{ data: productos }, { data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor)')
      .order('nombre')
      .limit(500),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat').eq('activo', true).order('valor'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat').eq('activo', true).order('valor'),
  ])

  return (
    <CarruselClient
      productos={productos ?? []}
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
    />
  )
}
```

- [ ] **Step 2: Crear `app/admin/productos/carrusel.module.css`**

Crear con clases mínimas (ajustar a gusto visual, pero deben existir las referenciadas por el cliente):

```css
.page { max-width: 720px; margin: 0 auto; padding: 1.5rem; }
.filtros { display: flex; flex-direction: column; gap: 1rem; }
.grupo { border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 1rem; }
.grupoTitulo { font-weight: 600; margin-bottom: 0.5rem; }
.checks { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.card { border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 1.5rem; }
.cardHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.contador { font-weight: 600; }
.saved { color: green; }
.nav { display: flex; gap: 0.75rem; justify-content: space-between; margin-top: 1.5rem; }
.error { color: #c00; margin-top: 0.5rem; }
.resumen { text-align: center; padding: 2rem; }
```

- [ ] **Step 3: Crear `app/admin/productos/CarruselClient.tsx`**

```tsx
'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import ProductoFields, { productoAForm } from '@/components/admin/ProductoFields'
import Toggle from '@/components/admin/Toggle'
import { updateProducto } from './actions'
import { filtrarInventario, type CriteriosInventario } from '@/lib/store/inventoryFilters'
import type { Producto, ProductoForm, Categoria } from '@/types'
import styles from './carrusel.module.css'

interface Props {
  productos: Producto[]
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
}

export default function CarruselClient({ productos, categorias, subcategorias }: Props) {
  const [criterios, setCriterios] = useState<CriteriosInventario>({})
  const [catId, setCatId] = useState('')
  const [genero, setGenero] = useState('')
  const [started, setStarted] = useState(false)
  const [set, setSet] = useState<Producto[]>([])
  const [idx, setIdx] = useState(0)
  const [form, setForm] = useState<ProductoForm>(() => productoAForm(productos[0] ?? ({} as Producto)))
  const [guardados, setGuardados] = useState<Set<string>>(new Set())
  const [modoCampos, setModoCampos] = useState<'rapido' | 'completo'>('rapido')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const flag = (k: keyof CriteriosInventario) => (v: boolean) =>
    setCriterios(c => ({ ...c, [k]: v || undefined }))

  function empezar() {
    const c: CriteriosInventario = {
      ...criterios,
      categoriaIds: catId ? [catId] : undefined,
      generos: genero ? [genero] : undefined,
    }
    const lista = filtrarInventario(productos, c)
    setSet(lista)
    setIdx(0)
    if (lista[0]) cargar(lista[0])
    setStarted(true)
  }

  function cargar(p: Producto) {
    setForm(productoAForm(p))
    setModoCampos('rapido')
    setDirty(false)
    setError('')
  }

  const actual = set[idx]

  // envuelve setForm para marcar dirty
  const setFormDirty: React.Dispatch<React.SetStateAction<ProductoForm>> = updater => {
    setDirty(true)
    setForm(updater)
  }

  function irA(nuevo: number) {
    if (nuevo < 0 || nuevo >= set.length) return
    setIdx(nuevo)
    cargar(set[nuevo])
  }

  function siguienteConAviso() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Avanzar sin guardar?')) return
    irA(idx + 1)
  }

  function guardarYSiguiente() {
    if (!actual) return
    startTransition(async () => {
      const res = await updateProducto(actual.id, form)
      if (res.error) { setError(res.error); return }
      setGuardados(prev => new Set(prev).add(actual.id))
      setDirty(false)
      if (idx + 1 < set.length) irA(idx + 1)
      else setIdx(set.length) // fin
    })
  }

  if (!started) {
    return (
      <div className={styles.page}>
        <h1>Modo carrusel</h1>
        <p>Elige los filtros y pulsa Empezar.</p>
        <div className={styles.filtros}>
          <div className={styles.grupo}>
            <div className={styles.grupoTitulo}>Faltantes</div>
            <div className={styles.checks}>
              <Toggle checked={!!criterios.sinCategoria} onChange={flag('sinCategoria')} label="Sin categoría" />
              <Toggle checked={!!criterios.sinImagen} onChange={flag('sinImagen')} label="Sin imagen" />
              <Toggle checked={!!criterios.sinDescripcion} onChange={flag('sinDescripcion')} label="Sin descripción" />
              <Toggle checked={!!criterios.sinPrecio} onChange={flag('sinPrecio')} label="Sin precio" />
              <Toggle checked={!!criterios.sinSku} onChange={flag('sinSku')} label="Sin SKU" />
            </div>
          </div>
          <div className={styles.grupo}>
            <div className={styles.grupoTitulo}>Categoría / género</div>
            <select value={catId} onChange={e => setCatId(e.target.value)}>
              <option value="">— Cualquier categoría —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.valor}</option>)}
            </select>
            <select value={genero} onChange={e => setGenero(e.target.value)}>
              <option value="">— Cualquier género —</option>
              {['Hombre', 'Mujer', 'Unisex', 'Niños'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className={styles.grupo}>
            <div className={styles.grupoTitulo}>Stock y estado</div>
            <div className={styles.checks}>
              <Toggle checked={!!criterios.stockBajo} onChange={flag('stockBajo')} label="Stock bajo (<5)" />
              <Toggle checked={!!criterios.sinStock} onChange={flag('sinStock')} label="Sin stock" />
              <Toggle checked={criterios.activo === true} onChange={v => setCriterios(c => ({ ...c, activo: v ? true : undefined }))} label="Solo activos" />
              <Toggle checked={criterios.activo === false} onChange={v => setCriterios(c => ({ ...c, activo: v ? false : undefined }))} label="Solo inactivos" />
            </div>
          </div>
        </div>
        <div className={styles.nav}>
          <Link href="/admin/productos">← Volver</Link>
          <button onClick={empezar}>Empezar</button>
        </div>
      </div>
    )
  }

  if (idx >= set.length) {
    return (
      <div className={styles.page}>
        <div className={styles.resumen}>
          <h2>¡Listo!</h2>
          <p>{guardados.size} guardados de {set.length} en el recorrido.</p>
          <Link href="/admin/productos">Volver a productos</Link>
        </div>
      </div>
    )
  }

  if (set.length === 0) {
    return (
      <div className={styles.page}>
        <p>Ningún producto coincide con esos filtros.</p>
        <button onClick={() => setStarted(false)}>← Cambiar filtros</button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.contador}>{idx + 1} / {set.length}</span>
          <span>
            {guardados.has(actual.id) && <span className={styles.saved}>✓ guardado</span>}{' '}
            <button onClick={() => setStarted(false)}>Cambiar filtros</button>
          </span>
        </div>
        <h3>{actual.nombre}</h3>
        <ProductoFields form={form} setForm={setFormDirty} categorias={categorias} subcategorias={subcategorias} modo={modoCampos} />
        {modoCampos === 'rapido' && (
          <button type="button" onClick={() => setModoCampos('completo')}>Ver más campos</button>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.nav}>
          <button onClick={() => irA(idx - 1)} disabled={idx === 0}>← Anterior</button>
          <button onClick={siguienteConAviso}>Saltar →</button>
          <button onClick={guardarYSiguiente} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar y siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Añadir el botón "Modo carrusel" en `ProductosClient.tsx`**

En la barra de acciones (`<div className={styles.actions}>`, junto a "Importar XLSX" y "+ Nuevo producto"), añadir (importar `Link` de `next/link` si no está):

```tsx
<Link href="/admin/productos/carrusel" className={styles.btnSecondary}>Modo carrusel</Link>
```

- [ ] **Step 5: Typecheck y build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: build OK; la ruta `/admin/productos/carrusel` aparece en la lista.

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/productos/carrusel/page.tsx" app/admin/productos/CarruselClient.tsx app/admin/productos/carrusel.module.css app/admin/productos/ProductosClient.tsx
git commit -m "feat(admin): editor carrusel de inventario con filtros y guardar-y-siguiente"
```

---

### Task 4: Rollout — verificación y finishing

**Files:** ninguno (operativo).

- [ ] **Step 1: Verificación final**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm test` → todos pasan.
Run: `npm run build` → OK, ruta `/admin/productos/carrusel` presente.

- [ ] **Step 2: Revisión final de toda la rama**

Correr la revisión whole-branch de subagent-driven-development (modelo capaz) sobre `merge-base main..HEAD`. Prestar atención a: que el modal de productos siga idéntico tras extraer `ProductoFields`, que `updateProducto` reciba un `ProductoForm` completo desde el carrusel, y a la marca dirty/aviso de cambios sin guardar.

- [ ] **Step 3: Fusionar y desplegar**

Con todo verde, pasar a `superpowers:finishing-a-development-branch` para fusionar a `main`, push (dispara el deploy de producción en Vercel — sin migración de BD, así que no hay orden que respetar) y verificar READY. Borrar la rama.

---

## Notas de verificación manual (post-deploy)

- Admin de productos: el modal "Nuevo/Editar" funciona igual que antes (campos, guardar, slug autogenerado).
- Botón "Modo carrusel" abre `/admin/productos/carrusel`.
- Filtrar por "Sin imagen" + una categoría → el recorrido solo trae esos productos.
- Editar en modo rápido, "Ver más campos", "Guardar y siguiente" persiste y avanza con ✓; "Saltar" avanza sin guardar; "Anterior" retrocede; el aviso salta al avanzar con cambios sin guardar.
- Resumen final muestra el conteo y vuelve a productos.
