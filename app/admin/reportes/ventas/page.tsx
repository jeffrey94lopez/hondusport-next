import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango, PagoDocumentoVenta } from '@/types'
import { Fragment } from 'react'
import { obtenerReporteVentas, obtenerOpcionesFiltro, obtenerPagosDocumentos, parseFiltros } from './data'
import { tipoDocLabel, resumenPorMetodo, conteoPorTipo, resumenNotasCredito } from '@/lib/reportes/ventas'
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

  // Cards de resumen al pie (R5a fixB): mismo conjunto de documentos ya
  // filtrado por la tabla — se traen los pagos de esos documentos y se
  // agrega con las funciones puras de lib/reportes/ventas.ts.
  const tipoPorId = new Map(filas.map(f => [f.id, f.tipo]))
  const pagosRaw = await obtenerPagosDocumentos(filas.map(f => f.id))
  const pagos: PagoDocumentoVenta[] = pagosRaw.map(p => ({
    ...p, tipoDocumento: tipoPorId.get(p.documentoId) ?? 'comprobante',
  }))
  const porMetodo = resumenPorMetodo(pagos)
  const porTipo = conteoPorTipo(filas)
  const notas = resumenNotasCredito(filas)

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

      <div className={styles.resumen}>
        <div className={styles.resumenCard}>
          <h2 className={styles.resumenTitulo}>Resumen por método de pago</h2>
          {porMetodo.length === 0 ? (
            <p className={styles.resumenVacio}>Sin pagos registrados en el período.</p>
          ) : (
            <table className={styles.resumenTabla}>
              <thead><tr><th>Método</th><th className={styles.num}>Documentos</th><th className={styles.num}>Monto</th></tr></thead>
              <tbody>
                {porMetodo.map(m => (
                  <tr key={m.metodo}>
                    <td>{m.metodo}</td>
                    <td className={styles.num}>{m.documentos}</td>
                    <td className={styles.num}>{formatPrice(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.resumenCard}>
          <h2 className={styles.resumenTitulo}>Documentos por tipo</h2>
          {porTipo.length === 0 ? (
            <p className={styles.resumenVacio}>Sin documentos en el período.</p>
          ) : (
            <table className={styles.resumenTabla}>
              <thead><tr><th>Tipo</th><th className={styles.num}>Cantidad</th></tr></thead>
              <tbody>
                {porTipo.map(t => (
                  <tr key={t.tipo}>
                    <td>{tipoDocLabel(t.tipo)}</td>
                    <td className={styles.num}>{t.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {notas.cantidad > 0 && (
          <div className={`${styles.resumenCard} ${styles.resumenCardAlerta}`}>
            <h2 className={styles.resumenTitulo}>Devoluciones y notas de crédito</h2>
            <p className={styles.resumenDestacado}>
              <span className={styles.negativo}>{notas.cantidad}</span> documento(s) ·{' '}
              <span className={styles.negativo}>{formatPrice(notas.monto)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
