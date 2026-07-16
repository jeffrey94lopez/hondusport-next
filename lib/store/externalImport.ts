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
