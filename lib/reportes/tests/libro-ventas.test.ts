import { describe, it, expect } from 'vitest'
import { filaLibro, totalesLibro, libroAoA } from '../libro-ventas'
import { fechaHN } from '../fecha'
import type { DocumentoFiscal } from '@/types'

function doc(over: Partial<DocumentoFiscal>): DocumentoFiscal {
  return {
    id: 'x', tipo: 'factura', correlativo: '000-001-01-00000001', numero_comprobante: null,
    cai_id: 'c', caja_id: 'k', sesion_id: null, vendedor_id: null, cliente_id: null,
    cliente_nombre: 'Juan', cliente_rtn: '0801-1990-12345', cliente_identidad: null,
    exonerado: false, orden_compra_exenta: null, constancia_exonerado: null, registro_sag: null,
    pedido_id: null, documento_origen_id: null, total_exento: 0, total_exonerado: 0,
    total_gravado15: 200, total_gravado18: 0, isv15: 30, isv18: 0, descuento_total: 0,
    total: 230, total_letras: '', tasa_usd: null, estado: 'emitido', anulado_motivo: null,
    anulado_at: null, notas: null, usuario: null, created_at: '2026-08-10T15:00:00Z',
    cai_codigo: 'ABC123', ...over,
  }
}

describe('filaLibro', () => {
  it('factura: valores en positivo', () => {
    const f = filaLibro(doc({}))
    expect(f.gravado15).toBe(200); expect(f.isv15).toBe(30); expect(f.total).toBe(230)
    expect(f.cai).toBe('ABC123'); expect(f.rtn).toBe('0801-1990-12345'); expect(f.esNota).toBe(false)
  })
  it('nota de crédito: valores en negativo', () => {
    const f = filaLibro(doc({ tipo: 'nota_credito', correlativo: '000-001-03-00000005' }))
    expect(f.gravado15).toBe(-200); expect(f.isv15).toBe(-30); expect(f.total).toBe(-230)
    expect(f.esNota).toBe(true)
  })
})

describe('totalesLibro', () => {
  it('suma factura + NC (neto)', () => {
    const filas = [filaLibro(doc({})), filaLibro(doc({ tipo: 'nota_credito' }))]
    const t = totalesLibro(filas)
    expect(t.gravado15).toBe(0); expect(t.isv15).toBe(0); expect(t.total).toBe(0)
  })
})

describe('libroAoA', () => {
  it('encabezado + filas + fila de totales (con columna Tipo)', () => {
    const filas = [filaLibro(doc({}))]
    const aoa = libroAoA(filas, totalesLibro(filas))
    expect(aoa[0][0]).toBe('Fecha')
    expect(aoa[0][2]).toBe('Tipo')
    expect(aoa[1][1]).toBe('000-001-01-00000001')
    expect(aoa[1][2]).toBe('Factura')
    expect(aoa[aoa.length - 1][0]).toBe('TOTALES')
    expect(aoa[aoa.length - 1][12]).toBe(230)
  })

  it('tipoLibroLabel: nota de crédito', () => {
    const filas = [filaLibro(doc({ tipo: 'nota_credito' }))]
    const aoa = libroAoA(filas, totalesLibro(filas))
    expect(aoa[1][2]).toBe('Nota de crédito')
  })
})

describe('fechaHN', () => {
  it('formatea el día local de Honduras', () => {
    // 2026-08-10T02:00:00Z = 2026-08-09 20:00 Honduras
    expect(fechaHN('2026-08-10T02:00:00Z')).toBe('09/08/2026')
  })
})
