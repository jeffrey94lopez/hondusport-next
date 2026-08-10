'use client'
import { useMemo, useState } from 'react'
import Modal from '@/components/admin/Modal'
import { numeroDocumento } from '@/lib/pos/documentos'
import { formatPrice } from '@/lib/store/format'
import { parseMoneyInput, valorMostrado } from '@/app/admin/pos/pos-helpers'
import { saldoAplicable, validarGastoSaldo } from '@/lib/pos/saldo-favor'
import { distribuirPago } from '@/lib/cxp/cxp'
import type { CxcFila } from '@/types'
import { aplicarSaldoFavorCxc } from './saldo-favor-actions'
import styles from './cxc.module.css'

interface Props {
  clienteId: string
  saldoDisponible: number
  documentos: CxcFila[] // documentos con saldo del cliente (para la distribución auto y el detalle manual)
  onClose: () => void
  onOk: () => void
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Mini-modal (patrón CobroModal/PagoModal, POS P4b/P4c) para aplicar el saldo
// a favor del cliente a sus documentos por cobrar. A diferencia de un cobro
// normal no hay método/caja: el "pago" siempre es saldo_favor y lo valida la
// RPC `aplicar_saldo_favor_cxc` bajo lock (esta pantalla solo hace UX
// temprana con `validarGastoSaldo`, igual que el chip de saldo a favor del
// mostrador POS).
export default function SaldoFavorModal({ clienteId, saldoDisponible, documentos, onClose, onOk }: Props) {
  const documentosOrdenados = useMemo(
    () =>
      documentos
        .slice()
        .sort((a, b) => String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? ''))),
    [documentos],
  )

  const deudaPendiente = useMemo(
    () => round2(documentosOrdenados.reduce((s, d) => s + d.saldo, 0)),
    [documentosOrdenados],
  )

  // Tope inicial: min(saldo disponible, deuda pendiente) — se usa solo para
  // proponer el monto por defecto; `problema` abajo es quien realmente lo
  // hace cumplir (el usuario puede editar el campo, pero no puede pasarse).
  const tope = saldoAplicable(saldoDisponible, deudaPendiente)

  const [montoStr, setMontoStr] = useState<string>(valorMostrado(tope))
  const [distrib, setDistrib] = useState<'auto' | 'manual'>('auto')
  const [montosDocumento, setMontosDocumento] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const monto = parseMoneyInput(montoStr)

  const sumaManual = useMemo(
    () => documentosOrdenados.reduce((s, d) => s + parseMoneyInput(montosDocumento[d.documento_id] ?? ''), 0),
    [documentosOrdenados, montosDocumento],
  )

  // Validación (mismo criterio que PagoModal/CobroModal ya corregidos, ver
  // task-4-report de P4b/P4c): rechaza montos negativos y > saldo, y aquí
  // además > deuda pendiente (el tope real es min(saldo, deuda)).
  const problema: string | null = (() => {
    if (documentosOrdenados.length === 0) return 'Este cliente no tiene deuda pendiente.'
    if (monto <= 0) return 'Ingresa un monto mayor a cero.'
    const errorSaldo = validarGastoSaldo(saldoDisponible, monto)
    if (errorSaldo) return errorSaldo
    if (monto > deudaPendiente + 0.005) return 'El monto excede la deuda pendiente del cliente.'
    if (distrib === 'manual') {
      for (const d of documentosOrdenados) {
        const m = parseMoneyInput(montosDocumento[d.documento_id] ?? '')
        if (m < 0) return 'Los montos no pueden ser negativos.'
        if (m > d.saldo + 0.005) return `La aplicación a ${numeroDocumento(d)} excede su saldo.`
      }
      if (Math.abs(sumaManual - monto) > 0.005) return 'La suma de las aplicaciones debe igualar el monto.'
    }
    return null
  })()

  async function submit() {
    if (problema) return
    setError(null)
    setSaving(true)

    let aplicaciones: { documentoId: string; monto: number }[]
    if (distrib === 'auto') {
      const { aplicaciones: apps } = distribuirPago(
        monto,
        documentosOrdenados.map(d => ({ compra_id: d.documento_id, saldo: d.saldo })),
      )
      aplicaciones = apps.map(a => ({ documentoId: a.compra_id, monto: a.monto }))
    } else {
      aplicaciones = documentosOrdenados
        .map(d => ({ documentoId: d.documento_id, monto: parseMoneyInput(montosDocumento[d.documento_id] ?? '') }))
        .filter(a => a.monto > 0)
    }

    const res = await aplicarSaldoFavorCxc({ clienteId, aplicaciones, notas: notas.trim() || undefined })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onOk()
  }

  return (
    <Modal title="Aplicar saldo a favor" onClose={onClose} maxWidth="560px">
      <div className={styles.form}>
        <div className={styles.compraFija}>
          <span className={styles.compraNumero}>Saldo disponible</span>
          <span className={styles.compraSaldo}>{formatPrice(saldoDisponible)}</span>
        </div>
        <div className={styles.compraFija}>
          <span className={styles.compraNumero}>Deuda pendiente</span>
          <span className={styles.compraSaldo}>{formatPrice(deudaPendiente)}</span>
        </div>

        <label className={styles.formLabel}>
          Monto a aplicar
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={montoStr}
            onChange={e => setMontoStr(e.target.value)}
          />
        </label>
        <p className={styles.hint}>Máximo aplicable: {formatPrice(tope)}.</p>

        {documentosOrdenados.length > 1 && (
          <div className={styles.distribToggle}>
            <button
              type="button"
              className={styles.distribBtn}
              aria-pressed={distrib === 'auto'}
              onClick={() => setDistrib('auto')}
            >
              Distribuir automáticamente
            </button>
            <button
              type="button"
              className={styles.distribBtn}
              aria-pressed={distrib === 'manual'}
              onClick={() => setDistrib('manual')}
            >
              Elegir documentos
            </button>
          </div>
        )}

        {distrib === 'auto' && (
          <p className={styles.hint}>Se aplica a los documentos más antiguos primero.</p>
        )}

        {distrib === 'manual' && (
          <div className={styles.detalleManual}>
            {documentosOrdenados.map(d => (
              <div key={d.documento_id} className={styles.detalleRow}>
                <div className={styles.detalleInfo}>
                  <span className={styles.compraNumero}>{numeroDocumento(d)}</span>
                  <span className={styles.compraSaldo}>Saldo {formatPrice(d.saldo)}</span>
                </div>
                <input
                  className={styles.detalleInput}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={montosDocumento[d.documento_id] ?? ''}
                  onChange={e =>
                    setMontosDocumento(prev => ({ ...prev, [d.documento_id]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className={styles.detalleTotal}>
              <span>Suma de aplicaciones</span>
              <span className={Math.abs(sumaManual - monto) > 0.005 ? styles.sumaMal : styles.sumaOk}>
                {formatPrice(sumaManual)} / {formatPrice(monto)}
              </span>
            </div>
          </div>
        )}

        <label className={styles.formLabel}>
          Notas
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)} />
        </label>

        {error && <p className={styles.formError}>{error}</p>}

        <div className={styles.formFooter}>
          <button
            type="button"
            className={`${styles.btnCancel} btnMerlinSecondary`}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`${styles.btnSubmit} btnMerlinPrimary`}
            onClick={submit}
            disabled={saving || problema !== null}
            title={problema ?? undefined}
          >
            {saving ? 'Aplicando…' : 'Aplicar saldo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
