import { createClient } from '@/lib/supabase-server'
import type { Cliente, CxpFila } from '@/types'
import { obtenerCxp } from './actions'
import CuentasPorPagarClient from './CuentasPorPagarClient'

export const dynamic = 'force-dynamic'

export default async function CuentasPorPagarPage() {
  const supabase = await createClient()

  const [cxp, { data: proveedores }] = await Promise.all([
    obtenerCxp(),
    supabase
      .from('clientes')
      .select('*')
      .eq('es_proveedor', true)
      .eq('activo', true)
      .order('nombre'),
  ])

  const filas: CxpFila[] = cxp.ok ? cxp.data ?? [] : []

  return (
    <CuentasPorPagarClient
      filas={filas}
      proveedores={(proveedores ?? []) as unknown as Cliente[]}
    />
  )
}
