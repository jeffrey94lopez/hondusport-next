import { createClient } from '@/lib/supabase-server'
import styles from './dashboard.module.css'
import type { EstadoPedido } from '@/types'

interface PedidoReciente {
  id: string
  numero: number
  nombre_cliente: string
  total: number
  estado: EstadoPedido
  created_at: string
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [
    { count: totalPedidosHoy },
    { count: pedidosPendientes },
    { count: totalProductos },
    { count: stockBajo },
    { data: pedidosRecientes },
    ventasHoyResult,
  ] = await Promise.all([
    supabase.from('pedidos').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'recibido'),
    supabase.from('productos').select('*', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('productos').select('*', { count: 'exact', head: true }).not('stock', 'is', null).lt('stock', 5).eq('activo', true),
    supabase.from('pedidos').select('id, numero, nombre_cliente, total, estado, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('pedidos').select('total').gte('created_at', todayISO),
  ])

  const ventasHoy = (ventasHoyResult.data ?? []).reduce((sum, p) => sum + (p.total ?? 0), 0)

  const ESTADO_COLOR: Record<string, string> = {
    recibido: '#3b8fed',
    preparando: '#f59e0b',
    enviado: '#8b5cf6',
    entregado: '#5bbf6b',
    cancelado: '#e05555',
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Dashboard</h1>
        <span className={styles.date}>
          {new Date().toLocaleDateString('es-HN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statNum}>{totalPedidosHoy ?? 0}</div>
          <div className={styles.statLabel}>Pedidos hoy</div>
        </div>
        <div className={`${styles.stat} ${(pedidosPendientes ?? 0) > 0 ? styles.statAlert : ''}`}>
          <div className={styles.statNum}>{pedidosPendientes ?? 0}</div>
          <div className={styles.statLabel}>Sin procesar</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>L. {ventasHoy.toLocaleString()}</div>
          <div className={styles.statLabel}>Ventas hoy</div>
        </div>
        <div className={`${styles.stat} ${(stockBajo ?? 0) > 0 ? styles.statWarn : ''}`}>
          <div className={styles.statNum}>{stockBajo ?? 0}</div>
          <div className={styles.statLabel}>Stock bajo (&lt;5)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>{totalProductos ?? 0}</div>
          <div className={styles.statLabel}>Productos activos</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Últimos pedidos</h2>
        <div className={styles.pedidosList}>
          {(pedidosRecientes ?? []).map((p: PedidoReciente) => (
            <div key={p.id} className={styles.pedidoRow}>
              <span className={styles.pedidoNum}>#{p.numero}</span>
              <span className={styles.pedidoCliente}>{p.nombre_cliente}</span>
              <span className={styles.pedidoTotal}>L. {p.total.toLocaleString()}</span>
              <span
                className={styles.pedidoEstado}
                style={{ color: ESTADO_COLOR[p.estado] }}
              >
                {p.estado}
              </span>
              <span className={styles.pedidoFecha}>
                {new Date(p.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {!pedidosRecientes?.length && (
            <div className={styles.empty}>No hay pedidos hoy aún.</div>
          )}
        </div>
      </div>
    </div>
  )
}
