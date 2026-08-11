import { describe, it, expect } from 'vitest'
import { filaGanancia, totalesGanancias, gananciasAoA } from '../ganancias'

const base = { codigo: 'A1', nombre: 'Camiseta', variante: 'M', categoria: 'Ropa', cantidad: 3, ventas: 600, costo: 360 }

describe('filaGanancia', () => {
  it('ganancia = ventas − costo, margen%', () => {
    const f = filaGanancia(base)
    expect(f.ganancia).toBe(240)
    expect(f.margen).toBe(40)
  })
  it('ventas 0 → margen 0', () => {
    expect(filaGanancia({ ...base, ventas: 0, costo: 0 }).margen).toBe(0)
  })
})
describe('totalesGanancias', () => {
  it('suma ventas/costo/ganancia y margen global', () => {
    const filas = [filaGanancia(base), filaGanancia({ ...base, ventas: 400, costo: 300 })]
    const t = totalesGanancias(filas)
    expect(t.ventas).toBe(1000); expect(t.costo).toBe(660); expect(t.ganancia).toBe(340); expect(t.margen).toBe(34)
  })
})
describe('gananciasAoA', () => {
  it('encabezado + filas + totales', () => {
    const filas = [filaGanancia(base)]
    const aoa = gananciasAoA(filas, totalesGanancias(filas))
    expect(aoa[0][0]).toBe('Código')
    expect(aoa[1][0]).toBe('A1')
    expect(aoa[aoa.length - 1][0]).toBe('TOTALES')
  })
})
