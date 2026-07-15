# Round-trip de inventario en Excel — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin descarga todo el inventario en un `.xlsx` de 3 pestañas, lo edita fuera de línea (actualizar existentes + dar de alta nuevos) y lo re-sube para aplicar los cambios de forma atómica y validada.

**Architecture:** La lógica de negocio (armar filas de descarga, parsear/validar la subida y producir updates/creates/errores) vive como **funciones puras testeadas** en `lib/store/inventoryRoundtrip.ts`. Dos rutas de API delgadas (`export` GET, `import` POST) leen/escriben Supabase y delegan en las puras. La escritura es un **único `upsert` keyed on `id`** (atómico de hecho): a las altas se les asigna un UUID nuevo y a las actualizaciones se les conserva su `id`. Sin migración de BD.

**Tech Stack:** Next.js 16 (App Router, route handlers), Supabase (`@supabase/ssr`), `xlsx` (ya es dependencia), Vitest.

## Global Constraints

- Idioma español en UI, dominio y mensajes de commit; moneda en Lempiras.
- La lógica con peso (dinero/integridad) vive en `lib/store/` como funciones puras con test en `lib/store/tests/`.
- El cliente Supabase de servidor es `createClient()` de `@/lib/supabase-server` (usa cookies del usuario; `/admin` ya está protegido en `middleware.ts`). El export/import deben además verificar `supabase.auth.getUser()` como hace `app/api/import/route.ts`.
- No confiar en importes del cliente: el import relee productos y categorías de la BD y recalcula todo.
- Modelo plano: un producto = una fila; `tallas`/`colores` son arreglos (conjuntos); `stock` es un solo número (`null` = ilimitado). Sin stock/precio por variante.
- Celda vacía en campo **opcional** = **no cambia** (incluye `stock` y `precio_original`); campo **obligatorio** (`nombre`, `precio`) vacío = **error**. Import **atómico**: si hay ≥1 error, no se escribe nada.
- Comandos de cierre: `npm test`, `npx tsc --noEmit`, `npm run build`. Commits convencionales en español.

---

## File Structure

- `lib/store/inventoryRoundtrip.ts` — **crear**. Tipos, constantes de columnas, helpers de celdas, `buildExportData` (descarga) y `parseInventoryUpload` (subida). Todo puro.
- `lib/store/tests/inventoryRoundtrip.test.ts` — **crear**. Tests de las funciones puras.
- `app/api/inventario/export/route.ts` — **crear**. `GET` que arma y devuelve el `.xlsx`.
- `app/api/inventario/import/route.ts` — **crear**. `POST` que valida y aplica.
- `app/admin/productos/ProductosClient.tsx` — **modificar**. Reemplazar el import legacy por "Descargar inventario" + "Importar inventario" con modal de resultado.
- `app/admin/productos/page.tsx` — **modificar**. Ya carga `productos`, `categorias`, `subcategorias`; pasarlos si hiciera falta (ver Task 6). Sin cambios de datos previstos.
- `app/api/import/route.ts` y `lib/xlsx-parser.ts` — **se dejan sin tocar** (quedan sin uso; C los retomará).

---

### Task 1: Módulo puro — tipos, columnas y helpers de celdas

**Files:**
- Create: `lib/store/inventoryRoundtrip.ts`
- Test: `lib/store/tests/inventoryRoundtrip.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `COLUMNAS: readonly string[]` — orden de columnas del Excel.
  - `INSTRUCCIONES: string[]` — líneas de la pestaña Instrucciones.
  - `interface InventoryRow` — forma cruda de una fila leída del sheet.
  - `parseBool(v: unknown): boolean`
  - `parseNum(v: unknown): number | undefined` — `undefined` si celda vacía; `NaN` si texto no numérico.
  - `cellText(v: unknown): string | undefined` — `undefined` si vacía/espacios; si no, texto recortado.
  - `cellBool(v: unknown): boolean | undefined` — `undefined` si vacía; si no, `parseBool`.
  - `splitList(v: unknown): string[]` — separa por coma, recorta, quita vacíos.
  - `joinList(arr: string[] | null | undefined): string` — une con `", "`.
  - `normNombre(s: unknown): string` — recorta y pasa a minúsculas (para casar categorías por nombre).

- [ ] **Step 1: Escribir el test de los helpers**

Crear `lib/store/tests/inventoryRoundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  COLUMNAS, INSTRUCCIONES,
  parseBool, parseNum, cellText, cellBool, splitList, joinList, normNombre,
} from '../inventoryRoundtrip'

describe('helpers de celdas', () => {
  it('COLUMNAS trae id primero y las 16 columnas', () => {
    expect(COLUMNAS[0]).toBe('id')
    expect(COLUMNAS).toContain('precio')
    expect(COLUMNAS).toContain('activo')
    expect(COLUMNAS.length).toBe(16)
  })
  it('INSTRUCCIONES no está vacío', () => {
    expect(INSTRUCCIONES.length).toBeGreaterThan(3)
  })
  it('parseBool reconoce verdadero en varias formas', () => {
    expect(parseBool('VERDADERO')).toBe(true)
    expect(parseBool('true')).toBe(true)
    expect(parseBool(1)).toBe(true)
    expect(parseBool('SÍ')).toBe(true)
    expect(parseBool('FALSO')).toBe(false)
    expect(parseBool('')).toBe(false)
  })
  it('parseNum: vacío→undefined, número→number, texto→NaN', () => {
    expect(parseNum('')).toBeUndefined()
    expect(parseNum('   ')).toBeUndefined()
    expect(parseNum(null)).toBeUndefined()
    expect(parseNum('3350')).toBe(3350)
    expect(parseNum('3604.66')).toBe(3604.66)
    expect(parseNum(10)).toBe(10)
    expect(Number.isNaN(parseNum('abc'))).toBe(true)
  })
  it('cellText: vacío/espacios→undefined; si no, recorta', () => {
    expect(cellText('')).toBeUndefined()
    expect(cellText('  ')).toBeUndefined()
    expect(cellText(null)).toBeUndefined()
    expect(cellText('  hola ')).toBe('hola')
  })
  it('cellBool: vacío→undefined; si no, booleano', () => {
    expect(cellBool('')).toBeUndefined()
    expect(cellBool('VERDADERO')).toBe(true)
    expect(cellBool('FALSO')).toBe(false)
  })
  it('splitList / joinList', () => {
    expect(splitList('S, M ,L,')).toEqual(['S', 'M', 'L'])
    expect(splitList('')).toEqual([])
    expect(joinList(['Rojo', 'Azul'])).toBe('Rojo, Azul')
    expect(joinList(null)).toBe('')
  })
  it('normNombre recorta y baja a minúsculas', () => {
    expect(normNombre('  Zapatos  ')).toBe('zapatos')
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- inventoryRoundtrip`
Expected: FAIL (módulo `../inventoryRoundtrip` no existe).

- [ ] **Step 3: Implementar los helpers**

Crear `lib/store/inventoryRoundtrip.ts`:

```ts
export const COLUMNAS = [
  'id', 'sku', 'nombre', 'marca', 'precio', 'precio_original',
  'stock', 'descripcion', 'categoria', 'subcategoria', 'genero',
  'badge', 'tallas', 'colores', 'personalizable', 'activo',
] as const

export const INSTRUCCIONES: string[] = [
  'Hondusport — Plantilla de inventario',
  '',
  'Pestaña "Actualizar": productos existentes. Edita las celdas y vuelve a subir el archivo.',
  'Pestaña "Nuevos": escribe aquí las filas de productos a crear (no pongas id).',
  '',
  'Reglas:',
  '- NO modifiques la columna "id": es la llave del producto.',
  '- Obligatorios: nombre y precio (precio mayor a 0). No pueden ir vacíos.',
  '- Celda vacía en un campo opcional = ese valor no se cambia.',
  '- stock: vacío = no cambia; 0 = agotado; un número = existencias. Ilimitado se fija en el panel.',
  '- precio_original: vacío = no cambia. Para quitar una oferta usa el panel.',
  '- Para desactivar: activo = FALSO. Borrar una fila NO elimina el producto.',
  '- tallas y colores: separados por coma. Ejemplo: "S, M, L".',
  '- categoria y subcategoria: por nombre exacto. La subcategoría debe pertenecer a esa categoría.',
  '- personalizable y activo: VERDADERO o FALSO.',
]

export interface InventoryRow {
  id?: string | number
  sku?: string | number
  nombre?: string
  marca?: string
  precio?: string | number
  precio_original?: string | number
  stock?: string | number
  descripcion?: string
  categoria?: string
  subcategoria?: string
  genero?: string
  badge?: string
  tallas?: string
  colores?: string
  personalizable?: string | boolean | number
  activo?: string | boolean | number
}

export function parseBool(v: unknown): boolean {
  const s = String(v ?? '').toUpperCase().trim()
  return s === 'VERDADERO' || s === 'TRUE' || s === '1' || s === 'SI' || s === 'SÍ'
}

export function parseNum(v: unknown): number | undefined {
  const s = String(v ?? '').trim()
  if (s === '') return undefined
  return Number(s)
}

export function cellText(v: unknown): string | undefined {
  const s = String(v ?? '').trim()
  return s === '' ? undefined : s
}

export function cellBool(v: unknown): boolean | undefined {
  const s = String(v ?? '').trim()
  if (s === '') return undefined
  return parseBool(v)
}

export function splitList(v: unknown): string[] {
  return String(v ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export function joinList(arr: string[] | null | undefined): string {
  return (arr ?? []).join(', ')
}

export function normNombre(s: unknown): string {
  return String(s ?? '').trim().toLowerCase()
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npm test -- inventoryRoundtrip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/inventoryRoundtrip.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(inventario): helpers puros para round-trip Excel"
```

---

### Task 2: `buildExportData` — filas de la descarga

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts`
- Test: `lib/store/tests/inventoryRoundtrip.test.ts`

**Interfaces:**
- Consumes: `joinList` (Task 1); tipo `Producto` de `@/types`.
- Produces:
  - `interface CategoriaRef { id: string; valor: string }`
  - `buildExportData(productos: Producto[], categorias: CategoriaRef[], subcategorias: CategoriaRef[]): { actualizar: Record<string, string | number>[] }`
    - Una fila por producto en el orden de `COLUMNAS`; `stock`/`precio_original` nulos salen como `''`; `tallas`/`colores` unidos por coma; `categoria`/`subcategoria` resueltos a su `valor`; `personalizable`/`activo` como `'VERDADERO'`/`'FALSO'`.

- [ ] **Step 1: Escribir el test de `buildExportData`**

Añadir a `lib/store/tests/inventoryRoundtrip.test.ts`:

```ts
import { buildExportData } from '../inventoryRoundtrip'
import type { Producto } from '@/types'

function prod(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'p1', nombre: 'Camiseta', slug: 'camiseta', descripcion: 'algodón',
    precio: 250, precio_original: null, categoria_id: 'c1', subcategoria_id: null,
    stock: 10, genero: 'Hombre', badge: null, tallas: ['S', 'M'], colores: ['Rojo'],
    imagenes: null, marca: 'Nike', sku: 'SKU1', personalizable: false,
    oferta_fin: null, activo: true, rating: 5, created_at: '', updated_at: '',
    ...overrides,
  }
}

describe('buildExportData', () => {
  const cats = [{ id: 'c1', valor: 'Ropa' }]
  const subs = [{ id: 's1', valor: 'Camisetas' }]

  it('mapea un producto a una fila con nombres de categoría', () => {
    const { actualizar } = buildExportData(
      [prod({ categoria_id: 'c1', subcategoria_id: 's1' })], cats, subs,
    )
    expect(actualizar).toHaveLength(1)
    const r = actualizar[0]
    expect(r.id).toBe('p1')
    expect(r.categoria).toBe('Ropa')
    expect(r.subcategoria).toBe('Camisetas')
    expect(r.tallas).toBe('S, M')
    expect(r.colores).toBe('Rojo')
    expect(r.personalizable).toBe('FALSO')
    expect(r.activo).toBe('VERDADERO')
  })

  it('nulos (stock, precio_original) salen como cadena vacía', () => {
    const { actualizar } = buildExportData(
      [prod({ stock: null, precio_original: null, sku: null, categoria_id: null })], cats, subs,
    )
    expect(actualizar[0].stock).toBe('')
    expect(actualizar[0].precio_original).toBe('')
    expect(actualizar[0].sku).toBe('')
    expect(actualizar[0].categoria).toBe('')
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- inventoryRoundtrip`
Expected: FAIL (`buildExportData` no existe).

- [ ] **Step 3: Implementar `buildExportData`**

Añadir a `lib/store/inventoryRoundtrip.ts` (arriba importar el tipo):

```ts
import type { Producto } from '@/types'

export interface CategoriaRef { id: string; valor: string }

export function buildExportData(
  productos: Producto[],
  categorias: CategoriaRef[],
  subcategorias: CategoriaRef[],
): { actualizar: Record<string, string | number>[] } {
  const catById = new Map(categorias.map(c => [c.id, c.valor]))
  const subById = new Map(subcategorias.map(c => [c.id, c.valor]))

  const actualizar = productos.map(p => ({
    id: p.id,
    sku: p.sku ?? '',
    nombre: p.nombre,
    marca: p.marca ?? '',
    precio: p.precio,
    precio_original: p.precio_original ?? '',
    stock: p.stock ?? '',
    descripcion: p.descripcion ?? '',
    categoria: p.categoria_id ? (catById.get(p.categoria_id) ?? '') : '',
    subcategoria: p.subcategoria_id ? (subById.get(p.subcategoria_id) ?? '') : '',
    genero: p.genero ?? '',
    badge: p.badge ?? '',
    tallas: joinList(p.tallas),
    colores: joinList(p.colores),
    personalizable: p.personalizable ? 'VERDADERO' : 'FALSO',
    activo: p.activo ? 'VERDADERO' : 'FALSO',
  }))

  return { actualizar }
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npm test -- inventoryRoundtrip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/inventoryRoundtrip.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(inventario): buildExportData arma filas de descarga"
```

---

### Task 3: `parseInventoryUpload` — validación y updates/creates

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts`
- Test: `lib/store/tests/inventoryRoundtrip.test.ts`

**Interfaces:**
- Consumes: `InventoryRow`, `cellText`, `cellBool`, `parseNum`, `splitList`, `normNombre` (Tasks 1); `slugify`, `uniqueSlug` de `@/lib/store/slug`; `Producto`, `Categoria` de `@/types`.
- Produces:
  - `interface ProductoData` — todos los campos de `productos` que tocamos, **sin** `id` (nombre, slug, descripcion, precio, precio_original, categoria_id, subcategoria_id, stock, genero, badge, tallas, colores, marca, sku, personalizable, activo). `imagenes`/`oferta_fin`/`rating` NO se incluyen (se preservan al ser upsert por columnas presentes).
  - `interface ImportError { pestaña: 'Actualizar' | 'Nuevos'; fila: number; motivo: string }`
  - `interface SubcategoriaRef { id: string; valor: string; categorias_padre: string[] | null }`
  - `interface ParseContext { existentes: Producto[]; categorias: CategoriaRef[]; subcategorias: SubcategoriaRef[] }`
  - `interface ParseResult { updates: (ProductoData & { id: string })[]; creates: ProductoData[]; errors: ImportError[] }`
  - `parseInventoryUpload(input: { actualizar: InventoryRow[]; nuevos: InventoryRow[] }, ctx: ParseContext): ParseResult`

**Reglas implementadas (resumen para el implementador):**
- Fila del Excel = índice de datos + 2 (encabezado en fila 1).
- **Actualizar:** requiere `id` existente en BD. `nombre`/`precio` obligatorios (vacío/inválido = error; precio > 0). Opcionales vacíos = conservar valor actual del producto (merge). `slug` se conserva (no se regenera). Categoría/subcat por nombre; subcat debe pertenecer a la categoría efectiva.
- **Nuevos:** fila totalmente vacía se ignora. `id` presente = error. `nombre`/`precio` obligatorios. Opcionales vacíos = `null` (o default: `personalizable=false`, `activo=true`, `stock=null` ilimitado). `slug` se genera con `uniqueSlug`.
- **SKU único** entre filas del archivo y contra la BD (una fila cuyo SKU pertenece a otro producto = error).
- Se acumulan **todos** los errores; una fila con error no aporta a updates/creates.

- [ ] **Step 1: Escribir los tests de `parseInventoryUpload`**

Añadir a `lib/store/tests/inventoryRoundtrip.test.ts`:

```ts
import { parseInventoryUpload } from '../inventoryRoundtrip'
import type { ParseContext } from '../inventoryRoundtrip'

function ctxBase(): ParseContext {
  return {
    existentes: [
      prod({ id: 'p1', nombre: 'Camiseta', slug: 'camiseta', precio: 250, stock: 10,
             sku: 'SKU1', categoria_id: 'c1', subcategoria_id: 's1', tallas: ['S'], colores: ['Rojo'],
             descripcion: 'vieja', precio_original: null, marca: 'Nike', activo: true, personalizable: false }),
    ],
    categorias: [{ id: 'c1', valor: 'Ropa' }, { id: 'c2', valor: 'Calzado' }],
    subcategorias: [
      { id: 's1', valor: 'Camisetas', categorias_padre: ['c1'] },
      { id: 's2', valor: 'Tenis', categorias_padre: ['c2'] },
    ],
  }
}

describe('parseInventoryUpload — actualizar', () => {
  it('actualiza precio y stock, conserva opcionales vacíos y el slug', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 300, stock: 5,
        descripcion: '', categoria: 'Ropa', subcategoria: 'Camisetas' }],
      nuevos: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.creates).toEqual([])
    expect(res.updates).toHaveLength(1)
    const u = res.updates[0]
    expect(u.id).toBe('p1')
    expect(u.precio).toBe(300)
    expect(u.stock).toBe(5)
    expect(u.descripcion).toBe('vieja') // opcional vacío = no cambia
    expect(u.slug).toBe('camiseta')     // no se regenera
    expect(u.categoria_id).toBe('c1')
    expect(u.subcategoria_id).toBe('s1')
  })

  it('stock vacío = no cambia; stock 0 = agotado', () => {
    const c = ctxBase()
    const r1 = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: '' }], nuevos: [] }, c)
    expect(r1.updates[0].stock).toBe(10)
    const r2 = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 0 }], nuevos: [] }, c)
    expect(r2.updates[0].stock).toBe(0)
  })

  it('error: id inexistente', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'zzz', nombre: 'X', precio: 10 }], nuevos: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors[0]).toMatchObject({ pestaña: 'Actualizar', fila: 2 })
    expect(res.errors[0].motivo).toContain('id')
  })

  it('error: nombre vacío y precio ≤ 0', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: '', precio: 0 }], nuevos: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors.map(e => e.motivo).join(' ')).toMatch(/nombre/)
    expect(res.errors.map(e => e.motivo).join(' ')).toMatch(/precio/)
  })

  it('error: categoría inexistente', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Zapatoss' }], nuevos: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('categoría')
  })

  it('error: subcategoría no pertenece a la categoría', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Ropa', subcategoria: 'Tenis' }], nuevos: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('subcategoría')
  })
})

describe('parseInventoryUpload — nuevos', () => {
  it('crea un producto con slug generado y defaults', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: 'Gorra', precio: 120, categoria: 'Ropa', tallas: 'Única' }],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.creates).toHaveLength(1)
    const c = res.creates[0]
    expect(c.nombre).toBe('Gorra')
    expect(c.slug).toBe('gorra')
    expect(c.precio).toBe(120)
    expect(c.stock).toBeNull()          // nuevo sin stock = ilimitado
    expect(c.activo).toBe(true)         // default
    expect(c.personalizable).toBe(false)
    expect(c.categoria_id).toBe('c1')
    expect(c.tallas).toEqual(['Única'])
  })

  it('ignora filas totalmente vacías', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{}, { nombre: '', precio: '' }] }, ctxBase())
    expect(res.creates).toEqual([])
    expect(res.errors).toEqual([])
  })

  it('error: fila nueva con id', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ id: 'x', nombre: 'Y', precio: 10 }] }, ctxBase())
    expect(res.errors[0].motivo).toContain('id')
  })

  it('genera slug único cuando choca con uno existente', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Camiseta', precio: 10 }] }, ctxBase())
    expect(res.creates[0].slug).toBe('camiseta-2')
  })
})

describe('parseInventoryUpload — SKU único', () => {
  it('error: alta con SKU ya existente en BD', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Otro', precio: 10, sku: 'SKU1' }] }, ctxBase())
    expect(res.errors[0].motivo).toContain('SKU')
  })
  it('error: dos filas con el mismo SKU', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: 'A', precio: 10, sku: 'DUP' }, { nombre: 'B', precio: 10, sku: 'DUP' }],
    }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('SKU'))).toBe(true)
  })
  it('actualizar conservando su propio SKU no es conflicto', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, sku: 'SKU1' }], nuevos: [] }, ctxBase())
    expect(res.errors).toEqual([])
  })
})

describe('parseInventoryUpload — atomicidad de datos', () => {
  it('devuelve updates y creates juntos cuando todo es válido', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 300 }],
      nuevos: [{ nombre: 'Nuevo', precio: 50 }],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.updates).toHaveLength(1)
    expect(res.creates).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npm test -- inventoryRoundtrip`
Expected: FAIL (`parseInventoryUpload` no existe).

- [ ] **Step 3: Implementar `parseInventoryUpload`**

Añadir a `lib/store/inventoryRoundtrip.ts` (importar slug helpers arriba: `import { slugify, uniqueSlug } from './slug'`):

```ts
export interface ProductoData {
  nombre: string
  slug: string
  descripcion: string | null
  precio: number
  precio_original: number | null
  categoria_id: string | null
  subcategoria_id: string | null
  stock: number | null
  genero: string | null
  badge: string | null
  tallas: string[] | null
  colores: string[] | null
  marca: string | null
  sku: string | null
  personalizable: boolean
  activo: boolean
}

export interface ImportError {
  pestaña: 'Actualizar' | 'Nuevos'
  fila: number
  motivo: string
}

export interface SubcategoriaRef { id: string; valor: string; categorias_padre: string[] | null }

export interface ParseContext {
  existentes: Producto[]
  categorias: CategoriaRef[]
  subcategorias: SubcategoriaRef[]
}

export interface ParseResult {
  updates: (ProductoData & { id: string })[]
  creates: ProductoData[]
  errors: ImportError[]
}

export function parseInventoryUpload(
  input: { actualizar: InventoryRow[]; nuevos: InventoryRow[] },
  ctx: ParseContext,
): ParseResult {
  const errors: ImportError[] = []
  const updates: (ProductoData & { id: string })[] = []
  const creates: ProductoData[] = []

  const porId = new Map(ctx.existentes.map(p => [p.id, p]))
  const catByNombre = new Map(ctx.categorias.map(c => [normNombre(c.valor), c]))
  const subByNombre = new Map(ctx.subcategorias.map(c => [normNombre(c.valor), c]))

  // SKU (recortado) -> id del producto dueño en BD
  const idPorSku = new Map<string, string>()
  for (const p of ctx.existentes) {
    if (p.sku) idPorSku.set(p.sku.trim(), p.id)
  }
  // SKUs ya vistos en este archivo -> fila que lo tomó
  const skuVistos = new Map<string, number>()
  const slugs = ctx.existentes.map(p => p.slug)

  // Resuelve categoría/subcat efectivas o empuja errores. Devuelve ids resueltos.
  function resolverCategorias(
    row: InventoryRow, pestaña: 'Actualizar' | 'Nuevos', fila: number,
    baseCat: string | null, baseSub: string | null, rowErrors: string[],
  ): { categoria_id: string | null; subcategoria_id: string | null } {
    const catCell = cellText(row.categoria)
    const subCell = cellText(row.subcategoria)

    let categoria_id = baseCat
    if (catCell !== undefined) {
      const cat = catByNombre.get(normNombre(catCell))
      if (!cat) { rowErrors.push(`la categoría "${catCell}" no existe`); categoria_id = baseCat }
      else categoria_id = cat.id
    }

    let subcategoria_id = baseSub
    if (subCell !== undefined) {
      const sub = subByNombre.get(normNombre(subCell))
      if (!sub) { rowErrors.push(`la subcategoría "${subCell}" no existe`) }
      else if (!categoria_id) { rowErrors.push(`la subcategoría "${subCell}" requiere una categoría`) }
      else if (!(sub.categorias_padre ?? []).includes(categoria_id)) {
        rowErrors.push(`la subcategoría "${subCell}" no pertenece a esa categoría`)
      } else {
        subcategoria_id = sub.id
      }
    }
    return { categoria_id, subcategoria_id }
  }

  // Valida y registra SKU. Devuelve el SKU final (o null). Empuja errores.
  function resolverSku(
    row: InventoryRow, fila: number, propioId: string | null,
    baseSku: string | null, rowErrors: string[],
  ): string | null {
    const cell = cellText(row.sku)
    const skuFinal = cell !== undefined ? cell : baseSku
    if (!skuFinal) return null
    const dueño = idPorSku.get(skuFinal)
    if (dueño && dueño !== propioId) {
      rowErrors.push(`el SKU "${skuFinal}" ya pertenece a otro producto`)
      return skuFinal
    }
    const filaPrevia = skuVistos.get(skuFinal)
    if (filaPrevia !== undefined) {
      rowErrors.push(`el SKU "${skuFinal}" está repetido (también en la fila ${filaPrevia})`)
      return skuFinal
    }
    skuVistos.set(skuFinal, fila)
    return skuFinal
  }

  function parsePrecio(v: unknown, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) { rowErrors.push('el precio no puede ir vacío'); return null }
    if (Number.isNaN(n)) { rowErrors.push('el precio no es un número válido'); return null }
    if (n <= 0) { rowErrors.push('el precio debe ser mayor a 0'); return null }
    return n
  }

  function parsePrecioOriginal(v: unknown, base: number | null, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) return base                       // vacío = no cambia (o base null en altas)
    if (Number.isNaN(n) || n < 0) { rowErrors.push('el precio_original no es un número válido'); return base }
    return n
  }

  function parseStock(v: unknown, base: number | null, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) return base                       // vacío = no cambia (o base null en altas)
    if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
      rowErrors.push('el stock debe ser un número entero de 0 o más'); return base
    }
    return n
  }

  // --- Pestaña Actualizar ---
  input.actualizar.forEach((row, i) => {
    const fila = i + 2
    const rowErrors: string[] = []
    const id = cellText(row.id)
    if (!id) { errors.push({ pestaña: 'Actualizar', fila, motivo: 'falta el id (no borres esa columna)' }); return }
    const prod = porId.get(id)
    if (!prod) { errors.push({ pestaña: 'Actualizar', fila, motivo: `el id "${id}" no existe` }); return }

    const nombre = cellText(row.nombre)
    if (!nombre) rowErrors.push('el nombre no puede ir vacío')
    const precio = parsePrecio(row.precio, rowErrors)
    const precio_original = parsePrecioOriginal(row.precio_original, prod.precio_original, rowErrors)
    const stock = parseStock(row.stock, prod.stock, rowErrors)
    const { categoria_id, subcategoria_id } = resolverCategorias(row, 'Actualizar', fila, prod.categoria_id, prod.subcategoria_id, rowErrors)
    const sku = resolverSku(row, fila, id, prod.sku, rowErrors)

    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Actualizar', fila, motivo: m })); return }

    updates.push({
      id,
      nombre: nombre!,
      slug: prod.slug,
      descripcion: cellText(row.descripcion) ?? prod.descripcion,
      precio: precio!,
      precio_original,
      categoria_id,
      subcategoria_id,
      stock,
      genero: cellText(row.genero) ?? prod.genero,
      badge: cellText(row.badge) ?? prod.badge,
      tallas: cellText(row.tallas) !== undefined ? splitList(row.tallas) : prod.tallas,
      colores: cellText(row.colores) !== undefined ? splitList(row.colores) : prod.colores,
      marca: cellText(row.marca) ?? prod.marca,
      sku,
      personalizable: cellBool(row.personalizable) ?? prod.personalizable,
      activo: cellBool(row.activo) ?? prod.activo,
    })
  })

  // --- Pestaña Nuevos ---
  input.nuevos.forEach((row, i) => {
    const fila = i + 2
    const vacia = COLUMNAS.every(col => cellText((row as Record<string, unknown>)[col]) === undefined)
    if (vacia) return

    const rowErrors: string[] = []
    if (cellText(row.id) !== undefined) rowErrors.push('las filas nuevas no llevan id (déjalo vacío)')

    const nombre = cellText(row.nombre)
    if (!nombre) rowErrors.push('el nombre no puede ir vacío')
    const precio = parsePrecio(row.precio, rowErrors)
    const precio_original = parsePrecioOriginal(row.precio_original, null, rowErrors)
    const stock = parseStock(row.stock, null, rowErrors)
    const { categoria_id, subcategoria_id } = resolverCategorias(row, 'Nuevos', fila, null, null, rowErrors)
    const sku = resolverSku(row, fila, null, null, rowErrors)

    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Nuevos', fila, motivo: m })); return }

    const slug = uniqueSlug(slugify(nombre!) || 'producto', slugs)
    slugs.push(slug)

    creates.push({
      nombre: nombre!,
      slug,
      descripcion: cellText(row.descripcion) ?? null,
      precio: precio!,
      precio_original,
      categoria_id,
      subcategoria_id,
      stock,
      genero: cellText(row.genero) ?? null,
      badge: cellText(row.badge) ?? null,
      tallas: cellText(row.tallas) !== undefined ? splitList(row.tallas) : null,
      colores: cellText(row.colores) !== undefined ? splitList(row.colores) : null,
      marca: cellText(row.marca) ?? null,
      sku,
      personalizable: cellBool(row.personalizable) ?? false,
      activo: cellBool(row.activo) ?? true,
    })
  })

  return { updates, creates, errors }
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npm test -- inventoryRoundtrip`
Expected: PASS (todos los describe).

- [ ] **Step 5: Typecheck y commit**

```bash
npx tsc --noEmit
git add lib/store/inventoryRoundtrip.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(inventario): parseInventoryUpload valida y arma updates/creates"
```

---

### Task 4: Ruta de descarga `GET /api/inventario/export`

**Files:**
- Create: `app/api/inventario/export/route.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase-server`; `buildExportData`, `COLUMNAS`, `INSTRUCCIONES` (Tasks 1-2); `XLSX` de `xlsx`.
- Produces: respuesta `.xlsx` (descarga) con pestañas `Instrucciones`, `Actualizar`, `Nuevos`.

- [ ] **Step 1: Implementar la ruta**

Crear `app/api/inventario/export/route.ts`:

```ts
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { buildExportData, COLUMNAS, INSTRUCCIONES } from '@/lib/store/inventoryRoundtrip'
import type { Producto } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [{ data: productos }, { data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor').eq('tipo', 'subcat'),
  ])

  const { actualizar } = buildExportData(
    (productos ?? []) as Producto[],
    categorias ?? [],
    subcategorias ?? [],
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCCIONES.map(l => [l])), 'Instrucciones')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actualizar, { header: COLUMNAS as unknown as string[] }), 'Actualizar')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COLUMNAS as unknown as string[]]), 'Nuevos')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventario-${fecha}.xlsx"`,
    },
  })
}
```

- [ ] **Step 2: Verificar typecheck y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Prueba manual de la descarga**

Con `npm run dev` y sesión de admin iniciada, navegar a `http://localhost:3000/api/inventario/export`. Debe descargar `inventario-YYYY-MM-DD.xlsx`. Abrirlo y confirmar 3 pestañas y que `Actualizar` trae los productos con `id`, `categoria`/`subcategoria` por nombre, y `tallas`/`colores` por coma.

- [ ] **Step 4: Commit**

```bash
git add app/api/inventario/export/route.ts
git commit -m "feat(inventario): ruta de descarga del inventario a XLSX"
```

---

### Task 5: Ruta de subida `POST /api/inventario/import`

**Files:**
- Create: `app/api/inventario/import/route.ts`

**Interfaces:**
- Consumes: `createClient`; `parseInventoryUpload`, tipos `InventoryRow`, `ParseContext`, `ProductoData` (Task 3); `XLSX`.
- Produces: JSON `{ success, actualizados, creados }` en éxito; `{ error, errores: ImportError[] }` (status 422) si hay filas inválidas.

- [ ] **Step 1: Implementar la ruta**

Crear `app/api/inventario/import/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { parseInventoryUpload } from '@/lib/store/inventoryRoundtrip'
import type { InventoryRow, ParseContext } from '@/lib/store/inventoryRoundtrip'
import type { Producto } from '@/types'

function leerPestaña(wb: XLSX.WorkBook, nombre: string): InventoryRow[] {
  const sheet = wb.Sheets[nombre]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<InventoryRow>(sheet, { defval: '' })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  if (!wb.Sheets['Actualizar'] && !wb.Sheets['Nuevos']) {
    return NextResponse.json({ error: 'El archivo no tiene las pestañas "Actualizar" ni "Nuevos". Usa la plantilla de "Descargar inventario".' }, { status: 400 })
  }

  const actualizar = leerPestaña(wb, 'Actualizar')
  const nuevos = leerPestaña(wb, 'Nuevos')

  const [{ data: existentes }, { data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase.from('productos').select('*').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat'),
  ])

  const ctx: ParseContext = {
    existentes: (existentes ?? []) as Producto[],
    categorias: categorias ?? [],
    subcategorias: subcategorias ?? [],
  }

  const { updates, creates, errors } = parseInventoryUpload({ actualizar, nuevos }, ctx)

  if (errors.length > 0) {
    return NextResponse.json({ error: 'No se importó nada. Corrige los errores y vuelve a subir.', errores: errors }, { status: 422 })
  }

  if (updates.length === 0 && creates.length === 0) {
    return NextResponse.json({ error: 'El archivo no tiene filas para actualizar ni crear.' }, { status: 400 })
  }

  const payload = [
    ...updates,
    ...creates.map(c => ({ ...c, id: crypto.randomUUID() })),
  ]

  const { error } = await supabase.from('productos').upsert(payload, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, actualizados: updates.length, creados: creates.length })
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Prueba manual (round-trip completo)**

Con `npm run dev` y sesión de admin: descargar el inventario (Task 4), en `Actualizar` cambiar un precio y un stock, en `Nuevos` agregar una fila (nombre + precio + categoría existente), guardar y subir vía la UI de Task 6 (o `curl` con multipart). Confirmar en `/admin/productos` que el existente cambió y el nuevo aparece. Repetir con un error deliberado (categoría inexistente) y confirmar que **no se aplica nada** y que la respuesta trae `errores`.

- [ ] **Step 4: Commit**

```bash
git add app/api/inventario/import/route.ts
git commit -m "feat(inventario): ruta de subida atómica del inventario (upsert por id)"
```

---

### Task 6: UI — botones de descarga/subida + modal de resultado; quitar legacy

**Files:**
- Modify: `app/admin/productos/ProductosClient.tsx`

**Interfaces:**
- Consumes: rutas `GET /api/inventario/export` y `POST /api/inventario/import` (Tasks 4-5); componente `Modal` (`@/components/admin/Modal`); tipo `ImportError` (Task 3).
- Produces: UI de round-trip en la barra de Productos.

- [ ] **Step 1: Reemplazar el estado/handler de import legacy**

En `app/admin/productos/ProductosClient.tsx`, importar el tipo y el Modal (Modal ya está importado). Añadir arriba:

```ts
import type { ImportError } from '@/lib/store/inventoryRoundtrip'
```

Sustituir el estado `importing` y la función `handleImport` por:

```ts
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<
    | { tipo: 'ok'; actualizados: number; creados: number }
    | { tipo: 'error'; mensaje: string; errores?: ImportError[] }
    | null
  >(null)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/inventario/import', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) {
        setResultado({ tipo: 'error', mensaje: json.error ?? 'Error al importar', errores: json.errores })
        return
      }
      setResultado({ tipo: 'ok', actualizados: json.actualizados, creados: json.creados })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  function cerrarResultado() {
    const exito = resultado?.tipo === 'ok'
    setResultado(null)
    if (exito) window.location.reload()
  }
```

- [ ] **Step 2: Reemplazar los botones de la barra**

En el bloque `<div className={styles.actions}>`, **quitar** la `<label>` de "Importar XLSX" legacy y en su lugar poner descargar + importar:

```tsx
          <a href="/api/inventario/export" className={styles.btnSecondary}>↓ Descargar inventario</a>
          <label className={`${styles.btnSecondary} ${importing ? styles.importing : ''}`}>
            {importing ? 'Importando…' : '↑ Importar inventario'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              style={{ display: 'none' }}
              disabled={importing}
            />
          </label>
          <Link href="/admin/productos/carrusel" className={styles.btnSecondary}>Modo carrusel</Link>
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Nuevo producto
          </button>
```

- [ ] **Step 3: Añadir el modal de resultado**

Antes del cierre del `return` (junto al otro `{modal && (...)}`), añadir:

```tsx
      {resultado && (
        <Modal
          title={resultado.tipo === 'ok' ? 'Importación completada' : 'No se importó'}
          onClose={cerrarResultado}
          maxWidth="560px"
        >
          {resultado.tipo === 'ok' ? (
            <p>✓ {resultado.actualizados} actualizados, {resultado.creados} creados.</p>
          ) : (
            <div>
              <p>{resultado.mensaje}</p>
              {resultado.errores && resultado.errores.length > 0 && (
                <ul>
                  {resultado.errores.map((er, i) => (
                    <li key={i}>Pestaña {er.pestaña}, fila {er.fila}: {er.motivo}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button className={styles.btnPrimary} onClick={cerrarResultado}>Cerrar</button>
          </div>
        </Modal>
      )}
```

- [ ] **Step 4: Verificar typecheck, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. (El `alert`/reload viejos ya no se usan.)

- [ ] **Step 5: Prueba manual de la UI**

`npm run dev`, ir a `/admin/productos`: confirmar que ya **no** está "Importar XLSX" legacy; que "↓ Descargar inventario" baja el archivo; que "↑ Importar inventario" con un archivo válido muestra el modal "✓ X actualizados, Y creados" y refresca; y que con un archivo con errores muestra la lista de filas rechazadas y **no** cambia nada.

- [ ] **Step 6: Commit**

```bash
git add app/admin/productos/ProductosClient.tsx
git commit -m "feat(inventario): UI de descarga/subida round-trip y retiro del import legacy"
```

---

## Cierre

- [ ] `npm test` (toda la suite) — verde.
- [ ] `npx tsc --noEmit` — sin errores.
- [ ] `npm run build` — ok.
- [ ] Revisión final whole-branch (opus) según el flujo del proyecto.
- [ ] No hay migración de BD en este proyecto → verificación con tsc/test/build + pruebas manuales del round-trip. No fusionar/pushear a `main` sin confirmación explícita del usuario (deploy a producción).

## Notas de decisiones (trazabilidad)

- Llave de casado: `id` (bloqueado) + `sku` editable con unicidad.
- Un solo `upsert` keyed on `id` = atomicidad de la escritura sin migración; a las altas se les asigna `crypto.randomUUID()` en la ruta (no en la función pura, que queda determinista).
- Campos preservados al actualizar (no viajan en el Excel): `imagenes`, `oferta_fin`, `rating`, `created_at` — el upsert por columnas presentes no los toca.
- `slug`: se conserva en updates (no rompe URLs); se genera en altas.
- Legacy (`app/api/import`, `lib/xlsx-parser.ts`) se deja en el repo para el sub-proyecto C.
