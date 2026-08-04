import type { ProductoVariante } from '@/types'
import type { StoreVariante } from '@/types/store'

export function precioEfectivo(precioPadre: number, precioVariante: number | null): number {
  return precioVariante ?? precioPadre
}

export function toStoreVariantes(precioPadre: number, hijas: ProductoVariante[]): StoreVariante[] {
  return hijas
    .filter(v => v.activo)
    .sort((a, b) => a.orden - b.orden)
    .map(v => ({
      id: v.id,
      nombre: v.nombre,
      precio: v.precio != null ? Number(v.precio) : null,
      precioEfectivo: precioEfectivo(precioPadre, v.precio != null ? Number(v.precio) : null),
      stock: v.stock,
      agotada: v.stock === 0,
    }))
}

export function stockEfectivo(stockPadre: number | null, variantes: { stock: number | null }[]): number | null {
  if (variantes.length === 0) return stockPadre
  if (variantes.some(v => v.stock == null)) return null
  return variantes.reduce((sum, v) => sum + (v.stock as number), 0)
}

export function estaAgotado(stockPadre: number | null, variantes: { stock: number | null }[]): boolean {
  return stockEfectivo(stockPadre, variantes) === 0
}

export function precioDesde(precioPadre: number, variantes: { precioEfectivo: number }[]): { min: number; varia: boolean } {
  if (variantes.length === 0) return { min: precioPadre, varia: false }
  const precios = variantes.map(v => v.precioEfectivo)
  const min = Math.min(...precios)
  return { min, varia: min !== Math.max(...precios) }
}
