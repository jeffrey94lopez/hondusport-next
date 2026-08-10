import { describe, it, expect } from 'vitest'
import { saldoAplicable, validarGastoSaldo } from '../saldo-favor'

describe('saldoAplicable', () => {
  it('el mínimo entre saldo y restante', () => expect(saldoAplicable(500, 300)).toBe(300))
  it('topea al saldo si el restante es mayor', () => expect(saldoAplicable(120, 300)).toBe(120))
  it('nunca negativo', () => expect(saldoAplicable(0, 300)).toBe(0))
  it('restante 0 → 0', () => expect(saldoAplicable(500, 0)).toBe(0))
})

describe('validarGastoSaldo', () => {
  it('ok si monto ≤ saldo', () => expect(validarGastoSaldo(500, 300)).toBeNull())
  it('error si monto > saldo', () => expect(validarGastoSaldo(200, 300)).toMatch(/saldo/i))
  it('error si monto ≤ 0', () => expect(validarGastoSaldo(500, 0)).toMatch(/mayor a 0|inválido/i))
})
