import type { Producto } from '@/types'
import { slugify, uniqueSlug } from './slug'

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
