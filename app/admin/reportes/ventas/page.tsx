import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { Fragment } from 'react'
import { obtenerReporteVentas, obtenerOpcionesFiltro, parseFiltros } from './data'
import { tipoDocLabel } from '@/lib/reportes/ventas'
import { fechaHN } from '@/lib/reportes/fecha'
import VentasControls from './VentasControls'
import styles from './ventas.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function VentasReportePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const usp = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][])
  const filtros = parseFiltros(usp, rango.desde, rango.hasta)
  const detallado = sp.detallado === '1'

  const [filas, opciones] = await Promise.all([obtenerReporteVentas(filtros), obtenerOpcionesFiltro()])
  const qs = usp.toString()

  return (
    <div className={styles.page}>
      <VentasControls sp={sp} preset={preset} etiqueta={etiquetaRango(preset, rango)}
        opciones={opciones} detallado={detallado} exportHref={`/api/reportes/ventas/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Reporte de ventas</h1>
        <p className={styles.periodo}>{etiquetaRango(preset, rango)} · {filas.length} documento(s)</p>
        <table className={styles.tabla}>
          <thead>
            <tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Caja</th><th>Tipo</th><th className={styles.num}>Total</th></tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const esNota = f.tipo === 'nota_credito' || f.tipo === 'devolucion'
              return (
              <Fragment key={f.id}>
                <tr>
                  <td>{f.numero}</td><td>{fechaHN(f.fecha)}</td><td>{f.cliente}</td>
                  <td>{f.vendedor}</td><td>{f.caja}</td><td>{tipoDocLabel(f.tipo)}</td>
                  <td className={`${styles.num} ${esNota ? styles.negativo : ''}`}>{formatPrice(f.total)}</td>
                </tr>
                {detallado && f.items.map((it, j) => (
                  <tr key={`${f.id}-${j}`} className={styles.filaItem}>
                    <td></td><td colSpan={4}>{it.descripcion}</td>
                    <td>{it.cantidad} × {formatPrice(it.precio)}</td>
                    <td className={styles.num}>{formatPrice(it.importe)}</td>
                  </tr>
                ))}
              </Fragment>
              )
            })}
            {filas.length === 0 && <tr><td colSpan={7} className={styles.vacio}>Sin documentos para los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
