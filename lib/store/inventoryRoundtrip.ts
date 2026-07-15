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
