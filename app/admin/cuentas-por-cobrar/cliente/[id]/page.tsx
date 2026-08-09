import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Cliente } from '@/types'
import { obtenerEstadoCuentaCliente } from '../../actions'
import EstadoCuentaClienteView from './EstadoCuentaClienteView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Estado de cuenta de un cliente: relee sus documentos con saldo + sus cobros
// (obtenerEstadoCuentaCliente), sus datos (clientes) y la config de
// empresa/logo (para la hoja imprimible). Si el cliente no existe o no es
// cliente, o la consulta falla, 404 — mismo criterio que
// app/admin/cuentas-por-pagar/proveedor/[id]/page.tsx (CxP, espejo).
export default async function EstadoCuentaClientePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [estado, { data: cliente }, { data: config }] = await Promise.all([
    obtenerEstadoCuentaCliente(id),
    supabase.from('clientes').select('*').eq('id', id).eq('es_cliente', true).maybeSingle(),
    supabase.from('configuracion').select('key, value'),
  ])

  if (!estado.ok || !estado.data || !cliente) notFound()

  return (
    <EstadoCuentaClienteView
      cliente={cliente as unknown as Cliente}
      documentos={estado.data.documentos}
      cobros={estado.data.cobros}
      totalAdeudado={estado.data.totalAdeudado}
      config={toConfigMap(config ?? [])}
    />
  )
}
