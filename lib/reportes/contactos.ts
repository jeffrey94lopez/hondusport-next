import type { FilaContacto, RolContacto } from '@/types'

interface ContactoRow {
  id: string; nombre: string; rtn: string | null; identidad: string | null
  es_cliente: boolean; es_proveedor: boolean
  total_ventas: number; total_compras: number; saldo_cxc: number; saldo_cxp: number
}

export function filaContacto(row: ContactoRow): FilaContacto {
  return {
    id: row.id, nombre: row.nombre, rtn: row.rtn ?? '', identidad: row.identidad ?? '',
    es_cliente: row.es_cliente, es_proveedor: row.es_proveedor,
    total_ventas: Number(row.total_ventas), total_compras: Number(row.total_compras),
    saldo_cxc: Number(row.saldo_cxc), saldo_cxp: Number(row.saldo_cxp),
  }
}

function rolLabel(f: FilaContacto): string {
  if (f.es_cliente && f.es_proveedor) return 'Cliente y proveedor'
  if (f.es_proveedor) return 'Proveedor'
  return 'Cliente'
}

export function contactosAoA(filas: FilaContacto[], rol: RolContacto): (string | number)[][] {
  if (rol === 'cliente') {
    return [['Nombre', 'RTN/Identidad', 'Total ventas', 'Saldo CxC'],
      ...filas.map(f => [f.nombre, f.rtn || f.identidad, f.total_ventas, f.saldo_cxc])]
  }
  if (rol === 'proveedor') {
    return [['Nombre', 'RTN/Identidad', 'Total compras', 'Saldo CxP'],
      ...filas.map(f => [f.nombre, f.rtn || f.identidad, f.total_compras, f.saldo_cxp])]
  }
  return [['Nombre', 'RTN/Identidad', 'Rol', 'Total ventas', 'Total compras', 'Saldo CxC', 'Saldo CxP'],
    ...filas.map(f => [f.nombre, f.rtn || f.identidad, rolLabel(f), f.total_ventas, f.total_compras, f.saldo_cxc, f.saldo_cxp])]
}
