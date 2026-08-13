import { describe, it, expect } from 'vitest'
import type { CxcFila } from '@/types'
import { agruparPorCliente } from '../cxc'

// Fila mínima válida para CxcFila; los campos irrelevantes al agrupamiento
// (tipo, correlativo, fecha, etc.) se dejan con valores neutros.
function fila(over: Partial<CxcFila> & Pick<CxcFila, 'documento_id' | 'cliente_id' | 'saldo'>): CxcFila {
  return {
    cliente_nombre: 'Cliente',
    tipo: 'factura',
    correlativo: null,
    numero_comprobante: null,
    fecha: '2026-08-01',
    fecha_vencimiento: '2026-08-15',
    credito_total: over.saldo,
    cobrado: 0,
    nc_cxc: 0,
    estado: 'pendiente',
    bucket: 'por_vencer',
    dias_vencido: 0,
    ...over,
  }
}

describe('agruparPorCliente', () => {
  it('agrupa por cliente en orden de PRIMERA APARICIÓN (no alfabético ni por monto)', () => {
    const filas: CxcFila[] = [
      fila({ documento_id: 'd1', cliente_id: 'b', cliente_nombre: 'Beta', saldo: 100 }),
      fila({ documento_id: 'd2', cliente_id: 'a', cliente_nombre: 'Alfa', saldo: 50 }),
      fila({ documento_id: 'd3', cliente_id: 'b', cliente_nombre: 'Beta', saldo: 25 }),
    ]
    const grupos = agruparPorCliente(filas)
    expect(grupos.map(g => g.clienteId)).toEqual(['b', 'a'])
  })

  it('agrupa 2 clientes con 3 documentos y suma el saldo por grupo', () => {
    const filas: CxcFila[] = [
      fila({ documento_id: 'd1', cliente_id: 'a', cliente_nombre: 'Athletic Masters', saldo: 45000 }),
      fila({ documento_id: 'd2', cliente_id: 'a', cliente_nombre: 'Athletic Masters', saldo: 65500 }),
      fila({ documento_id: 'd3', cliente_id: 'b', cliente_nombre: 'Gimnasios Titan', saldo: 12300 }),
    ]
    const grupos = agruparPorCliente(filas)
    expect(grupos).toHaveLength(2)
    expect(grupos[0]).toMatchObject({ clienteId: 'a', clienteNombre: 'Athletic Masters', total: 110500 })
    expect(grupos[0].filas.map(f => f.documento_id)).toEqual(['d1', 'd2'])
    expect(grupos[1]).toMatchObject({ clienteId: 'b', clienteNombre: 'Gimnasios Titan', total: 12300 })
    expect(grupos[1].filas.map(f => f.documento_id)).toEqual(['d3'])
  })

  it('redondea la suma a 2 decimales (evita arrastre de error de coma flotante)', () => {
    const filas: CxcFila[] = [
      fila({ documento_id: 'd1', cliente_id: 'a', saldo: 10.1 }),
      fila({ documento_id: 'd2', cliente_id: 'a', saldo: 20.2 }),
    ]
    const grupos = agruparPorCliente(filas)
    expect(grupos[0].total).toBe(30.3)
  })

  it('usa "Sin cliente" si cliente_nombre llega vacío', () => {
    const filas: CxcFila[] = [
      fila({ documento_id: 'd1', cliente_id: 'x', cliente_nombre: '', saldo: 10 }),
    ]
    const grupos = agruparPorCliente(filas)
    expect(grupos[0].clienteNombre).toBe('Sin cliente')
  })

  it('devuelve un arreglo vacío si no hay filas', () => {
    expect(agruparPorCliente([])).toEqual([])
  })
})
