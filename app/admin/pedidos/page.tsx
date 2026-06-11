import { createClient } from '@/lib/supabase-server'
import PedidosClient from './PedidosClient'

export default async function PedidosPage() {
  const supabase = await createClient()
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, pedido_items(*)')
    .order('created_at', { ascending: false })
    .limit(200)

  return <PedidosClient pedidos={pedidos ?? []} />
}
