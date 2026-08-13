import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { obtenerLibroVentas } from './data'
import { filaLibro, totalesLibro, tipoLibroLabel } from '@/lib/reportes/libro-ventas'
import { fechaHN } from '@/lib/reportes/fecha'
import LibroVentasControls from './LibroVentasControls'
import styles from './libro.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function LibroVentasPage({
  searchParams,
}: { searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const docs = await obtenerLibroVentas(rango.desde, rango.hasta)
  const filas = docs.map(filaLibro)
  const totales = totalesLibro(filas)
  const qs = new URLSearchParams({ preset, ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString()

  return (
    <div className={styles.page}>
      <LibroVentasControls preset={preset} desde={sp.desde} hasta={sp.hasta}
        etiqueta={etiquetaRango(preset, rango)} exportHref={`/api/reportes/libro-ventas/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Libro de ventas</h1>
        <p className={styles.periodo}>{etiquetaRango(preset, rango)}</p>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th><th>Correlativo</th><th>Tipo</th><th>CAI</th><th>Cliente</th><th>RTN</th>
              <th>Exento</th><th>Exonerado</th><th>Gravado 15%</th><th>ISV 15%</th>
              <th>Gravado 18%</th><th>ISV 18%</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className={f.esNota ? styles.filaNota : ''}>
                <td>{fechaHN(f.fecha)}</td><td>{f.correlativo}</td>
                <td>
                  <span className={`${styles.badge} ${f.esNota ? styles.badgeNota : styles.badgeFactura}`}>
                    {tipoLibroLabel(f.esNota)}
                  </span>
                </td>
                <td>{f.cai}</td>
                <td>{f.cliente}</td><td>{f.rtn}</td>
                <td className={styles.num}>{formatPrice(f.exento)}</td>
                <td className={styles.num}>{formatPrice(f.exonerado)}</td>
                <td className={styles.num}>{formatPrice(f.gravado15)}</td>
                <td className={styles.num}>{formatPrice(f.isv15)}</td>
                <td className={styles.num}>{formatPrice(f.gravado18)}</td>
                <td className={styles.num}>{formatPrice(f.isv18)}</td>
                <td className={styles.num}>{formatPrice(f.total)}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={13} className={styles.vacio}>Sin documentos fiscales en el período.</td></tr>}
          </tbody>
          <tfoot>
            <tr className={styles.totales}>
              <td colSpan={6}>TOTALES</td>
              <td className={styles.num}>{formatPrice(totales.exento)}</td>
              <td className={styles.num}>{formatPrice(totales.exonerado)}</td>
              <td className={styles.num}>{formatPrice(totales.gravado15)}</td>
              <td className={styles.num}>{formatPrice(totales.isv15)}</td>
              <td className={styles.num}>{formatPrice(totales.gravado18)}</td>
              <td className={styles.num}>{formatPrice(totales.isv18)}</td>
              <td className={styles.num}>{formatPrice(totales.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
