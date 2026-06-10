import { createClient } from '@/lib/supabase-server'
import Sidebar from '@/components/admin/Sidebar'
import styles from './layout.module.css'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { count } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'recibido')

  return (
    <div className={styles.shell}>
      <Sidebar pendingOrders={count ?? 0} />
      <div className={styles.content}>{children}</div>
    </div>
  )
}
