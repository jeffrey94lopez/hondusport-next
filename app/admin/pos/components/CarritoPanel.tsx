'use client'
import { useState } from 'react'
import { brutoLinea, brutoTotalLineas } from '@/lib/pos/carrito'
import type { LineaVenta } from '@/lib/pos/carrito'
import { formatPrice } from '@/lib/store/format'
import { topeStock, parseMoneyInput, valorMostrado } from '../pos-helpers'
import type { Cliente, Vendedor, Producto, TotalesDocumento } from '@/types'
import styles from '../pos.module.css'

// Contrato ajustado sobre el mínimo del brief (task-3-brief.md):
// - `productosPorId` y `totales` se agregaron porque el panel necesita el
//   tope de stock por línea (para el max del input de cantidad) y los
//   totales fiscales ya calculados (lib/pos/desglose) para el panel de
//   totales y la etiqueta del botón Cobrar; recalcularlos aquí duplicaría
//   la lógica de negocio del checkout, que debe vivir en un solo lugar
//   (PosClient, que ya la necesita para CobroModal).
// - Task 7 introdujo `onEditarLinea(key)` (el brief original de Task 3 lo
//   proponía, pero en ese momento la UI no tenía un concepto de "editar
//   línea"). Los antiguos `onPrecio`/`onDescuento`/`onDescuentoModo` se
//   quitaron de este contrato: precio y descuento ahora se editan en
//   `LineaEditorModal` (ver PosClient), que aplica el resultado completo
//   con un solo callback (`onGuardar`). `onCantidad`/`onCantidadInput` se
//   conservan porque el brief de Task 7 solo pide eliminar de la fila los
//   inputs de precio/descuento/modo, no el de cantidad.
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
  onEditarLinea: (key: string) => void
  onQuitarLinea: (key: string) => void
  onDescuentoGlobal: (monto: number) => void
  onCliente: (id: string | null) => void
  onNuevoCliente: () => void
  onVendedor: (id: string | null) => void
  onCobrar: () => void
}

// La descripción de una línea con variante se compone en PosClient como
// "{nombre} ({variante})" (ver agregarProducto en PosClient.tsx). Se separa
// aquí solo para mostrar nombre y variante en líneas distintas — no cambia
// el dato persistido (`descripcion`), solo cómo se presenta en la fila. Los
// ítems libres nunca tienen `variante_id`, así que nunca entran a este split.
function partesDescripcion(l: LineaVenta): { nombre: string; variante: string | null } {
  if (!l.variante_id) return { nombre: l.descripcion, variante: null }
  const m = l.descripcion.match(/^(.*) \(([^)]+)\)$/)
  return m ? { nombre: m[1], variante: m[2] } : { nombre: l.descripcion, variante: null }
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
  onEditarLinea,
  onQuitarLinea,
  onDescuentoGlobal,
  onCliente,
  onNuevoCliente,
  onVendedor,
  onCobrar,
}: CarritoPanelProps) {
  // ---- Selector de cliente (búsqueda sobre precargados + CONSUMIDOR FINAL) ----
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)

  const clienteActual = clienteId ? (clientes.find(c => c.id === clienteId) ?? null) : null
  const exonerado = clienteActual?.exonerado ?? false
  const brutoTotalActual = brutoTotalLineas(lineas)

  // Descuento global: input de dinero en texto plano, sin cero forzado (ver
  // spec de UX de mostrador). El estado numérico (`descuentoGlobal`) sigue
  // viviendo en PosClient — este componente solo agrega el string crudo que
  // se muestra MIENTRAS el campo tiene foco; fuera de eso (al montar, al
  // perder foco, o si el descuento se reclampa desde fuera al quitar una
  // línea) se muestra el valor canónico derivado del prop (0 = vacío).
  const [descuentoTexto, setDescuentoTexto] = useState('')
  const [editandoDescuento, setEditandoDescuento] = useState(false)
  const descuentoMostrado = editandoDescuento ? descuentoTexto : valorMostrado(descuentoGlobal)

  function handleDescuentoFocus() {
    setDescuentoTexto(valorMostrado(descuentoGlobal))
    setEditandoDescuento(true)
  }

  function handleDescuentoChange(texto: string) {
    setDescuentoTexto(texto)
    const n = parseMoneyInput(texto)
    onDescuentoGlobal(Math.min(Math.max(0, n), brutoTotalActual))
  }

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

  const clienteSelector = (
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
  )

  return (
    <section className={styles.carritoCol}>
      {/* Cliente arriba de todo (donde antes estaban las pestañas de ventas):
          se elige a quién se le vende antes de armar el carrito. El resto del
          "quién/cuánto" (vendedor, descuento, totales, cobrar) queda en el pie. */}
      <div className={`${styles.clienteBlock} ${styles.clienteBlockTop}`}>
        <div className={styles.clienteBlockHeader}>
          <label className={styles.formLabel}>Cliente</label>
          <button type="button" className={styles.btnNuevoCliente} onClick={onNuevoCliente}>
            + Nuevo
          </button>
        </div>
        {clienteSelector}
        {exonerado && <span className={styles.badgeExonerado}>Exonerado</span>}
      </div>

      <div className={styles.lineasScroll}>
        <div className={styles.lineasList}>
          {lineas.length === 0 ? (
            <div className={styles.empty}>Agrega productos desde el catálogo.</div>
          ) : (
            lineas.map(l => {
              const tope = topeStock(l, productosPorId)
              const subtotal = brutoLinea(l) - l.descuento
              const { nombre, variante } = partesDescripcion(l)
              return (
                <div key={l.key} className={styles.lineaRow}>
                  <div className={styles.lineaDesc}>
                    <div className={styles.lineaNombre}>{nombre}</div>
                    {variante && <div className={styles.lineaVariante}>{variante}</div>}
                    {l.descuento > 0 && (
                      <div className={styles.lineaDescuentoTag}>−{formatPrice(l.descuento)}</div>
                    )}
                  </div>
                  <div className={styles.lineaQty}>
                    <button type="button" className="btnMerlinIcon btnMerlinIconSm" onClick={() => onCantidad(l.key, -1)} aria-label="Restar cantidad">
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
                    <button type="button" className="btnMerlinIcon btnMerlinIconSm" onClick={() => onCantidad(l.key, 1)} aria-label="Sumar cantidad">
                      +
                    </button>
                  </div>
                  <div className={styles.lineaSubtotal}>{formatPrice(subtotal)}</div>
                  <div className={styles.lineaAcciones}>
                    <button type="button" className={styles.btnEditarLinea} onClick={() => onEditarLinea(l.key)} aria-label="Editar línea">
                      ✎
                    </button>
                    <button type="button" className="btnMerlinIcon btnMerlinIconDanger" onClick={() => onQuitarLinea(l.key)} aria-label="Quitar línea">
                      ×
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className={styles.pieCarrito}>
        <div className={styles.descuentoGlobalRow}>
          <label>Descuento global (L.)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={descuentoMostrado}
            onFocus={handleDescuentoFocus}
            onChange={e => handleDescuentoChange(e.target.value)}
            onBlur={() => setEditandoDescuento(false)}
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
      </div>
    </section>
  )
}
