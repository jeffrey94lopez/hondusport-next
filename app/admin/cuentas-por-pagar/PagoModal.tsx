'use client'
import { useMemo, useState } from 'react'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import { parseMoneyInput, valorMostrado } from '@/app/admin/pos/pos-helpers'
import type { Cliente, CxpFila, PagoMetodo } from '@/types'
import { registrarPago, type RegistrarPagoInput } from './actions'
import { sumaAplicaciones, validarAplicaciones } from '@/lib/cxp/cxp'
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

  // Saldo pendiente total del proveedor: el techo de un pago con distribución
  // automática. Sin él, el usuario teclea a ciegas y solo descubre que se pasó
  // cuando el servidor responde "El monto supera el total adeudado".
  const saldoTotalProveedor = useMemo(
    () => sumaAplicaciones(comprasProveedor.map(c => c.saldo)),
    [comprasProveedor],
  )

  const sumaManual = useMemo(
    () => sumaAplicaciones(comprasProveedor.map(c => parseMoneyInput(montosCompra[c.compra_id] ?? ''))),
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
    if (distrib === 'manual') {
      // El total del pago es la suma de lo aplicado: ya no hay monto general
      // que cuadrar, así que desaparece la validación "Σ = monto".
      return validarAplicaciones(
        comprasProveedor.map(c => ({
          numero: c.numero,
          monto: parseMoneyInput(montosCompra[c.compra_id] ?? ''),
          saldo: c.saldo,
        })),
      )
    }
    if (monto <= 0) return 'Ingresa un monto mayor a cero.'
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

        {!(modo === 'global' && distrib === 'manual') && (
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
        )}

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
          <div className={styles.saldoTotalRow}>
            <span>Saldo pendiente del proveedor</span>
            <span className={styles.saldoTotalValor}>{formatPrice(saldoTotalProveedor)}</span>
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
                <span>Total del pago</span>
                <span className={styles.totalCalculado}>{formatPrice(sumaManual)}</span>
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
