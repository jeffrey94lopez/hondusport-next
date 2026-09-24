import type { Categoria, Banner, Cupon, Envio, ConfigMap } from '@/types'

export interface StoreVariante {
  id: string
  nombre: string
  precio: number | null      // propio (null = heredado)
  precioEfectivo: number
  stock: number | null
  agotada: boolean
  // Ya resuelto (ver lib/store/variantes.ts:imagenesEfectivas): propias si
  // las tiene, si no las del producto — nunca vacío si el producto tiene fotos.
  imagenes: string[]
}

export interface StoreProducto {
  id: string
  nombre: string
  slug: string
  descripcion: string
  precio: number
  precioOriginal: number | null
  cat: string
  catId: string
  subcat: string | null
  subcatId: string | null
  genero: string | null
  badge: string | null
  tallas: string[]
  imagenes: string[]
  stock: number | null
  rating: number
  ofertaFin: string | null
  personalizable: boolean
  createdAt: string
  variantes: StoreVariante[]
}

export interface CartItem {
  id: string
  nombre: string
  precio: number
  imagen: string
  size: string
  custom: string
  qty: number
  personalizable: boolean
  varianteId?: string
  variante?: string
  stockDisponible?: number | null
}

export type { Categoria, Banner, Cupon, Envio, ConfigMap }
