'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import { filtrarTurnos, totalesTurnos, type FiltroTurnos, type DetalleTurno } from '@/lib/pos/turnos'
import { abrirSesion, cerrarSesion, obtenerResumenSesion, obtenerDetalleTurno } from '../actions'
import type { ResumenCaja } from '@/lib/pos/emision'
import { parseMoneyInput } from '../pos-helpers'
import ComprobanteTurnoModal, { type ComprobanteTurnoDatos } from '../components/ComprobanteTurnoModal'
import type { Caja, SesionCaja, MetodoPagoTipo, CobroMetodo } from '@/types'
import posStyles from '../pos.module.css'
import styles from './turnos.module.css'

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

interface Props {
  cajas: Caja[]
  sesionesAbiertas: SesionCaja[]
  historial: SesionCaja[]
  // R7: interruptor `pos_cierre_ciegas` y nombre comercial, ya resueltos por
  // el server component (turnos/page.tsx) con el criterio "ausente = activo".
  cierreCiegas: boolean
  empresaNombre: string
}

const FILTRO_VACIO: FiltroTurnos = { desde: '', hasta: '', cajaId: '', usuario: '' }

// `timeZone` explícito aunque esto corra en el navegador: sin él, un equipo
// fuera de hora hondureña (portátil de viaje, VM en UTC) mostraría aquí una
// hora distinta a la del detalle del mismo turno —que ya fija la zona— y a la
// del filtro, que agrupa por día hondureño (lib/pos/turnos.ts).
function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Tegucigalpa',
  })
}

function claseDiferencia(d: number): string {
  if (d < 0) return styles.diffNegativa
  if (d > 0) return styles.diffPositiva
  return styles.diffNeutra
}

export default function TurnosClient({ cajas, sesionesAbiertas, historial, cierreCiegas, empresaNombre }: Props) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<FiltroTurnos>(FILTRO_VACIO)
  const [cerrando, setCerrando] = useState<SesionCaja | null>(null)

  const cajaPorId = useMemo(() => new Map(cajas.map(c => [c.id, c])), [cajas])

  const usuarios = useMemo(
    () => [...new Set(historial.map(t => t.usuario).filter((u): u is string => !!u))].sort(),
    [historial],
  )

  const cajaIdsHistorial = useMemo(
    () => [...new Set(historial.map(t => t.caja_id))],
    [historial],
  )

  const turnosFiltrados = useMemo(() => filtrarTurnos(historial, filtro), [historial, filtro])
  const totales = useMemo(() => totalesTurnos(turnosFiltrados), [turnosFiltrados])

  function nombreCaja(cajaId: string): string {
    return cajaPorId.get(cajaId)?.nombre ?? '—'
  }

  return (
    <>
    {/* `.noPrint` oculta esta pantalla al imprimir (R7): el comprobante de
        cierre se renderiza como HERMANO de este bloque, no adentro — si
        estuviera anidado aquí, ocultar este contenedor también lo
        escondería. Sin este envoltorio, imprimir el comprobante arrastraría
        el encabezado, las tarjetas de turno y la tabla de turnos detrás de
        la tirilla (papel desperdiciado en cada copia). */}
    <div className={`${styles.page} ${styles.noPrint}`}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Turnos de caja</h1>
          <p className={styles.subtitle}>
            {turnosFiltrados.length} de {historial.length} turnos
          </p>
        </div>
      </div>

      {sesionesAbiertas.length > 0 ? (
        <div className={styles.turnoCards}>
          {sesionesAbiertas.map(s => (
            <div key={s.id} className={styles.turnoCard}>
              <div className={styles.turnoInfo}>
                <span className={styles.turnoCaja}>{nombreCaja(s.caja_id)}</span>
                <span className={styles.turnoMeta}>
                  {s.usuario ?? 'Usuario desconocido'} · Abierto el {fecha(s.abierta_at)}
                </span>
              </div>
              <div className={styles.turnoMontos}>
                <div className={styles.turnoMontoCol}>
                  <span className={styles.turnoMontoLabel}>Monto inicial</span>
                  <span className={styles.turnoMontoValor}>{formatPrice(s.monto_inicial)}</span>
                </div>
              </div>
              <button type="button" className={`${styles.btn} btnMerlinPrimary`} onClick={() => setCerrando(s)}>
                Cerrar turno
              </button>
            </div>
          ))}
        </div>
      ) : (
        <AperturaCard cajas={cajas} onAbierto={() => router.refresh()} />
      )}

      <div className={styles.filtros}>
        <label className={styles.filtroLabel}>
          Desde
          <input
            type="date"
            className={styles.filtroInput}
            value={filtro.desde}
            onChange={e => setFiltro(f => ({ ...f, desde: e.target.value }))}
          />
        </label>
        <label className={styles.filtroLabel}>
          Hasta
          <input
            type="date"
            className={styles.filtroInput}
            value={filtro.hasta}
            onChange={e => setFiltro(f => ({ ...f, hasta: e.target.value }))}
          />
        </label>
        <label className={styles.filtroLabel}>
          Caja
          <select
            className={styles.filtroSelect}
            value={filtro.cajaId}
            onChange={e => setFiltro(f => ({ ...f, cajaId: e.target.value }))}
          >
            <option value="">Todas</option>
            {cajaIdsHistorial.map(id => (
              <option key={id} value={id}>{nombreCaja(id)}</option>
            ))}
          </select>
        </label>
        <label className={styles.filtroLabel}>
          Usuario
          <select
            className={styles.filtroSelect}
            value={filtro.usuario}
            onChange={e => setFiltro(f => ({ ...f, usuario: e.target.value }))}
          >
            <option value="">Todos</option>
            {usuarios.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Caja</th>
              <th>Usuario</th>
              <th>Apertura</th>
              <th>Cierre</th>
              <th>Inicial</th>
              <th>Esperado</th>
              <th>Contado</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {turnosFiltrados.map(t => (
              <tr key={t.id}>
                <td>{nombreCaja(t.caja_id)}</td>
                <td>{t.usuario ?? '—'}</td>
                <td>
                  <Link href={`/admin/pos/turnos/${t.id}`} className={styles.aperturaLink}>
                    {fecha(t.abierta_at)}
                  </Link>
                </td>
                <td>{fecha(t.cerrada_at)}</td>
                <td>{formatPrice(t.monto_inicial)}</td>
                {/* Un turno abierto todavía no tiene arqueo: esas tres columnas
                    son null en la BD. Pintarlas como L. 0.00 haría que una caja
                    viva con dinero dentro se leyera como un turno cerrado que
                    cuadró exacto — y con el mismo color neutro. Se muestran
                    como "—", que es lo que realmente hay. */}
                <td>{t.monto_esperado == null ? '—' : formatPrice(t.monto_esperado)}</td>
                <td>{t.monto_contado == null ? '—' : formatPrice(t.monto_contado)}</td>
                <td className={t.diferencia == null ? undefined : claseDiferencia(t.diferencia)}>
                  {t.diferencia == null ? '—' : formatPrice(t.diferencia)}
                </td>
              </tr>
            ))}
          </tbody>
          {turnosFiltrados.length > 0 && (
            <tfoot>
              <tr className={styles.tfootRow}>
                <td colSpan={4}>Totales ({turnosFiltrados.length})</td>
                <td>{formatPrice(totales.inicial)}</td>
                <td>{formatPrice(totales.esperado)}</td>
                <td>{formatPrice(totales.contado)}</td>
                <td className={claseDiferencia(totales.diferencia)}>{formatPrice(totales.diferencia)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {turnosFiltrados.length === 0 && (
          <div className={styles.empty}>No hay turnos que coincidan con los filtros.</div>
        )}
      </div>

    </div>

    {cerrando && (
      <CerrarTurnoModal
        sesion={cerrando}
        cajaNombre={nombreCaja(cerrando.caja_id)}
        empresaNombre={empresaNombre}
        cierreCiegas={cierreCiegas}
        onClose={() => setCerrando(null)}
        onListo={() => { setCerrando(null); router.refresh() }}
      />
    )}
    </>
  )
}

interface AperturaCardProps {
  cajas: Caja[]
  onAbierto: () => void
}

function AperturaCard({ cajas, onAbierto }: AperturaCardProps) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '')
  const [montoInicial, setMontoInicial] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAbrir() {
    setError('')
    if (!cajaId) {
      setError('Selecciona una caja.')
      return
    }
    const monto = parseMoneyInput(montoInicial)
    if (monto < 0) {
      setError('El monto inicial no puede ser negativo.')
      return
    }
    startTransition(async () => {
      const result = await abrirSesion(cajaId, monto)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAbierto()
    })
  }

  return (
    <div className={styles.turnoCard}>
      <div className={`${styles.form} ${styles.formCrece}`}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Caja
            <select
              className={styles.formSelect}
              value={cajaId}
              onChange={e => setCajaId(e.target.value)}
              disabled={isPending}
            >
              {cajas.length === 0 && <option value="">No hay cajas activas</option>}
              {cajas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className={styles.formLabel}>
            Monto inicial
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={styles.formInput}
              value={montoInicial}
              onChange={e => setMontoInicial(e.target.value)}
              disabled={isPending}
            />
          </label>
          <button type="button" className={`${styles.btn} btnMerlinPrimary`} onClick={handleAbrir} disabled={isPending || cajas.length === 0}>
            {isPending ? 'Abriendo...' : 'Abrir turno'}
          </button>
        </div>
        {error && <div className={styles.formError}>{error}</div>}
      </div>
    </div>
  )
}

interface CerrarTurnoModalProps {
  sesion: SesionCaja
  cajaNombre: string
  empresaNombre: string
  /** Interruptor global `pos_cierre_ciegas` (R7): mismo criterio que
   * `CierreModal` en el mostrador — "Gobierna los dos caminos por igual"
   * (spec). Con `true` (ausente = activo), el resumen previo de abajo no se
   * muestra antes de teclear el conteo. */
  cierreCiegas: boolean
  onClose: () => void
  onListo: () => void
}

function CerrarTurnoModal({ sesion, cajaNombre, empresaNombre, cierreCiegas, onClose, onListo }: CerrarTurnoModalProps) {
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [resumen, setResumen] = useState<ResumenCaja | null>(null)
  // Comprobante de cierre (R7): se llena tras un `cerrarSesion` exitoso y,
  // mientras exista, reemplaza este modal por el papel.
  const [comprobante, setComprobante] = useState<ComprobanteTurnoDatos | null>(null)
  // La caja YA se cerró (el arqueo está congelado) pero no se pudo volver a
  // traer el desglose fresco para el comprobante (ver handleCerrar): en vez
  // de imprimir un papel con el desglose en cero —que contradice el bloque
  // de créditos/cobros y hace desaparecer la identidad de seis términos sin
  // avisar—, se avisa y se ofrece ir al detalle del turno a reimprimir.
  const [cierreSinComprobante, setCierreSinComprobante] = useState(false)

  // Resumen en vivo de la sesión (no persiste nada): solo alimenta el resumen
  // previo de abajo, gobernado por `cierreCiegas` (igual que en CierreModal).
  // Con el cierre a ciegas activo (el caso normal) ese bloque nunca se pinta,
  // así que ni siquiera se pide: ahorra una consulta por cierre y evita que
  // el esperado viaje al navegador (pestaña Red) cuando nadie lo va a ver —
  // aunque, para que quede claro, el cierre a ciegas sigue siendo un control
  // de proceso, no una barrera técnica: nada impide inspeccionar la respuesta
  // de `cerrarSesion` o del propio comprobante una vez cerrado.
  useEffect(() => {
    if (cierreCiegas) return
    let activo = true
    obtenerResumenSesion(sesion.id).then(result => {
      if (activo && result.ok && result.data) setResumen(result.data)
    })
    return () => { activo = false }
  }, [sesion.id, cierreCiegas])

  function handleCerrar() {
    setError('')
    const monto = parseMoneyInput(montoContado)
    if (montoContado.trim() === '' || monto < 0) {
      setError('Ingresa el monto contado en efectivo.')
      return
    }
    startTransition(async () => {
      const result = await cerrarSesion(sesion.id, monto, notas.trim())
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo cerrar la sesión.' : result.error)
        return
      }

      // Ninguno de los dos viaja en la respuesta de `cerrarSesion` (solo
      // esperado/diferencia): se piden justo ahora, frescos, en vez de
      // reutilizar el `resumen` previo (que además puede ni existir, si el
      // interruptor estaba activo) — así el desglose del comprobante sale
      // del mismo instante que el propio comprobante.
      const [detalleResult, resumenResult] = await Promise.all([
        obtenerDetalleTurno(sesion.id),
        obtenerResumenSesion(sesion.id),
      ])

      if (!resumenResult.ok || !resumenResult.data) {
        // La sesión YA se cerró (el arqueo está congelado); solo falló
        // volver a traer el desglose. Imprimir con un desglose en cero
        // mentiría (el renglón de crédito desaparecería mientras el bloque
        // de créditos del comprobante seguiría mostrando el monto real) —
        // mejor no montar el papel.
        setCierreSinComprobante(true)
        return
      }

      const detalle: DetalleTurno = detalleResult.ok && detalleResult.data
        ? detalleResult.data
        : { creditos: [], cobros: [] }

      setComprobante({
        sesion: {
          ...sesion,
          estado: 'cerrada',
          monto_esperado: result.data.esperado,
          monto_contado: monto,
          diferencia: result.data.diferencia,
          notas: notas.trim(),
          cerrada_at: new Date().toISOString(),
        },
        cajaNombre,
        empresaNombre,
        porMetodo: resumenResult.data.porMetodo,
        cobrosPorMetodo: resumenResult.data.cobrosPorMetodo,
        devolucionesPorMetodo: resumenResult.data.devolucionesPorMetodo,
        cambioEntregado: resumenResult.data.cambioEntregado,
        efectivoEsperadoDetalle: resumenResult.data.efectivoEsperado,
        detalle,
      })
    })
  }

  if (comprobante) {
    return <ComprobanteTurnoModal datos={comprobante} onCerrar={onListo} />
  }

  if (cierreSinComprobante) {
    return (
      <Modal title={`Cerrar caja — ${cajaNombre}`} onClose={onListo}>
        <div className={styles.form}>
          <p className={posStyles.identNota}>
            La caja se cerró correctamente, pero no se pudo generar el comprobante en este momento.
            Puedes reimprimirlo desde el detalle del turno.
          </p>
          <div className={styles.formFooter}>
            <Link href={`/admin/pos/turnos/${sesion.id}`} className={`${styles.btn} btnMerlinSecondary`}>
              Ver detalle del turno
            </Link>
            <button type="button" className={`${styles.btn} btnMerlinPrimary`} onClick={onListo}>
              Listo
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  const metodosConMonto = resumen
    ? (Object.keys(resumen.porMetodo) as MetodoPagoTipo[]).filter(tipo => tipo !== 'credito' && resumen.porMetodo[tipo] > 0)
    : []
  const cobrosConMonto = resumen
    ? (Object.keys(resumen.cobrosPorMetodo) as CobroMetodo[]).filter(m => resumen.cobrosPorMetodo[m] > 0)
    : []
  const devolucionesConMonto = resumen
    ? (Object.keys(resumen.devolucionesPorMetodo) as CobroMetodo[]).filter(m => resumen.devolucionesPorMetodo[m] > 0)
    : []

  return (
    <Modal title={`Cerrar caja — ${cajaNombre}`} onClose={onClose}>
      <div className={styles.form}>
        {/* Interruptor `pos_cierre_ciegas` (R7): mismo criterio que
            CierreModal — con el cierre a ciegas activo (por defecto), el
            efectivo esperado y su desglose no se muestran antes de teclear
            el conteo. El arqueo posterior (esperado/contado/diferencia) se
            sigue mostrando siempre, vía el comprobante. */}
        {!cierreCiegas && resumen && (
          <>
            <div className={posStyles.totalesPanel}>
              {metodosConMonto.map(tipo => (
                <div key={tipo} className={posStyles.totalesRow}>
                  <span>{NOMBRES_METODO[tipo]}</span>
                  <span>{formatPrice(resumen.porMetodo[tipo])}</span>
                </div>
              ))}
              {resumen.porMetodo.credito > 0 && (
                <div className={posStyles.totalesRow}>
                  <span>Crédito otorgado (no es efectivo)</span>
                  <span>{formatPrice(resumen.porMetodo.credito)}</span>
                </div>
              )}
              <div className={posStyles.totalesRowTotal}>
                <span>Efectivo esperado</span>
                <span>{formatPrice(resumen.efectivoEsperado)}</span>
              </div>
            </div>

            {cobrosConMonto.length > 0 && (
              <div className={posStyles.totalesPanel}>
                <div className={posStyles.panelTitle}>Cobros de CxC</div>
                <div className={posStyles.identNota}>
                  Cobros de esta sesión. El efectivo cobrado ya está sumado al efectivo esperado.
                </div>
                {cobrosConMonto.map(m => (
                  <div key={m} className={posStyles.totalesRow}>
                    <span>{NOMBRES_COBRO[m]}</span>
                    <span>{formatPrice(resumen.cobrosPorMetodo[m])}</span>
                  </div>
                ))}
              </div>
            )}

            {devolucionesConMonto.length > 0 && (
              <div className={posStyles.totalesPanel}>
                <div className={posStyles.panelTitle}>Devoluciones / reembolsos</div>
                <div className={posStyles.identNota}>
                  Reembolsos de esta sesión. El efectivo reembolsado ya está restado del efectivo esperado.
                </div>
                {devolucionesConMonto.map(m => (
                  <div key={m} className={posStyles.totalesRow}>
                    <span>{NOMBRES_COBRO[m]}</span>
                    <span>{formatPrice(resumen.devolucionesPorMetodo[m])}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <label className={styles.formLabel}>
          Monto contado en efectivo
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={styles.formInput}
            value={montoContado}
            onChange={e => setMontoContado(e.target.value)}
            autoFocus
            disabled={isPending}
          />
        </label>
        <label className={styles.formLabel}>
          Notas (opcional)
          <textarea
            className={styles.formInput}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            disabled={isPending}
            rows={2}
          />
        </label>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.formFooter}>
          <button type="button" className={`${styles.btn} btnMerlinTertiary`} onClick={onClose} disabled={isPending}>
            Cancelar
          </button>
          <button type="button" className={`${styles.btn} btnMerlinPrimary`} onClick={handleCerrar} disabled={isPending}>
            {isPending ? 'Cerrando...' : 'Cerrar caja'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
