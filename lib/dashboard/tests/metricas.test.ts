import { describe, it, expect } from 'vitest'
import { ticketPromedio, ordenarPorMetrica, maxValor } from '../metricas'

describe('ticketPromedio', () => {
  it('divide ventas entre documentos, redondeado a 2', () => {
    expect(ticketPromedio(1000, 3)).toBe(333.33)
  })
  it('0 documentos → 0 (sin división por cero)', () => {
    expect(ticketPromedio(1000, 0)).toBe(0)
  })
})

describe('ordenarPorMetrica', () => {
  const filas = [
    { nombre: 'A', monto: 10, cantidad: 5 },
    { nombre: 'B', monto: 30, cantidad: 1 },
    { nombre: 'C', monto: 20, cantidad: 8 },
  ]
  it('por monto descendente', () => {
    expect(ordenarPorMetrica(filas, 'monto').map(f => f.nombre)).toEqual(['B', 'C', 'A'])
  })
  it('por cantidad descendente', () => {
    expect(ordenarPorMetrica(filas, 'cantidad').map(f => f.nombre)).toEqual(['C', 'A', 'B'])
  })
  it('no muta el arreglo original', () => {
    const copia = [...filas]
    ordenarPorMetrica(filas, 'monto')
    expect(filas).toEqual(copia)
  })
})

describe('maxValor', () => {
  it('devuelve el máximo del selector', () => {
    expect(maxValor([{ v: 3 }, { v: 9 }, { v: 4 }], f => f.v)).toBe(9)
  })
  it('todo 0 → 1 (evita división por cero al escalar barras)', () => {
    expect(maxValor([{ v: 0 }, { v: 0 }], f => f.v)).toBe(1)
  })
  it('lista vacía → 1', () => {
    expect(maxValor([] as { v: number }[], f => f.v)).toBe(1)
  })
})
