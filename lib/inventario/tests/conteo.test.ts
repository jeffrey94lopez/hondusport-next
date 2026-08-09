import { describe, it, expect } from 'vitest'
import { numeroConteo, diferenciaLinea, clasificarLinea, valorDiferencia, resumenConteo } from '../conteo'

describe('numeroConteo', () => {
  it('formatea con 8 dígitos', () => expect(numeroConteo(7)).toBe('CONTEO-00000007'))
})

describe('diferenciaLinea', () => {
  it('null si no se contó', () => expect(diferenciaLinea(10, null)).toBeNull())
  it('sobrante', () => expect(diferenciaLinea(10, 12)).toBe(2))
  it('faltante', () => expect(diferenciaLinea(10, 8)).toBe(-2))
})

describe('clasificarLinea', () => {
  it('pendiente', () => expect(clasificarLinea(10, null)).toBe('pendiente'))
  it('cuadra', () => expect(clasificarLinea(10, 10)).toBe('cuadra'))
  it('sobrante', () => expect(clasificarLinea(10, 12)).toBe('sobrante'))
  it('faltante', () => expect(clasificarLinea(10, 8)).toBe('faltante'))
})

describe('valorDiferencia', () => {
  it('diferencia por costo', () => expect(valorDiferencia(-2, 50)).toBe(-100))
  it('sin costo es 0', () => expect(valorDiferencia(-2, null)).toBe(0))
})

describe('resumenConteo', () => {
  it('agrega contadas/pendientes/sobrantes/faltantes/valorNeto', () => {
    const r = resumenConteo([
      { stock_snapshot: 10, contado: 12, costo: 50 },
      { stock_snapshot: 5, contado: 3, costo: 20 },
      { stock_snapshot: 8, contado: null, costo: 10 },
    ])
    expect(r).toEqual({ contadas: 2, pendientes: 1, sobrantes: 1, faltantes: 1, valorNeto: 60 })
  })
})
