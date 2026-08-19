'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Pedido, EstadoPedido, Caja, Cliente } from '@/types'
import { cambiarEstado } from './actions'
import { emitirDesdePedido } from '@/app/admin/pos/actions'
import { ESTADO_COLOR } from '@/app/admin/estadoColor'
import Modal from '@/components/admin/Modal'
import type { DocumentoVigentePedido } from './page'
import { numeroDocumento } from '@/lib/pos/documentos'
import styles from './pedidos.module.css'

const ESTADOS: EstadoPedido[] = ['recibido', 'preparando', 'enviado', 'entregado', 'cancelado']
const ESTADO_LABEL: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

interface Props {
  pedidos: Pedido[]
  documentosPorPedido: Record<string, DocumentoVigentePedido>
  cajas: Caja[]
  clientes: Cliente[]
}

export default function PedidosClient({ pedidos, documentosPorPedido, cajas, clientes }: Props) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('todos')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [emitiendo, setEmitiendo] = useState<Pedido | null>(null)

  const filtered = filtro === 'todos' ? pedidos : pedidos.filter(p => p.estado === filtro)

  function handleEstado(id: string, estado: EstadoPedido) {
    setError(null)
    startTransition(async () => {
      const result = await cambiarEstado(id, estado)
      if (result.error) setError(result.error)
    })
  }

  function handleEmitido(documentoId: string) {
    setEmitiendo(null)
    window.open(`/admin/pos/documento/${documentoId}`, '_blank', 'noopener,noreferrer')
    router.refresh()
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>{filtered.length} pedidos</p>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

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
        {filtered.map(pedido => {
          const documento = documentosPorPedido[pedido.id]
          return (
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
                {documento ? (
                  <a
                    href={`/admin/pos/documento/${documento.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.verDocBtn}
                    onClick={e => e.stopPropagation()}
                  >
                    Ver {numeroDocumento(documento)}
                  </a>
                ) : pedido.estado !== 'cancelado' ? (
                  <button
                    type="button"
                    className={styles.emitirBtn}
                    onClick={e => { e.stopPropagation(); setEmitiendo(pedido) }}
                  >
                    Emitir documento
                  </button>
                ) : null}
                <span className={styles.chevron}>{expanded === pedido.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === pedido.id && (
              <div className={styles.cardBody}>
                {pedido.pedido_items?.map(item => (
                  <div key={item.id} className={styles.item}>
                    <span className={styles.itemNombre}>{item.nombre_producto}</span>
                    <span className={styles.itemDet}>
                      {(item.variante_nombre ?? item.talla) && `Talla: ${item.variante_nombre ?? item.talla}`}
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
          )
        })}
        {filtered.length === 0 && (
          <div className={styles.empty}>No hay pedidos en este estado.</div>
        )}
      </div>

      {emitiendo && (
        <EmitirModal
          pedido={emitiendo}
          cajas={cajas}
          clientes={clientes}
          onClose={() => setEmitiendo(null)}
          onEmitido={handleEmitido}
        />
      )}
    </div>
  )
}

interface EmitirModalProps {
  pedido: Pedido
  cajas: Caja[]
  clientes: Cliente[]
  onClose: () => void
  onEmitido: (documentoId: string) => void
}

function EmitirModal({ pedido, cajas, clientes, onClose, onEmitido }: EmitirModalProps) {
  const [tipo, setTipo] = useState<'factura' | 'comprobante'>('comprobante')
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '')
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const clienteActual = clienteId ? clientes.find(c => c.id === clienteId) ?? null : null
  const clientesFiltrados =
    clienteQuery.trim() === ''
      ? clientes
      : clientes.filter(c => {
          const q = clienteQuery.trim().toLowerCase()
          return c.nombre.toLowerCase().includes(q) || (c.rtn ?? '').includes(clienteQuery.trim())
        })

  function seleccionarCliente(cliente: Cliente | null) {
    setClienteId(cliente?.id ?? null)
    setClienteQuery('')
    setClienteOpen(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cajaId) { setError('Selecciona una caja.'); return }
    setError('')
    startTransition(async () => {
      const result = await emitirDesdePedido({ pedidoId: pedido.id, tipo, cajaId, clienteId })
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo completar la operación. Intenta de nuevo.' : result.error)
        return
      }
      onEmitido(result.data.documentoId)
    })
  }

  return (
    <Modal title={`Emitir documento — Pedido #${pedido.numero}`} onClose={onClose} maxWidth="480px">
      <form onSubmit={handleSubmit} className={styles.formEmitir}>
        <label className={styles.formLabel}>
          Tipo de documento
          <select
            className={styles.formSelect}
            value={tipo}
            onChange={e => setTipo(e.target.value as 'factura' | 'comprobante')}
          >
            <option value="factura">Factura</option>
            <option value="comprobante">Comprobante</option>
          </select>
        </label>

        <label className={styles.formLabel}>
          Caja
          {cajas.length === 0 ? (
            <p className={styles.formError}>No hay cajas activas configuradas.</p>
          ) : (
            <select className={styles.formSelect} value={cajaId} onChange={e => setCajaId(e.target.value)}>
              {cajas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </label>

        <label className={styles.formLabel}>
          Cliente
          <div className={styles.clienteCombo}>
            <input
              type="text"
              className={styles.clienteInput}
              value={clienteOpen ? clienteQuery : (clienteActual?.nombre ?? '(datos del pedido)')}
              onFocus={() => { setClienteOpen(true); setClienteQuery('') }}
              onChange={e => setClienteQuery(e.target.value)}
              onBlur={() => setTimeout(() => setClienteOpen(false), 120)}
              placeholder="Buscar por nombre o RTN…"
            />
            {clienteOpen && (
              <div className={styles.clienteDropdown} onMouseDown={e => e.preventDefault()}>
                <button type="button" className={styles.clienteOption} onClick={() => seleccionarCliente(null)}>
                  (datos del pedido)
                </button>
                {clientesFiltrados.map(c => (
                  <button key={c.id} type="button" className={styles.clienteOption} onClick={() => seleccionarCliente(c)}>
                    {c.nombre} {c.rtn ? `· ${c.rtn}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="submit" className={`${styles.btnSubmit} btnMerlinPrimary`} disabled={isPending || cajas.length === 0}>
            {isPending ? 'Emitiendo…' : 'Emitir documento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
