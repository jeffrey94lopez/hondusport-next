'use client'
import { useMemo, useState } from 'react'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import { parseMoneyInput, valorMostrado } from '@/app/admin/pos/pos-helpers'
import type { Cliente, CxpFila, PagoMetodo } from '@/types'
import { registrarPago, type RegistrarPagoInput } from './actions'
import styles from './cxp.module.css'

interface Props {
  modo: 'abono' | 'global'
  fila: CxpFila | null // requerido en modo abono
  proveedores: Cliente[]
  filas: CxpFila[] // todas las CxpFila (para armar el detalle manual por proveedor)
  onClose: () => void
  onOk: () => void
}

const METODOS: { value: PagoMetodo; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
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

export default function PagoModal({ modo, fila, proveedores, filas, onClose, onOk }: Props) {
  const [fecha, setFecha] = useState(hoyISO())
  const [metodo, setMetodo] = useState<PagoMetodo>('efectivo')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')

  // Proveedor: fijo en modo abono (el de la compra), seleccionable en global.
  const [proveedorId, setProveedorId] = useState<string>(
    modo === 'abono' && fila ? fila.proveedor_id : proveedores[0]?.id ?? '',
  )

  // Monto total del pago (string crudo, sin cero forzado). En abono arranca con
  // el saldo de la compra.
  const [montoStr, setMontoStr] = useState<string>(
    modo === 'abono' && fila ? valorMostrado(fila.saldo) : '',
  )

  // Modo global: distribución automática (más antigua primero) o manual.
  const [distrib, setDistrib] = useState<'auto' | 'manual'>('auto')
  // Manual: string crudo por compra_id.
  const [montosCompra, setMontosCompra] = useState<Record<string, string>>({})

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const monto = parseMoneyInput(montoStr)

  // Compras con saldo del proveedor seleccionado (para el detalle manual),
  // ordenadas por vencimiento (más antigua primero).
  const comprasProveedor = useMemo(
    () =>
      filas
        .filter(f => f.proveedor_id === proveedorId)
        .slice()
        .sort((a, b) =>
          String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? '')),
        ),
    [filas, proveedorId],
  )

  const sumaManual = useMemo(
    () => comprasProveedor.reduce((s, c) => s + parseMoneyInput(montosCompra[c.compra_id] ?? ''), 0),
    [comprasProveedor, montosCompra],
  )

  // Validación por modo. `problema` es el motivo (para el botón) o null si es válido.
  const problema: string | null = (() => {
    if (!fecha) return 'Indica la fecha del pago.'
    if (modo === 'abono') {
      if (!fila) return 'Falta la compra.'
      if (monto <= 0) return 'Ingresa un monto mayor a cero.'
      if (monto > fila.saldo + 0.005) return 'El monto excede el saldo de la compra.'
      return null
    }
    // global
    if (!proveedorId) return 'Selecciona un proveedor.'
    if (monto <= 0) return 'Ingresa un monto mayor a cero.'
    if (distrib === 'manual') {
      for (const c of comprasProveedor) {
        const m = parseMoneyInput(montosCompra[c.compra_id] ?? '')
        // Un monto negativo (o no numérico) invalida todo el formulario: si se
        // permitiera, `submit()` filtra las filas ≤ 0 y la RPC recibiría una
        // suma distinta a la validada (una fila en -50 y otra en 150 pasan la
        // validación de "Σ = monto" pero registran 150). Ver task-4-report.
        if (m < 0) return 'Los montos no pueden ser negativos.'
        if (m > c.saldo + 0.005) return `El abono a ${c.numero} excede su saldo.`
      }
      if (Math.abs(sumaManual - monto) > 0.005) return 'La suma de los abonos debe igualar el monto.'
    }
    return null
  })()

  async function submit() {
    if (problema) return
    setError(null)
    setSaving(true)

    let input: RegistrarPagoInput
    if (modo === 'abono' && fila) {
      input = {
        proveedorId: fila.proveedor_id,
        fecha,
        metodo,
        referencia: referencia.trim() || null,
        notas: notas.trim() || null,
        aplicaciones: [{ compraId: fila.compra_id, monto }],
      }
    } else if (distrib === 'auto') {
      input = {
        proveedorId,
        fecha,
        metodo,
        referencia: referencia.trim() || null,
        notas: notas.trim() || null,
        aplicaciones: [],
        montoGlobal: monto,
      }
    } else {
      const aplicaciones = comprasProveedor
        .map(c => ({ compraId: c.compra_id, monto: parseMoneyInput(montosCompra[c.compra_id] ?? '') }))
        .filter(a => a.monto > 0)
      input = {
        proveedorId,
        fecha,
        metodo,
        referencia: referencia.trim() || null,
        notas: notas.trim() || null,
        aplicaciones,
      }
    }

    const res = await registrarPago(input)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onOk()
  }

  const titulo = modo === 'abono' ? 'Abonar a compra' : 'Nuevo pago'

  return (
    <Modal title={titulo} onClose={onClose} maxWidth="560px">
      <div className={styles.form}>
        {modo === 'abono' && fila && (
          <div className={styles.compraFija}>
            <span className={styles.compraNumero}>{fila.numero}</span>
            <span className={styles.compraSaldo}>Saldo {formatPrice(fila.saldo)}</span>
          </div>
        )}

        {modo === 'global' && (
          <label className={styles.formLabel}>
            Proveedor
            <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              {proveedores.length === 0 && <option value="">Sin proveedores</option>}
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
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
            <select value={metodo} onChange={e => setMetodo(e.target.value as PagoMetodo)}>
              {METODOS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>

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
              Elegir compras
            </button>
          </div>
        )}

        {modo === 'global' && distrib === 'auto' && (
          <p className={styles.hint}>Se aplica a las compras más antiguas primero.</p>
        )}

        {modo === 'global' && distrib === 'manual' && (
          <div className={styles.detalleManual}>
            {comprasProveedor.length === 0 && (
              <p className={styles.hint}>Este proveedor no tiene compras con saldo.</p>
            )}
            {comprasProveedor.map(c => (
              <div key={c.compra_id} className={styles.detalleRow}>
                <div className={styles.detalleInfo}>
                  <span className={styles.compraNumero}>{c.numero}</span>
                  <span className={styles.compraSaldo}>Saldo {formatPrice(c.saldo)}</span>
                </div>
                <input
                  className={styles.detalleInput}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={montosCompra[c.compra_id] ?? ''}
                  onChange={e =>
                    setMontosCompra(prev => ({ ...prev, [c.compra_id]: e.target.value }))
                  }
                />
              </div>
            ))}
            {comprasProveedor.length > 0 && (
              <div className={styles.detalleTotal}>
                <span>Suma de abonos</span>
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
            {saving ? 'Registrando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
