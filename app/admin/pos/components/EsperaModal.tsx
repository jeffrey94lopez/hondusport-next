'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '@/components/admin/Modal'
import type { VentaEspera } from '@/types'
import styles from '../pos.module.css'

interface EsperaModalProps {
  esperas: VentaEspera[]
  carritoVacio: boolean
  isPending: boolean
  error: string
  onGuardar: (nombre: string) => void
  onRetomar: (espera: VentaEspera) => void
  onDescartar: (id: string) => void
  onClose: () => void
}

export default function EsperaModal({ esperas, carritoVacio, isPending, error, onGuardar, onRetomar, onDescartar, onClose }: EsperaModalProps) {
  const [nombre, setNombre] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // No se limpia `nombre` aquí: si `onGuardar` falla, el modal permanece
    // abierto (el padre solo actualiza `error`) y el usuario no debería tener
    // que re-escribirlo. Si tiene éxito, el padre cierra este modal
    // (`esperaAbierta` pasa a `false`), lo desmonta, y el estado local se
    // descarta solo — no hace falta limpiarlo a mano.
    onGuardar(nombre)
  }

  return (
    <Modal title="Ventas en espera" onClose={onClose}>
      <div className={styles.esperaModal}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.formLabel}>
            Guardar carrito actual en espera
            <input
              type="text"
              placeholder="Nombre del cliente o referencia"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              disabled={isPending || carritoVacio}
              autoFocus={!carritoVacio}
            />
          </label>
          {carritoVacio && (
            <div className={styles.empty}>Agrega productos al carrito para poder guardarlo en espera.</div>
          )}
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formFooter}>
            <button
              type="submit"
              className={`btnMerlinPrimary ${styles.btnSubmit}`}
              disabled={isPending || carritoVacio || !nombre.trim()}
            >
              {isPending ? 'Guardando...' : 'Guardar en espera'}
            </button>
          </div>
        </form>

        <div>
          <div className={styles.esperaListTitle}>Esperas de esta caja</div>
          {esperas.length === 0 ? (
            <div className={styles.empty}>No hay ventas en espera.</div>
          ) : (
            <div className={styles.esperaList}>
              {esperas.map(e => (
                <div key={e.id} className={styles.esperaRow}>
                  <div>
                    <div className={styles.esperaNombre}>{e.nombre}</div>
                    <div className={styles.esperaFecha}>
                      {new Date(e.created_at).toLocaleString('es-HN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className={styles.esperaAcciones}>
                    <button type="button" className={styles.btnCancel} onClick={() => onRetomar(e)} disabled={isPending}>
                      Retomar
                    </button>
                    <button
                      type="button"
                      className={styles.btnQuitar}
                      onClick={() => onDescartar(e.id)}
                      disabled={isPending}
                      aria-label="Descartar espera"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
