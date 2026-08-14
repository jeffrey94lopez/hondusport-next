import { describe, it, expect } from 'vitest'
import { filtrarTurnos, totalesTurnos, type FiltroTurnos } from '../turnos'
import type { SesionCaja } from '@/types'

function turno(over: Partial<SesionCaja>): SesionCaja {
  return {
    id: 'x', caja_id: 'c1', estado: 'cerrada', monto_inicial: 100,
    abierta_at: '2026-08-10T14:00:00Z', cerrada_at: '2026-08-10T22:00:00Z',
    monto_esperado: 500, monto_contado: 500, diferencia: 0,
    notas: null, usuario: 'ana@hs.com', ...over,
  }
}

const SIN_FILTRO: FiltroTurnos = { desde: '', hasta: '', cajaId: '', usuario: '' }

describe('filtrarTurnos', () => {
  it('sin filtros devuelve todo', () => {
    const t = [turno({ id: 'a' }), turno({ id: 'b' })]
    expect(filtrarTurnos(t, SIN_FILTRO).map(x => x.id)).toEqual(['a', 'b'])
  })

  it('filtra por caja y por usuario', () => {
    const t = [
      turno({ id: 'a', caja_id: 'c1', usuario: 'ana@hs.com' }),
      turno({ id: 'b', caja_id: 'c2', usuario: 'ana@hs.com' }),
      turno({ id: 'c', caja_id: 'c1', usuario: 'beto@hs.com' }),
    ]
    expect(filtrarTurnos(t, { ...SIN_FILTRO, cajaId: 'c1' }).map(x => x.id)).toEqual(['a', 'c'])
    expect(filtrarTurnos(t, { ...SIN_FILTRO, usuario: 'ana@hs.com' }).map(x => x.id)).toEqual(['a', 'b'])
  })

  // El rango se compara contra el DÍA de apertura en UTC. `hasta` es inclusivo:
  // un turno abierto el mismo día de `hasta` debe entrar, si no el usuario
  // filtra "hasta hoy" y no ve el turno de hoy.
  it('el rango de fechas es inclusivo en ambos extremos', () => {
    const t = [
      turno({ id: 'a', abierta_at: '2026-08-09T23:00:00Z' }),
      turno({ id: 'b', abierta_at: '2026-08-10T01:00:00Z' }),
      turno({ id: 'c', abierta_at: '2026-08-11T12:00:00Z' }),
    ]
    const r = filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-11' })
    expect(r.map(x => x.id)).toEqual(['b', 'c'])
  })

  it('un turno abierto (sin cierre) entra igual por su fecha de apertura', () => {
    const t = [turno({ id: 'a', estado: 'abierta', cerrada_at: null, monto_esperado: null, monto_contado: null, diferencia: null })]
    expect(filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-10' })).toHaveLength(1)
  })
})

describe('totalesTurnos', () => {
  it('suma los cuatro totales tratando null como cero', () => {
    const t = [
      turno({ monto_inicial: 100, monto_esperado: 500.25, monto_contado: 500.25, diferencia: 0 }),
      turno({ monto_inicial: 50, monto_esperado: null, monto_contado: null, diferencia: null }),
      turno({ monto_inicial: 25.5, monto_esperado: 300.1, monto_contado: 295.1, diferencia: -5 }),
    ]
    expect(totalesTurnos(t)).toEqual({ inicial: 175.5, esperado: 800.35, contado: 795.35, diferencia: -5 })
  })

  it('sin turnos devuelve ceros', () => {
    expect(totalesTurnos([])).toEqual({ inicial: 0, esperado: 0, contado: 0, diferencia: 0 })
  })
})
