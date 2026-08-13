import { createClient } from '@/lib/supabase-server'
import { filaContacto, filtrarPorRol } from '@/lib/reportes/contactos'
import type { FilaContacto, RolContacto } from '@/types'

// R5a fixB: directorio de clientes/proveedores — datos de contacto del
// formulario real (app/admin/clientes/ClientesClient.tsx), sin montos de
// ventas/compras/saldos (eso vive en los reportes de ventas/cxc/cxp). Ya no
// es "a un rango de fechas": es la lista vigente en `clientes`.
export async function obtenerContactos(rol: RolContacto): Promise<FilaContacto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, rtn, identidad, tipo_cliente, exonerado, telefono, correo, direccion, contacto, es_cliente, es_proveedor, activo')
    .order('nombre')
    .limit(5000)
  if (error) console.error('[contactos] error:', error.message)
  const filas = (data ?? []).map(filaContacto)
  return filtrarPorRol(filas, rol)
}
