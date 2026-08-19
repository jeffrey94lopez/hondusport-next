'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import { numeroDocumento } from '@/lib/pos/documentos'
import { anularDocumento } from '../actions'
import type { Documento } from '@/types'
import styles from './AnularModal.module.css'

interface Props {
  documento: Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante'>
  onClose: () => void
  onAnulado: () => void
}

/**
 * Modal de anulación de un comprobante. D2: extraído de DocumentosClient
 * (donde vivía como componente local) para que la pantalla del documento
 * (DocumentoView) lo reutilice sin duplicar el formulario ni el Server
 * Action — mismas reglas de anulación en los dos sitios, por construcción.
 *
 * `documento` acepta solo lo que `numeroDocumento` necesita (no todo
 * `DocumentoListItem`/`Documento`): DocumentosClient sigue pasando su fila
 * de la lista y DocumentoView pasa el `Documento` completo de la pantalla,
 * ambos calzan sin adaptar nada.
 */
export default function AnularModal({ documento, onClose, onAnulado }: Props) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo.trim()) { setError('El motivo es requerido.'); return }
    setError('')
    startTransition(async () => {
      const result = await anularDocumento(documento.id, motivo.trim())
      if (!result.ok) { setError(result.error); return }
      onAnulado()
    })
  }

  return (
    <Modal title={`Anular comprobante ${numeroDocumento(documento)}`} onClose={onClose} maxWidth="480px">
      <form onSubmit={handleSubmit} className={styles.formAnular}>
        <p className={styles.avisoAnular}>
          Esta acción no se puede deshacer. Si el comprobante descontó stock
          de mostrador, se repone automáticamente.
        </p>
        <label className={styles.formLabel}>
          Motivo *
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Explica por qué se anula este comprobante"
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="submit" className={`${styles.btnSubmit} btnMerlinPrimary`} disabled={isPending}>
            {isPending ? 'Anulando…' : 'Anular comprobante'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
