import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { obtenerGanancias } from './data'
import { totalesGanancias } from '@/lib/reportes/ganancias'
import GananciasControls from './GananciasControls'
import styles from './ganancias.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

// Iconos decorativos de las cards de totales (mismo estilo trazo que
// app/admin/reportes/page.tsx). Puramente visuales, sin dato propio.
function IconoVentas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}
function IconoCostos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8V21H3V8" /><path d="M1 3h22v5H1z" /><line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}
function IconoGanancia() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

export default async function GananciasPage({ searchParams }: { searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const filas = await obtenerGanancias(rango.desde, rango.hasta)
  const t = totalesGanancias(filas)
  const qs = new URLSearchParams({ preset, ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString()

  return (
    <div className={styles.page}>
      <GananciasControls preset={preset} desde={sp.desde} hasta={sp.hasta} etiqueta={etiquetaRango(preset, rango)} exportHref={`/api/reportes/ganancias/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Ganancias por ítem</h1>
        <div className={styles.totales}>
          <div className={styles.totalCard}>
            <div className={styles.totalHead}>
              <span className={styles.totLabel}>Total ventas</span>
              <span className={styles.totIcono}><IconoVentas /></span>
            </div>
            <span className={styles.totVal}>{formatPrice(t.ventas)}</span>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalHead}>
              <span className={styles.totLabel}>Total costos</span>
              <span className={styles.totIcono}><IconoCostos /></span>
            </div>
            <span className={styles.totVal}>{formatPrice(t.costo)}</span>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalHead}>
              <span className={styles.totLabel}>Total ganancias</span>
              <span className={styles.totIcono}><IconoGanancia /></span>
            </div>
            <span
              className={`${styles.totVal} ${styles.totGanancia} ${t.ganancia > 0 ? styles.positivo : t.ganancia < 0 ? styles.negativo : ''}`}
            >
              {formatPrice(t.ganancia)}
            </span>
            <span className={styles.totMargen}>Margen {t.margen}%</span>
          </div>
        </div>
        <table className={styles.tabla}>
          <thead><tr><th>Código</th><th>Nombre</th><th>Variante</th><th>Categoría</th><th className={styles.num}>Cantidad</th><th className={styles.num}>Ventas</th><th className={styles.num}>Costos</th><th className={styles.num}>Ganancia</th><th className={styles.num}>Ganancia %</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{f.codigo}</td><td>{f.nombre}</td><td>{f.variante}</td><td>{f.categoria}</td>
                <td className={styles.num}>{f.cantidad}</td>
                <td className={styles.num}>{formatPrice(f.ventas)}</td>
                <td className={styles.num}>{formatPrice(f.costo)}</td>
                <td className={`${styles.num} ${f.ganancia > 0 ? styles.positivo : f.ganancia < 0 ? styles.negativo : ''}`}>
                  {formatPrice(f.ganancia)}
                </td>
                <td className={`${styles.num} ${f.margen > 0 ? styles.positivo : f.margen < 0 ? styles.negativo : ''}`}>
                  {f.margen}%
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={9} className={styles.vacio}>Sin ventas en el período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
