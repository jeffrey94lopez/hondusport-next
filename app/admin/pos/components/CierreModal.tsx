'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import { cerrarSesion } from '../actions'
import { esperadoCaja } from '@/lib/pos/emision'
import { formatPrice } from '@/lib/store/format'
import { round2, parseMoneyInput } from '../pos-helpers'
import type { SesionCaja, DocumentoParaArqueo, MetodoPagoTipo } from '@/types'
import styles from '../pos.module.css'

const NOMBRES_METODO: Record<MetodoPagoTipo, string> = {
  efectivo_lps: 'Efectivo L.',
  efectivo_usd: 'Efectivo USD',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
  credito: 'Crédito',
}

interface CierreModalProps {
  sesion: SesionCaja
  documentos: DocumentoParaArqueo[]
  cartLineasPendientes: number
  onClose: () => void
  onCerrado: () => void
}

export default function CierreModal({ sesion, documentos, cartLineasPendientes, onClose, onCerrado }: CierreModalProps) {
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Resumen previo (no persiste nada): la misma pura que usa `cerrarSesion`
  // en el server para el cálculo definitivo al confirmar.
  const { efectivoEsperado, porMetodo } = esperadoCaja(Number(sesion.monto_inicial), documentos)
  const contadoNum = parseMoneyInput(montoContado)
  const contadoValido = montoContado.trim() !== '' && contadoNum >= 0
  const diferencia = contadoValido ? round2(contadoNum - efectivoEsperado) : null

  function handleCerrar() {
    setError('')
    if (!contadoValido) {
      setError('Ingresa el monto contado en efectivo.')
      return
    }
    startTransition(async () => {
      const result = await cerrarSesion(sesion.id, contadoNum, notas.trim())
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCerrado()
    })
  }

  return (
    <Modal title="Cerrar caja" onClose={onClose}>
      <div className={styles.cierreModal}>
        {cartLineasPendientes > 0 && (
          <div className={styles.identBlock}>
            <div className={styles.identNota}>
              Tienes {cartLineasPendientes} línea(s) sin cobrar en la venta actual. No se pierden al cerrar la
              caja: seguirán disponibles en su pestaña la próxima vez que abras esta caja.
            </div>
          </div>
        )}

        <div className={styles.totalesPanel}>
          {(Object.keys(porMetodo) as MetodoPagoTipo[])
            .filter(tipo => porMetodo[tipo] > 0)
            .map(tipo => (
              <div key={tipo} className={styles.totalesRow}>
                <span>{NOMBRES_METODO[tipo]}</span>
                <span>{formatPrice(porMetodo[tipo])}</span>
              </div>
            ))}
          <div className={styles.totalesRowTotal}>
            <span>Efectivo esperado</span>
            <span>{formatPrice(efectivoEsperado)}</span>
          </div>
        </div>

        <label className={styles.formLabel}>
          Monto contado en efectivo (L.)
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={montoContado}
            onChange={e => setMontoContado(e.target.value)}
            autoFocus
            disabled={isPending}
          />
        </label>

        {diferencia !== null && (
          <div
            className={styles.diferenciaRow}
            style={{ color: diferencia < 0 ? 'var(--danger)' : 'var(--success)' }}
          >
            <span>{diferencia === 0 ? 'Cuadra exacto' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
            <span>{formatPrice(Math.abs(diferencia))}</span>
          </div>
        )}

        <label className={styles.formLabel}>
          Notas (opcional)
          <textarea
            className={styles.notasInput}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            disabled={isPending}
            rows={2}
          />
        </label>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onClose} disabled={isPending}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btnMerlinPrimary ${styles.btnSubmit}`}
            onClick={handleCerrar}
            disabled={isPending}
          >
            {isPending ? 'Cerrando...' : 'Cerrar caja'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
