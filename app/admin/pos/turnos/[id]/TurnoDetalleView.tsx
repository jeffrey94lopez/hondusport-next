import Link from 'next/link'
import { formatPrice } from '@/lib/store/format'
import { numeroDocumento } from '@/lib/pos/documentos'
import { numeroDocumentoDevolucion } from '@/lib/pos/devoluciones'
import type { Caja, Documento, MetodoPagoTipo, SesionCaja } from '@/types'
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
  porMetodo: Record<MetodoPagoTipo, number>
  documentos: DocumentoTurno[]
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

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// nota_credito/devolucion tienen su propio criterio de numeración (CAI '03' /
// DEV-########); factura/comprobante usan el de `numeroDocumento`. Mismo
// criterio que DocumentosClient (app/admin/pos/documentos/DocumentosClient.tsx).
function numeroDoc(d: DocumentoTurno): string {
  if (d.tipo === 'nota_credito' || d.tipo === 'devolucion') return numeroDocumentoDevolucion(d)
  return numeroDocumento({ tipo: d.tipo, correlativo: d.correlativo, numero_comprobante: d.numero_comprobante })
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

export default function TurnoDetalleView({ sesion, caja, esperadoEnVivo, porMetodo, documentos }: Props) {
  const cerrada = sesion.estado === 'cerrada'
  const diferencia = sesion.diferencia ?? 0

  const metodosConMonto = (Object.keys(porMetodo) as MetodoPagoTipo[]).filter(
    tipo => tipo !== 'credito' && porMetodo[tipo] > 0,
  )

  return (
    <div className={styles.page}>
      <div className={styles.detalleHeader}>
        <div>
          <h1 className={styles.title}>Turno de caja — {caja?.nombre ?? '—'}</h1>
          <p className={styles.subtitle}>
            {sesion.usuario ?? 'Usuario desconocido'} · Apertura {fecha(sesion.abierta_at)} · Cierre{' '}
            {cerrada ? fecha(sesion.cerrada_at) : 'aún abierto'}
          </p>
        </div>
        <Link href="/admin/pos/turnos" className={styles.volverLink}>
          ← Volver a turnos
        </Link>
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
              <span className={styles.arqueoValor}>{formatPrice(esperadoEnVivo)}</span>
            </div>
            <p className={styles.arqueoNota}>
              El turno sigue abierto. El monto contado y la diferencia se registran al cerrar la caja.
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
            </>
          )}
        </div>
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
                    {numeroDoc(d)}
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
  )
}
