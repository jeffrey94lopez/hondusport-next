import { obtenerDashboardData } from './dashboard-data'
import { etiquetaRango } from '@/lib/dashboard/rango'
import { ticketPromedio, utilidadNeta, margen } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import FiltroFechas from './FiltroFechas'
import DashboardGraficos from './DashboardGraficos'
import KpiSegmento from './KpiSegmento'
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
  const ticket = ticketPromedio(resumen.ventas_sin_isv, resumen.num_documentos)
  const utilidad = utilidadNeta(resumen.ventas_sin_isv, resumen.costo_ventas)
  const pctMargen = margen(resumen.ventas_sin_isv, utilidad)

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Inicio</h1>
        <FiltroFechas preset={preset} desde={sp.desde} hasta={sp.hasta} etiqueta={etiquetaRango(preset, data.rango)} />
      </div>

      <div className={styles.segmentos}>
        <KpiSegmento icon="ventas" titulo="Ventas" metricas={[
          { label: 'Ventas (sin ISV)', valor: formatPrice(resumen.ventas_sin_isv) },
          { label: 'Costo de ventas', valor: formatPrice(resumen.costo_ventas) },
          { label: `Utilidad neta (${pctMargen}%)`, valor: formatPrice(utilidad), alerta: utilidad < 0, bien: utilidad >= 0 },
          { label: 'Ticket promedio', valor: formatPrice(ticket) },
        ]} />
        <KpiSegmento icon="documentos" titulo="Documentos" metricas={[
          { label: 'Total', valor: String(resumen.num_documentos) },
          { label: 'Facturas', valor: String(resumen.facturas) },
          { label: 'Comprobantes', valor: String(resumen.comprobantes) },
          { label: 'Pedidos web', valor: String(resumen.pedidos_web) },
          ...(resumen.pedidos_sin_procesar > 0
            ? [{ label: 'Sin procesar', valor: String(resumen.pedidos_sin_procesar), alerta: true }]
            : []),
        ]} />
        <KpiSegmento icon="cotizaciones" titulo="Cotizaciones" metricas={[
          { label: 'Abiertas', valor: String(resumen.cotizaciones_abiertas) },
          { label: 'Ganadas', valor: String(resumen.cotizaciones_ganadas), bien: true },
          { label: 'Perdidas', valor: String(resumen.cotizaciones_perdidas), alerta: true },
        ]} />
        <KpiSegmento icon="cxc" titulo="Cuentas por cobrar" metricas={[
          { label: 'Crédito nuevo', valor: formatPrice(resumen.cxc_nuevo) },
          { label: 'Cobrado', valor: formatPrice(resumen.cxc_cobrado), bien: true },
          { label: 'Acumulado', valor: formatPrice(resumen.cxc_pendiente) },
        ]} />
        <KpiSegmento icon="cxp" titulo="Cuentas por pagar" metricas={[
          { label: 'Crédito nuevo', valor: formatPrice(resumen.cxp_nuevo) },
          { label: 'Pagado', valor: formatPrice(resumen.cxp_pagado), bien: true },
          { label: 'Acumulado', valor: formatPrice(resumen.cxp_pendiente) },
        ]} />
        <KpiSegmento icon="productos" titulo="Ítems" metricas={[
          { label: 'Stock bajo (<5)', valor: String(stockBajo), alerta: stockBajo > 0 },
          { label: 'Ítems nuevos', valor: String(resumen.productos_nuevos) },
        ]} />
      </div>

      <DashboardGraficos
        ventasPorDia={data.ventasPorDia}
        topItems={data.topItems}
        topClientes={data.topClientes}
      />

      <div className={`${styles.section} ${styles.ultimos}`}>
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
