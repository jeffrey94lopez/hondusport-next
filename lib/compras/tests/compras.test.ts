import { describe, it, expect } from 'vitest'
import { numeroCompra, costoEnLempiras, totalCompra, estadoCompra, cantidadSugeridaReorden } from '../compras'

describe('numeroCompra', () => {
  it('formatea con prefijo COMP- y 8 dígitos', () => {
    expect(numeroCompra(1)).toBe('COMP-00000001')
    expect(numeroCompra(12345678)).toBe('COMP-12345678')
  })
})

describe('costoEnLempiras', () => {
  it('en L. devuelve el costo tal cual', () => {
    expect(costoEnLempiras(100, 'L', null)).toBe(100)
  })
  it('en USD multiplica por la tasa y redondea a 2', () => {
    expect(costoEnLempiras(10, 'USD', 26.3)).toBe(263)
    expect(costoEnLempiras(9.99, 'USD', 26.3)).toBe(262.74) // 262.737 -> 262.74
  })
})

describe('totalCompra', () => {
  it('suma cantidad × costo en Lempiras', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 100 },
      { cantidad_ordenada: 3, costo_unitario: 50 },
    ]
    expect(totalCompra(items, 'L', null)).toBe(350)
  })
  it('convierte USD con la tasa', () => {
    const items = [{ cantidad_ordenada: 2, costo_unitario: 10 }]
    expect(totalCompra(items, 'USD', 26.3)).toBe(526)
  })
})

describe('estadoCompra', () => {
  it('sin líneas es borrador', () => {
    expect(estadoCompra([])).toBe('borrador')
  })
  it('nada recibido es ordenada', () => {
    expect(estadoCompra([{ cantidad_ordenada: 5, cantidad_recibida: 0 }])).toBe('ordenada')
  })
  it('algo recibido pero no todo es parcial', () => {
    expect(estadoCompra([
      { cantidad_ordenada: 5, cantidad_recibida: 2 },
      { cantidad_ordenada: 3, cantidad_recibida: 0 },
    ])).toBe('parcial')
  })
  it('todo recibido es recibida', () => {
    expect(estadoCompra([
      { cantidad_ordenada: 5, cantidad_recibida: 5 },
      { cantidad_ordenada: 3, cantidad_recibida: 3 },
    ])).toBe('recibida')
  })
})

describe('cantidadSugeridaReorden', () => {
  it('sugiere lo que falta para llegar al mínimo', () => {
    expect(cantidadSugeridaReorden(2, 10)).toBe(8)
  })
  it('no sugiere nada si ya está en o sobre el mínimo', () => {
    expect(cantidadSugeridaReorden(10, 10)).toBe(0)
    expect(cantidadSugeridaReorden(15, 10)).toBe(0)
  })
})
