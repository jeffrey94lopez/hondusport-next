import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Cliente } from '@/types'
import { obtenerEstadoCuenta } from '../../actions'
import EstadoCuentaView from './EstadoCuentaView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Estado de cuenta de un proveedor: relee sus compras al crédito con saldo +
// sus pagos (obtenerEstadoCuenta), sus datos (clientes) y la config de
// empresa/logo (para la hoja imprimible). Si el proveedor no existe o no es
// proveedor, o la consulta falla, 404 — mismo criterio que
// app/admin/compras/[id]/orden/page.tsx.
export default async function EstadoCuentaPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [estado, { data: proveedor }, { data: config }] = await Promise.all([
    obtenerEstadoCuenta(id),
    supabase.from('clientes').select('*').eq('id', id).eq('es_proveedor', true).maybeSingle(),
    supabase.from('configuracion').select('key, value'),
  ])

  if (!estado.ok || !estado.data || !proveedor) notFound()

  return (
    <EstadoCuentaView
      proveedor={proveedor as unknown as Cliente}
      compras={estado.data.compras}
      pagos={estado.data.pagos}
      totalAdeudado={estado.data.totalAdeudado}
      config={toConfigMap(config ?? [])}
    />
  )
}
