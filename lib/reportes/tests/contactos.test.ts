import { describe, it, expect } from 'vitest'
import { filaContacto, rolLabel, tipoClienteLabel, filtrarPorRol, contactosAoA } from '../contactos'
import type { FilaContacto } from '@/types'

const rowCliente = {
  id: 'c1', nombre: 'Juan', rtn: '0801-1990-1', identidad: null as string | null,
  tipo_cliente: 'final' as const, exonerado: false,
  telefono: '9999-0000', correo: 'juan@test.hn', direccion: 'Col. Centro', contacto: null as string | null,
  es_cliente: true, es_proveedor: false, activo: true,
}
const rowProveedor = {
  id: 'p1', nombre: 'Distribuidora XYZ', rtn: null as string | null, identidad: null as string | null,
  tipo_cliente: 'final' as const, exonerado: false,
  telefono: '2222-1111', correo: null as string | null, direccion: null as string | null, contacto: 'María',
  es_cliente: false, es_proveedor: true, activo: true,
}

describe('filaContacto', () => {
  it('normaliza nulls a "" y arma la fila de directorio (sin montos)', () => {
    const f = filaContacto(rowCliente)
    expect(f.identidad).toBe('')
    expect(f.es_cliente).toBe(true)
    expect(f.telefono).toBe('9999-0000')
    expect(f).not.toHaveProperty('total_ventas')
  })
})

describe('rolLabel', () => {
  it('cliente y proveedor a la vez', () => {
    expect(rolLabel({ es_cliente: true, es_proveedor: true })).toBe('Cliente y proveedor')
  })
  it('solo proveedor', () => {
    expect(rolLabel({ es_cliente: false, es_proveedor: true })).toBe('Proveedor')
  })
  it('solo cliente (o ninguno)', () => {
    expect(rolLabel({ es_cliente: true, es_proveedor: false })).toBe('Cliente')
  })
})

describe('tipoClienteLabel', () => {
  it('traduce revendedor/final', () => {
    expect(tipoClienteLabel('revendedor')).toBe('Revendedor')
    expect(tipoClienteLabel('final')).toBe('Final')
  })
})

describe('filtrarPorRol', () => {
  const filas = [filaContacto(rowCliente), filaContacto(rowProveedor)]
  it('cliente: solo es_cliente', () => {
    expect(filtrarPorRol(filas, 'cliente').map(f => f.id)).toEqual(['c1'])
  })
  it('proveedor: solo es_proveedor', () => {
    expect(filtrarPorRol(filas, 'proveedor').map(f => f.id)).toEqual(['p1'])
  })
  it('ambos: sin filtrar (se muestran todos)', () => {
    expect(filtrarPorRol(filas, 'ambos').map(f => f.id)).toEqual(['c1', 'p1'])
  })
})

describe('contactosAoA', () => {
  it('encabezado y columnas de directorio (sin montos)', () => {
    const filas: FilaContacto[] = [filaContacto(rowCliente), filaContacto(rowProveedor)]
    const aoa = contactosAoA(filas)
    expect(aoa[0]).toEqual(['Nombre', 'Rol', 'RTN/Identidad', 'Tipo de cliente', 'Teléfono', 'Correo', 'Dirección', 'Persona de contacto', 'Exonerado', 'Activo'])
    expect(aoa[1][0]).toBe('Juan')
    expect(aoa[1][2]).toBe('0801-1990-1')
    expect(aoa[2][0]).toBe('Distribuidora XYZ')
    expect(aoa[2][7]).toBe('María') // persona de contacto (proveedor)
    expect(aoa[2][3]).toBe('—') // tipo de cliente no aplica (es proveedor puro)
  })
})
