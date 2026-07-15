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
  const sin = c.sinStock === true && p.stock === 0
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
