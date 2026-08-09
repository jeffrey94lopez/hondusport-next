'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import { recibirCompra } from '../actions'
import type { CompraItem } from '@/types'
import styles from '../compras.module.css'

interface Props {
  compraId: string
  items: CompraItem[]
  onClose: () => void
  onRecibido: () => void
}

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

// Estado editable de cada línea: el texto crudo del input (para no reescribir
// mientras el usuario teclea) más los datos fijos de la línea.
interface FilaRecepcion {
  compraItemId: string
  descripcion: string
  pendiente: number
  texto: string
}

export default function RecepcionModal({ compraId, items, onClose, onRecibido }: Props) {
  const [filas, setFilas] = useState<FilaRecepcion[]>(() =>
    items.map(it => {
      const pendiente = Math.max(0, it.cantidad_ordenada - it.cantidad_recibida)
      return {
        compraItemId: it.id,
        descripcion: it.descripcion,
        pendiente,
        // Default = pendiente; las líneas ya completas arrancan en 0.
        texto: pendiente > 0 ? String(pendiente) : '0',
      }
    }),
  )
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function cambiarCantidad(compraItemId: string, valor: string) {
    setFilas(prev =>
      prev.map(f => {
        if (f.compraItemId !== compraItemId) return f
        // Entero ≥ 0, tope = pendiente.
        const n = Math.floor(Number(valor))
        if (valor === '') return { ...f, texto: '' }
        if (!Number.isFinite(n)) return f
        const clamped = Math.max(0, Math.min(n, f.pendiente))
        return { ...f, texto: String(clamped) }
      }),
    )
  }

  function handleConfirmar() {
    const recepciones = filas
      .map(f => ({ compraItemId: f.compraItemId, cantidad: Math.floor(Number(f.texto) || 0) }))
      .filter(r => r.cantidad > 0)

    if (recepciones.length === 0) {
      setError('Indica al menos una cantidad a recibir.')
      return
    }
    setError('')
    startTransition(async () => {
      const r = await recibirCompra(compraId, recepciones)
      if (!r.ok) {
        setError(r.error || ERROR_GENERICO)
        return
      }
      onRecibido()
    })
  }

  return (
    <Modal title="Recibir compra" onClose={onClose}>
      <div className={styles.form}>
        <div className={styles.recepcionList}>
          {filas.map(f => (
            <div key={f.compraItemId} className={styles.recepcionRow}>
              <div className={styles.recepcionDesc}>
                <div className={styles.recepcionNombre}>{f.descripcion}</div>
                <div className={styles.recepcionPendiente}>Pendiente: {f.pendiente}</div>
              </div>
              <span className={styles.campoLabel}>Recibir</span>
              <input
                type="number"
                className={styles.recepcionInput}
                min={0}
                max={f.pendiente}
                step="1"
                value={f.texto}
                disabled={f.pendiente === 0 || isPending}
                onChange={e => cambiarCantidad(f.compraItemId, e.target.value)}
              />
            </div>
          ))}
        </div>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button
            type="button"
            className={`btnMerlinTertiary ${styles.btnCancel}`}
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`btnMerlinPrimary ${styles.btnSubmit}`}
            onClick={handleConfirmar}
            disabled={isPending}
          >
            {isPending ? 'Recibiendo…' : 'Confirmar recepción'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
