'use client'
import { useRef, useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import { emitirVenta } from '../actions'
import { validarPagos, cambioPago, validarEmision } from '@/lib/pos/emision'
import { formatPrice } from '@/lib/store/format'
import { round2 } from '../pos-helpers'
import type { LineaPos, PagoPos, MetodoPago, MetodoPagoTipo, Cliente } from '@/types'
import styles from '../pos.module.css'

// Línea de UI de un pago: `monto` es el string editado a mano para métodos
// que no son efectivo_usd; `montoUsd` es el string editado a mano SOLO para
// efectivo_usd (el monto en L. se deriva multiplicando por la tasa, nunca se
// edita directo). `referencia` solo se envía si el método es tarjeta o
// transferencia (el resto la ignora, pero se limpia igual al cambiar de
// método para no arrastrar datos de otro tipo de pago).
interface PagoRow {
  key: string
  metodoId: string
  tipo: MetodoPagoTipo
  monto: string
  montoUsd: string
  referencia: string
}

interface CobroModalProps {
  total: number
  lineas: LineaPos[]
  descuentoGlobal: number
  cajaId: string
  vendedorId: string | null
  clienteActual: Cliente | null
  metodos: MetodoPago[]
  tasaCambioUsd: number
  limite: number
  onClose: () => void
  onEmitido: (documentoId: string) => void
}

export default function CobroModal({
  total,
  lineas,
  descuentoGlobal,
  cajaId,
  vendedorId,
  clienteActual,
  metodos,
  tasaCambioUsd,
  limite,
  onClose,
  onEmitido,
}: CobroModalProps) {
  const [tipo, setTipo] = useState<'factura' | 'comprobante'>('factura')
  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [identNombre, setIdentNombre] = useState('')
  const [identIdentidad, setIdentIdentidad] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const nextPagoKeyRef = useRef(0)

  function nuevaPagoKey(): string {
    nextPagoKeyRef.current += 1
    return `p${nextPagoKeyRef.current}`
  }

  // Primer método sin usar efectivo_usd sin tasa configurada, para preseleccionar
  // al agregar una fila nueva.
  const metodoDisponible = metodos.find(m => !(m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0)) ?? null

  function agregarPago() {
    if (!metodoDisponible) return
    setPagos(prev => [
      ...prev,
      { key: nuevaPagoKey(), metodoId: metodoDisponible.id, tipo: metodoDisponible.tipo, monto: '', montoUsd: '', referencia: '' },
    ])
  }

  function cambiarMetodoPago(key: string, metodoId: string) {
    const m = metodos.find(x => x.id === metodoId)
    if (!m) return
    // Los campos monto/montoUsd/referencia dependen del tipo de método: se
    // limpian al cambiar para no arrastrar un valor con el sentido equivocado
    // (p.ej. un monto en USD quedando como si fuera Lempiras).
    setPagos(prev => prev.map(p => (p.key === key ? { key, metodoId: m.id, tipo: m.tipo, monto: '', montoUsd: '', referencia: '' } : p)))
  }

  function cambiarMontoPago(key: string, valor: string) {
    setPagos(prev => prev.map(p => (p.key === key ? { ...p, monto: valor } : p)))
  }

  function cambiarMontoUsdPago(key: string, valor: string) {
    setPagos(prev => prev.map(p => (p.key === key ? { ...p, montoUsd: valor } : p)))
  }

  function cambiarReferenciaPago(key: string, valor: string) {
    setPagos(prev => prev.map(p => (p.key === key ? { ...p, referencia: valor } : p)))
  }

  function quitarPago(key: string) {
    setPagos(prev => prev.filter(p => p.key !== key))
  }

  function montoLps(p: PagoRow): number {
    if (p.tipo === 'efectivo_usd') {
      const usd = Number(p.montoUsd)
      return Number.isFinite(usd) ? round2(usd * tasaCambioUsd) : 0
    }
    const n = Number(p.monto)
    return Number.isFinite(n) ? n : 0
  }

  const pagosPos: PagoPos[] = pagos.map(p => ({
    metodo_id: p.metodoId,
    tipo: p.tipo,
    monto: montoLps(p),
    monto_usd: p.tipo === 'efectivo_usd' ? (Number.isFinite(Number(p.montoUsd)) ? Number(p.montoUsd) : 0) : null,
    tasa: p.tipo === 'efectivo_usd' ? tasaCambioUsd : null,
    referencia: p.referencia.trim() || null,
  }))

  const sumaPagos = round2(pagosPos.reduce((s, p) => s + p.monto, 0))
  const restante = Math.max(0, round2(total - sumaPagos))
  const cambio = cambioPago(pagosPos, total)

  // Art. 11: cualquier factura que supere el límite exige RTN o identidad,
  // sin importar el nombre — aplica igual a CONSUMIDOR FINAL (clienteActual
  // null) que a un cliente ya registrado sin esos datos capturados.
  const necesitaIdentificacion =
    tipo === 'factura' && total > limite && !clienteActual?.rtn && !clienteActual?.identidad

  function clientePayload() {
    if (clienteActual) {
      return {
        id: clienteActual.id,
        nombre: clienteActual.nombre,
        rtn: clienteActual.rtn,
        identidad: necesitaIdentificacion ? (identIdentidad.trim() || null) : clienteActual.identidad,
        exonerado: clienteActual.exonerado,
        ordenCompraExenta: null,
        constanciaExonerado: clienteActual.constancia_exonerado,
        registroSag: clienteActual.registro_sag,
      }
    }
    if (necesitaIdentificacion) {
      return {
        id: null,
        nombre: identNombre.trim(),
        rtn: null,
        identidad: identIdentidad.trim(),
        exonerado: false,
        ordenCompraExenta: null,
        constanciaExonerado: null,
        registroSag: null,
      }
    }
    return {
      id: null,
      nombre: 'CONSUMIDOR FINAL',
      rtn: null,
      identidad: null,
      exonerado: false,
      ordenCompraExenta: null,
      constanciaExonerado: null,
      registroSag: null,
    }
  }

  function handleEmitir() {
    setError('')

    if (necesitaIdentificacion && ((!clienteActual && !identNombre.trim()) || !identIdentidad.trim())) {
      setError(clienteActual ? 'Completa la identidad del cliente.' : 'Completa el nombre y la identidad del cliente.')
      return
    }

    const cliente = clientePayload()

    // Duplicado client-side de las mismas puras que usa emitirVenta, solo
    // para UX temprana (mensaje inmediato sin round-trip); el server vuelve a
    // validar todo con los datos releídos de BD.
    const errorEmision = validarEmision({
      tipo,
      clienteNombre: cliente.nombre,
      clienteRtn: cliente.rtn,
      clienteIdentidad: cliente.identidad,
      total,
      limite,
    })
    if (errorEmision) {
      setError(errorEmision)
      return
    }

    const errorPagos = validarPagos(pagosPos, total)
    if (errorPagos) {
      setError(errorPagos)
      return
    }

    startTransition(async () => {
      const result = await emitirVenta({
        tipo,
        cajaId,
        vendedorId,
        cliente,
        lineas,
        descuentoGlobal,
        pagos: pagosPos,
        notas: null,
      })
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo completar la operación. Intenta de nuevo.' : result.error)
        return
      }
      onEmitido(result.data.documentoId)
    })
  }

  return (
    <Modal title="Cobrar" onClose={onClose} maxWidth="640px">
      <div className={styles.cobroModal}>
        <div className={styles.tipoDocRow}>
          <button
            type="button"
            className={`${styles.tipoDocBtn} ${tipo === 'factura' ? styles.tipoDocBtnActive : ''}`}
            onClick={() => setTipo('factura')}
            disabled={isPending}
          >
            Factura
          </button>
          <button
            type="button"
            className={`${styles.tipoDocBtn} ${tipo === 'comprobante' ? styles.tipoDocBtnActive : ''}`}
            onClick={() => setTipo('comprobante')}
            disabled={isPending}
          >
            Comprobante
          </button>
        </div>

        {necesitaIdentificacion && (
          <div className={styles.identBlock}>
            <div className={styles.identNota}>
              El total supera {formatPrice(limite)}: identifica al cliente para emitir la factura.
            </div>
            {!clienteActual && (
              <label className={styles.formLabel}>
                Nombre completo
                <input type="text" value={identNombre} onChange={e => setIdentNombre(e.target.value)} disabled={isPending} />
              </label>
            )}
            <label className={styles.formLabel}>
              Identidad
              <input type="text" value={identIdentidad} onChange={e => setIdentIdentidad(e.target.value)} disabled={isPending} />
            </label>
          </div>
        )}

        <div className={styles.pagosSection}>
          <div className={styles.pagosHeader}>
            <span>Pagos</span>
            <button type="button" className={styles.btnItemLibre} onClick={agregarPago} disabled={isPending || !metodoDisponible}>
              + Agregar pago
            </button>
          </div>

          {metodos.length === 0 ? (
            <div className={styles.empty}>No hay métodos de pago activos configurados.</div>
          ) : pagos.length === 0 ? (
            <div className={styles.empty}>Agrega al menos un método de pago.</div>
          ) : (
            <div className={styles.pagosList}>
              {pagos.map(p => (
                <div key={p.key} className={styles.pagoRow}>
                  <select value={p.metodoId} onChange={e => cambiarMetodoPago(p.key, e.target.value)} disabled={isPending}>
                    {metodos.map(m => (
                      <option key={m.id} value={m.id} disabled={m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0}>
                        {m.nombre}
                        {m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0 ? ' (sin tasa configurada)' : ''}
                      </option>
                    ))}
                  </select>

                  {p.tipo === 'efectivo_usd' ? (
                    <div className={styles.pagoUsdGroup}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="USD"
                        value={p.montoUsd}
                        onChange={e => cambiarMontoUsdPago(p.key, e.target.value)}
                        disabled={isPending}
                      />
                      <span className={styles.pagoUsdConversion}>≈ {formatPrice(montoLps(p))}</span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Monto (L.)"
                      value={p.monto}
                      onChange={e => cambiarMontoPago(p.key, e.target.value)}
                      disabled={isPending}
                    />
                  )}

                  {(p.tipo === 'tarjeta' || p.tipo === 'transferencia') && (
                    <input
                      type="text"
                      placeholder="Referencia (opcional)"
                      value={p.referencia}
                      onChange={e => cambiarReferenciaPago(p.key, e.target.value)}
                      disabled={isPending}
                    />
                  )}

                  <button
                    type="button"
                    className={styles.btnQuitar}
                    onClick={() => quitarPago(p.key)}
                    aria-label="Quitar pago"
                    disabled={isPending}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.cobroResumen}>
          <div className={styles.totalesRow}><span>Total</span><span>{formatPrice(total)}</span></div>
          <div className={styles.totalesRow}><span>Pagado</span><span>{formatPrice(sumaPagos)}</span></div>
          {restante > 0 && (
            <div className={styles.totalesRow}><span>Restante</span><span>{formatPrice(restante)}</span></div>
          )}
          {cambio > 0 && (
            <div className={styles.totalesRowTotal}><span>Cambio</span><span>{formatPrice(cambio)}</span></div>
          )}
        </div>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={isPending}>
            Cancelar
          </button>
          <button type="button" className={`btnMerlinPrimary ${styles.btnSubmit}`} onClick={handleEmitir} disabled={isPending}>
            {isPending ? 'Emitiendo...' : 'Emitir'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
