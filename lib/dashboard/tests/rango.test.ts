import { describe, it, expect } from 'vitest'
import { rangoDesdePreset, etiquetaRango } from '../rango'

// Honduras es UTC-6 fijo. Un instante de la tarde/noche local NO debe
// adelantar el día. 2026-08-10T02:00:00Z = 2026-08-09 20:00 en Honduras,
// así que "hoy" en Honduras es el 9 de agosto.
const instante = new Date('2026-08-10T02:00:00Z')

describe('rangoDesdePreset', () => {
  it('hoy: desde 00:00 Honduras del día local a 00:00 del día siguiente', () => {
    const r = rangoDesdePreset('hoy', instante)
    // 9 ago 00:00 Honduras = 9 ago 06:00Z; 10 ago 00:00 Honduras = 10 ago 06:00Z
    expect(r.desde).toBe('2026-08-09T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('semana: lunes 00:00 Honduras de la semana en curso hasta mañana', () => {
    // 9 ago 2026 es domingo → el lunes de su semana es el 3 de agosto.
    const r = rangoDesdePreset('semana', instante)
    expect(r.desde).toBe('2026-08-03T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('mes: día 1 del mes local hasta mañana', () => {
    const r = rangoDesdePreset('mes', instante)
    expect(r.desde).toBe('2026-08-01T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('anio: 1 de enero local hasta mañana', () => {
    const r = rangoDesdePreset('anio', instante)
    expect(r.desde).toBe('2026-01-01T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('personalizado: desde 00:00 hasta el día "hasta" +1 (inclusivo)', () => {
    const r = rangoDesdePreset('personalizado', instante, '2026-08-01', '2026-08-05')
    expect(r.desde).toBe('2026-08-01T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-06T06:00:00.000Z')
  })
})

describe('etiquetaRango', () => {
  it('semana da una etiqueta legible', () => {
    const r = rangoDesdePreset('semana', instante)
    expect(etiquetaRango('semana', r)).toMatch(/semana/i)
  })
})
