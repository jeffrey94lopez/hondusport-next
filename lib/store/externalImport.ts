import { cellText, parseNum, parseBool, splitList, normNombre, type ProductoData, type ParseContext } from './inventoryRoundtrip'
import { slugify, uniqueSlug } from './slug'
import type { Producto } from '@/types'

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

function tokens(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

const ALIAS: Record<CampoPlataforma, string[]> = {
  sku: ['sku', 'cbarras', 'codigo', 'codigobarras', 'codigodebarras', 'upc', 'ean', 'barcode'],
  nombre: ['nombre', 'nombreproducto', 'producto', 'articulo', 'descripcioncorta'],
  precio: ['precio', 'precioventa', 'pvp'],
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
  activo: ['activo', 'isactive', 'habilitado'],
}

export function sugerirMapeo(columnas: string[]): Mapeo {
  const cols = columnas.map(c => ({ raw: c, k: compact(c) }))
  const usados = new Set<string>()
  const mapeo: Mapeo = {}
  for (const { campo } of CAMPOS_PLATAFORMA) {
    const alias = ALIAS[campo]
    let hit = cols.find(c => !usados.has(c.raw) && alias.includes(c.k))
    if (!hit) hit = cols.find(c => !usados.has(c.raw) && tokens(c.raw).some(t => alias.includes(t)))
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

const ESCALARES = [
  'nombre', 'precio', 'precio_original', 'descripcion', 'categoria',
  'subcategoria', 'genero', 'badge', 'marca', 'personalizable', 'activo',
] as const

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
        if (v !== undefined) g[campo] = v
      }
    }
  })

  return { grupos: [...map.values()], sinSku }
}

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
  const skusDupBD = new Set<string>()
  for (const p of ctx.existentes) {
    if (!p.sku) continue
    const k = p.sku.trim()
    if (prodPorSku.has(k)) skusDupBD.add(k)
    else prodPorSku.set(k, p)
  }
  const slugs = ctx.existentes.map(p => p.slug)
  let conError = 0

  for (const g of grupos) {
    const errs: string[] = []
    const fila = g.filas[0] ?? null
    if (skusDupBD.has(g.sku)) {
      conError++
      errors.push({ sku: g.sku, fila, motivo: `el SKU "${g.sku}" está duplicado en la base de datos; corrígelo en el panel` })
      continue
    }
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
