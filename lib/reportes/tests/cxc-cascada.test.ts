import { describe, it, expect } from 'vitest'
import { agruparCxc, cxcAoA } from '../cxc-cascada'

const hoy = new Date('2026-08-10T12:00:00Z')
const saldos = [
  { documento_id: 'd1', cliente_id: 'c1', cliente_nombre: 'Juan', numero: 'F-1', fecha: '2026-08-01', fecha_vencimiento: '2026-08-05', saldo: 500 },
  { documento_id: 'd2', cliente_id: 'c1', cliente_nombre: 'Juan', numero: 'F-2', fecha: '2026-08-08', fecha_vencimiento: '2026-08-20', saldo: 300 },
  { documento_id: 'd3', cliente_id: 'c2', cliente_nombre: 'Ana', numero: 'F-3', fecha: '2026-08-02', fecha_vencimiento: '2026-08-06', saldo: 200 },
]

describe('agruparCxc', () => {
  it('agrupa por cliente con total y docs', () => {
    const g = agruparCxc(saldos, hoy)
    expect(g).toHaveLength(2)
    const juan = g.find(x => x.clienteId === 'c1')!
    expect(juan.total).toBe(800)
    expect(juan.docs).toHaveLength(2)
    expect(juan.docs[0].diasVencido).toBeGreaterThan(0) // F-1 venció el 05, hoy es 10
  })
})
describe('cxcAoA', () => {
  it('filas de cliente + documentos intercaladas', () => {
    const aoa = cxcAoA(agruparCxc(saldos, hoy))
    expect(aoa[0][0]).toBe('Tipo fila')
    expect(aoa.some(r => r[0] === 'Cliente')).toBe(true)
    expect(aoa.some(r => r[0] === '  Documento')).toBe(true)
  })
  it('formatea fechas con fechaDate (DD/MM/YYYY, sin restar zona horaria)', () => {
    const aoa = cxcAoA(agruparCxc(saldos, hoy))
    const fila = aoa.find(r => r[1] === 'F-1')!
    expect(fila[2]).toBe('01/08/2026')
    expect(fila[3]).toBe('05/08/2026')
  })
})
