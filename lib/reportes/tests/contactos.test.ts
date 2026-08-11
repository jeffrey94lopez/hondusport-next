import { describe, it, expect } from 'vitest'
import { filaContacto, contactosAoA } from '../contactos'
import type { FilaContacto } from '@/types'

const row = {
  id: 'c1', nombre: 'Juan', rtn: '0801-1990-1', identidad: null as string | null,
  es_cliente: true, es_proveedor: false,
  total_ventas: 5000, total_compras: 0, saldo_cxc: 1200, saldo_cxp: 0,
}

describe('filaContacto', () => {
  it('normaliza identidad null a "" y arma la fila', () => {
    const f = filaContacto(row)
    expect(f.identidad).toBe('')
    expect(f.es_cliente).toBe(true)
    expect(f.saldo_cxc).toBe(1200)
  })
})
describe('contactosAoA', () => {
  it('rol cliente: columnas de venta/CxC', () => {
    const aoa = contactosAoA([filaContacto(row)] as FilaContacto[], 'cliente')
    expect(aoa[0]).toContain('Total ventas')
    expect(aoa[0]).toContain('Saldo CxC')
    expect(aoa[1][0]).toBe('Juan')
  })
})
