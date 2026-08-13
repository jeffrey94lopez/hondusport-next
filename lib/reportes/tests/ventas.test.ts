import { describe, it, expect } from 'vitest'
import { tipoDocLabel, ventasAoA, resumenPorMetodo, conteoPorTipo, resumenNotasCredito } from '../ventas'
import type { FilaReporteVenta, PagoDocumentoVenta } from '@/types'

const fila: FilaReporteVenta = {
  id: 'd1', numero: 'C-00000001', fecha: '2026-08-10T15:00:00Z', cliente: 'Juan',
  vendedor: 'Ana', caja: 'Caja 1', tipo: 'comprobante', total: 230,
  items: [{ descripcion: 'Camiseta', cantidad: 2, precio: 115, importe: 230 }],
}

describe('tipoDocLabel', () => {
  it('traduce los tipos', () => {
    expect(tipoDocLabel('factura')).toBe('Factura')
    expect(tipoDocLabel('nota_credito')).toBe('Nota de crédito')
    expect(tipoDocLabel('devolucion')).toBe('Devolución')
  })
})

describe('ventasAoA', () => {
  it('resumen: una fila por documento', () => {
    const aoa = ventasAoA([fila], false)
    expect(aoa[0]).toEqual(['Número', 'Fecha', 'Cliente', 'Vendedor', 'Caja', 'Tipo doc', 'Total'])
    expect(aoa[1][0]).toBe('C-00000001')
    expect(aoa[1][6]).toBe(230)
    expect(aoa).toHaveLength(2)
  })
  it('detallado: documento + filas de ítem', () => {
    const aoa = ventasAoA([fila], true)
    expect(aoa[0][0]).toBe('Tipo fila')
    expect(aoa[1][0]).toBe('Documento')
    expect(aoa[2][0]).toBe('  Ítem')
    expect(aoa[2][7]).toBe('Camiseta')
    expect(aoa).toHaveLength(3)
  })
})

describe('resumenPorMetodo', () => {
  const pagos: PagoDocumentoVenta[] = [
    { documentoId: 'd1', metodo: 'Efectivo', monto: 100, tipoDocumento: 'comprobante' },
    { documentoId: 'd1', metodo: 'Efectivo', monto: 30, tipoDocumento: 'comprobante' }, // pago partido, mismo doc
    { documentoId: 'd2', metodo: 'Efectivo', monto: 50, tipoDocumento: 'comprobante' },
    { documentoId: 'd3', metodo: 'Tarjeta', monto: 200.005, tipoDocumento: 'factura' },
  ]
  it('suma monto y cuenta documentos distintos por método (pago partido no duplica documentos)', () => {
    const r = resumenPorMetodo(pagos)
    const efectivo = r.find(m => m.metodo === 'Efectivo')!
    expect(efectivo.monto).toBe(180)
    expect(efectivo.documentos).toBe(2)
  })
  it('ordena de mayor a menor monto', () => {
    const r = resumenPorMetodo(pagos)
    expect(r[0].metodo).toBe('Tarjeta') // 200.01 > 180 (Efectivo)
  })
  it('método sin pagos no aparece en el resultado', () => {
    const r = resumenPorMetodo(pagos)
    expect(r.find(m => m.metodo === 'Transferencia')).toBeUndefined()
  })
  it('redondea a 2 decimales', () => {
    const r = resumenPorMetodo(pagos)
    expect(r.find(m => m.metodo === 'Tarjeta')?.monto).toBe(200.01)
  })
  it('excluye pagos de notas de crédito/devolución (esta card es "cobrado", no reembolsado)', () => {
    const conNota: PagoDocumentoVenta[] = [
      ...pagos,
      { documentoId: 'd4', metodo: 'Efectivo', monto: 999, tipoDocumento: 'nota_credito' },
      { documentoId: 'd5', metodo: 'Efectivo', monto: 999, tipoDocumento: 'devolucion' },
    ]
    const r = resumenPorMetodo(conNota)
    expect(r.find(m => m.metodo === 'Efectivo')?.monto).toBe(180)
    expect(r.find(m => m.metodo === 'Efectivo')?.documentos).toBe(2)
  })
  it('sin pagos → arreglo vacío', () => {
    expect(resumenPorMetodo([])).toEqual([])
  })
})

describe('conteoPorTipo', () => {
  it('cuenta por tipo en el orden fiscal habitual', () => {
    const filas = [{ tipo: 'comprobante' as const }, { tipo: 'factura' as const }, { tipo: 'comprobante' as const }, { tipo: 'devolucion' as const }]
    const r = conteoPorTipo(filas)
    expect(r).toEqual([
      { tipo: 'factura', cantidad: 1 },
      { tipo: 'comprobante', cantidad: 2 },
      { tipo: 'devolucion', cantidad: 1 },
    ])
  })
  it('sin documentos de un tipo, no aparece', () => {
    const r = conteoPorTipo([{ tipo: 'factura' as const }])
    expect(r).toEqual([{ tipo: 'factura', cantidad: 1 }])
  })
})

describe('resumenNotasCredito', () => {
  it('cuenta y suma (en valor absoluto) solo nota_credito/devolucion', () => {
    const filas = [
      { tipo: 'comprobante' as const, total: 500 },
      { tipo: 'nota_credito' as const, total: 120 },
      { tipo: 'devolucion' as const, total: 30.005 },
    ]
    const r = resumenNotasCredito(filas)
    expect(r.cantidad).toBe(2)
    expect(r.monto).toBe(150.01)
  })
  it('sin notas/devoluciones en el rango → cantidad y monto en cero', () => {
    const r = resumenNotasCredito([{ tipo: 'comprobante' as const, total: 500 }])
    expect(r).toEqual({ cantidad: 0, monto: 0 })
  })
})
