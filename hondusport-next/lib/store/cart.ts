import type { CartItem } from '@/types/store'
import type { Cupon } from '@/types'

export function addToCart(cart: CartItem[], item: Omit<CartItem, 'qty'>): CartItem[] {
  const idx = cart.findIndex(
    i => i.id === item.id && i.size === item.size && i.custom === item.custom
  )
  if (idx === -1) return [...cart, { ...item, qty: 1 }]

  return cart.map((i, index) => (index === idx ? { ...i, qty: i.qty + 1 } : i))
}

export function removeFromCart(cart: CartItem[], idx: number): CartItem[] {
  return cart.filter((_, i) => i !== idx)
}

export function changeQty(cart: CartItem[], idx: number, delta: number): CartItem[] {
  return cart
    .map((item, i) => (i === idx ? { ...item, qty: item.qty + delta } : item))
    .filter(item => item.qty > 0)
}

export function updateCustom(cart: CartItem[], idx: number, custom: string): CartItem[] {
  return cart.map((item, i) => (i === idx ? { ...item, custom } : item))
}

export function getSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.precio * item.qty, 0)
}

export function getFinalTotal(subtotal: number, discountPercent: number): number {
  return discountPercent > 0 ? subtotal * (1 - discountPercent / 100) : subtotal
}

export function getCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.qty, 0)
}

export function findCoupon(cupones: Cupon[], code: string): Cupon | null {
  const normalized = code.trim().toUpperCase()
  return cupones.find(c => c.codigo === normalized) ?? null
}

export function getShippingProgress(finalTotal: number, threshold: number): number {
  if (threshold <= 0) return 100
  return Math.min((finalTotal / threshold) * 100, 100)
}
