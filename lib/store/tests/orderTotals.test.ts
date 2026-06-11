import { describe, it, expect } from 'vitest'
import { calculateOrderTotals, cartItemsToPedidoItems, getOrderText } from '../orderTotals'
import type { CartItem } from '@/types/store'
import type { Envio } from '@/types'

const ITEM_A: CartItem = {
  id: 'p1',
  nombre: 'Camiseta',
  precio: 100,
  imagen: 'a.jpg',
  size: 'M',
  custom: 'Sin personalización',
  qty: 2,
}

const ITEM_B: CartItem = {
  id: 'p2',
  nombre: 'Short',
  precio: 50,
  imagen: 'b.jpg',
  size: 'L',
  custom: 'Pérez #10',
  qty: 1,
}

const ENVIO_DELIVERY: Envio = {
  id: 'e1',
  nombre: 'Delivery a domicilio',
  descripcion: null,
  tipo: 'delivery',
  costo: 80,
  descuento: 0,
  activo: true,
}

const ENVIO_PICKUP: Envio = {
  id: 'e2',
  nombre: 'Recoger en tienda',
  descripcion: 'Local principal',
  tipo: 'pickup',
  costo: 0,
  descuento: 10,
  activo: true,
}

describe('calculateOrderTotals', () => {
  it('returns subtotal with no envio and no discount', () => {
    const result = calculateOrderTotals({
      cart: [ITEM_A, ITEM_B],
      activeDiscount: 0,
      envio: null,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    expect(result).toEqual({
      subtotal: 250,
      couponDiscount: 0,
      envioDiscount: 0,
      totalDiscount: 0,
      shippingFee: 0,
      total: 250,
    })
  })

  it('applies coupon discount as a percentage of subtotal', () => {
    const result = calculateOrderTotals({
      cart: [ITEM_A, ITEM_B],
      activeDiscount: 10,
      envio: null,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    expect(result.couponDiscount).toBe(25)
    expect(result.totalDiscount).toBe(25)
    expect(result.total).toBe(225)
  })

  it('charges shipping fee for delivery when below the free shipping threshold', () => {
    const result = calculateOrderTotals({
      cart: [ITEM_A, ITEM_B],
      activeDiscount: 0,
      envio: ENVIO_DELIVERY,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    expect(result.shippingFee).toBe(80)
    expect(result.total).toBe(330)
  })

  it('waives shipping fee for delivery when at or above the free shipping threshold', () => {
    const result = calculateOrderTotals({
      cart: [{ ...ITEM_A, qty: 10 }],
      activeDiscount: 0,
      envio: ENVIO_DELIVERY,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    expect(result.shippingFee).toBe(0)
  })

  it('charges shipping fee regardless of threshold when free shipping is disabled', () => {
    const result = calculateOrderTotals({
      cart: [{ ...ITEM_A, qty: 10 }],
      activeDiscount: 0,
      envio: ENVIO_DELIVERY,
      freeShippingActivo: false,
      freeShippingThreshold: 999,
    })

    expect(result.shippingFee).toBe(80)
  })

  it('applies envio discount percentage and never charges shipping for pickup', () => {
    const result = calculateOrderTotals({
      cart: [ITEM_A, ITEM_B],
      activeDiscount: 0,
      envio: ENVIO_PICKUP,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    expect(result.envioDiscount).toBe(25)
    expect(result.totalDiscount).toBe(25)
    expect(result.shippingFee).toBe(0)
    expect(result.total).toBe(225)
  })

  it('combines coupon discount and envio discount', () => {
    const result = calculateOrderTotals({
      cart: [ITEM_A, ITEM_B],
      activeDiscount: 10,
      envio: ENVIO_PICKUP,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    expect(result.couponDiscount).toBe(25)
    expect(result.envioDiscount).toBe(25)
    expect(result.totalDiscount).toBe(50)
    expect(result.total).toBe(200)
  })
})

describe('cartItemsToPedidoItems', () => {
  it('maps cart items to pedido_items insert rows', () => {
    const result = cartItemsToPedidoItems([ITEM_A, ITEM_B])

    expect(result).toEqual([
      {
        producto_id: 'p1',
        nombre_producto: 'Camiseta',
        precio: 100,
        cantidad: 2,
        talla: 'M',
        personalizado_nombre: null,
        imagen_url: 'a.jpg',
      },
      {
        producto_id: 'p2',
        nombre_producto: 'Short',
        precio: 50,
        cantidad: 1,
        talla: 'L',
        personalizado_nombre: 'Pérez #10',
        imagen_url: 'b.jpg',
      },
    ])
  })
})

describe('getOrderText', () => {
  it('builds a WhatsApp order summary for a delivery order', () => {
    const totals = calculateOrderTotals({
      cart: [ITEM_A, ITEM_B],
      activeDiscount: 10,
      envio: ENVIO_DELIVERY,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    const text = getOrderText({
      cart: [ITEM_A, ITEM_B],
      envio: ENVIO_DELIVERY,
      totals,
      cliente: { nombre: 'Juan Pérez', telefono: '9999-9999', email: 'juan@test.com', ciudad: 'Tegucigalpa', direccion: 'Col. Centro' },
    })

    expect(text).toContain('Juan%20P%C3%A9rez')
    expect(text).toContain('Tegucigalpa')
    expect(text).toContain('Camiseta')
    expect(text).toContain('Short')
  })

  it('shows the pickup point instead of address fields for pickup orders', () => {
    const totals = calculateOrderTotals({
      cart: [ITEM_A],
      activeDiscount: 0,
      envio: ENVIO_PICKUP,
      freeShippingActivo: true,
      freeShippingThreshold: 999,
    })

    const text = getOrderText({
      cart: [ITEM_A],
      envio: ENVIO_PICKUP,
      totals,
      cliente: { nombre: 'Ana', telefono: '8888-8888', email: 'ana@test.com', ciudad: '', direccion: '' },
    })

    const decoded = decodeURIComponent(text)
    expect(decoded).toContain('Local principal')
    expect(decoded).not.toContain('Ciudad:')
  })
})
