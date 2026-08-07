import { describe, it, expect } from 'vitest'
import { precioEfectivo, toStoreVariantes, stockEfectivo, estaAgotado, precioDesde, validarCompra, traducirErrorPedido } from '../variantes'
import type { ProductoVariante } from '@/types'

function variante(over: Partial<ProductoVariante>): ProductoVariante {
  return {
    id: 'v1', producto_id: 'p1', nombre: 'M', sku: null, precio: null,
    stock: null, costo: null, precio_revendedor: null, activo: true, orden: 0, created_at: '', updated_at: '', ...over,
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

describe('validarCompra', () => {
  const prod = { id: 'p1', nombre: 'Camisa', activo: true }
  it('producto inactivo se rechaza', () => {
    const r = validarCompra({ ...prod, activo: false }, [], undefined)
    expect(r.ok).toBe(false)
  })
  it('plano sin variante pasa con variante null', () => {
    expect(validarCompra(prod, [], undefined)).toEqual({ ok: true, variante: null })
  })
  it('producto con variantes exige varianteId', () => {
    const r = validarCompra(prod, [variante({ id: 'v1' })], undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('Camisa')
  })
  it('varianteId ajeno o inexistente se rechaza', () => {
    const ajena = variante({ id: 'v9', producto_id: 'OTRO' })
    expect(validarCompra(prod, [ajena], 'v9').ok).toBe(false)
    expect(validarCompra(prod, [variante({ id: 'v1' })], 'no-existe').ok).toBe(false)
  })
  it('variante válida se devuelve', () => {
    const v = variante({ id: 'v1', producto_id: 'p1' })
    expect(validarCompra(prod, [v], 'v1')).toEqual({ ok: true, variante: v })
  })
})

describe('traducirErrorPedido', () => {
  it('stock insuficiente con unidades', () =>
    expect(traducirErrorPedido('HS_STOCK|Camisa (M)|3')).toBe('Solo quedan 3 unidades de "Camisa (M)"'))
  it('stock cero = agotado', () =>
    expect(traducirErrorPedido('HS_STOCK|Camisa|0')).toBe('"Camisa" está agotado'))
  it('requiere variante', () =>
    expect(traducirErrorPedido('HS_REQUIERE_VARIANTE|Camisa')).toBe('Elige una variante de "Camisa"'))
  it('variante inválida', () =>
    expect(traducirErrorPedido('HS_VARIANTE|Camisa')).toBe('La variante seleccionada de "Camisa" ya no está disponible'))
  it('producto inactivo', () =>
    expect(traducirErrorPedido('HS_INACTIVO|Camisa')).toBe('"Camisa" ya no está disponible'))
  it('pedido inexistente', () =>
    expect(traducirErrorPedido('HS_PEDIDO|abc-123')).toBe('El pedido ya no existe'))
  it('desconocido devuelve null', () => {
    expect(traducirErrorPedido('otra cosa')).toBeNull()
    expect(traducirErrorPedido(undefined)).toBeNull()
  })
})
