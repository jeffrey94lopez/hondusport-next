'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { agruparPorCliente } from '@/lib/cxc/cxc'
import { numeroDocumento } from '@/lib/pos/documentos'
import { formatPrice } from '@/lib/store/format'
import type { BucketAntiguedad, Caja, Cliente, CxcFila, EstadoPago, SesionCaja } from '@/types'
import CobroModal from './CobroModal'
import SaldoFavorModal from './SaldoFavorModal'
import styles from './cxc.module.css'

interface Props {
  filas: CxcFila[]
  clientes: Cliente[]
  sesiones: SesionCaja[]
  cajas: Caja[]
  // Saldo a favor por cliente (vista saldo_favor_clientes, P5a/P5b). Clientes
  // sin fila = sin saldo. Mismo mapa que /admin/clientes (solo lectura ahí).
  saldosFavor: Record<string, number>
}

const BUCKETS: { key: BucketAntiguedad; label: string }[] = [
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'd1_30', label: '1-30 días' },
  { key: 'd31_60', label: '31-60 días' },
  { key: 'd61_90', label: '61-90 días' },
  { key: 'd90_mas', label: '+90 días' },
]

const ESTADO_LABEL: Record<EstadoPago, string> = {
  pagada: 'Pagada',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}

// pendiente gris, parcial ámbar, vencida rojo, pagada verde (no debería
// aparecer en el tablero porque solo llegan filas con saldo > 0, pero se mapea
// por completitud). Mismo criterio que CxP.
const ESTADO_BADGE: Record<EstadoPago, string> = {
  pagada: styles.badgeVerde,
  parcial: styles.badgeAmbar,
  pendiente: styles.badgeGris,
  vencida: styles.badgeRojo,
}

const ESTADOS: EstadoPago[] = ['pendiente', 'parcial', 'vencida']

function formatFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—'
}

// Iniciales para el avatar del cliente en la cabecera de cada grupo (look
// Stitch): primeras letras de las dos primeras palabras del nombre.
function inicialesCliente(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}

export default function CuentasPorCobrarClient({ filas, clientes, sesiones, cajas, saldosFavor }: Props) {
  const router = useRouter()
  const [clienteFiltro, setClienteFiltro] = useState<'todos' | string>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | EstadoPago>('todos')
  // null = cerrado; { modo: 'abono', fila } | { modo: 'global' }
  const [modal, setModal] = useState<{ modo: 'abono'; fila: CxcFila } | { modo: 'global' } | null>(null)
  // Modal de saldo a favor: se abre por cliente (no por documento), con TODOS
  // sus documentos con saldo (para distribuir/elegir), independiente de `modal`.
  const [modalSaldoFavor, setModalSaldoFavor] = useState<string | null>(null) // cliente_id
  // Cascada cliente → documentos: colapsado explícito por cliente_id (por
  // defecto todos abiertos, mismo contenido visible que la tabla plana previa).
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())

  function toggleGrupo(id: string) {
    setColapsados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalesPorBucket = useMemo(() => {
    const acc: Record<BucketAntiguedad, number> = {
      por_vencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_mas: 0,
    }
    for (const f of filas) acc[f.bucket] += f.saldo
    return acc
  }, [filas])

  const filtered = useMemo(() => {
    return filas.filter(f => {
      if (clienteFiltro !== 'todos' && f.cliente_id !== clienteFiltro) return false
      if (estadoFiltro !== 'todos' && f.estado !== estadoFiltro) return false
      return true
    })
  }, [filas, clienteFiltro, estadoFiltro])

  const saldoTotal = useMemo(() => filas.reduce((s, f) => s + f.saldo, 0), [filas])

  // Agrupa los documentos filtrados por cliente para la cascada (nivel 1:
  // cliente, nivel 2: documentos). `agruparPorCliente` (lib/cxc/cxc.ts) solo
  // reagrupa filas ya calculadas por el servidor — no recalcula saldos ni
  // antigüedad, pero SÍ suma dinero (`total`), de ahí que sea función pura
  // con test propio en vez de vivir inline aquí.
  const grupos = useMemo(() => agruparPorCliente(filtered), [filtered])

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Cuentas por cobrar</h1>
          <p className={styles.subtitle}>
            {filtered.length} de {filas.length} documentos · saldo total {formatPrice(saldoTotal)}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.btnAccion} btnMerlinSecondary`}
            onClick={() => router.push('/admin/cuentas-por-cobrar/cobros')}
          >
            Historial de cobros
          </button>
          <button
            className={`${styles.btnAccion} btnMerlinPrimary`}
            onClick={() => setModal({ modo: 'global' })}
          >
            + Nuevo cobro
          </button>
        </div>
      </div>

      {/* Resumen de antigüedad: montos vencidos (todo bucket salvo "por vencer") en rojo */}
      <div className={styles.resumen}>
        {BUCKETS.map(b => (
          <div key={b.key} className={styles.resumenCard}>
            <span className={styles.resumenLabel}>{b.label}</span>
            <span
              className={`${styles.resumenMonto} ${b.key !== 'por_vencer' && totalesPorBucket[b.key] > 0 ? styles.resumenVencido : ''}`}
            >
              {formatPrice(totalesPorBucket[b.key])}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.filtros}>
        <select
          className={styles.filtroSelect}
          value={clienteFiltro}
          onChange={e => setClienteFiltro(e.target.value)}
        >
          <option value="todos">Todos los clientes</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <select
          className={styles.filtroSelect}
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value as 'todos' | EstadoPago)}
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
          ))}
        </select>
      </div>

      <div className={styles.cascada}>
        {grupos.map(g => {
          const abierto = !colapsados.has(g.clienteId)
          return (
            <div key={g.clienteId} className={styles.grupo}>
              <div
                className={styles.grupoHeader}
                onClick={() => toggleGrupo(g.clienteId)}
              >
                <div className={styles.grupoLeft}>
                  <span className={styles.avatar}>{inicialesCliente(g.clienteNombre)}</span>
                  <span className={styles.grupoNombre}>{g.clienteNombre}</span>
                </div>
                <div className={styles.grupoRight}>
                  <span className={styles.grupoCount}>
                    {g.filas.length} documento{g.filas.length === 1 ? '' : 's'}
                  </span>
                  <span className={styles.grupoTotal}>{formatPrice(g.total)}</span>
                  {(saldosFavor[g.clienteId] ?? 0) > 0 && (
                    <button
                      className={`${styles.btnAbonar} btnMerlinSecondary`}
                      onClick={e => { e.stopPropagation(); setModalSaldoFavor(g.clienteId) }}
                    >
                      Aplicar saldo a favor
                    </button>
                  )}
                  <span className={styles.chevron}>{abierto ? '▲' : '▼'}</span>
                </div>
              </div>
              {abierto && (
                <div className={styles.grupoBody}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Fecha</th>
                        <th>Vencimiento</th>
                        <th className={styles.num}>Días vencido</th>
                        <th className={styles.num}>Total</th>
                        <th className={styles.num}>Cobrado</th>
                        <th className={styles.num}>Saldo</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.filas.map(f => (
                        <tr key={f.documento_id}>
                          <td className={styles.numero}>{numeroDocumento(f)}</td>
                          <td className={styles.fechaCol}>{formatFecha(f.fecha)}</td>
                          <td className={styles.fechaCol}>{formatFecha(f.fecha_vencimiento)}</td>
                          <td className={`${styles.num} ${f.dias_vencido > 0 ? styles.diasVencido : styles.diasOk}`}>
                            {f.dias_vencido}
                          </td>
                          <td className={styles.num}>{formatPrice(f.credito_total)}</td>
                          <td className={styles.num}>{formatPrice(f.cobrado)}</td>
                          <td className={`${styles.num} ${styles.saldoCol}`}>{formatPrice(f.saldo)}</td>
                          <td>
                            <span className={`${styles.badge} ${ESTADO_BADGE[f.estado]}`}>
                              {ESTADO_LABEL[f.estado]}
                            </span>
                          </td>
                          <td className={styles.accionCol}>
                            <button
                              className={`${styles.btnAbonar} btnMerlinSecondary`}
                              onClick={() => setModal({ modo: 'abono', fila: f })}
                            >
                              Cobrar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        {grupos.length === 0 && (
          <div className={styles.empty}>
            {filas.length === 0
              ? 'No hay cuentas por cobrar pendientes.'
              : 'No hay documentos que coincidan con el filtro.'}
          </div>
        )}
      </div>

      {modal && (
        <CobroModal
          modo={modal.modo}
          fila={modal.modo === 'abono' ? modal.fila : null}
          clientes={clientes}
          filas={filas}
          sesiones={sesiones}
          cajas={cajas}
          onClose={() => setModal(null)}
          onOk={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}

      {modalSaldoFavor && (
        <SaldoFavorModal
          clienteId={modalSaldoFavor}
          saldoDisponible={saldosFavor[modalSaldoFavor] ?? 0}
          documentos={filas.filter(f => f.cliente_id === modalSaldoFavor)}
          onClose={() => setModalSaldoFavor(null)}
          onOk={() => {
            setModalSaldoFavor(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
