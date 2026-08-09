'use client'
import { useMemo, useState } from 'react'
import Modal from '@/components/admin/Modal'
import { numeroDocumento } from '@/lib/pos/documentos'
import { formatPrice } from '@/lib/store/format'
import { parseMoneyInput, valorMostrado } from '@/app/admin/pos/pos-helpers'
import type { Caja, Cliente, CobroMetodo, CxcFila, SesionCaja } from '@/types'
import { registrarCobro, type RegistrarCobroInput } from './actions'
import styles from './cxc.module.css'

interface Props {
  modo: 'abono' | 'global'
  fila: CxcFila | null // requerido en modo abono
  clientes: Cliente[]
  filas: CxcFila[] // todas las CxcFila (para armar el detalle manual por cliente)
  sesiones: SesionCaja[] // sesiones de caja abiertas (para ligar cobros en efectivo)
  cajas: Caja[] // para etiquetar cada sesión abierta con el NOMBRE de su caja
  onClose: () => void
  onOk: () => void
}

const METODOS: { value: CobroMetodo; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
]

function hoyISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

export default function CobroModal({ modo, fila, clientes, filas, sesiones, cajas, onClose, onOk }: Props) {
  // `sesiones_caja` solo trae `caja_id`; se resuelve el nombre contra `cajas`
  // (Important del reviewer, fix round 1: sin el nombre, con 2+ cajas
  // abiertas a horas similares el cajero podía atribuir el cobro a la caja
  // equivocada y descuadrar el arqueo).
  function nombreCaja(cajaId: string): string {
    return cajas.find(c => c.id === cajaId)?.nombre ?? 'Caja'
  }
  const [fecha, setFecha] = useState(hoyISO())
  const [metodo, setMetodo] = useState<CobroMetodo>('efectivo')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')

  // Cliente: fijo en modo abono (el del documento), seleccionable en global.
  const [clienteId, setClienteId] = useState<string>(
    modo === 'abono' && fila ? fila.cliente_id : clientes[0]?.id ?? '',
  )

  // Monto total del cobro (string crudo, sin cero forzado). En abono arranca
  // con el saldo del documento.
  const [montoStr, setMontoStr] = useState<string>(
    modo === 'abono' && fila ? valorMostrado(fila.saldo) : '',
  )

  // Modo global: distribución automática (más antigua primero) o manual.
  const [distrib, setDistrib] = useState<'auto' | 'manual'>('auto')
  // Manual: string crudo por documento_id.
  const [montosDocumento, setMontosDocumento] = useState<Record<string, string>>({})

  // Sesión de caja para cobros en efectivo: si hay una sola sesión abierta se
  // preselecciona; si hay varias, el usuario elige con el select.
  const [sesionId, setSesionId] = useState<string | null>(
    sesiones.length === 1 ? sesiones[0].id : null,
  )

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const monto = parseMoneyInput(montoStr)

  // Documentos con saldo del cliente seleccionado (para el detalle manual),
  // ordenados por vencimiento (más antiguo primero).
  const documentosCliente = useMemo(
    () =>
      filas
        .filter(f => f.cliente_id === clienteId)
        .slice()
        .sort((a, b) =>
          String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? '')),
        ),
    [filas, clienteId],
  )

  const sumaManual = useMemo(
    () => documentosCliente.reduce((s, d) => s + parseMoneyInput(montosDocumento[d.documento_id] ?? ''), 0),
    [documentosCliente, montosDocumento],
  )

  // Validación por modo. `problema` es el motivo (para el botón) o null si es válido.
  const problema: string | null = (() => {
    if (!fecha) return 'Indica la fecha del cobro.'
    if (metodo === 'efectivo' && sesiones.length > 1 && !sesionId) {
      return 'Selecciona la caja para el cobro en efectivo.'
    }
    if (modo === 'abono') {
      if (!fila) return 'Falta el documento.'
      if (monto <= 0) return 'Ingresa un monto mayor a cero.'
      if (monto > fila.saldo + 0.005) return 'El monto excede el saldo del documento.'
      return null
    }
    // global
    if (!clienteId) return 'Selecciona un cliente.'
    if (monto <= 0) return 'Ingresa un monto mayor a cero.'
    if (distrib === 'manual') {
      for (const d of documentosCliente) {
        const m = parseMoneyInput(montosDocumento[d.documento_id] ?? '')
        // Un monto negativo (o no numérico) invalida todo el formulario: si se
        // permitiera, `submit()` filtra las filas ≤ 0 y la RPC recibiría una
        // suma distinta a la validada (mismo hallazgo que en PagoModal, ver
        // task-4-report de P4b).
        if (m < 0) return 'Los montos no pueden ser negativos.'
        if (m > d.saldo + 0.005) return `El cobro a ${numeroDocumento(d)} excede su saldo.`
      }
      if (Math.abs(sumaManual - monto) > 0.005) return 'La suma de los cobros debe igualar el monto.'
    }
    return null
  })()

  async function submit() {
    if (problema) return
    setError(null)
    setSaving(true)

    const sesionParaCobro = metodo === 'efectivo' ? sesionId : null

    let input: RegistrarCobroInput
    if (modo === 'abono' && fila) {
      input = {
        clienteId: fila.cliente_id,
        fecha,
        metodo,
        referencia: referencia.trim() || null,
        notas: notas.trim() || null,
        sesionId: sesionParaCobro,
        aplicaciones: [{ documentoId: fila.documento_id, monto }],
      }
    } else if (distrib === 'auto') {
      input = {
        clienteId,
        fecha,
        metodo,
        referencia: referencia.trim() || null,
        notas: notas.trim() || null,
        sesionId: sesionParaCobro,
        aplicaciones: [],
        montoGlobal: monto,
      }
    } else {
      const aplicaciones = documentosCliente
        .map(d => ({ documentoId: d.documento_id, monto: parseMoneyInput(montosDocumento[d.documento_id] ?? '') }))
        .filter(a => a.monto > 0)
      input = {
        clienteId,
        fecha,
        metodo,
        referencia: referencia.trim() || null,
        notas: notas.trim() || null,
        sesionId: sesionParaCobro,
        aplicaciones,
      }
    }

    const res = await registrarCobro(input)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onOk()
  }

  const titulo = modo === 'abono' ? 'Cobrar documento' : 'Nuevo cobro'

  return (
    <Modal title={titulo} onClose={onClose} maxWidth="560px">
      <div className={styles.form}>
        {modo === 'abono' && fila && (
          <div className={styles.compraFija}>
            <span className={styles.compraNumero}>{numeroDocumento(fila)}</span>
            <span className={styles.compraSaldo}>Saldo {formatPrice(fila.saldo)}</span>
          </div>
        )}

        {modo === 'global' && (
          <label className={styles.formLabel}>
            Cliente
            <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
              {clientes.length === 0 && <option value="">Sin clientes</option>}
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Fecha
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </label>
          <label className={styles.formLabel}>
            Método
            <select
              value={metodo}
              onChange={e => {
                const m = e.target.value as CobroMetodo
                setMetodo(m)
                if (m === 'efectivo' && sesiones.length === 1) setSesionId(sesiones[0].id)
              }}
            >
              {METODOS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>

        {metodo === 'efectivo' && sesiones.length > 1 && (
          <label className={styles.formLabel}>
            Caja
            <select value={sesionId ?? ''} onChange={e => setSesionId(e.target.value || null)}>
              <option value="">Selecciona una caja…</option>
              {sesiones.map(s => (
                <option key={s.id} value={s.id}>
                  {nombreCaja(s.caja_id)} — abierta desde {formatHora(s.abierta_at)}
                </option>
              ))}
            </select>
          </label>
        )}
        {metodo === 'efectivo' && sesiones.length === 1 && (
          <p className={styles.hint}>
            Se asignará a la caja {nombreCaja(sesiones[0].caja_id)} (abierta desde {formatHora(sesiones[0].abierta_at)}).
          </p>
        )}
        {metodo === 'efectivo' && sesiones.length === 0 && (
          <p className={styles.hint}>No hay una caja abierta; el cobro no se asignará a ninguna sesión.</p>
        )}

        <label className={styles.formLabel}>
          Monto
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={montoStr}
            onChange={e => setMontoStr(e.target.value)}
          />
        </label>

        {modo === 'global' && (
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

        {modo === 'global' && distrib === 'auto' && (
          <p className={styles.hint}>Se aplica a los documentos más antiguos primero.</p>
        )}

        {modo === 'global' && distrib === 'manual' && (
          <div className={styles.detalleManual}>
            {documentosCliente.length === 0 && (
              <p className={styles.hint}>Este cliente no tiene documentos con saldo.</p>
            )}
            {documentosCliente.map(d => (
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
            {documentosCliente.length > 0 && (
              <div className={styles.detalleTotal}>
                <span>Suma de cobros</span>
                <span className={Math.abs(sumaManual - monto) > 0.005 ? styles.sumaMal : styles.sumaOk}>
                  {formatPrice(sumaManual)} / {formatPrice(monto)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Referencia
            <input
              type="text"
              value={referencia}
              onChange={e => setReferencia(e.target.value)}
              placeholder="N.º de cheque, transferencia…"
            />
          </label>
          <label className={styles.formLabel}>
            Notas
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)} />
          </label>
        </div>

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
            {saving ? 'Registrando…' : 'Registrar cobro'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
