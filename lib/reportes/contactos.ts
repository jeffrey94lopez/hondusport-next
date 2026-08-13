import type { FilaContacto, RolContacto } from '@/types'

// Fila cruda tal como sale de `clientes` (mismo formulario real, ver
// app/admin/clientes/ClientesClient.tsx). R5a fixB: este reporte es un
// directorio de datos de contacto, no un reporte de montos — por eso no
// trae total_ventas/total_compras/saldo_cxc/saldo_cxp.
interface ClienteContactoRow {
  id: string
  nombre: string
  rtn: string | null
  identidad: string | null
  tipo_cliente: 'final' | 'revendedor'
  exonerado: boolean
  telefono: string | null
  correo: string | null
  direccion: string | null
  contacto: string | null
  es_cliente: boolean
  es_proveedor: boolean
  activo: boolean
}

export function filaContacto(row: ClienteContactoRow): FilaContacto {
  return {
    id: row.id,
    nombre: row.nombre,
    rtn: row.rtn ?? '',
    identidad: row.identidad ?? '',
    tipoCliente: row.tipo_cliente,
    exonerado: row.exonerado,
    telefono: row.telefono ?? '',
    correo: row.correo ?? '',
    direccion: row.direccion ?? '',
    contacto: row.contacto ?? '',
    es_cliente: row.es_cliente,
    es_proveedor: row.es_proveedor,
    activo: row.activo,
  }
}

export function rolLabel(f: Pick<FilaContacto, 'es_cliente' | 'es_proveedor'>): string {
  if (f.es_cliente && f.es_proveedor) return 'Cliente y proveedor'
  if (f.es_proveedor) return 'Proveedor'
  return 'Cliente'
}

export function tipoClienteLabel(t: FilaContacto['tipoCliente']): string {
  return t === 'revendedor' ? 'Revendedor' : 'Final'
}

// Filtra el directorio por rol. 'ambos' = sin filtrar (se muestran todos,
// con la columna Rol indicando cuál tiene cada uno) — mismo criterio que
// tenía el reporte antes de R5a fixB.
export function filtrarPorRol(filas: FilaContacto[], rol: RolContacto): FilaContacto[] {
  if (rol === 'cliente') return filas.filter(f => f.es_cliente)
  if (rol === 'proveedor') return filas.filter(f => f.es_proveedor)
  return filas
}

export function contactosAoA(filas: FilaContacto[]): (string | number)[][] {
  const head = ['Nombre', 'Rol', 'RTN/Identidad', 'Tipo de cliente', 'Teléfono', 'Correo', 'Dirección', 'Persona de contacto', 'Exonerado', 'Activo']
  const body = filas.map(f => [
    f.nombre,
    rolLabel(f),
    f.rtn || f.identidad || '—',
    f.es_cliente ? tipoClienteLabel(f.tipoCliente) : '—',
    f.telefono || '—',
    f.correo || '—',
    f.direccion || '—',
    f.es_proveedor ? (f.contacto || '—') : '—',
    f.es_cliente ? (f.exonerado ? 'Sí' : 'No') : '—',
    f.activo ? 'Sí' : 'No',
  ])
  return [head, ...body]
}
