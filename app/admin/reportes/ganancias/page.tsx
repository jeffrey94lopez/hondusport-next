import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { obtenerGanancias } from './data'
import { totalesGanancias } from '@/lib/reportes/ganancias'
import GananciasControls from './GananciasControls'
import styles from './ganancias.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

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
          <div><span className={styles.totLabel}>Total ventas</span><span className={styles.totVal}>{formatPrice(t.ventas)}</span></div>
          <div><span className={styles.totLabel}>Total costos</span><span className={styles.totVal}>{formatPrice(t.costo)}</span></div>
          <div><span className={styles.totLabel}>Total ganancias</span><span className={styles.totVal}>{formatPrice(t.ganancia)}</span></div>
          <div><span className={styles.totLabel}>Margen</span><span className={styles.totVal}>{t.margen}%</span></div>
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
                <td className={styles.num}>{formatPrice(f.ganancia)}</td>
                <td className={styles.num}>{f.margen}%</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={9} className={styles.vacio}>Sin ventas en el período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
