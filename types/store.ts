import type { Categoria, Banner, Cupon, Envio, ConfigMap } from '@/types'

export interface StoreProducto {
  id: string
  nombre: string
  descripcion: string
  precio: number
  precioOriginal: number | null
  cat: string
  subcat: string | null
  genero: string | null
  badge: string | null
  tallas: string[]
  imagenes: string[]
  stock: number | null
  rating: number
  ofertaFin: string | null
  personalizable: boolean
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
}

export type { Categoria, Banner, Cupon, Envio, ConfigMap }
