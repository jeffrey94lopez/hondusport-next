'use client'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import type { SesionCaja } from '@/types'
import styles from '../pos.module.css'

interface HistorialModalProps {
  sesiones: SesionCaja[]
  onClose: () => void
}

export default function HistorialModal({ sesiones, onClose }: HistorialModalProps) {
  return (
    <Modal title="Sesiones de esta caja" onClose={onClose} maxWidth="640px">
      {sesiones.length === 0 ? (
        <div className={styles.empty}>Aún no hay sesiones cerradas para esta caja.</div>
      ) : (
        <div className={styles.historialList}>
          {sesiones.map(s => {
            const fecha = new Date(s.cerrada_at ?? s.abierta_at).toLocaleString('es-HN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
            const diferencia = s.diferencia ?? 0
            return (
              <div key={s.id} className={styles.historialRow}>
                <div className={styles.historialFecha}>{fecha}</div>
                <div className={styles.historialCol}>
                  <span>Inicial</span>
                  <span>{formatPrice(s.monto_inicial)}</span>
                </div>
                <div className={styles.historialCol}>
                  <span>Esperado</span>
                  <span>{formatPrice(s.monto_esperado ?? 0)}</span>
                </div>
                <div className={styles.historialCol}>
                  <span>Contado</span>
                  <span>{formatPrice(s.monto_contado ?? 0)}</span>
                </div>
                <div
                  className={styles.historialCol}
                  style={{ color: diferencia < 0 ? 'var(--danger)' : diferencia > 0 ? 'var(--success)' : undefined }}
                >
                  <span>Diferencia</span>
                  <span>{formatPrice(diferencia)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
