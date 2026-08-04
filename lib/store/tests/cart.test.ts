import { describe, it, expect } from 'vitest'
import {
  addToCart,
  removeFromCart,
  changeQty,
  updateCustom,
  getSubtotal,
  getFinalTotal,
  getCount,
  findCoupon,
  getShippingProgress,
  normalizeStoredCart,
} from '../cart'
import type { CartItem } from '@/types/store'
import type { Cupon } from '@/types'

const ITEM_A: Omit<CartItem, 'qty'> = {
  id: 'p1',
  nombre: 'Camiseta',
  precio: 100,
  imagen: 'a.jpg',
  size: 'M',
  custom: '',
  personalizable: false,
}

const ITEM_B: Omit<CartItem, 'qty'> = {
  id: 'p2',
  nombre: 'Short',
  precio: 50,
  imagen: 'b.jpg',
  size: 'L',
  custom: '',
  personalizable: false,
}

describe('addToCart', () => {
  it('adds a new item with qty 1', () => {
    const result = addToCart([], ITEM_A)
    expect(result).toEqual([{ ...ITEM_A, qty: 1 }])
  })

  it('merges with an existing item that has the same id, size and custom', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }]
    const result = addToCart(cart, ITEM_A)
    expect(result).toEqual([{ ...ITEM_A, qty: 2 }])
  })

  it('keeps items with the same id but different size as separate entries', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }]
    const result = addToCart(cart, { ...ITEM_A, size: 'L' })
    expect(result).toEqual([{ ...ITEM_A, qty: 1 }, { ...ITEM_A, size: 'L', qty: 1 }])
  })

  it('keeps items with the same id but different custom text as separate entries', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }]
    const result = addToCart(cart, { ...ITEM_A, custom: 'Texto' })
    expect(result).toEqual([{ ...ITEM_A, qty: 1 }, { ...ITEM_A, custom: 'Texto', qty: 1 }])
  })
})

describe('normalizeStoredCart', () => {
  it('keeps an explicit personalizable flag untouched', () => {
    const stored: CartItem[] = [{ ...ITEM_A, personalizable: true, qty: 1 }]
    expect(normalizeStoredCart(stored)).toEqual(stored)
  })

  it('infers personalizable=true for a legacy item that had a real custom text', () => {
    // Carrito guardado antes del campo `personalizable` (sin la propiedad)
    const legacy = [{ ...ITEM_A, custom: 'Pérez #10', qty: 1 }] as CartItem[]
    delete (legacy[0] as Partial<CartItem>).personalizable

    expect(normalizeStoredCart(legacy)[0].personalizable).toBe(true)
  })

  it('infers personalizable=false for a legacy item without personalization', () => {
    const legacy = [{ ...ITEM_A, custom: 'Sin personalización', qty: 1 }] as CartItem[]
    delete (legacy[0] as Partial<CartItem>).personalizable

    expect(normalizeStoredCart(legacy)[0].personalizable).toBe(false)
  })

  it('infers personalizable=false for a legacy item with empty custom', () => {
    const legacy = [{ ...ITEM_A, custom: '', qty: 1 }] as CartItem[]
    delete (legacy[0] as Partial<CartItem>).personalizable

    expect(normalizeStoredCart(legacy)[0].personalizable).toBe(false)
  })
})

describe('removeFromCart', () => {
  it('removes the item at the given index', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }, { ...ITEM_B, qty: 1 }]
    const result = removeFromCart(cart, 0)
    expect(result).toEqual([{ ...ITEM_B, qty: 1 }])
  })
})

describe('changeQty', () => {
  it('increments the qty of the item at the given index', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }]
    const result = changeQty(cart, 0, 1)
    expect(result).toEqual([{ ...ITEM_A, qty: 2 }])
  })

  it('decrements the qty of the item at the given index', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 2 }]
    const result = changeQty(cart, 0, -1)
    expect(result).toEqual([{ ...ITEM_A, qty: 1 }])
  })

  it('removes the item when qty drops to zero or below', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }]
    const result = changeQty(cart, 0, -1)
    expect(result).toEqual([])
  })
})

describe('updateCustom', () => {
  it('updates the custom text of the item at the given index', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 1 }]
    const result = updateCustom(cart, 0, 'Nombre y número')
    expect(result).toEqual([{ ...ITEM_A, qty: 1, custom: 'Nombre y número' }])
  })
})

describe('getSubtotal', () => {
  it('returns 0 for an empty cart', () => {
    expect(getSubtotal([])).toBe(0)
  })

  it('sums price times quantity for all items', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 2 }, { ...ITEM_B, qty: 3 }]
    expect(getSubtotal(cart)).toBe(100 * 2 + 50 * 3)
  })
})

describe('getFinalTotal', () => {
  it('returns the subtotal unchanged when there is no discount', () => {
    expect(getFinalTotal(200, 0)).toBe(200)
  })

  it('applies a percentage discount to the subtotal', () => {
    expect(getFinalTotal(200, 25)).toBe(150)
  })
})

describe('getCount', () => {
  it('returns 0 for an empty cart', () => {
    expect(getCount([])).toBe(0)
  })

  it('sums the quantities of all items', () => {
    const cart: CartItem[] = [{ ...ITEM_A, qty: 2 }, { ...ITEM_B, qty: 3 }]
    expect(getCount(cart)).toBe(5)
  })
})

describe('findCoupon', () => {
  const cupones: Cupon[] = [
    { id: 'c1', codigo: 'VERANO10', descuento: 10, tipo: 'porcentaje', activo: true, created_at: '' },
  ]

  it('returns the coupon matching the code case-insensitively', () => {
    expect(findCoupon(cupones, 'verano10')).toEqual(cupones[0])
  })

  it('returns null when no coupon matches', () => {
    expect(findCoupon(cupones, 'INVALIDO')).toBeNull()
  })
})

describe('getShippingProgress', () => {
  it('returns 0 when the total is 0', () => {
    expect(getShippingProgress(0, 1000)).toBe(0)
  })

  it('returns the percentage of progress toward the threshold', () => {
    expect(getShippingProgress(500, 1000)).toBe(50)
  })

  it('caps the result at 100 when the total exceeds the threshold', () => {
    expect(getShippingProgress(1500, 1000)).toBe(100)
  })

  it('returns 100 when the threshold is zero or negative', () => {
    expect(getShippingProgress(100, 0)).toBe(100)
  })
})

const base: Omit<CartItem, 'qty'> = {
  id: 'p1',
  nombre: 'Camisa',
  precio: 100,
  imagen: '',
  size: '',
  custom: 'Sin personalización',
  personalizable: false,
}

describe('addToCart con variantes', () => {
  it('distinta variante = líneas separadas', () => {
    let cart = addToCart([], { ...base, varianteId: 'v1', variante: 'M' })
    cart = addToCart(cart, { ...base, varianteId: 'v2', variante: 'L' })
    expect(cart).toHaveLength(2)
  })

  it('misma variante suma cantidad', () => {
    let cart = addToCart([], { ...base, varianteId: 'v1', variante: 'M' })
    cart = addToCart(cart, { ...base, varianteId: 'v1', variante: 'M' })
    expect(cart).toHaveLength(1)
    expect(cart[0].qty).toBe(2)
  })

  it('item plano guardado sin varianteId sigue combinando por talla', () => {
    let cart = addToCart([], { ...base, size: 'M' })
    cart = addToCart(cart, { ...base, size: 'M' })
    expect(cart).toHaveLength(1)
  })
})

describe('changeQty con stockDisponible', () => {
  it('no supera el stock conocido', () => {
    const cart: CartItem[] = [{ ...base, qty: 3, varianteId: 'v1', stockDisponible: 3 }]
    expect(changeQty(cart, 0, +1)[0].qty).toBe(3)
  })

  it('sin stockDisponible no hay tope', () => {
    const cart: CartItem[] = [{ ...base, qty: 3 }]
    expect(changeQty(cart, 0, +1)[0].qty).toBe(4)
  })

  it('bajar y eliminar en 0 sigue funcionando', () => {
    const cart: CartItem[] = [{ ...base, qty: 1, stockDisponible: 5 }]
    expect(changeQty(cart, 0, -1)).toHaveLength(0)
  })

  it('item agotado (stockDisponible: 0), incremento no lo elimina', () => {
    const cart: CartItem[] = [{ ...base, qty: 1, stockDisponible: 0 }]
    const result = changeQty(cart, 0, +1)
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(1)
  })

  it('qty supera stock (stale), incremento no crece ni recorta', () => {
    const cart: CartItem[] = [{ ...base, qty: 5, stockDisponible: 3 }]
    const result = changeQty(cart, 0, +1)
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(5)
  })

  it('qty supera stock (stale), decremento baja de a 1', () => {
    const cart: CartItem[] = [{ ...base, qty: 5, stockDisponible: 3 }]
    const result = changeQty(cart, 0, -1)
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(4)
  })
})

describe('normalizeStoredCart con carritos viejos', () => {
  it('items sin campos de variante quedan como planos', () => {
    const viejo = [{ id: 'p1', nombre: 'X', precio: 1, imagen: '', size: 'M', custom: '', qty: 1 }] as CartItem[]
    const [item] = normalizeStoredCart(viejo)
    expect(item.varianteId).toBeUndefined()
    expect(item.personalizable).toBe(false)
  })
})
