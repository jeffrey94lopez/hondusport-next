'use client'
import { useEffect, useMemo, useState } from 'react'
import { CartContext } from '@/lib/store/cart-context'
import {
  addToCart as addToCartItem,
  removeFromCart as removeFromCartItem,
  changeQty as changeQtyItem,
  updateCustom as updateCustomItem,
  getSubtotal,
  getFinalTotal,
  getCount,
  findCoupon,
} from '@/lib/store/cart'
import type { CartItem } from '@/types/store'
import type { Cupon } from '@/types'

const CART_KEY = 'hondusport_cart'
const DISCOUNT_KEY = 'hondusport_discount'

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CART_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

function readDiscount(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(DISCOUNT_KEY)
    return raw ? (JSON.parse(raw) as number) : 0
  } catch {
    return 0
  }
}

interface CartProviderProps {
  children: React.ReactNode
}

export default function CartProvider({ children }: CartProviderProps) {
  const [cart, setCart] = useState<CartItem[]>(readCart)
  const [activeDiscount, setActiveDiscount] = useState<number>(readDiscount)

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
    localStorage.setItem(DISCOUNT_KEY, JSON.stringify(activeDiscount))
  }, [cart, activeDiscount])

  const subtotal = useMemo(() => getSubtotal(cart), [cart])
  const finalTotal = useMemo(() => getFinalTotal(subtotal, activeDiscount), [subtotal, activeDiscount])
  const count = useMemo(() => getCount(cart), [cart])

  function addToCart(item: Omit<CartItem, 'qty'>) {
    setCart(prev => addToCartItem(prev, item))
  }

  function removeFromCart(idx: number) {
    setCart(prev => removeFromCartItem(prev, idx))
  }

  function changeQty(idx: number, delta: number) {
    setCart(prev => changeQtyItem(prev, idx, delta))
  }

  function updateCustom(idx: number, custom: string) {
    setCart(prev => updateCustomItem(prev, idx, custom))
  }

  function applyCoupon(cupones: Cupon[], code: string): boolean {
    const cupon = findCoupon(cupones, code)
    if (!cupon) return false
    setActiveDiscount(cupon.descuento)
    return true
  }

  function clear() {
    setCart([])
    setActiveDiscount(0)
  }

  return (
    <CartContext.Provider
      value={{
        cart,
        activeDiscount,
        subtotal,
        finalTotal,
        count,
        addToCart,
        removeFromCart,
        changeQty,
        updateCustom,
        applyCoupon,
        clear,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}
