import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FREE_SHIPPING_THRESHOLD,
  isConfigActivo,
  resolveFreeShippingThreshold,
} from '../freeShipping'

describe('resolveFreeShippingThreshold', () => {
  it('usa el número configurado cuando es válido', () => {
    expect(resolveFreeShippingThreshold('1500')).toBe(1500)
  })

  it('acepta 0 como umbral válido (envío gratis siempre)', () => {
    expect(resolveFreeShippingThreshold('0')).toBe(0)
  })

  it('cae al default cuando falta', () => {
    expect(resolveFreeShippingThreshold(undefined)).toBe(DEFAULT_FREE_SHIPPING_THRESHOLD)
  })

  it('cae al default cuando está vacío', () => {
    expect(resolveFreeShippingThreshold('')).toBe(DEFAULT_FREE_SHIPPING_THRESHOLD)
  })

  it('cae al default cuando no es un número', () => {
    expect(resolveFreeShippingThreshold('abc')).toBe(DEFAULT_FREE_SHIPPING_THRESHOLD)
  })
})

describe('isConfigActivo', () => {
  it('devuelve el default cuando el valor es undefined', () => {
    expect(isConfigActivo(undefined, true)).toBe(true)
    expect(isConfigActivo(undefined, false)).toBe(false)
  })

  it("trata 'false'/'FALSE' (cualquier caja) como desactivado", () => {
    expect(isConfigActivo('false', true)).toBe(false)
    expect(isConfigActivo('FALSE', true)).toBe(false)
  })

  it('trata cualquier otro valor como activado', () => {
    expect(isConfigActivo('true', false)).toBe(true)
    expect(isConfigActivo('1', false)).toBe(true)
  })
})
