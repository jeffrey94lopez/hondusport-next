'use client'
import { useState, useTransition, useEffect } from 'react'
import Modal from '@/components/admin/Modal'
import { cerrarSesion, obtenerCobrosSesion, obtenerDevolucionesSesion, obtenerDetalleTurno } from '../actions'
import { esperadoCaja } from '@/lib/pos/emision'
import { formatPrice } from '@/lib/store/format'
import { round2, parseMoneyInput } from '../pos-helpers'
import type { DetalleTurno } from '@/lib/pos/turnos'
import ComprobanteTurnoModal, { type ComprobanteTurnoDatos } from './ComprobanteTurnoModal'
import type { SesionCaja, DocumentoParaArqueo, MetodoPagoTipo, CobroMetodo } from '@/types'
import styles from '../pos.module.css'

const NOMBRES_METODO: Record<MetodoPagoTipo, string> = {
  efectivo_lps: 'Efectivo L.',
  efectivo_usd: 'Efectivo USD',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
  credito: 'Crédito',
  saldo_favor: 'Saldo a favor',
}

const NOMBRES_COBRO: Record<CobroMetodo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
}

interface CierreModalProps {
  sesion: SesionCaja
  documentos: DocumentoParaArqueo[]
  cartLineasPendientes: number
  cajaNombre: string
  empresaNombre: string
  /** Interruptor global `pos_cierre_ciegas` (R7): con `true` (ausente =
   * activo), el efectivo esperado y su desglose NO se muestran antes de
   * teclear el conteo. Solo decide qué se pinta — `esperadoCaja` se sigue
   * invocando igual y `cerrarSesion` sigue siendo quien congela el arqueo. */
  cierreCiegas: boolean
  onClose: () => void
  onCerrado: () => void
}

export default function CierreModal({
  sesion,
  documentos,
  cartLineasPendientes,
  cajaNombre,
  empresaNombre,
  cierreCiegas,
  onClose,
  onCerrado,
}: CierreModalProps) {
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [cobros, setCobros] = useState<Array<{ metodo: CobroMetodo; monto: number }>>([])
  const [devoluciones, setDevoluciones] = useState<Array<{ metodo: CobroMetodo; monto: number }>>([])
  // Comprobante de cierre (R7): se llena tras un `cerrarSesion` exitoso y,
  // mientras exista, reemplaza el formulario de conteo por el papel. `null`
  // = todavía no se ha cerrado (o el usuario sigue tecleando el conteo).
  const [comprobante, setComprobante] = useState<ComprobanteTurnoDatos | null>(null)

  // Cobros de CxC y devoluciones/reembolsos (P5a) ya registrados en esta
  // sesión abierta, para el resumen previo (no persiste nada; `cerrarSesion`
  // los vuelve a traer en el server para el cálculo definitivo al confirmar).
  useEffect(() => {
    let activo = true
    obtenerCobrosSesion(sesion.id).then(result => {
      if (activo && result.ok && result.data) setCobros(result.data)
    })
    obtenerDevolucionesSesion(sesion.id).then(result => {
      if (activo && result.ok && result.data) setDevoluciones(result.data)
    })
    return () => { activo = false }
  }, [sesion.id])

  // Resumen previo (no persiste nada): la misma pura que usa `cerrarSesion`
  // en el server para el cálculo definitivo al confirmar.
  const { efectivoEsperado, cambioEntregado, porMetodo, cobrosPorMetodo, devolucionesPorMetodo } = esperadoCaja(
    Number(sesion.monto_inicial),
    documentos,
    cobros,
    devoluciones,
  )
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
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo cerrar la sesión.' : result.error)
        return
      }

      // El comprobante necesita el detalle de créditos otorgados y cobros de
      // CxC recibidos (Task 3), que no viaja en la respuesta de
      // `cerrarSesion` (solo esperado/diferencia). El desglose por método
      // (porMetodo/cobrosPorMetodo/devolucionesPorMetodo/cambioEntregado) SÍ
      // se reutiliza del cálculo local de arriba: viene de los mismos
      // `documentos`/`cobros`/`devoluciones` que se acaban de usar para
      // confirmar el cierre, así que es consistente con lo que la RPC acaba
      // de congelar.
      const detalleResult = await obtenerDetalleTurno(sesion.id)
      const detalle: DetalleTurno = detalleResult.ok && detalleResult.data
        ? detalleResult.data
        : { creditos: [], cobros: [] }

      setComprobante({
        sesion: {
          ...sesion,
          estado: 'cerrada',
          monto_esperado: result.data.esperado,
          monto_contado: contadoNum,
          diferencia: result.data.diferencia,
          notas: notas.trim(),
          cerrada_at: new Date().toISOString(),
        },
        cajaNombre,
        empresaNombre,
        porMetodo,
        cobrosPorMetodo,
        devolucionesPorMetodo,
        cambioEntregado,
        efectivoEsperadoDetalle: efectivoEsperado,
        detalle,
      })
    })
  }

  if (comprobante) {
    return <ComprobanteTurnoModal datos={comprobante} onCerrar={onCerrado} />
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

        {/* Interruptor `pos_cierre_ciegas` (R7): con el cierre a ciegas activo
            (por defecto), estos tres bloques —efectivo esperado y su
            desglose por método, cobros de CxC y devoluciones— no se pintan
            antes de teclear el conteo. El cálculo de arriba (`esperadoCaja`)
            se sigue ejecutando igual: el interruptor decide solo qué se
            muestra, nunca qué se calcula ni qué congela `cerrarSesion`. */}
        {!cierreCiegas && (
          <>
            <div className={styles.totalesPanel}>
              {(Object.keys(porMetodo) as MetodoPagoTipo[])
                .filter(tipo => tipo !== 'credito' && porMetodo[tipo] > 0)
                .map(tipo => (
                  <div key={tipo} className={styles.totalesRow}>
                    <span>{NOMBRES_METODO[tipo]}</span>
                    <span>{formatPrice(porMetodo[tipo])}</span>
                  </div>
                ))}
              {porMetodo.credito > 0 && (
                <div className={styles.totalesRow}>
                  <span>Crédito otorgado (no es efectivo)</span>
                  <span>{formatPrice(porMetodo.credito)}</span>
                </div>
              )}
              <div className={styles.totalesRowTotal}>
                <span>Efectivo esperado</span>
                <span>{formatPrice(efectivoEsperado)}</span>
              </div>
            </div>

            {(Object.keys(cobrosPorMetodo) as CobroMetodo[]).some(m => cobrosPorMetodo[m] > 0) && (
              <div className={styles.totalesPanel}>
                <div className={styles.panelTitle}>Cobros de CxC</div>
                <div className={styles.identNota}>
                  Cobros de esta sesión. El efectivo cobrado ya está sumado al efectivo esperado.
                </div>
                {(Object.keys(cobrosPorMetodo) as CobroMetodo[])
                  .filter(metodo => cobrosPorMetodo[metodo] > 0)
                  .map(metodo => (
                    <div key={metodo} className={styles.totalesRow}>
                      <span>{NOMBRES_COBRO[metodo]}</span>
                      <span>{formatPrice(cobrosPorMetodo[metodo])}</span>
                    </div>
                  ))}
              </div>
            )}

            {(Object.keys(devolucionesPorMetodo) as CobroMetodo[]).some(m => devolucionesPorMetodo[m] > 0) && (
              <div className={styles.totalesPanel}>
                <div className={styles.panelTitle}>Devoluciones / reembolsos</div>
                <div className={styles.identNota}>
                  Reembolsos de esta sesión. El efectivo reembolsado ya está restado del efectivo esperado.
                </div>
                {(Object.keys(devolucionesPorMetodo) as CobroMetodo[])
                  .filter(metodo => devolucionesPorMetodo[metodo] > 0)
                  .map(metodo => (
                    <div key={metodo} className={styles.totalesRow}>
                      <span>{NOMBRES_COBRO[metodo]}</span>
                      <span>{formatPrice(devolucionesPorMetodo[metodo])}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {/* R4 Task 7 (look Stitch): mismo tratamiento que los montos de pago de
            CobroModal (.pagoCard/.pagoMontoWrap/.pagoMontoPrefix/.pagoMontoInput,
            mismo módulo) — es el único monto que captura el cajero en este
            modal, así que se destaca igual que "Monto recibido" en el cobro. */}
        <div className={styles.pagoCard}>
          <div className={styles.pagoCardNombre}>Monto contado en efectivo</div>
          <div className={styles.pagoMontoWrap}>
            <span className={styles.pagoMontoPrefix}>L.</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={styles.pagoMontoInput}
              value={montoContado}
              onChange={e => setMontoContado(e.target.value)}
              autoFocus
              disabled={isPending}
            />
          </div>
        </div>

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
