'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { agruparPorEtapa, estaVencida, hoyHonduras, puedeEditarCotizacion } from '@/lib/cotizaciones/cotizaciones'
import { formatPrice } from '@/lib/store/format'
import type { CotizacionEtapa, Vendedor } from '@/types'
import { duplicarCotizacion, moverEtapaCotizacion, eliminarCotizacion } from './actions'
import type { CotizacionKanbanItem } from './page'
import styles from './cotizaciones.module.css'

interface Props {
  etapas: CotizacionEtapa[]
  cotizaciones: CotizacionKanbanItem[]
  vendedores: Vendedor[]
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function KanbanBoard({ etapas, cotizaciones, vendedores }: Props) {
  const router = useRouter()
  const hoy = useMemo(() => hoyHonduras(new Date()), [])

  // Estado local para el movimiento optimista entre columnas: se resincroniza
  // cuando la prop cambia (tras router.refresh()). Ajustar estado durante el
  // render (en vez de en un efecto) evita el render en cascada que marca
  // react-hooks/set-state-in-effect — patrón recomendado por React para
  // "resetear" estado derivado cuando cambia una prop.
  const [cotizacionesProp, setCotizacionesProp] = useState(cotizaciones)
  const [cotizacionesLocal, setCotizacionesLocal] = useState(cotizaciones)
  if (cotizaciones !== cotizacionesProp) {
    setCotizacionesProp(cotizaciones)
    setCotizacionesLocal(cotizaciones)
  }

  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null)
  const [dragOverEtapaId, setDragOverEtapaId] = useState<string | null>(null)

  useEffect(() => {
    if (!menuAbierto) return
    const cerrar = () => setMenuAbierto(null)
    window.addEventListener('click', cerrar)
    return () => window.removeEventListener('click', cerrar)
  }, [menuAbierto])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return cotizacionesLocal.filter(c => {
      if (filtroVendedor !== 'todos' && c.vendedor_id !== filtroVendedor) return false
      if (!q) return true
      return (
        c.numero.toLowerCase().includes(q) ||
        c.cliente_display.toLowerCase().includes(q) ||
        (c.vendedor_nombre ?? '').toLowerCase().includes(q)
      )
    })
  }, [cotizacionesLocal, filtroVendedor, busqueda])

  const columnas = useMemo(() => agruparPorEtapa(filtradas, etapas), [filtradas, etapas])

  async function mover(id: string, etapaId: string) {
    setMenuAbierto(null)
    const previo = cotizacionesLocal
    setCotizacionesLocal(prev => prev.map(c => (c.id === id ? { ...c, etapa_id: etapaId } : c)))
    const res = await moverEtapaCotizacion(id, etapaId)
    if (!res.ok) {
      setCotizacionesLocal(previo)
      alert(res.error)
      return
    }
    router.refresh()
  }

  async function eliminar(id: string, numero: string) {
    setMenuAbierto(null)
    if (!window.confirm(`¿Eliminar la cotización ${numero}? Esta acción no se puede deshacer.`)) return
    const previo = cotizacionesLocal
    setCotizacionesLocal(prev => prev.filter(c => c.id !== id))
    const res = await eliminarCotizacion(id)
    if (!res.ok) {
      setCotizacionesLocal(previo)
      alert(res.error)
      return
    }
    router.refresh()
  }

  // Copia editable de la cotización (sin documento_id) — útil sobre todo
  // cuando ya fue facturada y "Facturar" está deshabilitado en el editor.
  async function duplicar(id: string) {
    setMenuAbierto(null)
    const res = await duplicarCotizacion(id)
    if (!res.ok || !res.data) {
      alert(res.ok ? 'No se pudo duplicar.' : res.error)
      return
    }
    router.push('/admin/cotizaciones/' + res.data.id)
  }

  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd() {
    setDragOverEtapaId(null)
  }

  function onDrop(e: React.DragEvent, etapaId: string) {
    e.preventDefault()
    setDragOverEtapaId(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) mover(id, etapaId)
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Cotizaciones</h1>
          <p className={styles.subtitle}>{filtradas.length} de {cotizacionesLocal.length} cotizaciones</p>
        </div>
        <div className={styles.topbarActions}>
          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar cotización, cliente o vendedor…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <select
            className={styles.filtroVendedor}
            value={filtroVendedor}
            onChange={e => setFiltroVendedor(e.target.value)}
          >
            <option value="todos">Todos los vendedores</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </select>
          <button
            className={`${styles.btnNueva} btnMerlinPrimary`}
            onClick={() => router.push('/admin/cotizaciones/nueva')}
          >
            + Nueva cotización
          </button>
        </div>
      </div>

      <div className={styles.board}>
        {columnas.map(({ etapa, items }) => (
          <div
            key={etapa.id}
            className={`${styles.column} ${dragOverEtapaId === etapa.id ? styles.columnDragOver : ''}`}
            onDragOver={e => {
              e.preventDefault()
              if (dragOverEtapaId !== etapa.id) setDragOverEtapaId(etapa.id)
            }}
            onDragLeave={e => {
              // Evita el titileo: onDragLeave se dispara también al entrar a
              // una tarjeta hija dentro de la misma columna; solo limpiar si
              // el puntero de verdad salió de la columna.
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setDragOverEtapaId(prev => (prev === etapa.id ? null : prev))
            }}
            onDrop={e => onDrop(e, etapa.id)}
          >
            <div className={styles.columnHeader}>
              <div className={styles.columnHeaderLeft}>
                <span className={styles.columnDot} style={{ background: etapa.color }} />
                <span className={styles.columnNombre}>{etapa.nombre}</span>
              </div>
              <span className={styles.columnCount}>{items.length}</span>
            </div>

            <div className={styles.columnBody}>
              {items.length === 0 && <p className={styles.columnEmpty}>Sin cotizaciones</p>}
              {items.map(c => {
                const vencida = estaVencida(new Date(c.valido_hasta), hoy)
                // La condición sale de la función pura para que tablero, editor
                // y servidor no puedan divergir.
                const facturada = !puedeEditarCotizacion(c.documento_id)
                return (
                  <div
                    key={c.id}
                    className={`${styles.card} ${vencida ? styles.cardVencida : ''}`}
                    draggable
                    onDragStart={e => onDragStart(e, c.id)}
                    onDragEnd={onDragEnd}
                    onClick={() => router.push(`/admin/cotizaciones/${c.id}`)}
                  >
                    <div className={styles.cardHeader}>
                      <span className={styles.cardNumero}>{c.numero}</span>
                      <div className={styles.cardHeaderRight}>
                        {facturada && <span className={styles.badgeFacturada}>Facturada</span>}
                        {vencida && <span className={styles.badgeVencida}>Vencida</span>}
                        <div className={styles.cardMenuWrap} onClick={e => e.stopPropagation()}>
                          <button
                            className={`${styles.menuBtn} btnMerlinIcon`}
                            aria-label="Más acciones"
                            onClick={() => setMenuAbierto(menuAbierto === c.id ? null : c.id)}
                          >
                            ⋮
                          </button>
                          {menuAbierto === c.id && (
                            <div className={styles.menu}>
                              <span className={styles.menuLabel}>Mover a…</span>
                              {etapas.filter(e => e.activo).map(e => (
                                <button
                                  key={e.id}
                                  className={styles.menuItem}
                                  disabled={e.id === c.etapa_id}
                                  onClick={() => mover(c.id, e.id)}
                                >
                                  {e.nombre}
                                </button>
                              ))}
                              <div className={styles.menuDivider} />
                              <button
                                className={styles.menuItem}
                                onClick={() => duplicar(c.id)}
                              >
                                Duplicar
                              </button>
                              {/* D3: una cotización facturada no se borra (la
                                  acción lo rechaza en el servidor); ofrecer el
                                  botón solo para que falle es peor que no
                                  ofrecerlo. Duplicar sí se queda: es la salida. */}
                              {!facturada && (
                                <button
                                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                  onClick={() => eliminar(c.id, c.numero)}
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className={styles.cardCliente}>{c.cliente_display}</p>

                    <div className={styles.cardFooter}>
                      <div className={styles.cardVendedorBlock}>
                        <span className={styles.cardLabel}>Vendedor</span>
                        <span className={styles.cardVendedor}>{c.vendedor_nombre ?? 'Sin vendedor'}</span>
                      </div>
                      <span className={styles.cardTotal}>{formatPrice(c.total)}</span>
                    </div>

                    <div className={styles.cardVence}>
                      <span className={styles.cardLabel}>Vence</span>
                      <span className={`${styles.cardVenceFecha} ${vencida ? styles.cardVenceFechaVencida : ''}`}>
                        {fechaCorta(c.valido_hasta)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
