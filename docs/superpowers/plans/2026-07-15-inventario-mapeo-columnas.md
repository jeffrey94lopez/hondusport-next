# Mapeo de columnas / import externo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar una plantilla `.xlsx` de otro programa mapeando sus columnas a los campos de la plataforma: subir → mapear → preview → confirmar, agrupando por SKU y creando/actualizando de forma atómica.

**Architecture:** Lógica pura y testeada en `lib/store/externalImport.ts` (sugerir mapeo, agrupar por SKU, validar y armar updates/creates), que **reutiliza** los helpers y tipos ya exportados por `lib/store/inventoryRoundtrip.ts` (`cellText`, `parseNum`, `parseBool`, `splitList`, `normNombre`, `ProductoData`, `ParseContext`) y `lib/store/slug`. Dos rutas delgadas: `plantilla/columnas` (encabezados + sugerencia + mapeo guardado) y `plantilla/importar` (preview con `confirmar=false`, aplicación atómica con `confirmar=true`). UI: modal wizard. Se elimina el import legacy.

**Tech Stack:** Next.js 16 (App Router route handlers), Supabase (`@supabase/ssr`), `xlsx`, Vitest.

## Global Constraints

- Idioma español (dominio, UI, mensajes, commits); moneda en Lempiras.
- Lógica de negocio pura en `lib/store/` con tests en `lib/store/tests/`.
- Cliente Supabase de servidor: `createClient()` de `@/lib/supabase-server`; ambas rutas verifican `supabase.auth.getUser()` → 401 (middleware solo cubre `/admin/*`, no `/api/*`).
- Frontera de confianza: el import relee productos + categorías de la BD y delega toda la validación en las funciones puras. No se confía en el cliente.
- **Casar por SKU**; **agrupar por SKU** (suma stock, une tallas/colores, primer no-vacío para escalares). Obligatorio mapear `sku`, `nombre`, `precio` (> 0).
- Celda vacía / campo no mapeado: actualización = no cambia (merge con existente); alta = null/default (`activo=true`, `personalizable=false`, `stock=null`). Nunca borra.
- Import atómico: si hay ≥1 error (incluye filas sin SKU), no se escribe nada; el preview los lista.
- Escritura como B: un solo `upsert(payload, { onConflict: 'id' })` (updates con el `id` del SKU existente; creates con `crypto.randomUUID()`); preserva columnas fuera del set (`imagenes`, `oferta_fin`, `rating`, `created_at`).
- Mapeo guardado en `configuracion` (`upsert` on `key`), clave `import_plantilla_mapeo`.
- Comandos de cierre: `npm test`, `npx tsc --noEmit`, `npm run build`.

## Nota de diseño (desviación consciente del spec)

El spec mencionaba "extraer a compartido la resolución de categoría y el armado de `ProductoData`" de `inventoryRoundtrip.ts`. Para **no** tocar el motor de B (desplegado y probado, con semántica de round-trip distinta), C **reutiliza los helpers de bajo nivel ya exportados** (`cellText/parseNum/parseBool/splitList/normNombre` y los tipos `ProductoData`/`ParseContext`/`SubcategoriaRef`) y **reimplementa** su resolución de categoría/subcat (más simple, sin la lógica de round-trip) en `externalImport.ts`. Es menos "DRY" a nivel de la resolución, pero evita el riesgo de refactorizar B. La resolución de C incorpora la re-validación de subcat aprendida del fix de B (si cambia la categoría, re-validar la subcat conservada).

## File Structure

- `lib/store/externalImport.ts` — **crear**. Tipos, `sugerirMapeo`, `validarMapeo`, `agruparPorSku`, `parseExternalImport`.
- `lib/store/tests/externalImport.test.ts` — **crear**. Tests de las puras.
- `app/api/inventario/plantilla/columnas/route.ts` — **crear**.
- `app/api/inventario/plantilla/importar/route.ts` — **crear**.
- `components/admin/ImportarPlantilla.tsx` — **crear**. Wizard (botón + modal).
- `app/admin/productos/ProductosClient.tsx` — **modificar**. Insertar `<ImportarPlantilla />` en la barra.
- **Borrar:** `app/api/import/route.ts`, `lib/xlsx-parser.ts`, y los tipos `XlsxRow`/`ProductoAgrupado` de `types/index.ts` (si no quedan otros usos).

---

### Task 1: `externalImport.ts` — tipos, `sugerirMapeo`, `validarMapeo`

**Files:**
- Create: `lib/store/externalImport.ts`
- Test: `lib/store/tests/externalImport.test.ts`

**Interfaces:**
- Produces:
  - `type CampoPlataforma` (union de 15 campos).
  - `type Mapeo = Partial<Record<CampoPlataforma, string>>` (campo → nombre de columna externa).
  - `CAMPOS_PLATAFORMA: { campo: CampoPlataforma; label: string; obligatorio: boolean }[]`.
  - `sugerirMapeo(columnas: string[]): Mapeo`.
  - `validarMapeo(mapeo: Mapeo): string[]` (labels de obligatorios faltantes).

- [ ] **Step 1: Escribir el test**

Crear `lib/store/tests/externalImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  CAMPOS_PLATAFORMA, sugerirMapeo, validarMapeo,
  type Mapeo,
} from '../externalImport'

describe('CAMPOS_PLATAFORMA', () => {
  it('sku, nombre y precio son obligatorios; el resto no', () => {
    const oblig = CAMPOS_PLATAFORMA.filter(c => c.obligatorio).map(c => c.campo)
    expect(oblig).toEqual(['sku', 'nombre', 'precio'])
  })
})

describe('sugerirMapeo', () => {
  it('empareja encabezados típicos del POS por nombre', () => {
    const m = sugerirMapeo(['cbarras', 'nombre_producto', 'precio_venta', 'existencia', 'tamano', 'color', 'marca', 'nombre_categoria', 'is_active'])
    expect(m.sku).toBe('cbarras')
    expect(m.nombre).toBe('nombre_producto')
    expect(m.precio).toBe('precio_venta')
    expect(m.stock).toBe('existencia')
    expect(m.talla).toBe('tamano')
    expect(m.color).toBe('color')
    expect(m.marca).toBe('marca')
    expect(m.categoria).toBe('nombre_categoria')
    expect(m.activo).toBe('is_active')
  })
  it('ignora acentos, mayúsculas y separadores', () => {
    const m = sugerirMapeo(['SKU', 'Descripción', 'Precio Venta'])
    expect(m.sku).toBe('SKU')
    expect(m.precio).toBe('Precio Venta')
  })
  it('no asigna dos campos a la misma columna', () => {
    const m = sugerirMapeo(['color'])
    // 'color' solo puede ir a un campo
    const asignaciones = Object.values(m).filter(v => v === 'color')
    expect(asignaciones.length).toBeLessThanOrEqual(1)
  })
  it('devuelve vacío cuando nada coincide', () => {
    expect(sugerirMapeo(['xyz', 'abc'])).toEqual({})
  })
})

describe('validarMapeo', () => {
  it('reporta obligatorios faltantes', () => {
    const errs = validarMapeo({ sku: 'cb' } as Mapeo)
    expect(errs.length).toBe(2) // faltan nombre y precio
  })
  it('sin errores cuando están los tres obligatorios', () => {
    expect(validarMapeo({ sku: 'cb', nombre: 'n', precio: 'p' })).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npm test -- externalImport`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

Crear `lib/store/externalImport.ts`:

```ts
export type CampoPlataforma =
  | 'sku' | 'nombre' | 'precio' | 'precio_original' | 'stock'
  | 'descripcion' | 'categoria' | 'subcategoria' | 'genero'
  | 'badge' | 'marca' | 'talla' | 'color' | 'personalizable' | 'activo'

export type Mapeo = Partial<Record<CampoPlataforma, string>>

export const CAMPOS_PLATAFORMA: { campo: CampoPlataforma; label: string; obligatorio: boolean }[] = [
  { campo: 'sku', label: 'SKU (identificador)', obligatorio: true },
  { campo: 'nombre', label: 'Nombre', obligatorio: true },
  { campo: 'precio', label: 'Precio', obligatorio: true },
  { campo: 'precio_original', label: 'Precio original (oferta)', obligatorio: false },
  { campo: 'stock', label: 'Stock', obligatorio: false },
  { campo: 'marca', label: 'Marca', obligatorio: false },
  { campo: 'categoria', label: 'Categoría', obligatorio: false },
  { campo: 'subcategoria', label: 'Subcategoría', obligatorio: false },
  { campo: 'genero', label: 'Género', obligatorio: false },
  { campo: 'talla', label: 'Talla (por variante)', obligatorio: false },
  { campo: 'color', label: 'Color (por variante)', obligatorio: false },
  { campo: 'descripcion', label: 'Descripción', obligatorio: false },
  { campo: 'badge', label: 'Badge', obligatorio: false },
  { campo: 'personalizable', label: 'Personalizable', obligatorio: false },
  { campo: 'activo', label: 'Activo', obligatorio: false },
]

function compact(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ALIAS: Record<CampoPlataforma, string[]> = {
  sku: ['sku', 'cbarras', 'codigo', 'codigobarras', 'codigodebarras', 'upc', 'ean', 'barcode'],
  nombre: ['nombre', 'nombreproducto', 'producto', 'articulo', 'descripcioncorta'],
  precio: ['precio', 'precioventa', 'pvp', 'venta'],
  precio_original: ['preciooriginal', 'precioanterior', 'preciolista', 'preciotachado'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'inventario', 'disponible'],
  descripcion: ['descripcion', 'descripcionproducto', 'detalle', 'descripcionlarga'],
  categoria: ['categoria', 'nombrecategoria'],
  subcategoria: ['subcategoria', 'vnombresubcategoria', 'nombresubcategoria'],
  genero: ['genero', 'sexo'],
  badge: ['badge', 'etiqueta'],
  marca: ['marca', 'fabricante'],
  talla: ['talla', 'tamano', 'size', 'medida'],
  color: ['color', 'colores'],
  personalizable: ['personalizable'],
  activo: ['activo', 'isactive', 'estado', 'habilitado'],
}

export function sugerirMapeo(columnas: string[]): Mapeo {
  const cols = columnas.map(c => ({ raw: c, k: compact(c) }))
  const usados = new Set<string>()
  const mapeo: Mapeo = {}
  for (const { campo } of CAMPOS_PLATAFORMA) {
    const alias = ALIAS[campo]
    let hit = cols.find(c => !usados.has(c.raw) && alias.includes(c.k))
    if (!hit) hit = cols.find(c => !usados.has(c.raw) && c.k !== '' && alias.some(a => c.k.includes(a) || a.includes(c.k)))
    if (hit) { mapeo[campo] = hit.raw; usados.add(hit.raw) }
  }
  return mapeo
}

export function validarMapeo(mapeo: Mapeo): string[] {
  const errs: string[] = []
  for (const { campo, label, obligatorio } of CAMPOS_PLATAFORMA) {
    if (obligatorio && !mapeo[campo]) errs.push(`falta mapear ${label}`)
  }
  return errs
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npm test -- externalImport`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/externalImport.ts lib/store/tests/externalImport.test.ts
git commit -m "feat(inventario): sugerirMapeo/validarMapeo para import externo"
```

---

### Task 2: `agruparPorSku` — agrupar filas externas por SKU

**Files:**
- Modify: `lib/store/externalImport.ts`
- Test: `lib/store/tests/externalImport.test.ts`

**Interfaces:**
- Consumes: `cellText`, `parseNum`, `splitList` de `@/lib/store/inventoryRoundtrip`; `Mapeo`, `CAMPOS_PLATAFORMA` (Task 1).
- Produces:
  - `interface GrupoProducto { sku: string; filas: number[]; nombre?: string; precio?: string; precio_original?: string; stock?: string; descripcion?: string; categoria?: string; subcategoria?: string; genero?: string; badge?: string; marca?: string; tallas: string[]; colores: string[]; personalizable?: string; activo?: string }`
  - `agruparPorSku(rows: Record<string, unknown>[], mapeo: Mapeo): { grupos: GrupoProducto[]; sinSku: number[] }`
    - Agrupa por el valor de la columna `mapeo.sku`. Suma `stock` (numérico); une `talla`/`color` en conjuntos (usando `splitList` por si vienen separados por coma); primer valor no vacío para escalares. `filas` = números de fila origen (índice + 2). Filas totalmente vacías (ninguna columna mapeada con valor) se ignoran. Filas con datos pero sin SKU → su número va a `sinSku`.

- [ ] **Step 1: Escribir el test**

Añadir a `lib/store/tests/externalImport.test.ts`:

```ts
import { agruparPorSku } from '../externalImport'

const MAPEO_POS = {
  sku: 'cbarras', nombre: 'nombre_producto', precio: 'precio_venta',
  stock: 'existencia', talla: 'tamano', color: 'color', marca: 'marca',
} as const

describe('agruparPorSku', () => {
  it('agrupa variantes por SKU: suma stock, une tallas/colores, primer no-vacío', () => {
    const rows = [
      { cbarras: 'A10', nombre_producto: 'Samba OG', precio_venta: 2720, existencia: 3, tamano: '40', color: 'Negro', marca: 'Adidas' },
      { cbarras: 'A10', nombre_producto: 'Samba OG', precio_venta: 2720, existencia: 2, tamano: '41', color: 'Blanco', marca: 'Adidas' },
    ]
    const { grupos, sinSku } = agruparPorSku(rows, MAPEO_POS)
    expect(sinSku).toEqual([])
    expect(grupos).toHaveLength(1)
    const g = grupos[0]
    expect(g.sku).toBe('A10')
    expect(g.nombre).toBe('Samba OG')
    expect(g.precio).toBe('2720')
    expect(g.stock).toBe('5')
    expect(g.tallas).toEqual(['40', '41'])
    expect(g.colores).toEqual(['Negro', 'Blanco'])
    expect(g.filas).toEqual([2, 3])
  })

  it('fila con datos pero sin SKU va a sinSku', () => {
    const rows = [{ cbarras: '', nombre_producto: 'X', precio_venta: 10 }]
    const { grupos, sinSku } = agruparPorSku(rows, MAPEO_POS)
    expect(grupos).toEqual([])
    expect(sinSku).toEqual([2])
  })

  it('ignora filas totalmente vacías', () => {
    const rows = [{ cbarras: '', nombre_producto: '', precio_venta: '' }]
    const { grupos, sinSku } = agruparPorSku(rows, MAPEO_POS)
    expect(grupos).toEqual([])
    expect(sinSku).toEqual([])
  })

  it('no suma stock cuando la columna no está mapeada', () => {
    const rows = [{ cbarras: 'A1', nombre_producto: 'Y', precio_venta: 5 }]
    const { grupos } = agruparPorSku(rows, { sku: 'cbarras', nombre: 'nombre_producto', precio: 'precio_venta' })
    expect(grupos[0].stock).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npm test -- externalImport`
Expected: FAIL (`agruparPorSku` no existe).

- [ ] **Step 3: Implementar**

Añadir a `lib/store/externalImport.ts` (importar helpers arriba: `import { cellText, parseNum, splitList } from './inventoryRoundtrip'`):

```ts
export interface GrupoProducto {
  sku: string
  filas: number[]
  nombre?: string
  precio?: string
  precio_original?: string
  stock?: string
  descripcion?: string
  categoria?: string
  subcategoria?: string
  genero?: string
  badge?: string
  marca?: string
  tallas: string[]
  colores: string[]
  personalizable?: string
  activo?: string
}

const ESCALARES: CampoPlataforma[] = [
  'nombre', 'precio', 'precio_original', 'descripcion', 'categoria',
  'subcategoria', 'genero', 'badge', 'marca', 'personalizable', 'activo',
]

export function agruparPorSku(
  rows: Record<string, unknown>[],
  mapeo: Mapeo,
): { grupos: GrupoProducto[]; sinSku: number[] } {
  const map = new Map<string, GrupoProducto>()
  const sinSku: number[] = []

  const cel = (row: Record<string, unknown>, campo: CampoPlataforma): string | undefined => {
    const col = mapeo[campo]
    return col ? cellText(row[col]) : undefined
  }

  rows.forEach((row, i) => {
    const fila = i + 2
    const tieneDatos = CAMPOS_PLATAFORMA.some(({ campo }) => cel(row, campo) !== undefined)
    if (!tieneDatos) return
    const sku = cel(row, 'sku')
    if (!sku) { sinSku.push(fila); return }

    let g = map.get(sku)
    if (!g) { g = { sku, filas: [], tallas: [], colores: [] }; map.set(sku, g) }
    g.filas.push(fila)

    if (mapeo.stock) {
      const n = parseNum(row[mapeo.stock])
      if (n !== undefined && !Number.isNaN(n)) g.stock = String((g.stock ? Number(g.stock) : 0) + n)
    }
    if (mapeo.talla) for (const t of splitList(row[mapeo.talla])) if (!g.tallas.includes(t)) g.tallas.push(t)
    if (mapeo.color) for (const c of splitList(row[mapeo.color])) if (!g.colores.includes(c)) g.colores.push(c)

    for (const campo of ESCALARES) {
      if (g[campo] === undefined) {
        const v = cel(row, campo)
        if (v !== undefined) (g as Record<string, unknown>)[campo] = v
      }
    }
  })

  return { grupos: [...map.values()], sinSku }
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npm test -- externalImport`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/externalImport.ts lib/store/tests/externalImport.test.ts
git commit -m "feat(inventario): agruparPorSku para plantillas variante-por-fila"
```

---

### Task 3: `parseExternalImport` — casar por SKU, validar, armar updates/creates

**Files:**
- Modify: `lib/store/externalImport.ts`
- Test: `lib/store/tests/externalImport.test.ts`

**Interfaces:**
- Consumes: `cellText`, `parseNum`, `parseBool`, `normNombre` de `@/lib/store/inventoryRoundtrip`; `slugify`, `uniqueSlug` de `@/lib/store/slug`; tipos `ProductoData`, `ParseContext` de `@/lib/store/inventoryRoundtrip`; `Producto` de `@/types`; `GrupoProducto` (Task 2).
- Produces:
  - `interface ImportExternoError { sku: string | null; fila: number | null; motivo: string }`
  - `interface Resumen { crear: number; actualizar: number; conError: number }`
  - `interface ExternalParseResult { updates: (ProductoData & { id: string })[]; creates: ProductoData[]; errors: ImportExternoError[]; resumen: Resumen }`
  - `parseExternalImport(grupos: GrupoProducto[], ctx: ParseContext): ExternalParseResult`
    - Casa cada grupo por SKU contra `ctx.existentes` (por `sku` recortado). Existe → update con `id` existente + merge (opcional vacío = valor actual), `slug` conservado. No existe → create, `slug` generado. Valida `nombre` (requerido), `precio` (número > 0), `precio_original`/`stock` (numérico ≥ 0; stock entero), categoría/subcat por nombre (deben existir; subcat debe pertenecer a la categoría efectiva; si cambia la categoría y no se da subcat, re-validar la subcat conservada). `tallas`/`colores`: si el grupo trae (array no vacío) se usan; si no, en update se conservan y en alta = null. Errores por grupo con `{ sku, fila (primera) }`.

- [ ] **Step 1: Escribir el test**

Añadir a `lib/store/tests/externalImport.test.ts`:

```ts
import { parseExternalImport, type GrupoProducto } from '../externalImport'
import type { ParseContext } from '../inventoryRoundtrip'
import type { Producto } from '@/types'

function prod(o: Partial<Producto> = {}): Producto {
  return {
    id: 'p1', nombre: 'Viejo', slug: 'viejo', descripcion: 'd', precio: 100, precio_original: null,
    categoria_id: 'c1', subcategoria_id: null, stock: 4, genero: null, badge: null,
    tallas: ['S'], colores: ['Rojo'], imagenes: null, marca: 'M', sku: 'A10',
    personalizable: false, oferta_fin: null, activo: true, rating: 5, created_at: '', updated_at: '', ...o,
  }
}
function ctx(): ParseContext {
  return {
    existentes: [prod()],
    categorias: [{ id: 'c1', valor: 'Ropa' }, { id: 'c2', valor: 'Calzado' }],
    subcategorias: [
      { id: 's1', valor: 'Tenis', categorias_padre: ['c2'] },
      { id: 's2', valor: 'Playeras', categorias_padre: ['c1'] },
    ],
  }
}
function grupo(o: Partial<GrupoProducto> = {}): GrupoProducto {
  return { sku: 'NEW1', filas: [2], tallas: [], colores: [], nombre: 'Nuevo', precio: '50', ...o }
}

describe('parseExternalImport', () => {
  it('actualiza cuando el SKU ya existe (merge de opcionales, conserva slug)', () => {
    const g = grupo({ sku: 'A10', nombre: 'Samba OG', precio: '2720', stock: '5', tallas: ['40', '41'] })
    const r = parseExternalImport([g], ctx())
    expect(r.errors).toEqual([])
    expect(r.creates).toEqual([])
    expect(r.updates).toHaveLength(1)
    const u = r.updates[0]
    expect(u.id).toBe('p1')
    expect(u.slug).toBe('viejo')
    expect(u.precio).toBe(2720)
    expect(u.stock).toBe(5)
    expect(u.tallas).toEqual(['40', '41'])
    expect(u.colores).toEqual(['Rojo']) // no venía en el grupo → conserva
    expect(r.resumen).toEqual({ crear: 0, actualizar: 1, conError: 0 })
  })

  it('crea cuando el SKU no existe (slug generado, defaults)', () => {
    const r = parseExternalImport([grupo()], ctx())
    expect(r.errors).toEqual([])
    expect(r.creates).toHaveLength(1)
    const c = r.creates[0]
    expect(c.sku).toBe('NEW1')
    expect(c.slug).toBe('nuevo')
    expect(c.precio).toBe(50)
    expect(c.stock).toBeNull()
    expect(c.activo).toBe(true)
    expect(r.resumen.crear).toBe(1)
  })

  it('error: nombre vacío o precio inválido', () => {
    const r = parseExternalImport([grupo({ nombre: undefined, precio: '0' })], ctx())
    expect(r.updates).toEqual([]); expect(r.creates).toEqual([])
    expect(r.errors.some(e => /nombre/.test(e.motivo))).toBe(true)
    expect(r.errors.some(e => /precio/.test(e.motivo))).toBe(true)
    expect(r.resumen.conError).toBe(1)
  })

  it('error: categoría inexistente / subcat que no pertenece', () => {
    const r1 = parseExternalImport([grupo({ categoria: 'NoExiste' })], ctx())
    expect(r1.errors.some(e => /categor/.test(e.motivo))).toBe(true)
    const r2 = parseExternalImport([grupo({ categoria: 'Ropa', subcategoria: 'Tenis' })], ctx())
    expect(r2.errors.some(e => /subcategor/.test(e.motivo))).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npm test -- externalImport`
Expected: FAIL (`parseExternalImport` no existe).

- [ ] **Step 3: Implementar**

Añadir a `lib/store/externalImport.ts` (ampliar imports arriba a: `import { cellText, parseNum, parseBool, splitList, normNombre, type ProductoData, type ParseContext } from './inventoryRoundtrip'` y `import { slugify, uniqueSlug } from './slug'` y `import type { Producto } from '@/types'`):

```ts
export interface ImportExternoError { sku: string | null; fila: number | null; motivo: string }
export interface Resumen { crear: number; actualizar: number; conError: number }
export interface ExternalParseResult {
  updates: (ProductoData & { id: string })[]
  creates: ProductoData[]
  errors: ImportExternoError[]
  resumen: Resumen
}

function precioReq(v: string | undefined, errs: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) { errs.push('falta el precio'); return null }
  if (Number.isNaN(n)) { errs.push('el precio no es un número válido'); return null }
  if (n <= 0) { errs.push('el precio debe ser mayor a 0'); return null }
  return n
}
function numOpt(v: string | undefined, base: number | null, campo: string, errs: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return base
  if (Number.isNaN(n) || n < 0) { errs.push(`el ${campo} no es un número válido`); return base }
  return n
}
function stockOpt(v: string | undefined, base: number | null, errs: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return base
  if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) { errs.push('el stock debe ser un entero de 0 o más'); return base }
  return n
}
function boolOpt(v: string | undefined): boolean | undefined {
  return v === undefined ? undefined : parseBool(v)
}

export function parseExternalImport(grupos: GrupoProducto[], ctx: ParseContext): ExternalParseResult {
  const updates: (ProductoData & { id: string })[] = []
  const creates: ProductoData[] = []
  const errors: ImportExternoError[] = []

  const catByNombre = new Map(ctx.categorias.map(c => [normNombre(c.valor), c]))
  const subByNombre = new Map(ctx.subcategorias.map(c => [normNombre(c.valor), c]))
  const subById = new Map(ctx.subcategorias.map(c => [c.id, c]))
  const prodPorSku = new Map<string, Producto>()
  for (const p of ctx.existentes) if (p.sku) prodPorSku.set(p.sku.trim(), p)
  const slugs = ctx.existentes.map(p => p.slug)
  let conError = 0

  for (const g of grupos) {
    const errs: string[] = []
    const fila = g.filas[0] ?? null
    const existente = prodPorSku.get(g.sku) ?? null

    const nombre = cellText(g.nombre)
    if (!nombre) errs.push('falta el nombre')
    const precio = precioReq(g.precio, errs)
    const precio_original = numOpt(g.precio_original, existente?.precio_original ?? null, 'precio_original', errs)
    const stock = stockOpt(g.stock, existente?.stock ?? null, errs)

    // categoría / subcategoría
    let categoria_id = existente?.categoria_id ?? null
    let subcategoria_id = existente?.subcategoria_id ?? null
    const catCell = cellText(g.categoria)
    if (catCell !== undefined) {
      const cat = catByNombre.get(normNombre(catCell))
      if (!cat) errs.push(`la categoría "${catCell}" no existe`)
      else categoria_id = cat.id
    }
    const subCell = cellText(g.subcategoria)
    if (subCell !== undefined) {
      const sub = subByNombre.get(normNombre(subCell))
      if (!sub) errs.push(`la subcategoría "${subCell}" no existe`)
      else if (!categoria_id) errs.push(`la subcategoría "${subCell}" requiere una categoría`)
      else if (!(sub.categorias_padre ?? []).includes(categoria_id)) errs.push(`la subcategoría "${subCell}" no pertenece a esa categoría`)
      else subcategoria_id = sub.id
    } else if (catCell !== undefined && subcategoria_id) {
      // cambió la categoría pero se conserva la subcat: re-validar
      const s = subById.get(subcategoria_id)
      if (!categoria_id || !(s?.categorias_padre ?? []).includes(categoria_id)) {
        errs.push(`la subcategoría "${s?.valor ?? subcategoria_id}" no pertenece a esa categoría`)
      }
    }

    if (errs.length) { conError++; errs.forEach(m => errors.push({ sku: g.sku, fila, motivo: m })); continue }

    if (existente) {
      updates.push({
        id: existente.id,
        nombre: nombre!,
        slug: existente.slug,
        descripcion: cellText(g.descripcion) ?? existente.descripcion,
        precio: precio!,
        precio_original,
        categoria_id,
        subcategoria_id,
        stock,
        genero: cellText(g.genero) ?? existente.genero,
        badge: cellText(g.badge) ?? existente.badge,
        tallas: g.tallas.length ? g.tallas : existente.tallas,
        colores: g.colores.length ? g.colores : existente.colores,
        marca: cellText(g.marca) ?? existente.marca,
        sku: g.sku,
        personalizable: boolOpt(g.personalizable) ?? existente.personalizable,
        activo: boolOpt(g.activo) ?? existente.activo,
      })
    } else {
      const slug = uniqueSlug(slugify(nombre!) || 'producto', slugs)
      slugs.push(slug)
      creates.push({
        nombre: nombre!,
        slug,
        descripcion: cellText(g.descripcion) ?? null,
        precio: precio!,
        precio_original,
        categoria_id,
        subcategoria_id,
        stock,
        genero: cellText(g.genero) ?? null,
        badge: cellText(g.badge) ?? null,
        tallas: g.tallas.length ? g.tallas : null,
        colores: g.colores.length ? g.colores : null,
        marca: cellText(g.marca) ?? null,
        sku: g.sku,
        personalizable: boolOpt(g.personalizable) ?? false,
        activo: boolOpt(g.activo) ?? true,
      })
    }
  }

  return { updates, creates, errors, resumen: { crear: creates.length, actualizar: updates.length, conError } }
}
```

- [ ] **Step 4: Correr y ver pasar; typecheck**

Run: `npm test -- externalImport` (PASS) y `npx tsc --noEmit` (limpio).

- [ ] **Step 5: Commit**

```bash
git add lib/store/externalImport.ts lib/store/tests/externalImport.test.ts
git commit -m "feat(inventario): parseExternalImport casa por SKU y arma updates/creates"
```

---

### Task 4: Ruta `POST /api/inventario/plantilla/columnas`

**Files:**
- Create: `app/api/inventario/plantilla/columnas/route.ts`

**Interfaces:**
- Consumes: `createClient`; `sugerirMapeo`, `type Mapeo`; `XLSX`.
- Produces: `{ columnas: string[], sugerencia: Mapeo, guardado: Mapeo | null }`.

- [ ] **Step 1: Implementar**

Crear `app/api/inventario/plantilla/columnas/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { sugerirMapeo, type Mapeo } from '@/lib/store/externalImport'

const CLAVE_MAPEO = 'import_plantilla_mapeo'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })

  const filas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
  const columnas = ((filas[0] as unknown[]) ?? []).map(c => String(c ?? '').trim()).filter(Boolean)
  if (columnas.length === 0) return NextResponse.json({ error: 'No se encontraron encabezados en la primera fila' }, { status: 400 })

  const { data: cfg } = await supabase.from('configuracion').select('value').eq('key', CLAVE_MAPEO).maybeSingle()
  let guardado: Mapeo | null = null
  if (cfg?.value) { try { guardado = JSON.parse(cfg.value) as Mapeo } catch { guardado = null } }

  return NextResponse.json({ columnas, sugerencia: sugerirMapeo(columnas), guardado })
}
```

- [ ] **Step 2: Typecheck y build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; ruta `/api/inventario/plantilla/columnas` registrada.

(La prueba manual con archivo real la hace el controlador; no iniciar `npm run dev`.)

- [ ] **Step 3: Commit**

```bash
git add app/api/inventario/plantilla/columnas/route.ts
git commit -m "feat(inventario): ruta que devuelve columnas + mapeo sugerido/guardado"
```

---

### Task 5: Ruta `POST /api/inventario/plantilla/importar` (preview + commit)

**Files:**
- Create: `app/api/inventario/plantilla/importar/route.ts`

**Interfaces:**
- Consumes: `createClient`; `agruparPorSku`, `parseExternalImport`, `validarMapeo`, `type Mapeo`; `type ParseContext`; `Producto`; `XLSX`.
- Produces: preview `{ resumen, errores, muestra }` (confirmar=false) o `{ success, actualizados, creados }` (confirmar=true); 422 con `errores` si hay errores en commit.

- [ ] **Step 1: Implementar**

Crear `app/api/inventario/plantilla/importar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { agruparPorSku, parseExternalImport, validarMapeo, type Mapeo } from '@/lib/store/externalImport'
import type { ParseContext } from '@/lib/store/inventoryRoundtrip'
import type { Producto } from '@/types'

const CLAVE_MAPEO = 'import_plantilla_mapeo'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
  let mapeo: Mapeo
  try { mapeo = JSON.parse(String(formData.get('mapeo') ?? '{}')) as Mapeo } catch { return NextResponse.json({ error: 'Mapeo inválido' }, { status: 400 }) }
  const confirmar = String(formData.get('confirmar') ?? 'false') === 'true'

  const faltan = validarMapeo(mapeo)
  if (faltan.length) return NextResponse.json({ error: 'Mapeo incompleto: ' + faltan.join(', ') }, { status: 400 })

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const [{ data: existentes, error: prodError }, { data: cats }, { data: subs }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat'),
  ])
  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })

  const ctx: ParseContext = {
    existentes: (existentes ?? []) as Producto[],
    categorias: cats ?? [],
    subcategorias: subs ?? [],
  }

  const { grupos, sinSku } = agruparPorSku(rows, mapeo)
  const { updates, creates, errors, resumen } = parseExternalImport(grupos, ctx)
  const erroresSinSku = sinSku.map(fila => ({ sku: null, fila, motivo: 'la fila tiene datos pero no tiene SKU' }))
  const todos = [...erroresSinSku, ...errors]
  const conError = resumen.conError + erroresSinSku.length

  if (!confirmar) {
    return NextResponse.json({
      resumen: { ...resumen, conError },
      errores: todos,
      muestra: grupos.slice(0, 10).map(g => ({
        sku: g.sku, nombre: g.nombre, precio: g.precio, stock: g.stock,
        tallas: g.tallas, colores: g.colores,
      })),
    })
  }

  if (todos.length) return NextResponse.json({ error: 'No se importó nada. Corrige los errores.', errores: todos }, { status: 422 })
  if (!updates.length && !creates.length) return NextResponse.json({ error: 'No hay productos para importar.' }, { status: 400 })

  const payload = [...updates, ...creates.map(c => ({ ...c, id: crypto.randomUUID() }))]
  const { error } = await supabase.from('productos').upsert(payload, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('configuracion').upsert({ key: CLAVE_MAPEO, value: JSON.stringify(mapeo) }, { onConflict: 'key' })

  return NextResponse.json({ success: true, actualizados: updates.length, creados: creates.length })
}
```

- [ ] **Step 2: Typecheck y build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; ruta `/api/inventario/plantilla/importar` registrada.

- [ ] **Step 3: Commit**

```bash
git add app/api/inventario/plantilla/importar/route.ts
git commit -m "feat(inventario): ruta de import externo (preview atómico + commit + guarda mapeo)"
```

---

### Task 6: UI wizard + botón; eliminar legacy

**Files:**
- Create: `components/admin/ImportarPlantilla.tsx`
- Modify: `app/admin/productos/ProductosClient.tsx`
- Delete: `app/api/import/route.ts`, `lib/xlsx-parser.ts`, y (si quedan sin uso) los tipos `XlsxRow`/`ProductoAgrupado` en `types/index.ts`

**Interfaces:**
- Consumes: rutas de Tasks 4-5; `CAMPOS_PLATAFORMA`, `type Mapeo`, `type CampoPlataforma`; `Modal`.

- [ ] **Step 1: Crear el wizard**

Crear `components/admin/ImportarPlantilla.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Modal from './Modal'
import { CAMPOS_PLATAFORMA, type Mapeo, type CampoPlataforma } from '@/lib/store/externalImport'
import styles from '@/app/admin/productos/productos.module.css'

type Paso = 'subir' | 'mapear' | 'preview'
interface ErrItem { sku: string | null; fila: number | null; motivo: string }
interface PreviewData {
  resumen: { crear: number; actualizar: number; conError: number }
  errores: ErrItem[]
  muestra: { sku: string; nombre?: string; precio?: string; stock?: string; tallas: string[]; colores: string[] }[]
}

export default function ImportarPlantilla() {
  const [abierto, setAbierto] = useState(false)
  const [paso, setPaso] = useState<Paso>('subir')
  const [file, setFile] = useState<File | null>(null)
  const [columnas, setColumnas] = useState<string[]>([])
  const [mapeo, setMapeo] = useState<Mapeo>({})
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  function reset() { setPaso('subir'); setFile(null); setColumnas([]); setMapeo({}); setPreview(null); setError('') }
  function abrir() { reset(); setAbierto(true) }
  function cerrar() { setAbierto(false) }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFile(f); setError(''); setCargando(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await fetch('/api/inventario/plantilla/columnas', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al leer el archivo'); return }
      setColumnas(json.columnas)
      const base: Mapeo = { ...json.sugerencia }
      if (json.guardado) {
        for (const [k, v] of Object.entries(json.guardado as Mapeo)) {
          if (v && json.columnas.includes(v)) base[k as CampoPlataforma] = v
        }
      }
      setMapeo(base); setPaso('mapear')
    } catch { setError('No se pudo leer el archivo.') }
    finally { setCargando(false); e.target.value = '' }
  }

  function setCampo(campo: CampoPlataforma, col: string) {
    setMapeo(m => { const n = { ...m }; if (col) n[campo] = col; else delete n[campo]; return n })
  }

  const obligatoriosOk = CAMPOS_PLATAFORMA.filter(c => c.obligatorio).every(c => mapeo[c.campo])

  async function enviar(confirmar: boolean) {
    if (!file) return
    setCargando(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('mapeo', JSON.stringify(mapeo)); fd.append('confirmar', String(confirmar))
      const res = await fetch('/api/inventario/plantilla/importar', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al procesar')
        if (json.errores) setPreview(p => (p ? { ...p, errores: json.errores } : p))
        return
      }
      if (confirmar) { window.location.reload(); return }
      setPreview(json); setPaso('preview')
    } catch { setError('No se pudo procesar (error de red).') }
    finally { setCargando(false) }
  }

  return (
    <>
      <button className={styles.btnSecondary} onClick={abrir} type="button">↑ Importar plantilla</button>
      {abierto && (
        <Modal title="Importar plantilla externa" onClose={cerrar} maxWidth="720px">
          {error && <p className={styles.formError}>{error}</p>}

          {paso === 'subir' && (
            <div>
              <p>Sube un archivo .xlsx de otro programa. Luego eliges qué columna corresponde a cada campo.</p>
              <label className={styles.btnSecondary}>
                {cargando ? 'Leyendo…' : 'Elegir archivo'}
                <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} disabled={cargando} />
              </label>
            </div>
          )}

          {paso === 'mapear' && (
            <div>
              <p>Asigna cada campo a una columna del archivo. Los marcados con * son obligatorios.</p>
              <table className={styles.table}>
                <thead><tr><th>Campo de la plataforma</th><th>Columna del archivo</th></tr></thead>
                <tbody>
                  {CAMPOS_PLATAFORMA.map(({ campo, label, obligatorio }) => (
                    <tr key={campo}>
                      <td>{label}{obligatorio ? ' *' : ''}</td>
                      <td>
                        <select value={mapeo[campo] ?? ''} onChange={e => setCampo(campo, e.target.value)}>
                          <option value="">— ninguna —</option>
                          {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button className={styles.btnCancel} onClick={() => setPaso('subir')} type="button">Atrás</button>
                <button className={styles.btnPrimary} onClick={() => enviar(false)} disabled={!obligatoriosOk || cargando} type="button">
                  {cargando ? 'Procesando…' : 'Ver preview'}
                </button>
              </div>
            </div>
          )}

          {paso === 'preview' && preview && (
            <div>
              <p>Resumen: <b>{preview.resumen.crear}</b> a crear, <b>{preview.resumen.actualizar}</b> a actualizar, <b>{preview.resumen.conError}</b> con error.</p>
              {preview.errores.length > 0 && (
                <div>
                  <p>Errores (no se aplicará nada hasta corregirlos):</p>
                  <ul>
                    {preview.errores.slice(0, 50).map((er, i) => (
                      <li key={i}>{er.sku ? `SKU ${er.sku}` : `fila ${er.fila}`}: {er.motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button className={styles.btnCancel} onClick={() => setPaso('mapear')} type="button">Atrás</button>
                <button className={styles.btnPrimary} onClick={() => enviar(true)} disabled={preview.errores.length > 0 || cargando} type="button">
                  {cargando ? 'Importando…' : 'Confirmar import'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
```

- [ ] **Step 2: Insertar el botón en la barra**

En `app/admin/productos/ProductosClient.tsx`: añadir el import
```ts
import ImportarPlantilla from '@/components/admin/ImportarPlantilla'
```
y, en el bloque `<div className={styles.actions}>`, insertar `<ImportarPlantilla />` justo después del label "↑ Importar inventario" (antes del `<Link>` "Modo carrusel"):

```tsx
          </label>
          <ImportarPlantilla />
          <Link href="/admin/productos/carrusel" className={styles.btnSecondary}>Modo carrusel</Link>
```

- [ ] **Step 3: Eliminar el legacy**

```bash
git rm app/api/import/route.ts lib/xlsx-parser.ts
```
Luego, en `types/index.ts`, eliminar las interfaces `XlsxRow` y `ProductoAgrupado` **solo si** no quedan otros usos. Verificar antes:
```bash
grep -rn "XlsxRow\|ProductoAgrupado\|agruparProductos\|xlsx-parser\|api/import" app lib components types
```
Expected: sin resultados fuera de los archivos borrados. Si algún resultado persiste (p. ej. un test del parser legacy), borrarlo también.

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; el build ya NO lista `/api/import`; sí lista `/api/inventario/plantilla/columnas` y `/api/inventario/plantilla/importar`.

- [ ] **Step 5: Prueba manual (controlador)**

Con sesión admin: en `/admin/productos` aparece "↑ Importar plantilla". Subir un `.xlsx` externo → se muestran las columnas con mapeo sugerido → Ver preview (resumen + errores) → Confirmar. (La ejerce el controlador; no la hace el subagente.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(inventario): wizard de importar plantilla externa; elimina el import legacy"
```

---

## Cierre

- [ ] `npm test` (toda la suite) — verde (incluye `externalImport` y que B siga verde).
- [ ] `npx tsc --noEmit` — sin errores.
- [ ] `npm run build` — ok; rutas nuevas registradas, `/api/import` ausente.
- [ ] Revisión final whole-branch (opus).
- [ ] Sin migración de BD. No fusionar/pushear a `main` sin confirmación del usuario (deploy a producción). Tras el push, verificar READY en Vercel por SHA.

## Notas de decisiones (trazabilidad)

- Casar y agrupar por SKU (variantes comparten SKU). Escritura reusa el `upsert` por `id` de B.
- Preview atómico (confirmar=false no escribe; commit solo si 0 errores). Filas sin SKU cuentan como error.
- Mapeo: auto-sugerido + guardado en `configuracion` (`import_plantilla_mapeo`), precargado.
- No se refactoriza B (desplegado/probado): C reutiliza helpers/tipos exportados y reimplementa su resolución (más simple), con la re-validación de subcat aprendida del fix de B.
- Legacy (`app/api/import`, `lib/xlsx-parser.ts`, tipos `XlsxRow`/`ProductoAgrupado`) eliminado.
</content>
