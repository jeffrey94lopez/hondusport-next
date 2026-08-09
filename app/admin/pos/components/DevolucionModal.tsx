'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import NotaCreditoHoja from './NotaCreditoHoja'
import { obtenerDevolvible, emitirNotaCredito, obtenerNotaCredito } from '../actions'
import {
  cantidadDevolvible,
  recalcularLineaDevuelta,
  totalNotaCredito,
  validarReembolsos,
  LABEL_REEMBOLSO,
} from '@/lib/pos/devoluciones'
import { formatPrice } from '@/lib/store/format'
import { parseMoneyInput, valorMostrado, round2 } from '../pos-helpers'
import type {
  LineaOriginalDoc,
  ReembolsoDevolucion,
  ReembolsoTipo,
  Caja,
  SesionCaja,
  Documento,
  DocumentoItem,
  NotaCreditoReembolso,
  CaiAutorizacion,
  ConfigMap,
} from '@/types'
import styles from './DevolucionModal.module.css'
import impStyles from '../documento/documento.module.css'

type Formato = '80mm' | 'carta'

interface NotaCreditoData {
  documento: Documento
  items: DocumentoItem[]
  reembolsos: NotaCreditoReembolso[]
  origen: Pick<Documento, 'tipo' | 'correlativo' | 'numero_comprobante'> | null
  cai: CaiAutorizacion | null
  caja: Caja
  config: ConfigMap
}

interface DevolvibleData {
  documento: {
    id: string
    // obtenerDevolvible ya valida que sea factura/comprobante antes de
    // devolver `ok:true`; el tipo declarado es el de `Documento.tipo`
    // (ver Pick<Documento,...> en la firma de la action), que ahora incluye
    // nota_credito/devolucion — de ahí la unión amplia aquí también.
    tipo: 'factura' | 'comprobante' | 'nota_credito' | 'devolucion'
    correlativo: string | null
    numero_comprobante: number | null
    cliente_id: string | null
    cliente_nombre: string
    exonerado: boolean
    total: number
    estado: 'emitido' | 'anulado'
    created_at: string
  }
  lineas: LineaOriginalDoc[]
  saldoCxc: number
  sinEfectivo: boolean
}

interface ReembolsoUi {
  tipo: ReembolsoTipo
  monto: number
  montoTexto: string
}

interface Props {
  documentoId: string
  sesiones: SesionCaja[]
  cajas: Caja[]
  onClose: () => void
  // El propio modal muestra la NC/devolución impresa tras emitir (ver el
  // branch `notaCreditoId` más abajo); el consumidor solo necesita refrescar
  // el listado/detalle en segundo plano — no debe cerrar el modal aquí (eso
  // lo hace `onClose`, disparado desde el botón "Cerrar" de esa pantalla).
  onEmitida: (notaCreditoId: string) => void
}

function nombreCaja(cajas: Caja[], cajaId: string): string {
  return cajas.find(c => c.id === cajaId)?.nombre ?? 'Caja'
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
}

export default function DevolucionModal({ documentoId, sesiones, cajas, onClose, onEmitida }: Props) {
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [data, setData] = useState<DevolvibleData | null>(null)

  // Cantidad a devolver por línea: texto crudo (mismo criterio que los
  // inputs de dinero, ver pos-helpers) — se clampa a [0, devolvible] solo al
  // derivar el importe/payload, nunca reescribiendo lo que tecleó el cajero.
  const [cantidadesTexto, setCantidadesTexto] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [reembolsos, setReembolsos] = useState<ReembolsoUi[]>([])
  const [sesionId, setSesionId] = useState<string | null>(sesiones.length === 1 ? sesiones[0].id : null)
  const [errorSubmit, setErrorSubmit] = useState('')
  const [isPending, startTransition] = useTransition()

  // Task 5: tras emitir con éxito, el modal deja de mostrar el formulario y
  // pasa a mostrar la NC/devolución impresa (mismo criterio que DocumentoModal
  // para la venta) — `onClose` sigue siendo quien cierra todo el flujo, ahora
  // disparado desde el botón "Cerrar" de esa pantalla en vez de al emitir.
  const [notaCreditoId, setNotaCreditoId] = useState<string | null>(null)
  const [ncData, setNcData] = useState<NotaCreditoData | null>(null)
  const [ncFormato, setNcFormato] = useState<Formato>('80mm')
  const [ncCargando, setNcCargando] = useState(false)
  const [ncError, setNcError] = useState('')

  useEffect(() => {
    if (!notaCreditoId) return
    let cancelado = false
    obtenerNotaCredito(notaCreditoId).then(result => {
      if (cancelado) return
      if (!result.ok || !result.data) {
        setNcError(result.ok ? 'No se pudo cargar la nota de crédito.' : result.error)
        setNcCargando(false)
        return
      }
      setNcData(result.data)
      setNcFormato(result.data.caja.formato_impresion)
      setNcCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [notaCreditoId])

  useEffect(() => {
    let cancelado = false
    obtenerDevolvible(documentoId).then(result => {
      if (cancelado) return
      if (!result.ok || !result.data) {
        setErrorCarga(result.ok ? 'No se pudo cargar el documento.' : result.error)
        setCargando(false)
        return
      }
      setData(result.data)
      setCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [documentoId])

  // Cada línea con su devolvible, la cantidad efectiva (clampada) y el
  // importe que acredita — recalculado en vivo con la misma matemática que
  // usa la RPC (recalcularLineaDevuelta), no aproximado en el cliente.
  const lineasCalculadas = useMemo(() => {
    if (!data) return []
    return data.lineas.map(linea => {
      const devolvible = cantidadDevolvible(linea.cantidad, linea.ya_devuelto)
      const parseada = Math.round(parseMoneyInput(cantidadesTexto[linea.id] ?? ''))
      const cantidad = Math.max(0, Math.min(parseada, devolvible))
      const importe = cantidad > 0 ? recalcularLineaDevuelta(linea, cantidad).importe : 0
      return { linea, devolvible, cantidad, importe }
    })
  }, [data, cantidadesTexto])

  const total = totalNotaCredito(lineasCalculadas.map(l => ({ importe: l.importe })))

  // Vías de reembolso disponibles: efectivo se oculta si la regla
  // `devoluciones_sin_efectivo` está activa o si no hay ninguna caja con
  // sesión abierta (la RPC exige caja_id igual — sin sesión abierta no hay
  // dónde registrar la devolución, ver `emitir_nota_credito`).
  const tiposDisponibles = useMemo((): ReembolsoTipo[] => {
    if (!data) return []
    const tipos: ReembolsoTipo[] = []
    if (!data.sinEfectivo && sesiones.length > 0) tipos.push('efectivo')
    if (data.documento.cliente_id) tipos.push('saldo_favor')
    if (data.saldoCxc > 0) tipos.push('cxc')
    return tipos
  }, [data, sesiones.length])

  function pendienteReembolso(tipo: ReembolsoTipo): number {
    const otros = reembolsos.filter(r => r.tipo !== tipo)
    const sumaOtros = round2(otros.reduce((s, r) => s + r.monto, 0))
    return Math.max(0, round2(total - sumaOtros))
  }

  function alternarReembolso(tipo: ReembolsoTipo) {
    if (isPending) return
    const yaActivo = reembolsos.some(r => r.tipo === tipo)
    if (yaActivo) {
      setReembolsos(prev => prev.filter(r => r.tipo !== tipo))
      return
    }
    setReembolsos(prev => {
      const otros = prev.filter(r => r.tipo !== tipo)
      const sumaOtros = round2(otros.reduce((s, r) => s + r.monto, 0))
      const pendiente = Math.max(0, round2(total - sumaOtros))
      return [...otros, { tipo, monto: pendiente, montoTexto: valorMostrado(pendiente) }]
    })
  }

  function cambiarMontoReembolso(tipo: ReembolsoTipo, texto: string) {
    setReembolsos(prev =>
      prev.map(r => (r.tipo === tipo ? { ...r, montoTexto: texto, monto: parseMoneyInput(texto) } : r)),
    )
  }

  function fijarMontoReembolso(tipo: ReembolsoTipo, monto: number) {
    setReembolsos(prev =>
      prev.map(r => (r.tipo === tipo ? { ...r, monto, montoTexto: valorMostrado(monto) } : r)),
    )
  }

  const reembolsosPayload: ReembolsoDevolucion[] = reembolsos
    .filter(r => r.monto > 0)
    .map(r => ({ tipo: r.tipo, monto: r.monto, metodo_id: null }))

  const errorReembolsos = data
    ? validarReembolsos(reembolsosPayload, total, {
        saldoCxc: data.saldoCxc,
        sinEfectivo: data.sinEfectivo,
        clienteRegistrado: !!data.documento.cliente_id,
      })
    : null

  const sesionSeleccionada = sesiones.find(s => s.id === sesionId) ?? null

  function handleConfirmar() {
    if (!data) return
    setErrorSubmit('')

    if (!motivo.trim()) {
      setErrorSubmit('El motivo es requerido.')
      return
    }
    const lineasPayload = lineasCalculadas
      .filter(l => l.cantidad > 0)
      .map(l => ({ origenItemId: l.linea.id, cantidad: l.cantidad }))
    if (lineasPayload.length === 0) {
      setErrorSubmit('Marca al menos una cantidad a devolver.')
      return
    }
    if (!sesionSeleccionada) {
      setErrorSubmit('Selecciona la caja que recibe la devolución.')
      return
    }
    if (errorReembolsos) {
      setErrorSubmit(errorReembolsos)
      return
    }

    startTransition(async () => {
      const result = await emitirNotaCredito({
        documentoOrigenId: data.documento.id,
        cajaId: sesionSeleccionada.caja_id,
        motivo: motivo.trim(),
        lineas: lineasPayload,
        reembolsos: reembolsosPayload,
      })
      if (!result.ok || !result.data) {
        setErrorSubmit(result.ok ? 'No se pudo completar la operación. Intenta de nuevo.' : result.error)
        return
      }
      onEmitida(result.data.id)
      // `ncCargando` arranca en `true` aquí (al disparar el cambio de fase),
      // no dentro del efecto — llamar setState síncrono en el cuerpo del
      // efecto (en vez de en un callback async) dispara cascading renders,
      // ver lint react-hooks/set-state-in-effect (mismo criterio que
      // `cargando`/lazy init en DocumentoModal).
      setNcCargando(true)
      setNotaCreditoId(result.data.id)
    })
  }

  // Mismo wrapper (clases de documento.module.css) que DocumentoModal usa para
  // el papel de la venta recién emitida — no el <Modal> genérico (su overlay
  // `position: fixed` no fragmenta en paginado, ver comentario de
  // `.modalDocumentoOverlay` en ese CSS): así el papel de la NC/devolución
  // pagina bien al imprimir desde este modal.
  if (notaCreditoId) {
    const tituloNc = ncData
      ? `${ncData.documento.tipo === 'nota_credito' ? 'Nota de crédito' : 'Devolución'} emitida`
      : 'Documento emitido'

    return (
      <div className={impStyles.modalDocumentoOverlay}>
        <div className={impStyles.modalDocumento}>
          <div className={`${impStyles.modalDocumentoToolbar} ${impStyles.noPrint}`}>
            <div className={impStyles.modalDocumentoToolbarTop}>
              <span className={impStyles.modalDocumentoToolbarTitulo}>{tituloNc}</span>
            </div>
            <div className={impStyles.modalDocumentoToolbarAcciones}>
              {ncData && (
                <div className={impStyles.formatoGroup}>
                  <button
                    type="button"
                    className="btnMerlinChip"
                    aria-pressed={ncFormato === '80mm'}
                    onClick={() => setNcFormato('80mm')}
                  >
                    80mm
                  </button>
                  <button
                    type="button"
                    className="btnMerlinChip"
                    aria-pressed={ncFormato === 'carta'}
                    onClick={() => setNcFormato('carta')}
                  >
                    Carta
                  </button>
                </div>
              )}
              {ncData && (
                <button type="button" className={`btnMerlinPrimary ${impStyles.btnToolbar}`} onClick={() => window.print()}>
                  Imprimir
                </button>
              )}
              <button type="button" className={`btnMerlinTertiary ${impStyles.btnToolbar}`} onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>

          <div className={impStyles.modalDocumentoBody}>
            {ncCargando && <div className={`${impStyles.modalDocumentoEstado} ${impStyles.noPrint}`}>Cargando…</div>}
            {!ncCargando && ncError && (
              <div className={`${impStyles.modalDocumentoEstado} ${impStyles.noPrint}`}>{ncError}</div>
            )}
            {!ncCargando && ncData && (
              <NotaCreditoHoja
                documento={ncData.documento}
                items={ncData.items}
                reembolsos={ncData.reembolsos}
                origen={ncData.origen}
                cai={ncData.cai}
                config={ncData.config}
                formato={ncFormato}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  const titulo = data
    ? `Devolver ${data.documento.tipo === 'factura' ? 'factura' : 'comprobante'} — ${data.documento.cliente_nombre}`
    : 'Devolver'

  return (
    <Modal title={titulo} onClose={onClose} maxWidth="680px">
      <div className={styles.body}>
        {cargando && <div className={styles.estado}>Cargando…</div>}
        {!cargando && errorCarga && <div className={styles.formError}>{errorCarga}</div>}

        {!cargando && data && (
          <>
            <div className={styles.lineas}>
              <div className={styles.lineasHeader}>
                <span>Producto</span>
                <span>Devolvible</span>
                <span>Cantidad</span>
                <span>Acredita</span>
              </div>
              {lineasCalculadas.length === 0 && (
                <div className={styles.sinLineas}>Este documento no tiene líneas.</div>
              )}
              {lineasCalculadas.map(({ linea, devolvible, importe }) => (
                <div key={linea.id} className={styles.lineaRow}>
                  <span className={styles.lineaDesc}>{linea.descripcion}</span>
                  <span className={styles.lineaDevolvible}>{devolvible}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className={styles.cantidadInput}
                    value={cantidadesTexto[linea.id] ?? ''}
                    onChange={e => setCantidadesTexto(prev => ({ ...prev, [linea.id]: e.target.value }))}
                    disabled={isPending || devolvible <= 0}
                  />
                  <span className={styles.lineaImporte}>{formatPrice(importe)}</span>
                </div>
              ))}
            </div>

            <div className={styles.total}>
              <span>Total a acreditar</span>
              <span>{formatPrice(total)}</span>
            </div>

            {sesiones.length === 0 && (
              <p className={styles.formError}>
                No hay una caja abierta; abre una caja en el POS para poder emitir la devolución.
              </p>
            )}
            {sesiones.length > 1 && (
              <label className={styles.formLabel}>
                Caja
                <select value={sesionId ?? ''} onChange={e => setSesionId(e.target.value || null)} disabled={isPending}>
                  <option value="">Selecciona una caja…</option>
                  {sesiones.map(s => (
                    <option key={s.id} value={s.id}>
                      {nombreCaja(cajas, s.caja_id)} — abierta desde {formatHora(s.abierta_at)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {sesiones.length === 1 && (
              <p className={styles.hint}>Se registrará en la caja {nombreCaja(cajas, sesiones[0].caja_id)}.</p>
            )}

            <div className={styles.reembolsoSection}>
              <div className={styles.reembolsoHeader}>Reembolso</div>
              {tiposDisponibles.length === 0 ? (
                <p className={styles.hint}>No hay vías de reembolso disponibles para este documento.</p>
              ) : (
                <>
                  <div className={styles.chipsRow}>
                    {tiposDisponibles.map(tipo => {
                      const activo = reembolsos.some(r => r.tipo === tipo)
                      return (
                        <button
                          key={tipo}
                          type="button"
                          className="btnMerlinChip"
                          aria-pressed={activo}
                          onClick={() => alternarReembolso(tipo)}
                          disabled={isPending}
                        >
                          {LABEL_REEMBOLSO[tipo]}
                        </button>
                      )
                    })}
                  </div>

                  {reembolsos.map(r => (
                    <div key={r.tipo} className={styles.reembolsoCard}>
                      <span className={styles.reembolsoNombre}>{LABEL_REEMBOLSO[r.tipo]}</span>
                      <label className={styles.formLabel}>
                        Monto
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          className={styles.montoInput}
                          value={r.montoTexto}
                          onChange={e => cambiarMontoReembolso(r.tipo, e.target.value)}
                          disabled={isPending}
                        />
                      </label>
                      <div className={styles.reembolsoChipsRow}>
                        <button
                          type="button"
                          className="btnMerlinChip"
                          onClick={() => fijarMontoReembolso(r.tipo, total)}
                          disabled={isPending}
                        >
                          Total
                        </button>
                        <button
                          type="button"
                          className="btnMerlinChip"
                          onClick={() => fijarMontoReembolso(r.tipo, pendienteReembolso(r.tipo))}
                          disabled={isPending}
                        >
                          Restante
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Fix round 1 (revisión Task 4): feedback en vivo de
                validarReembolsos, no solo al confirmar — el cajero ve al
                instante si los montos no cuadran, exceden el saldo de CxC,
                o el efectivo está deshabilitado. */}
            {errorReembolsos && <div className={styles.formError}>{errorReembolsos}</div>}

            <label className={styles.formLabel}>
              Motivo *
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={3}
                placeholder="Explica el motivo de la devolución"
                disabled={isPending}
              />
            </label>

            {errorSubmit && <div className={styles.formError}>{errorSubmit}</div>}

            <div className={styles.formFooter}>
              <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onClose} disabled={isPending}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btnMerlinPrimary ${styles.btnSubmit}`}
                onClick={handleConfirmar}
                disabled={isPending || sesiones.length === 0 || !motivo.trim() || !!errorReembolsos}
              >
                {isPending ? 'Emitiendo…' : 'Confirmar devolución'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
