import { createClient } from '@/lib/supabase-server'
import { filaContacto, filtrarPorRol } from '@/lib/reportes/contactos'
import type { EstadoContacto, FilaContacto, RolContacto } from '@/types'

// R5a fixB: directorio de clientes/proveedores — datos de contacto del
// formulario real (app/admin/clientes/ClientesClient.tsx), sin montos de
// ventas/compras/saldos (eso vive en los reportes de ventas/cxc/cxp). Ya no
// es "a un rango de fechas": es la lista vigente en `clientes`.
// R5a fixC: + filtro de estado ('todos'/'activos'/'inactivos'); al ser un
// simple .eq() sobre la columna `activo`, se aplica aquí en la consulta y no
// amerita función pura aparte en lib/reportes/contactos.ts.
export async function obtenerContactos(rol: RolContacto, estado: EstadoContacto = 'todos'): Promise<FilaContacto[]> {
  const supabase = await createClient()
  let query = supabase
    .from('clientes')
    .select('id, nombre, rtn, identidad, tipo_cliente, exonerado, telefono, correo, direccion, contacto, es_cliente, es_proveedor, activo')
  if (estado === 'activos') query = query.eq('activo', true)
  if (estado === 'inactivos') query = query.eq('activo', false)
  const { data, error } = await query.order('nombre').limit(5000)
  if (error) console.error('[contactos] error:', error.message)
  const filas = (data ?? []).map(filaContacto)
  return filtrarPorRol(filas, rol)
}
