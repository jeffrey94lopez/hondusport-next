import { cellText, parseNum, splitList } from './inventoryRoundtrip'

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
