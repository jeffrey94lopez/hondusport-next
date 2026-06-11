'use client'
import { useState, useTransition } from 'react'
import type { Pedido, EstadoPedido } from '@/types'
import { cambiarEstado } from './actions'
import styles from './pedidos.module.css'

const ESTADOS: EstadoPedido[] = ['recibido', 'preparando', 'enviado', 'entregado', 'cancelado']
const ESTADO_LABEL: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}
const ESTADO_COLOR: Record<EstadoPedido, string> = {
  recibido: '#3b8fed',
  preparando: '#f59e0b',
  enviado: '#8b5cf6',
  entregado: '#5bbf6b',
  cancelado: '#e05555',
}

interface Props { pedidos: Pedido[] }

export default function PedidosClient({ pedidos }: Props) {
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('todos')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = filtro === 'todos' ? pedidos : pedidos.filter(p => p.estado === filtro)

  function handleEstado(id: string, estado: EstadoPedido) {
    startTransition(async () => { await cambiarEstado(id, estado) })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>{filtered.length} pedidos</p>
        </div>
      </div>

      <div className={styles.filtros}>
        <button
          className={`${styles.filtroBtn} ${filtro === 'todos' ? styles.filtroActive : ''}`}
          onClick={() => setFiltro('todos')}
        >
          Todos ({pedidos.length})
        </button>
        {ESTADOS.map(e => (
          <button
            key={e}
            className={`${styles.filtroBtn} ${filtro === e ? styles.filtroActive : ''}`}
            onClick={() => setFiltro(e)}
            style={filtro === e ? { borderColor: ESTADO_COLOR[e], color: ESTADO_COLOR[e] } : {}}
          >
            {ESTADO_LABEL[e]} ({pedidos.filter(p => p.estado === e).length})
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {filtered.map(pedido => (
          <div key={pedido.id} className={styles.card}>
            <div
              className={styles.cardHeader}
              onClick={() => setExpanded(expanded === pedido.id ? null : pedido.id)}
            >
              <div className={styles.cardLeft}>
                <span className={styles.numero}>#{pedido.numero}</span>
                <span className={styles.cliente}>{pedido.nombre_cliente}</span>
                <span className={styles.ciudad}>{pedido.ciudad}</span>
              </div>
              <div className={styles.cardRight}>
                <span className={styles.total}>L. {pedido.total.toLocaleString()}</span>
                <select
                  value={pedido.estado}
                  onChange={e => handleEstado(pedido.id, e.target.value as EstadoPedido)}
                  disabled={isPending}
                  className={styles.estadoSelect}
                  style={{ color: ESTADO_COLOR[pedido.estado] }}
                  onClick={e => e.stopPropagation()}
                >
                  {ESTADOS.map(e => (
                    <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                  ))}
                </select>
                <a
                  href={`https://wa.me/${pedido.telefono}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.waBtn}
                  onClick={e => e.stopPropagation()}
                >
                  WhatsApp
                </a>
                <span className={styles.chevron}>{expanded === pedido.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === pedido.id && (
              <div className={styles.cardBody}>
                {pedido.pedido_items?.map(item => (
                  <div key={item.id} className={styles.item}>
                    <span className={styles.itemNombre}>{item.nombre_producto}</span>
                    <span className={styles.itemDet}>
                      {item.talla && `Talla: ${item.talla}`}
                      {item.color && ` · Color: ${item.color}`}
                      {item.personalizado_nombre && ` · Nombre: ${item.personalizado_nombre}`}
                      {item.personalizado_numero && ` · Número: ${item.personalizado_numero}`}
                    </span>
                    <span className={styles.itemPrecio}>
                      {item.cantidad}× L. {item.precio.toLocaleString()}
                    </span>
                  </div>
                ))}
                {pedido.notas && <p className={styles.notas}>Nota: {pedido.notas}</p>}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.empty}>No hay pedidos en este estado.</div>
        )}
      </div>
    </div>
  )
}
