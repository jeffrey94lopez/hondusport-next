'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import { emitirVenta } from '../actions'
import { validarPagos, cambioPago, validarEmision, montosPagoAlAgregar } from '@/lib/pos/emision'
import { formatPrice } from '@/lib/store/format'
import { round2 } from '../pos-helpers'
import type { LineaPos, PagoPos, MetodoPago, Cliente } from '@/types'
import styles from '../pos.module.css'

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
  // Cada pago vive en la forma que consume la RPC (PagoPos) — a lo sumo un
  // pago por método (el chip del método es lo que agrega/quita filas), así
  // que metodo_id sirve de key. `referencia` se guarda tal cual se teclea;
  // se recorta a null solo al armar `pagosParaEnvio` para no interferir con
  // el usuario mientras escribe.
  const [pagos, setPagos] = useState<PagoPos[]>([])
  const [identNombre, setIdentNombre] = useState('')
  const [identIdentidad, setIdentIdentidad] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function alternarMetodo(m: MetodoPago) {
    if (isPending) return
    if (m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0) return

    const yaSeleccionado = pagos.some(p => p.metodo_id === m.id)
    if (yaSeleccionado) {
      // Quitar un pago no recalcula los demás: solo se elimina esa fila.
      setPagos(prev => prev.filter(p => p.metodo_id !== m.id))
      return
    }

    const nuevoPago: PagoPos = {
      metodo_id: m.id,
      tipo: m.tipo,
      monto: 0,
      monto_usd: m.tipo === 'efectivo_usd' ? 0 : null,
      tasa: m.tipo === 'efectivo_usd' ? tasaCambioUsd : null,
      referencia: null,
    }
    setPagos(prev => {
      const actualizados = montosPagoAlAgregar([...prev, nuevoPago], total)
      if (m.tipo !== 'efectivo_usd') return actualizados
      // El monto en L. que asignó montosPagoAlAgregar es la verdad y NO se
      // recalcula (recalcularlo desplaza el total, ver Fix round 1 en el
      // reporte). Solo se deriva monto_usd = monto / tasa para poblar el
      // input visible; el monto en L. queda intacto.
      return actualizados.map(p =>
        p.metodo_id === m.id ? { ...p, monto_usd: round2(p.monto / tasaCambioUsd) } : p,
      )
    })
  }

  function cambiarMonto(metodoId: string, valor: string) {
    setPagos(prev => prev.map(p => (p.metodo_id === metodoId ? { ...p, monto: Number(valor) || 0 } : p)))
  }

  function cambiarMontoUsd(metodoId: string, valor: string) {
    const usd = Number(valor) || 0
    setPagos(prev =>
      prev.map(p => (p.metodo_id === metodoId ? { ...p, monto_usd: usd, monto: round2(usd * tasaCambioUsd) } : p)),
    )
  }

  function cambiarReferencia(metodoId: string, valor: string) {
    setPagos(prev => prev.map(p => (p.metodo_id === metodoId ? { ...p, referencia: valor } : p)))
  }

  // Normaliza la referencia (recorte a null) recién al momento de calcular
  // totales/validar/emitir — el estado de edición conserva el string crudo.
  const pagosParaEnvio: PagoPos[] = pagos.map(p => ({ ...p, referencia: (p.referencia ?? '').trim() || null }))

  const sumaPagos = round2(pagosParaEnvio.reduce((s, p) => s + p.monto, 0))
  const restante = Math.max(0, round2(total - sumaPagos))
  const cambio = cambioPago(pagosParaEnvio, total)

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

    const errorPagos = validarPagos(pagosParaEnvio, total)
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
        pagos: pagosParaEnvio,
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
            className={`btnMerlinChip ${styles.tipoDocBtn}`}
            aria-pressed={tipo === 'factura'}
            onClick={() => setTipo('factura')}
            disabled={isPending}
          >
            Factura
          </button>
          <button
            type="button"
            className={`btnMerlinChip ${styles.tipoDocBtn}`}
            aria-pressed={tipo === 'comprobante'}
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
          </div>

          {metodos.length === 0 ? (
            <div className={styles.empty}>No hay métodos de pago activos configurados.</div>
          ) : (
            <>
              <div className={styles.chipsRow}>
                {metodos.map(m => {
                  const seleccionado = pagos.some(p => p.metodo_id === m.id)
                  const sinTasa = m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="btnMerlinChip"
                      aria-pressed={seleccionado}
                      onClick={() => alternarMetodo(m)}
                      disabled={isPending || sinTasa}
                      title={sinTasa ? 'Sin tasa de cambio configurada' : undefined}
                    >
                      {m.nombre}
                      {sinTasa ? ' (sin tasa)' : ''}
                    </button>
                  )
                })}
              </div>

              {pagos.length === 0 ? (
                <div className={styles.empty}>Selecciona al menos un método de pago.</div>
              ) : (
                <div className={styles.pagosList}>
                  {pagos.map(p => {
                    const metodo = metodos.find(m => m.id === p.metodo_id)
                    return (
                      <div key={p.metodo_id} className={styles.pagoCard}>
                        <div className={styles.pagoCardNombre}>{metodo?.nombre ?? ''}</div>

                        {p.tipo === 'efectivo_usd' ? (
                          <>
                            <div className={styles.pagoTasaLinea}>
                              Tasa: {formatPrice(tasaCambioUsd)} × USD 1.00
                            </div>
                            <div className={styles.pagoUsdRow}>
                              <label className={styles.formLabel}>
                                Monto (USD)
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className={styles.pagoMontoInput}
                                  value={p.monto_usd ?? 0}
                                  onChange={e => cambiarMontoUsd(p.metodo_id, e.target.value)}
                                  disabled={isPending}
                                />
                              </label>
                              <span className={styles.pagoUsdConversion}>≈ {formatPrice(p.monto)}</span>
                            </div>
                          </>
                        ) : (
                          <label className={styles.formLabel}>
                            Monto
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={styles.pagoMontoInput}
                              value={p.monto}
                              onChange={e => cambiarMonto(p.metodo_id, e.target.value)}
                              disabled={isPending}
                            />
                          </label>
                        )}

                        {(p.tipo === 'tarjeta' || p.tipo === 'transferencia') && (
                          <label className={styles.formLabel}>
                            Referencia
                            <input
                              type="text"
                              value={p.referencia ?? ''}
                              onChange={e => cambiarReferencia(p.metodo_id, e.target.value)}
                              disabled={isPending}
                            />
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.cobroResumen}>
          <div className={styles.resumenDestacado}><span>Total</span><span>{formatPrice(total)}</span></div>
          <div className={styles.totalesRow}><span>Pagado</span><span>{formatPrice(sumaPagos)}</span></div>
          {restante > 0 && (
            <div className={`${styles.resumenDestacado} ${styles.resumenRestante}`}>
              <span>Restante</span><span>{formatPrice(restante)}</span>
            </div>
          )}
          {cambio > 0 && (
            <div className={`${styles.resumenDestacado} ${styles.resumenCambio}`}>
              <span>Cambio</span><span>{formatPrice(cambio)}</span>
            </div>
          )}
        </div>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onClose} disabled={isPending}>
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
