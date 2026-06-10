import { createClient } from '@/lib/supabase-server'
import PedidosClient from './PedidosClient'

export default async function PedidosPage() {
  const supabase = await createClient()

  const [{ data: pedidos }, { data: config }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, pedido_items(*)')
      .order('created_at', { ascending: false }),
    supabase
      .from('configuracion')
      .select('key, value')
      .in('key', ['whatsapp_principal']),
  ])

  const whatsapp = config?.find(c => c.key === 'whatsapp_principal')?.value ?? ''

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      whatsapp={whatsapp}
    />
  )
}
