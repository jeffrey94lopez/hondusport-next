import { ICONOS, type IconoKey } from '@/components/admin/icons'
import styles from './dashboard.module.css'

interface Metrica {
  label: string
  valor: string
  alerta?: boolean
}

interface Props {
  icon: IconoKey
  titulo: string
  metricas: Metrica[]
}

export default function KpiSegmento({ icon, titulo, metricas }: Props) {
  const Icono = ICONOS[icon]
  return (
    <div className={styles.segmento}>
      <div className={styles.segmentoHead}>
        <span className={styles.segmentoIcon}><Icono className="iconoMerlin" /></span>
        {titulo}
      </div>
      <div className={styles.segmentoMetricas}>
        {metricas.map(m => (
          <div key={m.label} className={`${styles.segMetrica} ${m.alerta ? styles.segAlerta : ''}`}>
            <div className={styles.segValor}>{m.valor}</div>
            <div className={styles.segLabel}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
