import { describe, it, expect } from 'vitest'
import { precioEfectivo, toStoreVariantes, stockEfectivo, estaAgotado, precioDesde } from '../variantes'
import type { ProductoVariante } from '@/types'

function variante(over: Partial<ProductoVariante>): ProductoVariante {
  return {
    id: 'v1', producto_id: 'p1', nombre: 'M', sku: null, precio: null,
    stock: null, activo: true, orden: 0, created_at: '', updated_at: '', ...over,
  }
}

describe('precioEfectivo', () => {
  it('usa el precio propio si existe', () => expect(precioEfectivo(100, 150)).toBe(150))
  it('hereda el del padre si es null', () => expect(precioEfectivo(100, null)).toBe(100))
})

describe('toStoreVariantes', () => {
  it('excluye inactivas y ordena por orden y nombre', () => {
    const out = toStoreVariantes(100, [
      variante({ id: 'b', nombre: 'B', orden: 1 }),
      variante({ id: 'x', nombre: 'X', activo: false }),
      variante({ id: 'a', nombre: 'A', orden: 0 }),
      variante({ id: 'a2', nombre: 'A2', orden: 1 }),
    ])
    expect(out.map(v => v.id)).toEqual(['a', 'b', 'a2'])
  })
  it('calcula precioEfectivo y agotada', () => {
    const out = toStoreVariantes(100, [
      variante({ id: 'v1', precio: 150, stock: 0 }),
      variante({ id: 'v2', precio: null, stock: null }),
    ])
    expect(out[0]).toMatchObject({ precioEfectivo: 150, agotada: true })
    expect(out[1]).toMatchObject({ precioEfectivo: 100, agotada: false })
  })
})

describe('stockEfectivo', () => {
  it('sin variantes devuelve el stock del padre', () => {
    expect(stockEfectivo(7, [])).toBe(7)
    expect(stockEfectivo(null, [])).toBeNull()
  })
  it('suma las variantes e ignora el stock del padre', () => {
    expect(stockEfectivo(99, [{ stock: 2 }, { stock: 3 }])).toBe(5)
  })
  it('una variante ilimitada hace ilimitado el total', () => {
    expect(stockEfectivo(0, [{ stock: 2 }, { stock: null }])).toBeNull()
  })
})

describe('estaAgotado', () => {
  it('true solo cuando el stock efectivo es 0', () => {
    expect(estaAgotado(0, [])).toBe(true)
    expect(estaAgotado(null, [])).toBe(false)
    expect(estaAgotado(9, [{ stock: 0 }, { stock: 0 }])).toBe(true)
  })
})

describe('precioDesde', () => {
  it('sin variantes: precio del padre, no varía', () =>
    expect(precioDesde(100, [])).toEqual({ min: 100, varia: false }))
  it('con precios distintos: mínimo y varia=true', () =>
    expect(precioDesde(100, [{ precioEfectivo: 90 }, { precioEfectivo: 120 }])).toEqual({ min: 90, varia: true }))
  it('con precios iguales: varia=false', () =>
    expect(precioDesde(100, [{ precioEfectivo: 100 }, { precioEfectivo: 100 }])).toEqual({ min: 100, varia: false }))
})
