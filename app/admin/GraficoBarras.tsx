'use client'
import Link from 'next/link'
import { maxValor, ordenarPorMetrica } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import styles from './graficos.module.css'

interface FilaBarra { nombre: string; monto: number; cantidad: number; href?: string }

interface Props {
  filas: FilaBarra[]
  metrica: 'monto' | 'cantidad'
  onMetrica: (m: 'monto' | 'cantidad') => void
}

export default function GraficoBarras({ filas, metrica, onMetrica }: Props) {
  const ordenadas = ordenarPorMetrica(filas, metrica)
  const max = maxValor(ordenadas, f => f[metrica])

  return (
    <div className={styles.barras}>
      <div className={styles.toggle}>
        <button type="button" className={metrica === 'monto' ? styles.toggleOn : ''} onClick={() => onMetrica('monto')}>L.</button>
        <button type="button" className={metrica === 'cantidad' ? styles.toggleOn : ''} onClick={() => onMetrica('cantidad')}>Uds.</button>
      </div>
      {ordenadas.length === 0 && <div className={styles.vacio}>Sin datos en el rango.</div>}
      {ordenadas.map((f, i) => {
        const valor = f[metrica]
        const pct = Math.max(2, (valor / max) * 100)
        const etiqueta = metrica === 'monto' ? formatPrice(f.monto) : `${f.cantidad}`
        return (
          <div key={`${f.nombre}-${i}`} className={styles.fila}>
            <span className={styles.nombre} title={f.nombre}>
              {f.href ? <Link href={f.href}>{f.nombre}</Link> : f.nombre}
            </span>
            <span className={styles.pista}>
              <span className={styles.relleno} style={{ width: `${pct}%` }} />
            </span>
            <span className={styles.valor}>{etiqueta}</span>
          </div>
        )
      })}
    </div>
  )
}
