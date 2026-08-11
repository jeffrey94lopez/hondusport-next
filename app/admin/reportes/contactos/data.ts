import { createClient } from '@/lib/supabase-server'
import { filaContacto } from '@/lib/reportes/contactos'
import type { FilaContacto, RolContacto } from '@/types'

export async function obtenerContactos(desde: string, hasta: string, rol: RolContacto): Promise<FilaContacto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reporte_contactos', { p_desde: desde, p_hasta: hasta })
  if (error) console.error('[contactos] error:', error.message)
  let filas: FilaContacto[] = (data ?? []).map(filaContacto)
  // Solo contactos con actividad o saldo (no listar inertes).
  filas = filas.filter(f => f.total_ventas !== 0 || f.total_compras !== 0 || f.saldo_cxc !== 0 || f.saldo_cxp !== 0)
  if (rol === 'cliente') filas = filas.filter(f => f.es_cliente)
  else if (rol === 'proveedor') filas = filas.filter(f => f.es_proveedor)
  filas.sort((a, b) => (rol === 'proveedor' ? b.total_compras - a.total_compras : b.total_ventas - a.total_ventas))
  return filas
}
