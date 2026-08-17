import { describe, it, expect } from 'vitest'
import { filtrarTurnos, totalesTurnos, totalCreditos, totalCobros, creditosDeDocumentos, diferenciaDetalleArqueo, type FiltroTurnos } from '../turnos'
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
    // Mediodía UTC a propósito: son las 6 a. m. en Honduras, así que el día
    // local y el día UTC coinciden y el caso prueba el rango, no la zona (eso
    // lo cubre el test de arriba).
    const t = [
      turno({ id: 'a', abierta_at: '2026-08-09T12:00:00Z' }),
      turno({ id: 'b', abierta_at: '2026-08-10T12:00:00Z' }),
      turno({ id: 'c', abierta_at: '2026-08-11T12:00:00Z' }),
    ]
    const r = filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-11' })
    expect(r.map(x => x.id)).toEqual(['b', 'c'])
  })

  // El corte de día es el de HONDURAS (UTC-6), no el de UTC. Un turno abierto
  // a las 6:30 p. m. de Tegucigalpa ya cae en el día UTC siguiente, así que
  // filtrar por su propio día —el que la tabla muestra— lo dejaba fuera. Todo
  // turno abierto entre las 18:00 y las 23:59 caía en el día equivocado: en una
  // tienda con turno de tarde ese es el caso normal, no el borde.
  it('agrupa por el dia de Honduras, no por el dia UTC', () => {
    const t = [turno({ id: 'tarde', abierta_at: '2026-08-11T00:30:00Z' })] // 10/08 6:30 p. m. en Honduras
    expect(filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-10' }).map(x => x.id)).toEqual(['tarde'])
    expect(filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-11', hasta: '2026-08-11' })).toHaveLength(0)
  })

  it('un turno de la madrugada cae en su propio dia local', () => {
    const t = [turno({ id: 'madrugada', abierta_at: '2026-08-10T07:00:00Z' })] // 10/08 1:00 a. m. en Honduras
    expect(filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-10' }).map(x => x.id)).toEqual(['madrugada'])
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

describe('totales del detalle del turno', () => {
  // 0.1 + 0.2 no es exacto en punto flotante (da 0.30000000000000004): este
  // caso sí ejercita el round2, a diferencia de 100.1 + 200.25 (exacto en
  // JS), que pasaba igual con un totalCreditos sin redondeo.
  it('suma los creditos otorgados redondeando a 2', () => {
    expect(totalCreditos([
      { documentoId: 'a', numero: 'F-001', cliente: 'Ana', monto: 0.1 },
      { documentoId: 'b', numero: 'F-002', cliente: 'Beto', monto: 0.2 },
    ])).toBe(0.3)
  })

  it('suma los cobros redondeando a 2', () => {
    expect(totalCobros([
      { cobroId: 'a', numero: 'C-001', cliente: 'Ana', metodo: 'efectivo', monto: 0.1 },
      { cobroId: 'b', numero: 'C-002', cliente: 'Ana', metodo: 'tarjeta', monto: 0.2 },
    ])).toBe(0.3)
  })

  it('sin lineas devuelven cero', () => {
    expect(totalCreditos([])).toBe(0)
    expect(totalCobros([])).toBe(0)
  })
})

// R7 (revisión del comprobante): la suma en vivo del detalle puede divergir
// del arqueo congelado si se anuló un comprobante DESPUÉS del cierre — el
// papel debe poder advertirlo en vez de imprimir un "cuadró" falso.
describe('diferenciaDetalleArqueo', () => {
  it('sin arqueo congelado (turno abierto) no hay nada que advertir', () => {
    expect(diferenciaDetalleArqueo(1380, null)).toBeNull()
  })

  it('detalle y congelado iguales: no hay nada que advertir', () => {
    expect(diferenciaDetalleArqueo(1880, 1880)).toBeNull()
  })

  it('detalle y congelado distintos: devuelve la magnitud de la diferencia', () => {
    expect(diferenciaDetalleArqueo(1380, 1880)).toBe(500)
    expect(diferenciaDetalleArqueo(1880, 1380)).toBe(500) // el orden no cambia la magnitud
  })

  it('una diferencia de centimos tambien se reporta (no la absorbe el redondeo)', () => {
    expect(diferenciaDetalleArqueo(1380.02, 1380.01)).toBe(0.01)
  })
})

describe('creditosDeDocumentos', () => {
  function documento(over: Partial<Parameters<typeof creditosDeDocumentos>[0][number]>) {
    return {
      id: 'd1',
      tipo: 'factura',
      correlativo: 'FAC-001',
      numero_comprobante: null,
      cliente_nombre: 'Ana',
      estado: 'emitido',
      pagos: [],
      ...over,
    }
  }

  it('venta mixta: solo la parte pagada con credito entra, no el total', () => {
    const docs = [documento({
      pagos: [{ tipo: 'efectivo', monto: 400 }, { tipo: 'credito', monto: 600 }],
    })]
    expect(creditosDeDocumentos(docs)).toEqual([
      { documentoId: 'd1', numero: 'FAC-001', cliente: 'Ana', monto: 600 },
    ])
  })

  it('documento anulado con pago de credito no aparece', () => {
    const docs = [documento({
      estado: 'anulado',
      pagos: [{ tipo: 'credito', monto: 600 }],
    })]
    expect(creditosDeDocumentos(docs)).toEqual([])
  })

  it('dos pagos de credito se suman en una sola linea', () => {
    const docs = [documento({
      pagos: [{ tipo: 'credito', monto: 300 }, { tipo: 'credito', monto: 250 }],
    })]
    expect(creditosDeDocumentos(docs)).toEqual([
      { documentoId: 'd1', numero: 'FAC-001', cliente: 'Ana', monto: 550 },
    ])
  })

  it('documento sin ningun pago de credito no aparece', () => {
    const docs = [documento({
      pagos: [{ tipo: 'efectivo', monto: 1000 }],
    })]
    expect(creditosDeDocumentos(docs)).toEqual([])
  })
})
