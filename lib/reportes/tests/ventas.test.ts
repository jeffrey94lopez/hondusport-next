import { describe, it, expect } from 'vitest'
import { tipoDocLabel, ventasAoA } from '../ventas'
import type { FilaReporteVenta } from '@/types'

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
