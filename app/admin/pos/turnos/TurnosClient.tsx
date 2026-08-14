'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import { filtrarTurnos, totalesTurnos, type FiltroTurnos } from '@/lib/pos/turnos'
import { abrirSesion, cerrarSesion } from '../actions'
import { parseMoneyInput } from '../pos-helpers'
import type { Caja, SesionCaja } from '@/types'
import styles from './turnos.module.css'

interface Props {
  cajas: Caja[]
  sesionesAbiertas: SesionCaja[]
  historial: SesionCaja[]
}

const FILTRO_VACIO: FiltroTurnos = { desde: '', hasta: '', cajaId: '', usuario: '' }

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

function claseDiferencia(d: number): string {
  if (d < 0) return styles.diffNegativa
  if (d > 0) return styles.diffPositiva
  return styles.diffNeutra
}

export default function TurnosClient({ cajas, sesionesAbiertas, historial }: Props) {
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
    <div className={styles.page}>
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
              <button type="button" className="btnMerlinPrimary" onClick={() => setCerrando(s)}>
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
                <td>{formatPrice(t.monto_esperado ?? 0)}</td>
                <td>{formatPrice(t.monto_contado ?? 0)}</td>
                <td className={claseDiferencia(t.diferencia ?? 0)}>{formatPrice(t.diferencia ?? 0)}</td>
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

      {cerrando && (
        <CerrarTurnoModal
          sesion={cerrando}
          cajaNombre={nombreCaja(cerrando.caja_id)}
          onClose={() => setCerrando(null)}
          onListo={() => { setCerrando(null); router.refresh() }}
        />
      )}
    </div>
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
      <div className={styles.form} style={{ flex: 1 }}>
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
          <button type="button" className="btnMerlinPrimary" onClick={handleAbrir} disabled={isPending || cajas.length === 0}>
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
  onClose: () => void
  onListo: () => void
}

function CerrarTurnoModal({ sesion, cajaNombre, onClose, onListo }: CerrarTurnoModalProps) {
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ esperado: number; diferencia: number } | null>(null)

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
      setResultado(result.data)
    })
  }

  return (
    <Modal title={`Cerrar caja — ${cajaNombre}`} onClose={onClose}>
      <div className={styles.form}>
        {resultado ? (
          <>
            <div className={styles.resultado}>
              <div className={styles.resultadoRow}>
                <span>Esperado</span>
                <span>{formatPrice(resultado.esperado)}</span>
              </div>
              <div className={styles.resultadoRow}>
                <span>Contado</span>
                <span>{formatPrice(parseMoneyInput(montoContado))}</span>
              </div>
              <div className={`${styles.resultadoRow} ${styles.resultadoDiferencia} ${claseDiferencia(resultado.diferencia)}`}>
                <span>
                  {resultado.diferencia === 0 ? 'Cuadra exacto' : resultado.diferencia > 0 ? 'Sobrante' : 'Faltante'}
                </span>
                <span>{formatPrice(Math.abs(resultado.diferencia))}</span>
              </div>
            </div>
            <div className={styles.formFooter}>
              <button type="button" className="btnMerlinPrimary" onClick={onListo}>
                Listo
              </button>
            </div>
          </>
        ) : (
          <>
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
              <button type="button" className="btnMerlinTertiary" onClick={onClose} disabled={isPending}>
                Cancelar
              </button>
              <button type="button" className="btnMerlinPrimary" onClick={handleCerrar} disabled={isPending}>
                {isPending ? 'Cerrando...' : 'Cerrar caja'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
