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

export type ValidacionCompra =
  | { ok: true; variante: ProductoVariante | null }
  | { ok: false; motivo: string }

// Frontera de confianza: decide si un item del carrito puede comprarse.
// `variantesActivas` deben venir ya filtradas a activas del producto.
export function validarCompra(
  producto: { id: string; nombre: string; activo: boolean; canal?: string },
  variantesActivas: ProductoVariante[],
  varianteId: string | undefined,
): ValidacionCompra {
  if (!producto.activo) return { ok: false, motivo: `"${producto.nombre}" ya no está disponible` }
  if (producto.canal === 'mostrador') return { ok: false, motivo: `"${producto.nombre}" ya no está disponible` }
  if (!varianteId) {
    if (variantesActivas.length > 0) {
      return { ok: false, motivo: `Elige una variante de "${producto.nombre}"` }
    }
    return { ok: true, variante: null }
  }
  const v = variantesActivas.find(v => v.id === varianteId && v.producto_id === producto.id)
  if (!v) {
    return { ok: false, motivo: `La variante seleccionada de "${producto.nombre}" ya no está disponible` }
  }
  return { ok: true, variante: v }
}

// Traduce los errores HS_* que lanza la RPC crear_pedido (ver migración
// 2026-08-04-producto-variantes.sql). null = no reconocido.
export function traducirErrorPedido(message: string | null | undefined): string | null {
  if (!message) return null
  const [codigo, nombre, dato] = message.split('|')
  switch (codigo) {
    case 'HS_STOCK':
      return dato === '0' ? `"${nombre}" está agotado` : `Solo quedan ${dato} unidades de "${nombre}"`
    case 'HS_REQUIERE_VARIANTE':
      return `Elige una variante de "${nombre}"`
    case 'HS_VARIANTE':
      return `La variante seleccionada de "${nombre}" ya no está disponible`
    case 'HS_INACTIVO':
      return `"${nombre}" ya no está disponible`
    case 'HS_PEDIDO':
      return 'El pedido ya no existe'
    default:
      return null
  }
}
