'use client'
import { createContext, useContext } from 'react'
import type { CartItem } from '@/types/store'
import type { Cupon } from '@/types'

export interface CartContextValue {
  cart: CartItem[]
  activeDiscount: number
  subtotal: number
  finalTotal: number
  count: number
  addToCart: (item: Omit<CartItem, 'qty'>) => void
  removeFromCart: (idx: number) => void
  changeQty: (idx: number, delta: number) => void
  updateCustom: (idx: number, custom: string) => void
  applyCoupon: (cupones: Cupon[], code: string) => boolean
  clear: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
