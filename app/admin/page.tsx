import { obtenerDashboardData } from './dashboard-data'
import { etiquetaRango } from '@/lib/dashboard/rango'
import { ticketPromedio } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import FiltroFechas from './FiltroFechas'
import DashboardGraficos from './DashboardGraficos'
import Link from 'next/link'
import styles from './dashboard.module.css'

const PRESETS_VALIDOS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }>
}) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS_VALIDOS.includes(sp.preset as PresetRango)
    ? (sp.preset as PresetRango) : 'semana'
  const data = await obtenerDashboardData(preset, sp.desde, sp.hasta)
  const { resumen, stockBajo } = data
  const ticket = ticketPromedio(resumen.ventas_netas, resumen.num_documentos)

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Inicio</h1>
      </div>

      <FiltroFechas preset={preset} desde={sp.desde} hasta={sp.hasta} etiqueta={etiquetaRango(preset, data.rango)} />

      <h2 className={styles.filaTitulo}>En el rango</h2>
      <div className={styles.stats}>
        <Kpi num={formatPrice(resumen.ventas_netas)} label="Ventas netas (POS)" />
        <Kpi num={String(resumen.num_documentos)} label="Documentos" />
        <Kpi num={formatPrice(ticket)} label="Ticket promedio" />
        <Kpi num={String(resumen.pedidos_web)} label="Pedidos web" badge={resumen.pedidos_sin_procesar} badgeLabel="sin procesar" alert={resumen.pedidos_sin_procesar > 0} />
      </div>

      <h2 className={styles.filaTitulo}>Ahora mismo</h2>
      <div className={styles.stats}>
        <Kpi num={formatPrice(resumen.cxc_pendiente)} label="Por cobrar (CxC)" />
        <Kpi num={formatPrice(resumen.cxp_pendiente)} label="Por pagar (CxP)" />
        <Kpi num={`${resumen.cotizaciones_abiertas} · ${formatPrice(resumen.cotizaciones_monto)}`} label="Cotizaciones abiertas" />
        <Kpi num={String(stockBajo)} label="Stock bajo (<5)" warn={stockBajo > 0} />
      </div>

      <DashboardGraficos
        ventasPorDia={data.ventasPorDia}
        topItems={data.topItems}
        topClientes={data.topClientes}
      />

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Últimos documentos</h2>
        <div className={styles.pedidosList}>
          {data.ultimosDocumentos.map(d => (
            <Link key={d.id} href={`/admin/pos/documento/${d.id}`} className={styles.pedidoRow}>
              <span className={styles.pedidoNum}>{d.numero}</span>
              <span className={styles.pedidoCliente}>{d.cliente_nombre}</span>
              <span className={styles.pedidoTotal}>{formatPrice(d.total)}</span>
              <span className={styles.pedidoEstado}>{d.tipo === 'factura' ? 'Factura' : 'Comprobante'}</span>
              <span className={styles.pedidoFecha}>
                {new Date(d.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </Link>
          ))}
          {data.ultimosDocumentos.length === 0 && <div className={styles.empty}>Sin documentos aún.</div>}
        </div>
      </div>
    </div>
  )
}

function Kpi({ num, label, badge, badgeLabel, alert, warn }: {
  num: string; label: string; badge?: number; badgeLabel?: string; alert?: boolean; warn?: boolean
}) {
  return (
    <div className={`${styles.stat} ${alert ? styles.statAlert : ''} ${warn ? styles.statWarn : ''}`}>
      <div className={styles.statNum}>{num}</div>
      <div className={styles.statLabel}>
        {label}
        {badge != null && badge > 0 && <span className={styles.kpiBadge}> · {badge} {badgeLabel}</span>}
      </div>
    </div>
  )
}
