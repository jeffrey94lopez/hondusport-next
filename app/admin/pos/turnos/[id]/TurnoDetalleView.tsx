'use client'
import { useState } from 'react'
import Link from 'next/link'
import { formatPrice } from '@/lib/store/format'
import { numeroDocumento } from '@/lib/pos/documentos'
import type { DetalleTurno } from '@/lib/pos/turnos'
import ComprobanteTurnoModal, { type ComprobanteTurnoDatos } from '../../components/ComprobanteTurnoModal'
import type { Caja, CobroMetodo, Documento, MetodoPagoTipo, SesionCaja } from '@/types'
import styles from '../turnos.module.css'

export interface DocumentoTurno {
  id: string
  tipo: Documento['tipo']
  correlativo: string | null
  numero_comprobante: number | null
  created_at: string
  estado: Documento['estado']
  total: number
}

interface Props {
  sesion: SesionCaja
  caja: Pick<Caja, 'id' | 'nombre'> | null
  /** Efectivo esperado calculado en vivo con `esperadoCaja` (no persiste). Se
   * muestra solo si la sesión sigue abierta; para una cerrada se usa el valor
   * congelado en `sesion.monto_esperado`. */
  esperadoEnVivo: number
  /** Cambio entregado acumulado (R7, `esperadoCaja`): línea propia del
   * comprobante para que el desglose por método reconcilie con el esperado. */
  cambioEntregado: number
  porMetodo: Record<MetodoPagoTipo, number>
  /** Cobros de CxC en efectivo/transferencia/tarjeta/cheque de esta sesión,
   * informativos: el efectivo ya está sumado dentro de `esperadoEnVivo` (turno
   * abierto) o de `sesion.monto_esperado` (turno cerrado, congelado al cerrar). */
  cobrosPorMetodo: Record<CobroMetodo, number>
  /** Devoluciones/reembolsos de esta sesión, informativos: el efectivo ya está
   * restado del mismo esperado (ver `cobrosPorMetodo`). */
  devolucionesPorMetodo: Record<CobroMetodo, number>
  documentos: DocumentoTurno[]
  /** Créditos otorgados y cobros de CxC recibidos en el turno (R7,
   * `obtenerDetalleTurno`), para el comprobante reimprimible. */
  detalle: DetalleTurno
  /** `false` si `obtenerDetalleTurno` falló en el server component: `detalle`
   * llegó vacío como respaldo, no porque el turno no tuviera créditos/cobros.
   * Imprimir con ese respaldo mentiría (el renglón informativo de crédito de
   * `porMetodo` seguiría mostrando el monto real mientras el bloque de
   * "Créditos otorgados" saldría vacío) — el botón se deshabilita en vez de
   * arriesgarse. */
  detalleDisponible: boolean
  /**
   * `false` si los cobros o las devoluciones del turno no se pudieron leer.
   * Sin ellos `esperadoEnVivo` sale corto (faltan cobros) o de más (faltan
   * reembolsos), sin ninguna señal: se muestra `—` en vez de un número que
   * el supervisor cuadraría contra la gaveta creyendolo bueno.
   */
  movimientoCompleto: boolean
  empresaNombre: string
}

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

// El servidor de Next (Vercel) corre en UTC; sin `timeZone` explícito, en
// producción esta fecha saldría 6 horas corrida respecto a la hora hondureña
// que ya muestra `TurnosClient` (esa sí formatea en el cliente, con la zona
// del navegador). Se fija la zona real del negocio, no la del proceso.
function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function claseDiferencia(d: number): string {
  if (d < 0) return styles.diffNegativa
  if (d > 0) return styles.diffPositiva
  return styles.diffNeutra
}

function etiquetaDiferencia(d: number): string {
  if (d === 0) return 'Cuadra exacto'
  return d > 0 ? 'Sobrante' : 'Faltante'
}

export default function TurnoDetalleView({
  sesion,
  caja,
  esperadoEnVivo,
  cambioEntregado,
  porMetodo,
  cobrosPorMetodo,
  devolucionesPorMetodo,
  documentos,
  detalle,
  detalleDisponible,
  movimientoCompleto,
  empresaNombre,
}: Props) {
  const cerrada = sesion.estado === 'cerrada'
  const diferencia = sesion.diferencia ?? 0
  const [comprobante, setComprobante] = useState(false)

  // Datos del comprobante (R7): el arqueo sale de `sesion` tal cual (valores
  // congelados si está cerrada, `null` si sigue abierta — `ComprobanteTurno`
  // ya distingue ambos casos); el desglose por método es el mismo que ya
  // calculó el server component con `esperadoCaja` para esta pantalla.
  const datosComprobante: ComprobanteTurnoDatos = {
    sesion,
    cajaNombre: caja?.nombre ?? '—',
    empresaNombre,
    porMetodo,
    cobrosPorMetodo,
    devolucionesPorMetodo,
    cambioEntregado,
    efectivoEsperadoDetalle: esperadoEnVivo,
    detalle,
  }

  const metodosConMonto = (Object.keys(porMetodo) as MetodoPagoTipo[]).filter(
    tipo => tipo !== 'credito' && porMetodo[tipo] > 0,
  )
  const cobrosConMonto = (Object.keys(cobrosPorMetodo) as CobroMetodo[]).filter(m => cobrosPorMetodo[m] > 0)
  const devolucionesConMonto = (Object.keys(devolucionesPorMetodo) as CobroMetodo[]).filter(
    m => devolucionesPorMetodo[m] > 0,
  )

  return (
    <>
    {/* `.noPrint` oculta esta pantalla al imprimir (R7): el comprobante se
        renderiza como HERMANO de este bloque, no adentro — si estuviera
        anidado aquí, ocultar este contenedor también lo escondería. Sin este
        envoltorio, imprimir el comprobante arrastraría el encabezado, la
        card de arqueo y la tabla de documentos detrás de la tirilla (papel
        desperdiciado en cada copia). */}
    <div className={`${styles.page} ${styles.noPrint}`}>
      <div className={styles.detalleHeader}>
        <div>
          <h1 className={styles.title}>Turno de caja — {caja?.nombre ?? '—'}</h1>
          <p className={styles.subtitle}>
            {sesion.usuario ?? 'Usuario desconocido'} · Apertura {fecha(sesion.abierta_at)} · Cierre{' '}
            {cerrada ? fecha(sesion.cerrada_at) : 'aún abierto'}
          </p>
        </div>
        <div className={styles.detalleHeaderAcciones}>
          <button
            type="button"
            className={`btnMerlinSecondary ${styles.btn}`}
            onClick={() => setComprobante(true)}
            disabled={!detalleDisponible}
            title={detalleDisponible ? undefined : 'No se pudo cargar todo el movimiento del turno (créditos, cobros o devoluciones). Recarga la página e intenta de nuevo.'}
          >
            Imprimir comprobante
          </button>
          <Link href="/admin/pos/turnos" className={styles.volverLink}>
            ← Volver a turnos
          </Link>
        </div>
      </div>

      <div className={styles.arqueoCard}>
        <div className={styles.arqueoRow}>
          <span className={styles.arqueoLabel}>Monto inicial</span>
          <span className={styles.arqueoValor}>{formatPrice(sesion.monto_inicial)}</span>
        </div>

        {cerrada ? (
          <>
            <div className={styles.arqueoRow}>
              <span className={styles.arqueoLabel}>Efectivo esperado</span>
              <span className={styles.arqueoValor}>{formatPrice(sesion.monto_esperado ?? 0)}</span>
            </div>
            <div className={styles.arqueoRow}>
              <span className={styles.arqueoLabel}>Monto contado</span>
              <span className={styles.arqueoValor}>{formatPrice(sesion.monto_contado ?? 0)}</span>
            </div>
            <div className={`${styles.arqueoRow} ${styles.arqueoDiferencia} ${claseDiferencia(diferencia)}`}>
              <span>{etiquetaDiferencia(diferencia)}</span>
              <span>{formatPrice(Math.abs(diferencia))}</span>
            </div>
          </>
        ) : (
          <>
            <div className={styles.arqueoRow}>
              <span className={styles.arqueoLabel}>
                Efectivo esperado <span className={styles.arqueoEstimado}>(estimado)</span>
              </span>
              <span className={styles.arqueoValor}>
                {movimientoCompleto ? formatPrice(esperadoEnVivo) : '—'}
              </span>
            </div>
            <p className={styles.arqueoNota}>
              {movimientoCompleto
                ? 'El turno sigue abierto. El monto contado y la diferencia se registran al cerrar la caja.'
                : 'No se pudo leer todo el movimiento del turno, así que el efectivo esperado no se muestra: saldría equivocado. Recarga la página e intenta de nuevo.'}
            </p>
          </>
        )}

        <div className={styles.desglose}>
          <div className={styles.desgloseTitle}>Desglose por método de pago</div>
          {metodosConMonto.length === 0 && porMetodo.credito === 0 ? (
            <p className={styles.arqueoNota}>Sin movimientos registrados en este turno.</p>
          ) : (
            <>
              {metodosConMonto.map(tipo => (
                <div key={tipo} className={styles.desgloseRow}>
                  <span>{NOMBRES_METODO[tipo]}</span>
                  <span>{formatPrice(porMetodo[tipo])}</span>
                </div>
              ))}
              {porMetodo.credito > 0 && (
                <div className={styles.desgloseRow}>
                  <span>Crédito otorgado (no es efectivo)</span>
                  <span>{formatPrice(porMetodo.credito)}</span>
                </div>
              )}
              {/* R7: la nota de R6 sobre "montos en bruto" ya no aplica — el
                  cambio entregado ahora se muestra como línea propia (R7
                  Task 1, `esperadoCaja` lo devuelve), así que el desglose sí
                  reconcilia con el esperado sin advertencia. */}
              {cambioEntregado > 0 && (
                <div className={styles.desgloseRow}>
                  <span>Cambio entregado</span>
                  <span>− {formatPrice(cambioEntregado)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {cobrosConMonto.length > 0 && (
          <div className={styles.desglose}>
            <div className={styles.desgloseTitle}>Cobros de CxC</div>
            <p className={styles.arqueoNota}>
              Cobros de esta sesión. El efectivo cobrado ya está sumado al efectivo esperado de arriba.
            </p>
            {cobrosConMonto.map(metodo => (
              <div key={metodo} className={styles.desgloseRow}>
                <span>{NOMBRES_COBRO[metodo]}</span>
                <span>{formatPrice(cobrosPorMetodo[metodo])}</span>
              </div>
            ))}
          </div>
        )}

        {devolucionesConMonto.length > 0 && (
          <div className={styles.desglose}>
            <div className={styles.desgloseTitle}>Devoluciones / reembolsos</div>
            <p className={styles.arqueoNota}>
              Reembolsos de esta sesión. El efectivo reembolsado ya está restado del efectivo esperado de arriba.
            </p>
            {devolucionesConMonto.map(metodo => (
              <div key={metodo} className={styles.desgloseRow}>
                <span>{NOMBRES_COBRO[metodo]}</span>
                <span>{formatPrice(devolucionesPorMetodo[metodo])}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Hora</th>
              <th>Estado</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map(d => (
              <tr key={d.id}>
                <td>
                  <Link href={`/admin/pos/documento/${d.id}`} className={styles.docLink}>
                    {numeroDocumento(d)}
                  </Link>
                </td>
                <td>{fecha(d.created_at)}</td>
                <td>
                  <span className={d.estado === 'anulado' ? styles.badgeAnulado : styles.badgeEmitido}>
                    {d.estado === 'anulado' ? 'Anulado' : 'Emitido'}
                  </span>
                </td>
                <td>{formatPrice(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {documentos.length === 0 && <div className={styles.empty}>No hay documentos emitidos en este turno.</div>}
      </div>
    </div>

    {comprobante && (
      <ComprobanteTurnoModal datos={datosComprobante} onCerrar={() => setComprobante(false)} />
    )}
    </>
  )
}
