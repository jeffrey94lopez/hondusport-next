import { describe, it, expect } from 'vitest'
import { aplicarEntradaCosto, precioParaCliente, margen } from '../costeo'

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
})
