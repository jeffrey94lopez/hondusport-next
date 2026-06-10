import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import styles from './dashboard.module.css'

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    { count: pedidosHoy },
    { count: pendientes },
    { count: productos },
    { data: ventasData },
    { data: stockBajo },
    { data: ultimosPedidos },
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString()),
    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'recibido'),
    supabase
      .from('productos')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true),
    supabase
      .from('pedidos')
      .select('total')
      .gte('created_at', today.toISOString()),
    supabase
      .from('productos')
      .select('id, nombre, stock, marca')
      .lt('stock', 5)
      .not('stock', 'is', null)
      .eq('activo', true)
      .order('stock')
      .limit(10),
    supabase
      .from('pedidos')
      .select('id, numero, nombre_cliente, total, estado, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const ventasHoy = (ventasData ?? []).reduce(
    (sum, p) => sum + (p.total ?? 0),
    0
  )

  const stockBajoList = stockBajo ?? []
  const pedidosList = ultimosPedidos ?? []

  function formatFecha(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('es-HN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const estadoLabel: Record<string, string> = {
    recibido: 'Recibido',
    preparando: 'Preparando',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      {/* ── Stat cards ──────────────────────────────── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pedidos hoy</span>
          <span className={styles.statValue}>{pedidosHoy ?? 0}</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pendientes</span>
          <span
            className={
              (pendientes ?? 0) > 0 ? styles.statValueAlert : styles.statValue
            }
          >
            {pendientes ?? 0}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Productos activos</span>
          <span className={styles.statValue}>{productos ?? 0}</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Ventas hoy</span>
          <span className={styles.statValue}>
            L.&nbsp;{ventasHoy.toLocaleString('es-HN')}
          </span>
        </div>
      </div>

      {/* ── Stock bajo ──────────────────────────────── */}
      {stockBajoList.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>&#9888; Stock bajo</div>
          <table className={styles.alertTable}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {stockBajoList.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.marca ?? '—'}</td>
                  <td>
                    <span
                      className={
                        (p.stock ?? 0) < 3
                          ? styles.stockCritical
                          : styles.stockWarn
                      }
                    >
                      {p.stock}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Últimos pedidos ─────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Últimos pedidos</div>
        <table className={styles.recentTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {pedidosList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  Sin pedidos aún
                </td>
              </tr>
            ) : (
              pedidosList.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={styles.pedidoNum}>#{p.numero}</span>
                  </td>
                  <td>{p.nombre_cliente}</td>
                  <td className={styles.totalCell}>
                    L.&nbsp;{(p.total ?? 0).toLocaleString('es-HN')}
                  </td>
                  <td>
                    <span
                      className={`${styles.estadoBadge} ${
                        styles[`estado_${p.estado}` as keyof typeof styles] ?? ''
                      }`}
                    >
                      {estadoLabel[p.estado] ?? p.estado}
                    </span>
                  </td>
                  <td className={styles.fechaCell}>
                    {formatFecha(p.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className={styles.tableFooter}>
          <Link href="/admin/pedidos" className={styles.viewAllLink}>
            Ver todos los pedidos &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
