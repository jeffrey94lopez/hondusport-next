import type { CartItem } from '@/types/store'
import type { Envio } from '@/types'
import { formatPrice } from './format'

export interface OrderTotals {
  subtotal: number
  couponDiscount: number
  envioDiscount: number
  totalDiscount: number
  shippingFee: number
  total: number
}

export type EnvioPricing = Pick<Envio, 'id' | 'nombre' | 'tipo' | 'costo' | 'descuento' | 'descripcion'>

export interface OrderTotalsInput {
  cart: CartItem[]
  activeDiscount: number
  envio: EnvioPricing | null
  freeShippingActivo: boolean
  freeShippingThreshold: number
}

export function calculateOrderTotals({
  cart,
  activeDiscount,
  envio,
  freeShippingActivo,
  freeShippingThreshold,
}: OrderTotalsInput): OrderTotals {
  const subtotal = cart.reduce((sum, item) => sum + item.precio * item.qty, 0)
  const couponDiscount = activeDiscount > 0 ? subtotal * (activeDiscount / 100) : 0
  const envioDiscount = envio ? subtotal * ((envio.descuento || 0) / 100) : 0
  const totalDiscount = couponDiscount + envioDiscount

  const isBelowFreeShippingThreshold = !freeShippingActivo || subtotal < freeShippingThreshold
  const shippingFee = envio && envio.tipo === 'delivery' && isBelowFreeShippingThreshold ? envio.costo || 0 : 0

  const total = subtotal - totalDiscount + shippingFee

  return { subtotal, couponDiscount, envioDiscount, totalDiscount, shippingFee, total }
}

export interface PedidoItemInsert {
  producto_id: string
  nombre_producto: string
  precio: number
  cantidad: number
  talla: string
  personalizado_nombre: string | null
  imagen_url: string
}

export const SIN_PERSONALIZACION = 'Sin personalización'

// Frontera de confianza: solo un producto personalizable conserva el `custom`
// enviado por el cliente; cualquier otro se normaliza a "Sin personalización".
export function resolveTrustedCustom(personalizable: boolean, custom: string): string {
  return personalizable && custom !== SIN_PERSONALIZACION && custom !== ''
    ? custom
    : SIN_PERSONALIZACION
}

export function cartItemsToPedidoItems(cart: CartItem[]): PedidoItemInsert[] {
  return cart.map(item => ({
    producto_id: item.id,
    nombre_producto: item.nombre,
    precio: item.precio,
    cantidad: item.qty,
    talla: item.size,
    personalizado_nombre: item.custom === SIN_PERSONALIZACION || item.custom === '' ? null : item.custom,
    imagen_url: item.imagen,
  }))
}

export interface ClienteInfo {
  nombre: string
  telefono: string
  email: string
  ciudad: string
  direccion: string
}

export interface OrderTextInput {
  cart: CartItem[]
  envio: EnvioPricing | null
  totals: OrderTotals
  cliente: ClienteInfo
}

export function getOrderText({ cart, envio, totals, cliente }: OrderTextInput): string {
  let msg = `DATOS CLIENTE\nMétodo: ${envio ? envio.nombre : 'ENVÍO'}\n`
  msg += `Nombre: ${cliente.nombre}\n`
  msg += `Tel: ${cliente.telefono}\n`
  msg += `Email: ${cliente.email}\n`

  if (envio && envio.tipo === 'delivery') {
    msg += `Ciudad: ${cliente.ciudad}\n`
    msg += `Dirección: ${cliente.direccion}\n`
  } else if (envio && envio.descripcion) {
    msg += `Punto retiro: ${envio.descripcion}\n`
  }

  msg += `\nPEDIDO\n`
  cart.forEach(item => {
    msg += `- ${item.nombre} (${item.size}) [${item.custom}] x${item.qty} - ${formatPrice(item.precio * item.qty)}\n`
  })

  msg += `\nSubtotal: ${formatPrice(totals.subtotal)}`
  msg += `\nEnvío: ${totals.shippingFee > 0 ? formatPrice(totals.shippingFee) : 'Gratis'}`
  msg += `\nDescuento total: -${formatPrice(totals.totalDiscount)}`
  msg += `\nTOTAL FINAL: ${formatPrice(totals.total)}`

  return encodeURIComponent(msg)
}
