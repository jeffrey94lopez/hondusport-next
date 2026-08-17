'use client'
import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import Modal from '@/components/admin/Modal'
import { cerrarSesion, obtenerCobrosSesion, obtenerDevolucionesSesion, obtenerDetalleTurno, obtenerResumenSesion } from '../actions'
import { esperadoCaja } from '@/lib/pos/emision'
import { formatPrice } from '@/lib/store/format'
import { round2, parseMoneyInput } from '../pos-helpers'
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
  // La caja YA se cerró (el arqueo está congelado) pero no se pudo volver a
  // traer el desglose/detalle fresco para el comprobante (ver handleCerrar):
  // en vez de imprimir un papel con datos en cero o incompletos —que
  // contradicen el bloque de créditos/cobros y hacen desaparecer la
  // identidad de seis términos sin avisar—, se avisa y se ofrece ir al
  // detalle del turno a reimprimir. Guarda el arqueo (no solo un booleano):
  // el spec exige que esperado/contado/diferencia se muestren SIEMPRE tras
  // confirmar, con o sin comprobante.
  const [cierreSinComprobante, setCierreSinComprobante] = useState<{
    esperado: number
    contado: number
    diferencia: number
  } | null>(null)

  // Cobros de CxC y devoluciones/reembolsos (P5a) ya registrados en esta
  // sesión abierta, para el resumen previo (no persiste nada; `cerrarSesion`
  // los vuelve a traer en el server para el cálculo definitivo al confirmar).
  // Si alguna de las dos lecturas falla, el resumen previo NO se puede pintar:
  // sin los cobros el esperado sale corto y sin las devoluciones sale de mas,
  // en ambos casos SIN aviso. Antes de la guarda de truncamiento estas
  // consultas casi no fallaban; ahora abortan a proposito cuando detectan que
  // faltan filas, asi que un fallo silencioso aqui mostraria un esperado peor
  // que el de antes. Se marca y se explica en vez de pintar un numero malo.
  const [resumenIncompleto, setResumenIncompleto] = useState(false)

  useEffect(() => {
    let activo = true
    obtenerCobrosSesion(sesion.id).then(result => {
      if (!activo) return
      if (result.ok && result.data) setCobros(result.data)
      else setResumenIncompleto(true)
    })
    obtenerDevolucionesSesion(sesion.id).then(result => {
      if (!activo) return
      if (result.ok && result.data) setDevoluciones(result.data)
      else setResumenIncompleto(true)
    })
    return () => { activo = false }
  }, [sesion.id])

  // Resumen previo (no persiste nada): la misma pura que usa `cerrarSesion`
  // en el server para el cálculo definitivo al confirmar. Nota: esto es una
  // FOTO tomada al abrir el modal (`documentos` viene resuelto desde
  // `pos/page.tsx`; `cobros`/`devoluciones` se piden en el efecto de arriba).
  // Sirve para el resumen previo (gobernado por `cierreCiegas`) y para la
  // fila de diferencia en vivo; NO se reutiliza para el comprobante final
  // (ver handleCerrar) — entre que se abre el modal y se confirma el cierre
  // puede registrarse un cobro de CxC u otro movimiento desde otra pantalla,
  // y el comprobante debe reflejar lo que `cerrarSesion` acaba de congelar,
  // no esta foto.
  const { efectivoEsperado, porMetodo, cobrosPorMetodo, devolucionesPorMetodo } = esperadoCaja(
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

      // Ninguno de los dos viaja en la respuesta de `cerrarSesion` (solo
      // esperado/diferencia): se piden FRESCOS justo ahora, en vez de
      // reutilizar la foto de arriba (`documentos`/`cobros`/`devoluciones`,
      // tomada al abrir el modal) — así el desglose del comprobante sale del
      // mismo instante que el propio arqueo que `cerrarSesion` acaba de
      // congelar, y no de un cálculo que pudo quedar desactualizado mientras
      // el cajero contaba la gaveta (p. ej. un cobro de CxC registrado desde
      // otra pantalla en ese lapso).
      const [detalleResult, resumenResult] = await Promise.all([
        obtenerDetalleTurno(sesion.id),
        obtenerResumenSesion(sesion.id),
      ])

      // Ambas consultas son igual de necesarias para que el papel no mienta:
      // sin `resumenResult` falta el desglose por método; sin `detalleResult`
      // el bloque de "Créditos otorgados" saldría vacío mientras el renglón
      // informativo de crédito (que sí viene de `resumenResult`) seguiría
      // mostrando el monto real — un papel que declara crédito y no lista
      // ninguno, indistinguible de un turno que de verdad no tuvo ninguno.
      // En cualquiera de los dos casos, mejor no montar el papel.
      if (!resumenResult.ok || !resumenResult.data || !detalleResult.ok || !detalleResult.data) {
        // El arqueo (esperado/contado/diferencia) sí se muestra siempre tras
        // confirmar, con o sin comprobante (spec) — se pasa lo que ya
        // devolvió `cerrarSesion` más el monto tecleado, no un recálculo.
        setCierreSinComprobante({ esperado: result.data.esperado, contado: contadoNum, diferencia: result.data.diferencia })
        return
      }

      setComprobante({
        sesion: {
          ...sesion,
          estado: 'cerrada',
          monto_esperado: result.data.esperado,
          monto_contado: contadoNum,
          diferencia: result.data.diferencia,
          notas: notas.trim(),
          cerrada_at: result.data.cerradaAt,
        },
        cajaNombre,
        empresaNombre,
        porMetodo: resumenResult.data.porMetodo,
        cobrosPorMetodo: resumenResult.data.cobrosPorMetodo,
        devolucionesPorMetodo: resumenResult.data.devolucionesPorMetodo,
        cambioEntregado: resumenResult.data.cambioEntregado,
        efectivoEsperadoDetalle: resumenResult.data.efectivoEsperado,
        detalle: detalleResult.data,
      })
    })
  }

  if (comprobante) {
    return <ComprobanteTurnoModal datos={comprobante} onCerrar={onCerrado} />
  }

  if (cierreSinComprobante) {
    return (
      <Modal title="Cerrar caja" onClose={onCerrado}>
        <div className={styles.cierreModal}>
          {/* El arqueo se muestra SIEMPRE tras confirmar (spec), con o sin
              comprobante — estos tres valores son los que ya devolvió
              `cerrarSesion`, no un recálculo. */}
          <div className={styles.totalesPanel}>
            <div className={styles.totalesRow}>
              <span>Esperado</span>
              <span>{formatPrice(cierreSinComprobante.esperado)}</span>
            </div>
            <div className={styles.totalesRowTotal}>
              <span>Contado</span>
              <span>{formatPrice(cierreSinComprobante.contado)}</span>
            </div>
          </div>
          <div
            className={styles.diferenciaRow}
            style={{ color: cierreSinComprobante.diferencia < 0 ? 'var(--danger)' : 'var(--success)' }}
          >
            <span>
              {cierreSinComprobante.diferencia === 0 ? 'Cuadra exacto' : cierreSinComprobante.diferencia > 0 ? 'Sobrante' : 'Faltante'}
            </span>
            <span>{formatPrice(Math.abs(cierreSinComprobante.diferencia))}</span>
          </div>
          <p className={styles.identNota}>
            La caja se cerró correctamente, pero no se pudo generar el comprobante en este momento.
            Puedes reimprimirlo desde el detalle del turno.
          </p>
          <div className={styles.formFooter}>
            <Link href={`/admin/pos/turnos/${sesion.id}`} className={`btnMerlinSecondary ${styles.btnCancel}`}>
              Ver detalle del turno
            </Link>
            <button type="button" className={`btnMerlinPrimary ${styles.btnSubmit}`} onClick={onCerrado}>
              Listo
            </button>
          </div>
        </div>
      </Modal>
    )
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
        {!cierreCiegas && resumenIncompleto && (
          <p className={styles.identNota}>
            No se pudo leer todo el movimiento del turno, así que el resumen previo no se
            muestra: saldría con un efectivo esperado equivocado. Puedes contar la gaveta y
            confirmar igual — el arqueo definitivo lo calcula el servidor al cerrar, y si
            tampoco puede leerlo todo, no cerrará la caja y te lo dirá.
          </p>
        )}

        {!cierreCiegas && !resumenIncompleto && (
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

        {/* CRÍTICO (revisión de esta tarea): esta fila daba feedback EN VIVO
            mientras el cajero teclea (`diferencia` se recalcula en cada
            cambio, línea de arriba), sin importar el interruptor — un cajero
            podía tantear números hasta ver "Cuadra exacto", que es
            exactamente el ajuste de conteo que el cierre a ciegas existe
            para impedir. Con el interruptor activo, este renglón no se
            pinta; el arqueo real se sigue mostrando siempre DESPUÉS de
            confirmar, vía el comprobante. */}
        {/* `!resumenIncompleto` además del interruptor: esta fila compara contra
            el mismo `efectivoEsperado` del resumen previo, así que si ese número
            está incompleto la diferencia en vivo también lo está. */}
        {!cierreCiegas && !resumenIncompleto && diferencia !== null && (
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
