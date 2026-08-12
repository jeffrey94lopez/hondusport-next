import { ICONOS, type IconoKey } from '@/components/admin/icons'
import styles from './dashboard.module.css'

interface Metrica {
  label: string
  valor: string
  alerta?: boolean
  bien?: boolean
}

interface Props {
  icon: IconoKey
  titulo: string
  metricas: Metrica[]
}

export default function KpiSegmento({ icon, titulo, metricas }: Props) {
  const Icono = ICONOS[icon]
  // La card "Ítems" usa banners de alerta (stock bajo) en vez del patrón
  // número grande + fila de sub-métricas; ver .segmentoItems en dashboard.module.css.
  const cardClass = icon === 'productos' ? `${styles.segmento} ${styles.segmentoItems}` : styles.segmento
  return (
    <div className={cardClass}>
      <div className={styles.segmentoHead}>
        <span className={styles.segmentoIcon}><Icono className="iconoMerlin" /></span>
        {titulo}
      </div>
      <div className={styles.segmentoMetricas}>
        {metricas.map(m => (
          <div
            key={m.label}
            className={`${styles.segMetrica} ${m.alerta ? styles.segAlerta : ''} ${m.bien ? styles.segBien : ''}`}
          >
            <div className={styles.segValor}>{m.valor}</div>
            <div className={styles.segLabel}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
