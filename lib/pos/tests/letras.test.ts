import { describe, it, expect } from 'vitest'
import { numeroALetras } from '../letras'

describe('numeroALetras', () => {
  const casos: Array<[number, string]> = [
    [0.99, 'CERO LEMPIRAS CON 99/100'],
    [15, 'QUINCE LEMPIRAS CON 00/100'],
    [16, 'DIECISÉIS LEMPIRAS CON 00/100'],
    [21, 'VEINTIÚN LEMPIRAS CON 00/100'],
    [100, 'CIEN LEMPIRAS CON 00/100'],
    [101, 'CIENTO UN LEMPIRAS CON 00/100'],
    [555.5, 'QUINIENTOS CINCUENTA Y CINCO LEMPIRAS CON 50/100'],
    [1000, 'UN MIL LEMPIRAS CON 00/100'],
    [12345.67, 'DOCE MIL TRESCIENTOS CUARENTA Y CINCO LEMPIRAS CON 67/100'],
    [1000000, 'UN MILLÓN DE LEMPIRAS CON 00/100'],
    [2500000.1, 'DOS MILLONES QUINIENTOS MIL LEMPIRAS CON 10/100'],
  ]
  it.each(casos)('numeroALetras(%f) → %s', (n, esperado) => {
    expect(numeroALetras(n)).toBe(esperado)
  })

  it('millón exacto con centavos sigue llevando DE (la parte entera es exacta)', () => {
    expect(numeroALetras(1000000.05)).toBe('UN MILLÓN DE LEMPIRAS CON 05/100')
  })

  it('centenas exactas irregulares: 700 → SETECIENTOS', () => {
    expect(numeroALetras(700)).toBe('SETECIENTOS LEMPIRAS CON 00/100')
  })
})
