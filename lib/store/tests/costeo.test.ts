import { describe, it, expect } from 'vitest'
import { aplicarEntradaCosto, precioParaCliente, margen, calcularCambioStock } from '../costeo'

describe('aplicarEntradaCosto', () => {
  it('promedio ponderado', () =>
    expect(aplicarEntradaCosto('promedio', 10, 100, 10, 200)).toBe(150))
  it('promedio redondea a 4 decimales', () =>
    expect(aplicarEntradaCosto('promedio', 3, 10, 1, 11)).toBe(10.25))
  it('promedio sin stock/costo previo toma el costo de entrada', () => {
    expect(aplicarEntradaCosto('promedio', null, null, 5, 80)).toBe(80)
    expect(aplicarEntradaCosto('promedio', 0, 100, 5, 80)).toBe(80)
  })
  it('ultimo siempre toma el costo de entrada', () =>
    expect(aplicarEntradaCosto('ultimo', 10, 100, 1, 75.5)).toBe(75.5))
})

describe('precioParaCliente', () => {
  it('revendedor usa su precio si existe', () =>
    expect(precioParaCliente('revendedor', 100, 80)).toBe(80))
  it('revendedor sin precio propio usa el normal', () =>
    expect(precioParaCliente('revendedor', 100, null)).toBe(100))
  it('final siempre el normal', () =>
    expect(precioParaCliente('final', 100, 80)).toBe(100))
})

describe('margen', () => {
  it('calcula ganancia y porcentaje', () =>
    expect(margen(150, 100)).toEqual({ ganancia: 50, porcentaje: 50 }))
  it('sin costo devuelve null', () => expect(margen(150, null)).toBeNull())
  it('con costo cero porcentaje es 100', () =>
    expect(margen(150, 0)).toEqual({ ganancia: 150, porcentaje: 100 }))
})

describe('calcularCambioStock', () => {
  it('sin cambio (mismo número)', () =>
    expect(calcularCambioStock(10, 10)).toEqual({ tipo: 'sin_cambio' }))
  it('sin cambio (ambos ilimitados)', () =>
    expect(calcularCambioStock(null, null)).toEqual({ tipo: 'sin_cambio' }))
  it('delta positivo (aumento de stock)', () =>
    expect(calcularCambioStock(10, 15)).toEqual({ tipo: 'delta', delta: 5 }))
  it('delta negativo (reducción de stock)', () =>
    expect(calcularCambioStock(10, 4)).toEqual({ tipo: 'delta', delta: -6 }))
  it('modalidad: limitado a ilimitado', () =>
    expect(calcularCambioStock(10, null)).toEqual({ tipo: 'modalidad', valor: null }))
  it('modalidad: ilimitado a limitado', () =>
    expect(calcularCambioStock(null, 10)).toEqual({ tipo: 'modalidad', valor: 10 }))
})
