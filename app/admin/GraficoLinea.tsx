'use client'
import { maxValor } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import styles from './graficos.module.css'

interface Props { puntos: { dia: string; ventas: number }[] }

export default function GraficoLinea({ puntos }: Props) {
  const max = maxValor(puntos, p => p.ventas)
  if (puntos.length === 0) return <div className={styles.vacio}>Sin datos en el rango.</div>

  return (
    <div className={styles.linea}>
      {puntos.map(p => {
        const pct = Math.max(1, (p.ventas / max) * 100)
        const etiquetaDia = p.dia.slice(8) // 'DD'
        return (
          <div key={p.dia} className={styles.columna} title={`${p.dia}: ${formatPrice(p.ventas)}`}>
            <span className={styles.columnaPista}>
              <span className={styles.columnaRelleno} style={{ height: `${pct}%` }} />
            </span>
            <span className={styles.columnaDia}>{etiquetaDia}</span>
          </div>
        )
      })}
    </div>
  )
}
