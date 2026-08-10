'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PresetRango } from '@/types'
import styles from './dashboard.module.css'

const PRESETS: { valor: PresetRango; label: string }[] = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: 'semana', label: 'Semana' },
  { valor: 'mes', label: 'Mes' },
  { valor: 'anio', label: 'Año' },
  { valor: 'personalizado', label: 'Personalizado' },
]

interface Props { preset: PresetRango; desde?: string; hasta?: string; etiqueta: string }

export default function FiltroFechas({ preset, desde, hasta, etiqueta }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function aplicar(next: Partial<{ preset: PresetRango; desde: string; hasta: string }>) {
    const p = new URLSearchParams(params.toString())
    if (next.preset) p.set('preset', next.preset)
    if (next.desde !== undefined) p.set('desde', next.desde)
    if (next.hasta !== undefined) p.set('hasta', next.hasta)
    if (next.preset && next.preset !== 'personalizado') { p.delete('desde'); p.delete('hasta') }
    router.push(`/admin?${p.toString()}`)
  }

  return (
    <div className={styles.filtro}>
      <div className={styles.presets}>
        {PRESETS.map(pr => (
          <button
            key={pr.valor}
            type="button"
            className={`${styles.presetBtn} ${preset === pr.valor ? styles.presetOn : ''}`}
            onClick={() => aplicar({ preset: pr.valor })}
          >
            {pr.label}
          </button>
        ))}
      </div>
      {preset === 'personalizado' && (
        <div className={styles.rangoLibre}>
          <input type="date" value={desde ?? ''} onChange={e => aplicar({ preset: 'personalizado', desde: e.target.value, hasta: hasta ?? e.target.value })} />
          <span>a</span>
          <input type="date" value={hasta ?? ''} onChange={e => aplicar({ preset: 'personalizado', desde: desde ?? e.target.value, hasta: e.target.value })} />
        </div>
      )}
      <span className={styles.filtroEtiqueta}>{etiqueta}</span>
    </div>
  )
}
