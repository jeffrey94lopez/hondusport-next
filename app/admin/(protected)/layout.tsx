import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Sidebar from '@/components/admin/Sidebar'
import styles from './layout.module.css'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const hasSession = cookieStore.getAll().some(
    c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  )

  if (!hasSession) {
    redirect('/admin/login')
  }

  let pendingCount = 0
  try {
    const supabase = await createClient()
    const { count } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'recibido')
    pendingCount = count ?? 0
  } catch {}

  return (
    <div className={styles.shell}>
      <Sidebar pendingOrders={pendingCount} />
      <div className={styles.content}>{children}</div>
    </div>
  )
}
