'use client'
import { useState, useTransition, useMemo } from 'react'
import type { Pedido, EstadoPedido } from '@/types'
import { updateEstadoPedido } from './actions'
import styles from './pedidos.module.css'

interface Props {
  pedidos: Pedido[]
  whatsapp: string
}

const ESTADOS: EstadoPedido[] = ['recibido', 'preparando', 'enviado', 'entregado', 'cancelado']
const ESTADO_LABELS: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatCurrency(amount: number): string {
  return `L. ${amount.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PedidosClient({ pedidos, whatsapp }: Props) {
  const [activeTab, setActiveTab] = useState<'todos' | EstadoPedido>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: pedidos.length }
    for (const e of ESTADOS) {
      c[e] = pedidos.filter(p => p.estado === e).length
    }
    return c
  }, [pedidos])

  const filtered = useMemo(() => {
    if (activeTab === 'todos') return pedidos
    return pedidos.filter(p => p.estado === activeTab)
  }, [pedidos, activeTab])

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  function handleEstadoChange(id: string, estado: EstadoPedido) {
    setPendingId(id)
    startTransition(async () => {
      await updateEstadoPedido(id, estado)
      setPendingId(null)
    })
  }

  function buildWhatsAppLink(pedido: Pedido): string {
    const text = encodeURIComponent(
      `Hola ${pedido.nombre_cliente}, tu pedido #${pedido.numero} está listo.`
    )
    return `https://wa.me/${whatsapp}?text=${text}`
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>{filtered.length} de {pedidos.length} pedidos</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'todos' ? styles.active : ''}`}
          onClick={() => setActiveTab('todos')}
        >
          Todos
          <span className={styles.badge}>{counts.todos}</span>
        </button>
        {ESTADOS.map(e => (
          <button
            key={e}
            className={`${styles.tab} ${activeTab === e ? styles.active : ''}`}
            onClick={() => setActiveTab(e)}
          >
            {ESTADO_LABELS[e]}
            {counts[e] > 0 && <span className={styles.badge}>{counts[e]}</span>}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Ciudad</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(pedido => (
              <>
                <tr key={pedido.id}>
                  <td>
                    <button
                      className={styles.expandBtn}
                      onClick={() => toggleExpand(pedido.id)}
                      title={expandedId === pedido.id ? 'Cerrar detalle' : 'Ver detalle'}
                    >
                      {expandedId === pedido.id ? '▾' : '▸'}
                    </button>
                    <span className={styles.pedidoNum}>#{pedido.numero}</span>
                  </td>
                  <td>
                    <div className={styles.clienteName}>{pedido.nombre_cliente}</div>
                    {pedido.telefono && (
                      <div className={styles.clientePhone}>{pedido.telefono}</div>
                    )}
                  </td>
                  <td>{pedido.ciudad || '—'}</td>
                  <td className={styles.total}>{formatCurrency(pedido.total)}</td>
                  <td>
                    <span
                      className={`${styles.estadoBadge} ${styles[`estado_${pedido.estado}`]}`}
                    >
                      {ESTADO_LABELS[pedido.estado]}
                    </span>
                  </td>
                  <td className={styles.fecha}>{formatDate(pedido.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <select
                        className={styles.estadoSelect}
                        value={pedido.estado}
                        disabled={isPending && pendingId === pedido.id}
                        onChange={e =>
                          handleEstadoChange(pedido.id, e.target.value as EstadoPedido)
                        }
                      >
                        {ESTADOS.map(e => (
                          <option key={e} value={e}>
                            {ESTADO_LABELS[e]}
                          </option>
                        ))}
                      </select>
                      {whatsapp && (
                        <a
                          href={buildWhatsAppLink(pedido)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.whatsappBtn}
                          title="Enviar WhatsApp"
                        >
                          WA
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === pedido.id && (
                  <tr key={`${pedido.id}-detail`} className={styles.detailRow}>
                    <td colSpan={7}>
                      <div className={styles.detailPanel}>
                        {/* Items table */}
                        <div className={styles.detailItems}>
                          <h3 className={styles.detailTitle}>Productos del pedido</h3>
                          {pedido.pedido_items && pedido.pedido_items.length > 0 ? (
                            <table className={styles.itemsTable}>
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Talla</th>
                                  <th>Color</th>
                                  <th>Cant.</th>
                                  <th>Precio unit.</th>
                                  <th>Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pedido.pedido_items.map(item => (
                                  <tr key={item.id}>
                                    <td>
                                      <div>{item.nombre_producto}</div>
                                      {item.personalizado_nombre && (
                                        <div className={styles.itemMeta}>
                                          Nombre: {item.personalizado_nombre}
                                        </div>
                                      )}
                                      {item.personalizado_numero && (
                                        <div className={styles.itemMeta}>
                                          Número: {item.personalizado_numero}
                                        </div>
                                      )}
                                    </td>
                                    <td>{item.talla ?? '—'}</td>
                                    <td>{item.color ?? '—'}</td>
                                    <td>{item.cantidad}</td>
                                    <td>{formatCurrency(item.precio)}</td>
                                    <td>{formatCurrency(item.precio * item.cantidad)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className={styles.detailEmpty}>Sin items registrados.</p>
                          )}
                        </div>

                        {/* Resumen + notas */}
                        <div className={styles.detailSummary}>
                          <h3 className={styles.detailTitle}>Resumen</h3>
                          <div className={styles.summaryGrid}>
                            <span>Subtotal</span>
                            <span>{formatCurrency(pedido.subtotal)}</span>
                            <span>Descuento cupón</span>
                            <span className={pedido.descuento_cupon > 0 ? styles.descuento : ''}>
                              {pedido.descuento_cupon > 0
                                ? `- ${formatCurrency(pedido.descuento_cupon)}`
                                : '—'}
                            </span>
                            {pedido.cupon_codigo && (
                              <>
                                <span>Cupón</span>
                                <span className={styles.cuponCode}>{pedido.cupon_codigo}</span>
                              </>
                            )}
                            <span>Envío</span>
                            <span>
                              {pedido.costo_envio > 0
                                ? formatCurrency(pedido.costo_envio)
                                : 'Gratis'}
                            </span>
                            {pedido.envio_nombre && (
                              <>
                                <span>Método envío</span>
                                <span>{pedido.envio_nombre}</span>
                              </>
                            )}
                            <span className={styles.summaryTotalLabel}>Total</span>
                            <span className={styles.summaryTotal}>
                              {formatCurrency(pedido.total)}
                            </span>
                          </div>
                          {pedido.notas && (
                            <div className={styles.notas}>
                              <span className={styles.notasLabel}>Notas:</span>
                              <span>{pedido.notas}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {activeTab === 'todos'
              ? 'No hay pedidos aún.'
              : `No hay pedidos con estado "${ESTADO_LABELS[activeTab as EstadoPedido]}".`}
          </div>
        )}
      </div>
    </div>
  )
}
