'use client'
import { useState } from 'react'
import { brutoTotalLineas } from '@/lib/pos/carrito'
import type { LineaVenta, DescuentoModo } from '@/lib/pos/carrito'
import { formatPrice } from '@/lib/store/format'
import { round2, topeStock } from '../pos-helpers'
import type { Cliente, Vendedor, Producto, TotalesDocumento } from '@/types'
import styles from '../pos.module.css'

// Contrato ajustado sobre el mínimo del brief (task-3-brief.md):
// - `productosPorId` y `totales` se agregaron porque el panel necesita el
//   tope de stock por línea (para el max del input de cantidad) y los
//   totales fiscales ya calculados (lib/pos/desglose) para el panel de
//   totales y la etiqueta del botón Cobrar; recalcularlos aquí duplicaría
//   la lógica de negocio del checkout, que debe vivir en un solo lugar
//   (PosClient, que ya la necesita para CobroModal).
// - `onEditarLinea(key)` del brief se reemplazó por los cuatro mutadores
//   concretos que ya existían en PosClient (`onCantidadInput`, `onPrecio`,
//   `onDescuento`, `onDescuentoModo`): no hay un único "editar" en la UI
//   actual, sino inputs independientes por campo de la línea.
export interface CarritoPanelProps {
  lineas: LineaVenta[]
  descuentoGlobal: number
  clientes: Cliente[]
  vendedores: Vendedor[]
  clienteId: string | null
  vendedorId: string | null
  productosPorId: Map<string, Producto>
  totales: TotalesDocumento
  onCantidad: (key: string, delta: number) => void
  onCantidadInput: (key: string, valor: string) => void
  onPrecio: (key: string, valor: string) => void
  onDescuento: (key: string, valor: string) => void
  onDescuentoModo: (key: string, modo: DescuentoModo) => void
  onQuitarLinea: (key: string) => void
  onDescuentoGlobal: (monto: number) => void
  onCliente: (id: string | null) => void
  onVendedor: (id: string | null) => void
  onItemLibre: () => void
  onCobrar: () => void
}

export default function CarritoPanel({
  lineas,
  descuentoGlobal,
  clientes,
  vendedores,
  clienteId,
  vendedorId,
  productosPorId,
  totales,
  onCantidad,
  onCantidadInput,
  onPrecio,
  onDescuento,
  onDescuentoModo,
  onQuitarLinea,
  onDescuentoGlobal,
  onCliente,
  onVendedor,
  onItemLibre,
  onCobrar,
}: CarritoPanelProps) {
  // ---- Selector de cliente (búsqueda sobre precargados + CONSUMIDOR FINAL) ----
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)

  const clienteActual = clienteId ? (clientes.find(c => c.id === clienteId) ?? null) : null
  const exonerado = clienteActual?.exonerado ?? false
  const brutoTotalActual = brutoTotalLineas(lineas)

  const clientesFiltrados =
    clienteQuery.trim() === ''
      ? clientes
      : clientes.filter(c => {
          const q = clienteQuery.trim().toLowerCase()
          return c.nombre.toLowerCase().includes(q) || (c.rtn ?? '').includes(clienteQuery.trim())
        })

  function seleccionarCliente(cliente: Cliente | null) {
    onCliente(cliente?.id ?? null)
    setClienteQuery('')
    setClienteOpen(false)
  }

  return (
    <section className={styles.carritoCol}>
      <div className={styles.lineasList}>
        {lineas.length === 0 ? (
          <div className={styles.empty}>Agrega productos desde el catálogo.</div>
        ) : (
          lineas.map(l => {
            const tope = topeStock(l, productosPorId)
            const brutoBase = l.cantidad * l.precio_unitario
            const pctValue = brutoBase > 0 ? round2((l.descuento / brutoBase) * 100) : 0
            const subtotal = round2(brutoBase - l.descuento)
            return (
              <div key={l.key} className={styles.lineaRow}>
                <div className={styles.lineaDesc}>{l.descripcion}</div>
                <div className={styles.lineaQty}>
                  <button type="button" className={styles.qtyBtn} onClick={() => onCantidad(l.key, -1)}>
                    −
                  </button>
                  <input
                    type="number"
                    className={styles.qtyInput}
                    value={l.cantidad}
                    min={1}
                    max={tope ?? undefined}
                    onChange={e => onCantidadInput(l.key, e.target.value)}
                  />
                  <button type="button" className={styles.qtyBtn} onClick={() => onCantidad(l.key, 1)}>
                    +
                  </button>
                </div>
                <input
                  type="number"
                  className={styles.lineaPrecio}
                  min={0}
                  step="0.01"
                  value={l.precio_unitario}
                  onChange={e => onPrecio(l.key, e.target.value)}
                />
                <div className={styles.lineaDescuentoGroup}>
                  <input
                    type="number"
                    className={styles.lineaDescuento}
                    min={0}
                    step="0.01"
                    value={l.descuentoModo === 'monto' ? l.descuento : pctValue}
                    onChange={e => onDescuento(l.key, e.target.value)}
                  />
                  <select
                    className={styles.descuentoModoSelect}
                    value={l.descuentoModo}
                    onChange={e => onDescuentoModo(l.key, e.target.value as DescuentoModo)}
                  >
                    <option value="monto">L.</option>
                    <option value="porcentaje">%</option>
                  </select>
                </div>
                <div className={styles.lineaSubtotal}>{formatPrice(subtotal)}</div>
                <button type="button" className={styles.btnQuitar} onClick={() => onQuitarLinea(l.key)} aria-label="Quitar línea">
                  ×
                </button>
              </div>
            )
          })
        )}
      </div>

      <button type="button" className={styles.btnItemLibre} onClick={onItemLibre}>
        + Ítem libre
      </button>

      <div className={styles.descuentoGlobalRow}>
        <label>Descuento global (L.)</label>
        <input
          type="number"
          min={0}
          max={brutoTotalActual}
          step="0.01"
          value={descuentoGlobal}
          onChange={e => onDescuentoGlobal(Math.min(Math.max(0, Number(e.target.value) || 0), brutoTotalActual))}
        />
      </div>

      <div className={styles.totalesPanel}>
        {totales.total_exento > 0 && (
          <div className={styles.totalesRow}><span>Exento</span><span>{formatPrice(totales.total_exento)}</span></div>
        )}
        {totales.total_exonerado > 0 && (
          <div className={styles.totalesRow}><span>Exonerado</span><span>{formatPrice(totales.total_exonerado)}</span></div>
        )}
        {totales.total_gravado15 > 0 && (
          <div className={styles.totalesRow}><span>Gravado 15%</span><span>{formatPrice(totales.total_gravado15)}</span></div>
        )}
        {totales.total_gravado18 > 0 && (
          <div className={styles.totalesRow}><span>Gravado 18%</span><span>{formatPrice(totales.total_gravado18)}</span></div>
        )}
        {totales.isv15 > 0 && (
          <div className={styles.totalesRow}><span>ISV 15%</span><span>{formatPrice(totales.isv15)}</span></div>
        )}
        {totales.isv18 > 0 && (
          <div className={styles.totalesRow}><span>ISV 18%</span><span>{formatPrice(totales.isv18)}</span></div>
        )}
        {totales.descuento_total > 0 && (
          <div className={styles.totalesRow}><span>Descuento</span><span>-{formatPrice(totales.descuento_total)}</span></div>
        )}
        <div className={styles.totalesRowTotal}><span>Total</span><span>{formatPrice(totales.total)}</span></div>
      </div>

      <div className={styles.clienteBlock}>
        <label className={styles.formLabel}>Cliente</label>
        <div className={styles.clienteCombo}>
          <input
            type="text"
            className={styles.clienteInput}
            value={clienteOpen ? clienteQuery : (clienteActual?.nombre ?? 'CONSUMIDOR FINAL')}
            onFocus={() => {
              setClienteOpen(true)
              setClienteQuery('')
            }}
            onChange={e => setClienteQuery(e.target.value)}
            onBlur={() => setTimeout(() => setClienteOpen(false), 120)}
            placeholder="Buscar por nombre o RTN…"
          />
          {clienteOpen && (
            <div className={styles.clienteDropdown} onMouseDown={e => e.preventDefault()}>
              <button type="button" className={styles.clienteOption} onClick={() => seleccionarCliente(null)}>
                CONSUMIDOR FINAL
              </button>
              {clientesFiltrados.map(c => (
                <button key={c.id} type="button" className={styles.clienteOption} onClick={() => seleccionarCliente(c)}>
                  {c.nombre} {c.rtn ? `· ${c.rtn}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        {exonerado && <span className={styles.badgeExonerado}>Exonerado</span>}
      </div>

      <div className={styles.vendedorBlock}>
        <label className={styles.formLabel}>Vendedor</label>
        <select
          className={styles.vendedorSelect}
          value={vendedorId ?? ''}
          onChange={e => onVendedor(e.target.value || null)}
        >
          <option value="">Sin vendedor</option>
          {vendedores.map(v => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className={`btnMerlinPrimary ${styles.btnCobrar}`}
        disabled={lineas.length === 0}
        onClick={onCobrar}
      >
        Cobrar {formatPrice(totales.total)}
      </button>
    </section>
  )
}
