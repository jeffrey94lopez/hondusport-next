'use client'
import { useRouter } from 'next/navigation'
import type { PresetRango } from '@/types'
import styles from './libro.module.css'

const PRESETS: { v: PresetRango; l: string }[] = [
  { v: 'mes', l: 'Mes' }, { v: 'anio', l: 'Año' }, { v: 'personalizado', l: 'Personalizado' },
]

export default function LibroVentasControls({ preset, desde, hasta, etiqueta, exportHref }: {
  preset: PresetRango; desde?: string; hasta?: string; etiqueta: string; exportHref: string
}) {
  const router = useRouter()
  function ir(next: { preset?: PresetRango; desde?: string; hasta?: string }) {
    const p = new URLSearchParams()
    p.set('preset', next.preset ?? preset)
    const d = next.desde ?? desde, h = next.hasta ?? hasta
    if ((next.preset ?? preset) === 'personalizado') { if (d) p.set('desde', d); if (h) p.set('hasta', h) }
    router.push(`/admin/reportes/libro-ventas?${p.toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.presets}>
        {PRESETS.map(pr => (
          <button key={pr.v} type="button" className={`${styles.presetBtn} ${preset === pr.v ? styles.presetOn : ''}`}
            onClick={() => ir({ preset: pr.v })}>{pr.l}</button>
        ))}
        {preset === 'personalizado' && (
          <span className={styles.rangoLibre}>
            <input type="date" value={desde ?? ''} onChange={e => ir({ preset: 'personalizado', desde: e.target.value, hasta: hasta ?? e.target.value })} />
            <span>a</span>
            <input type="date" value={hasta ?? ''} onChange={e => ir({ preset: 'personalizado', desde: desde ?? e.target.value, hasta: e.target.value })} />
          </span>
        )}
        <span className={styles.etiqueta}>{etiqueta}</span>
      </div>
      <div className={styles.acciones}>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
