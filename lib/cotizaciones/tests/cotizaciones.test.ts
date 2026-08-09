import { describe, it, expect } from 'vitest'
import { numeroCotizacion, validoHasta, estaVencida, hoyHonduras, agruparPorEtapa, etapaGanadaDestino } from '../cotizaciones'
import type { CotizacionEtapa } from '@/types'

const etapa = (id: string, orden: number, tipo: CotizacionEtapa['tipo'] = 'abierta'): CotizacionEtapa =>
  ({ id, nombre: id, tipo, color: '#000', orden, activo: true })

describe('numeroCotizacion', () => {
  it('formatea con prefijo COT- y 8 dígitos', () => {
    expect(numeroCotizacion(1)).toBe('COT-00000001')
    expect(numeroCotizacion(42)).toBe('COT-00000042')
    expect(numeroCotizacion(12345678)).toBe('COT-12345678')
  })
})

describe('validoHasta', () => {
  it('suma los días a la fecha de creación', () => {
    const r = validoHasta(new Date('2026-08-08T10:00:00Z'), 15)
    expect(r.toISOString().slice(0, 10)).toBe('2026-08-23')
  })
  it('con 0 días vence el mismo día', () => {
    const r = validoHasta(new Date('2026-08-08T10:00:00Z'), 0)
    expect(r.toISOString().slice(0, 10)).toBe('2026-08-08')
  })
})

describe('hoyHonduras', () => {
  const dia = (d: Date) => d.toISOString().slice(0, 10)
  it('toma el día local de Honduras (UTC-6), no el UTC', () => {
    // Honduras 8 ago 20:00 = UTC 9 ago 02:00 → sigue siendo el día 8 en Honduras
    expect(dia(hoyHonduras(new Date('2026-08-09T02:00:00Z')))).toBe('2026-08-08')
  })
  it('antes de medianoche UTC pero ya día siguiente en... no: mediodía UTC = mismo día', () => {
    expect(dia(hoyHonduras(new Date('2026-08-08T18:00:00Z')))).toBe('2026-08-08')
  })
  it('madrugada UTC = día anterior en Honduras', () => {
    // UTC 8 ago 05:00 = Honduras 7 ago 23:00
    expect(dia(hoyHonduras(new Date('2026-08-08T05:00:00Z')))).toBe('2026-08-07')
  })
  it('validoHasta desde hoyHonduras corrige el off-by-one de la tarde', () => {
    // Guardado Honduras 8 ago 20:00 (UTC 9 ago 02:00) + 15 días = 23 ago, no 24
    const r = validoHasta(hoyHonduras(new Date('2026-08-09T02:00:00Z')), 15)
    expect(dia(r)).toBe('2026-08-23')
  })
})

describe('estaVencida', () => {
  it('vencida si hoy es posterior a valido_hasta', () => {
    expect(estaVencida(new Date('2026-08-08'), new Date('2026-08-09'))).toBe(true)
  })
  it('no vencida el mismo día', () => {
    expect(estaVencida(new Date('2026-08-08'), new Date('2026-08-08'))).toBe(false)
  })
  it('no vencida antes', () => {
    expect(estaVencida(new Date('2026-08-10'), new Date('2026-08-08'))).toBe(false)
  })
})

describe('agruparPorEtapa', () => {
  const etapas = [etapa('b', 1), etapa('a', 0), etapa('c', 2)]
  it('ordena por orden e incluye columnas vacías', () => {
    const items = [{ id: '1', etapa_id: 'a' }, { id: '2', etapa_id: 'c' }]
    const r = agruparPorEtapa(items, etapas)
    expect(r.map(g => g.etapa.id)).toEqual(['a', 'b', 'c'])
    expect(r[0].items.map(i => i.id)).toEqual(['1'])
    expect(r[1].items).toEqual([]) // b vacía pero presente
    expect(r[2].items.map(i => i.id)).toEqual(['2'])
  })
  it('ignora etapas inactivas', () => {
    const conInactiva = [...etapas, { ...etapa('z', 3), activo: false }]
    const r = agruparPorEtapa([], conInactiva)
    expect(r.find(g => g.etapa.id === 'z')).toBeUndefined()
  })
})

describe('etapaGanadaDestino', () => {
  it('devuelve la primera etapa activa de tipo ganada por orden', () => {
    const etapas = [etapa('g2', 5, 'ganada'), etapa('g1', 3, 'ganada'), etapa('a', 0)]
    expect(etapaGanadaDestino(etapas)?.id).toBe('g1')
  })
  it('devuelve null si no hay etapa ganada', () => {
    expect(etapaGanadaDestino([etapa('a', 0)])).toBeNull()
  })
})
