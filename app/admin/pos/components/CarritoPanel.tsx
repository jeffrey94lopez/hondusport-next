'use client'
import { useRef, useState } from 'react'
import Modal from '@/components/admin/Modal'
import { brutoLinea, brutoTotalLineas, presetToDescuento } from '@/lib/pos/carrito'
import type { LineaVenta } from '@/lib/pos/carrito'
import { formatPrice } from '@/lib/store/format'
import { topeStock, parseMoneyInput, round2, valorMostrado } from '../pos-helpers'
import type { Cliente, Vendedor, Producto, TotalesDocumento, DescuentoPreset } from '@/types'
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
  // R2b Task 5: presets activos de descuento, cargados en PosClient. Esta
  // tarea solo deja el contrato listo (recibe y tipa la prop); los chips del
  // descuento global los consume Task 6 (pie del carrito).
  descuentos: DescuentoPreset[]
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

// Iconos inline (look Stitch): mismo patrón que el ícono de búsqueda de
// CatalogoPanel — SVG con stroke=currentColor, sin depender de una librería.
function IconoPersona() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  )
}

function IconoChevron() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function IconoEtiqueta() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function CarritoPanel({
  lineas,
  descuentoGlobal,
  descuentos,
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
  // Pase visual R4: los chips + input manual del descuento global viven en un
  // modal (botón compacto en el pie) para ceder espacio a la lista de ítems.
  const [descuentoModalAbierto, setDescuentoModalAbierto] = useState(false)
  const descuentoMostrado = editandoDescuento ? descuentoTexto : valorMostrado(descuentoGlobal)
  // Chip "Otro": no guarda estado propio — solo enfoca el input manual (mismo
  // criterio que LineaEditorModal, Task 5).
  const descuentoInputRef = useRef<HTMLInputElement>(null)

  function handleDescuentoFocus() {
    setDescuentoTexto(valorMostrado(descuentoGlobal))
    setEditandoDescuento(true)
  }

  function handleDescuentoChange(texto: string) {
    setDescuentoTexto(texto)
    const n = parseMoneyInput(texto)
    onDescuentoGlobal(Math.min(Math.max(0, n), brutoTotalActual))
  }

  // Chip activo: se deriva del descuento global actual (nunca de un estado
  // propio) para que escribir en el input manual "apague" el chip
  // automáticamente — mismo criterio que LineaEditorModal (Task 5).
  // "Ninguno" gana si el descuento es 0; un preset gana si el monto actual
  // coincide con lo que ese preset produciría sobre el bruto total actual;
  // "Otro" es el resto.
  const presetActivo = (p: DescuentoPreset) =>
    brutoTotalActual > 0 && round2(descuentoGlobal) === presetToDescuento(p, brutoTotalActual)
  const ningunoActivo = descuentoGlobal === 0
  const otroActivo = !ningunoActivo && !descuentos.some(presetActivo)

  // Subtotal (pre-ISV, neto de descuentos): derivado por aritmética simple de
  // los campos ya calculados en `totales` (total = suma de bases + ISV, ver
  // lib/pos/desglose.ts) — no es una regla de negocio nueva, solo una lectura
  // distinta de datos que el panel ya recibe, para mostrar la fila "Subtotal"
  // del look Stitch.
  const subtotalMostrado = round2(totales.total - totales.isv15 - totales.isv18)

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
      <span className={styles.clienteChevron} aria-hidden="true"><IconoChevron /></span>
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
      <div className={styles.clienteBlockTop}>
        <div className={styles.clienteCard}>
          <span className={styles.clienteCardIcon} aria-hidden="true"><IconoPersona /></span>
          <div className={styles.clienteCardBody}>
            <div className={styles.clienteCardTopRow}>
              <span className={styles.clienteCardLabel}>Cliente</span>
              <button type="button" className={styles.btnNuevoCliente} onClick={onNuevoCliente}>
                + Nuevo
              </button>
            </div>
            {clienteSelector}
          </div>
        </div>
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
              const producto = l.producto_id ? productosPorId.get(l.producto_id) : undefined
              const imagen = producto?.imagenes?.[0] ?? null
              // Pase visual R4: dos filas — el nombre ocupa la primera
              // completa (con elipsis solo en casos extremos + title);
              // stepper/subtotal/acciones van en la segunda.
              return (
                <div key={l.key} className={styles.carritoLineaRow}>
                  <div className={styles.carritoLineaImgWrap}>
                    {imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagen} alt="" className={styles.carritoLineaImg} />
                    ) : (
                      <div className={styles.carritoLineaImgPlaceholder} />
                    )}
                  </div>
                  <div className={styles.carritoLineaBody}>
                    <div className={styles.lineaNombre} title={nombre}>
                      {nombre}
                      {variante && <span className={styles.lineaVariante}> · {variante}</span>}
                    </div>
                    <div className={styles.carritoLineaControls}>
                      <div className={styles.qtyStepper}>
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
                      {l.descuento > 0 && (
                        <span className={styles.lineaDescuentoTag}>−{formatPrice(l.descuento)}</span>
                      )}
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
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className={styles.pieCarrito}>
        {/* Pase visual R4: el descuento global se abre en un modal (botón
            compacto); el Total vive dentro del botón Cobrar. */}
        <div className={styles.pieTopRow}>
          <button
            type="button"
            className={styles.btnDescuentoPie}
            onClick={() => setDescuentoModalAbierto(true)}
          >
            <IconoEtiqueta />
            {descuentoGlobal > 0 ? `Descuento −${formatPrice(descuentoGlobal)}` : 'Descuento'}
          </button>
          <div className={styles.vendedorInline}>
            <label className={styles.vendedorInlineLabel} htmlFor="pos-carrito-vendedor">Vendedor</label>
            <select
              id="pos-carrito-vendedor"
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
        </div>

        <div className={styles.carritoTotales}>
          <div className={styles.carritoTotalRow}><span>Subtotal</span><span>{formatPrice(subtotalMostrado)}</span></div>
          {totales.isv15 > 0 && (
            <div className={styles.carritoTotalRow}><span>ISV (15%)</span><span>{formatPrice(totales.isv15)}</span></div>
          )}
          {totales.isv18 > 0 && (
            <div className={styles.carritoTotalRow}><span>ISV (18%)</span><span>{formatPrice(totales.isv18)}</span></div>
          )}
          {totales.descuento_total > 0 && (
            <div className={styles.carritoTotalRow}><span>Descuento</span><span>-{formatPrice(totales.descuento_total)}</span></div>
          )}
        </div>

        <button
          type="button"
          className={`btnMerlinPrimary ${styles.btnCobrar}`}
          disabled={lineas.length === 0}
          onClick={onCobrar}
        >
          Cobrar {formatPrice(totales.total)} <span aria-hidden="true">→</span>
        </button>
      </div>

      {descuentoModalAbierto && (
        <Modal title="Descuento global" onClose={() => setDescuentoModalAbierto(false)}>
          {/* R2b: chips de descuento global — misma lógica y marcado
              (.chip/.chipActivo + input manual); solo cambió el contenedor
              (antes el pie del carrito, ahora este modal). */}
          <div className={styles.descuentoGlobalRow}>
            <div className={styles.chipsRow}>
              <button
                type="button"
                className={`${styles.chip} ${ningunoActivo ? styles.chipActivo : ''}`}
                aria-pressed={ningunoActivo}
                onClick={() => onDescuentoGlobal(0)}
              >
                Ninguno
              </button>
              {descuentos.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.chip} ${presetActivo(p) ? styles.chipActivo : ''}`}
                  aria-pressed={presetActivo(p)}
                  onClick={() => onDescuentoGlobal(presetToDescuento(p, brutoTotalActual))}
                >
                  {p.etiqueta}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.chip} ${otroActivo ? styles.chipActivo : ''}`}
                aria-pressed={otroActivo}
                onClick={() => descuentoInputRef.current?.focus()}
              >
                Otro
              </button>
            </div>
            <input
              ref={descuentoInputRef}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Descuento global (L.)"
              value={descuentoMostrado}
              onFocus={handleDescuentoFocus}
              onChange={e => handleDescuentoChange(e.target.value)}
              onBlur={() => setEditandoDescuento(false)}
            />
            <div className={styles.formFooter}>
              <button
                type="button"
                className={`btnMerlinPrimary ${styles.btnSubmit}`}
                onClick={() => setDescuentoModalAbierto(false)}
              >
                Listo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
