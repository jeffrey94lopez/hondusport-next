'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { abrirSesion } from './actions'
import Modal from '@/components/admin/Modal'
import { precioLineaPos } from '@/lib/pos/emision'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { estadoCai } from '@/lib/pos/fiscal'
import { toStoreVariantes, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'
import type {
  Caja,
  SesionCaja,
  Vendedor,
  MetodoPago,
  Producto,
  ProductoVariante,
  Cliente,
  CaiAutorizacion,
  ConfigMap,
  LineaPos,
  IsvTipo,
} from '@/types'
import styles from './pos.module.css'

const STORAGE_KEY = 'pos_caja_id'

// Contrato de props para las Tasks 10-12 (catálogo/carrito, cobro y emisión,
// espera/cierre): esta tarea solo consume `cajas` y `sesionesAbiertas`; el
// resto viaja ya resuelto desde el server component para que las próximas
// tareas no necesiten tocar page.tsx.
interface Props {
  cajas: Caja[]
  sesionesAbiertas: SesionCaja[]
  vendedores: Vendedor[]
  metodos: MetodoPago[]
  productos: Producto[]
  clientes: Cliente[]
  cais: CaiAutorizacion[]
  config: ConfigMap
}

// Contrato de carrito para Task 11 (cobro/emisión, consume) y Task 12
// (espera, aparca/restaura): se mantiene plano a propósito. `lineas` ya
// viene limpio de los campos de solo-UI (ver LineaVenta más abajo) — es
// exactamente lo que espera `emitirVenta` como `input.lineas`.
export interface CarritoPos {
  lineas: LineaPos[]
  descuentoGlobal: number
  clienteId: string | null
  vendedorId: string | null
}

type DescuentoModo = 'monto' | 'porcentaje'

// Línea de venta de la UI: extiende LineaPos con campos que NUNCA viajan al
// server. `precioManual` marca que el precio de esta línea fue editado a
// mano (o es un ítem libre): al cambiar de cliente (final/revendedor) esas
// líneas NO se recalculan, solo las de inventario sin override. `key` es el
// id estable de React (no existe en LineaPos). `descuentoModo` solo decide
// cómo se muestra/edita el descuento (monto L. o %); el valor persistido
// (`descuento`) siempre es un monto en Lempiras, igual que en LineaPos.
interface LineaVenta extends LineaPos {
  key: string
  precioManual: boolean
  descuentoModo: DescuentoModo
}

const round2 = (n: number) => Math.round(n * 100) / 100

function toLineaPos(l: LineaVenta): LineaPos {
  return {
    producto_id: l.producto_id,
    variante_id: l.variante_id,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    descuento: l.descuento,
    isv: l.isv,
  }
}

function variantesActivasDe(producto: Producto): ProductoVariante[] {
  return (producto.producto_variantes ?? []).filter(v => v.activo).sort((a, b) => a.orden - b.orden)
}

// Precio(s) del producto para el card del catálogo, respetando tipo de
// cliente (revendedor puede tener precio propio por variante).
function preciosCatalogo(producto: Producto, tipoCliente: 'final' | 'revendedor'): number[] {
  const activas = variantesActivasDe(producto)
  if (activas.length === 0) return [precioLineaPos(tipoCliente, producto, null)]
  return activas.map(v => precioLineaPos(tipoCliente, producto, v))
}

// Tope de cantidad para una línea de inventario: null = ilimitado (mismo
// criterio que el carrito de la tienda, ver lib/store/cart.ts).
function topeStock(linea: LineaVenta, productosPorId: Map<string, Producto>): number | null {
  if (!linea.producto_id) return null
  const producto = productosPorId.get(linea.producto_id)
  if (!producto) return null
  const variantes = toStoreVariantes(producto.precio, producto.producto_variantes ?? [])
  if (linea.variante_id) return variantes.find(v => v.id === linea.variante_id)?.stock ?? null
  return stockEfectivo(producto.stock, variantes)
}

// Lazy initializer de useState (patrón ya usado en CartProvider/WishlistProvider
// para localStorage): en el servidor `window` no existe y se devuelve `null`;
// en el cliente se lee una sola vez al montar. Evita el nuevo lint
// `react-hooks/set-state-in-effect` de sincronizar estado con un efecto.
function leerCajaGuardada(cajas: Caja[]): string | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && cajas.some(c => c.id === stored) ? stored : null
}

export default function PosClient({ cajas, sesionesAbiertas, vendedores, productos, clientes, cais }: Props) {
  const router = useRouter()
  const [cajaId, setCajaId] = useState<string | null>(() => leerCajaGuardada(cajas))
  const [montoInicial, setMontoInicial] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Guard de montaje: aunque `leerCajaGuardada` usa un lazy initializer (sin
  // setState dentro de un efecto), el componente SÍ se prerenderiza en el
  // servidor. El SSR siempre resuelve a la rama "selección de caja" (no hay
  // localStorage), pero en el cliente, durante la hidratación, el mismo
  // render inicial ya tiene `window` disponible: si hay `pos_caja_id`
  // guardado (el caso normal en visitas repetidas), el initializer decide
  // otra rama completa (apertura de sesión o venta) en ese primer render,
  // lo que produce un mismatch de árbol completo entre servidor y cliente
  // (flash + error de hidratación en consola). Para evitarlo, la rama no se
  // decide hasta después de montar: se renderiza un estado neutro (idéntico
  // en servidor y en el primer render del cliente) y recién en el efecto se
  // habilita mostrar la rama real ya calculada por el lazy initializer.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // Diverge intencionalmente del árbol de SSR (ver comentario arriba): no
    // es un caso de "sincronizar con un sistema externo" que dispare
    // `react-hooks/set-state-in-effect` con un patrón corregible por
    // lazy-init, porque lo que cambia no es un valor sino qué rama de JSX se
    // pinta — se necesita el paso extra de "ya estamos en el cliente".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // ---- Estado del carrito (contrato Task 11/12, ver CarritoPos arriba) ----
  const [lineas, setLineas] = useState<LineaVenta[]>([])
  const [descuentoGlobal, setDescuentoGlobal] = useState(0)
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [vendedorId, setVendedorId] = useState<string | null>(null)

  // ---- Catálogo: búsqueda y selector de variantes ----
  const [busqueda, setBusqueda] = useState('')
  const [varianteModal, setVarianteModal] = useState<Producto | null>(null)
  const [libreModal, setLibreModal] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const nextKeyRef = useRef(0)

  // ---- Selector de cliente (búsqueda sobre precargados + CONSUMIDOR FINAL) ----
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)

  const productosPorId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const clienteActual = clienteId ? (clientes.find(c => c.id === clienteId) ?? null) : null
  const tipoCliente: 'final' | 'revendedor' = clienteActual?.tipo_cliente ?? 'final'
  const exonerado = clienteActual?.exonerado ?? false

  function nuevaKey(): string {
    nextKeyRef.current += 1
    return `l${nextKeyRef.current}`
  }

  function agregarProducto(producto: Producto, variante: ProductoVariante | null) {
    setLineas(prev => {
      const idx = prev.findIndex(l => l.producto_id === producto.id && l.variante_id === (variante?.id ?? null))
      const variantes = toStoreVariantes(producto.precio, producto.producto_variantes ?? [])
      const tope = (variante ? variantes.find(v => v.id === variante.id)?.stock : stockEfectivo(producto.stock, variantes)) ?? Infinity
      if (idx === -1) {
        if (tope <= 0) return prev
        const nueva: LineaVenta = {
          key: nuevaKey(),
          producto_id: producto.id,
          variante_id: variante?.id ?? null,
          descripcion: variante ? `${producto.nombre} (${variante.nombre})` : producto.nombre,
          cantidad: 1,
          precio_unitario: precioLineaPos(tipoCliente, producto, variante),
          descuento: 0,
          isv: producto.isv,
          precioManual: false,
          descuentoModo: 'monto',
        }
        return [...prev, nueva]
      }
      return prev.map((l, i) => (i === idx ? { ...l, cantidad: Math.min(l.cantidad + 1, Math.max(tope, l.cantidad)) } : l))
    })
    searchRef.current?.focus()
  }

  function buscarPorSkuExacto(q: string): { producto: Producto; variante: ProductoVariante | null } | null {
    const query = q.trim().toLowerCase()
    if (!query) return null
    for (const p of productos) {
      if (p.sku && p.sku.trim().toLowerCase() === query) return { producto: p, variante: null }
      const variante = variantesActivasDe(p).find(v => v.sku && v.sku.trim().toLowerCase() === query)
      if (variante) return { producto: p, variante }
    }
    return null
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const match = buscarPorSkuExacto(busqueda)
    if (!match) return
    e.preventDefault()
    agregarProducto(match.producto, match.variante)
    setBusqueda('')
  }

  function handleProductoClick(producto: Producto) {
    const activas = variantesActivasDe(producto)
    if (activas.length === 0) {
      agregarProducto(producto, null)
      return
    }
    setVarianteModal(producto)
  }

  function elegirVariante(producto: Producto, variante: ProductoVariante) {
    agregarProducto(producto, variante)
    setVarianteModal(null)
  }

  function quitarLinea(key: string) {
    setLineas(prev => prev.filter(l => l.key !== key))
  }

  function cambiarCantidadDelta(key: string, delta: number) {
    setLineas(prev =>
      prev
        .map(l => {
          if (l.key !== key) return l
          if (delta <= 0) return { ...l, cantidad: l.cantidad + delta }
          const tope = topeStock(l, productosPorId) ?? Infinity
          return { ...l, cantidad: Math.min(l.cantidad + delta, Math.max(tope, l.cantidad)) }
        })
        .filter(l => l.cantidad > 0),
    )
  }

  function cambiarCantidadInput(key: string, valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    setLineas(prev =>
      prev.map(l => {
        if (l.key !== key) return l
        const tope = topeStock(l, productosPorId) ?? Infinity
        return { ...l, cantidad: Math.max(1, Math.min(Math.round(n), tope)) }
      }),
    )
  }

  function cambiarPrecio(key: string, valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, precio_unitario: Math.max(0, n), precioManual: true } : l)))
  }

  function cambiarModoDescuento(key: string, modo: DescuentoModo) {
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, descuentoModo: modo } : l)))
  }

  function cambiarDescuento(key: string, valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n) || n < 0) return
    setLineas(prev =>
      prev.map(l => {
        if (l.key !== key) return l
        if (l.descuentoModo === 'monto') return { ...l, descuento: n }
        const brutoBase = l.cantidad * l.precio_unitario
        return { ...l, descuento: brutoBase > 0 ? round2((brutoBase * n) / 100) : 0 }
      }),
    )
  }

  function agregarItemLibre(descripcion: string, cantidad: number, precio: number, isv: IsvTipo) {
    setLineas(prev => [
      ...prev,
      {
        key: nuevaKey(),
        producto_id: null,
        variante_id: null,
        descripcion,
        cantidad,
        precio_unitario: precio,
        descuento: 0,
        isv,
        precioManual: true,
        descuentoModo: 'monto',
      },
    ])
    setLibreModal(false)
  }

  function seleccionarCliente(cliente: Cliente | null) {
    setClienteId(cliente?.id ?? null)
    const tipo = cliente?.tipo_cliente ?? 'final'
    setLineas(prev =>
      prev.map(l => {
        if (!l.producto_id || l.precioManual) return l
        const producto = productosPorId.get(l.producto_id)
        if (!producto) return l
        const variante = l.variante_id ? variantesActivasDe(producto).find(v => v.id === l.variante_id) ?? null : null
        return { ...l, precio_unitario: precioLineaPos(tipo, producto, variante) }
      }),
    )
    setClienteQuery('')
    setClienteOpen(false)
  }

  function seleccionarCaja(id: string) {
    window.localStorage.setItem(STORAGE_KEY, id)
    setCajaId(id)
    setError('')
  }

  function cambiarCaja() {
    window.localStorage.removeItem(STORAGE_KEY)
    setCajaId(null)
    setError('')
  }

  const caja = cajaId ? (cajas.find(c => c.id === cajaId) ?? null) : null
  const sesion = caja ? (sesionesAbiertas.find(s => s.caja_id === caja.id) ?? null) : null

  function handleAbrirSesion(e: FormEvent) {
    e.preventDefault()
    if (!caja) return

    const monto = Number(montoInicial)
    if (!Number.isFinite(monto) || monto < 0) {
      setError('Ingresa un monto inicial válido.')
      return
    }

    setError('')
    startTransition(async () => {
      const result = await abrirSesion(caja.id, monto)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // abrirSesion ya revalida /admin/pos; refresh trae sesionesAbiertas
      // actualizado a este mismo componente (sin remount).
      router.refresh()
    })
  }

  // Estado neutro: idéntico en SSR y en el primer render del cliente (antes
  // de montar) — evita el mismatch de árbol descrito arriba. Mismo fondo
  // (--bg) que el resto de la pantalla para que no haya parpadeo visible.
  if (!mounted) {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.empty}>Cargando caja…</div>
      </div>
    )
  }

  // Estado 1: selección de caja
  if (!caja) {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Punto de venta</div>
          <div className={styles.panelSubtitle}>Elige la caja con la que vas a trabajar.</div>

          {cajas.length === 0 ? (
            <div className={styles.empty}>No hay cajas configuradas.</div>
          ) : (
            <div className={styles.cajaList}>
              {cajas.map(c => {
                const ocupada = sesionesAbiertas.some(s => s.caja_id === c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.cajaCard}
                    onClick={() => seleccionarCaja(c.id)}
                  >
                    <div>
                      <div className={styles.cajaNombre}>{c.nombre}</div>
                      <div className={styles.cajaMeta}>
                        Punto de emisión {c.punto_emision} · {c.formato_impresion}
                      </div>
                    </div>
                    {ocupada && <span className={styles.cajaBadgeOcupada}>Sesión abierta</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: '1.25rem' }}>
            <Link href="/admin" className={styles.headerBack}>← Volver al admin</Link>
          </div>
        </div>
      </div>
    )
  }

  // Estado 2: apertura de sesión
  if (!sesion) {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Abrir caja: {caja.nombre}</div>
          <div className={styles.panelSubtitle}>
            Ingresa el monto inicial en Lempiras para abrir la sesión.
          </div>

          <form className={styles.form} onSubmit={handleAbrirSesion}>
            <label className={styles.formLabel}>
              Monto inicial (L.)
              <input
                type="number"
                min="0"
                step="0.01"
                value={montoInicial}
                onChange={e => setMontoInicial(e.target.value)}
                autoFocus
                disabled={isPending}
              />
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.formFooter}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={cambiarCaja}
                disabled={isPending}
              >
                Cambiar caja
              </button>
              <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`} disabled={isPending}>
                {isPending ? 'Abriendo...' : 'Abrir sesión'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Estado 3: venta
  const abiertaDesde = new Date(sesion.abierta_at).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Preview de totales EN VIVO con las puras del checkout POS (mismas que usa
  // la Server Action emitirVenta al recalcular) — nunca reimplementar esta
  // matemática aquí.
  const lineasPos = lineas.map(toLineaPos)
  const lineasProrrateadas = prorratearDescuentoGlobal(lineasPos, descuentoGlobal)
  const lineasDesglosadas = lineasProrrateadas.map(l => desglosarLinea(l, exonerado))
  const totales = totalesDocumento(lineasDesglosadas, descuentoGlobal, '')

  const query = busqueda.trim().toLowerCase()
  const productosFiltrados =
    query === ''
      ? productos
      : productos.filter(p => {
          if (p.nombre.toLowerCase().includes(query)) return true
          if (p.sku && p.sku.trim().toLowerCase() === query) return true
          return variantesActivasDe(p).some(v => v.sku && v.sku.trim().toLowerCase() === query)
        })

  const clientesFiltrados =
    clienteQuery.trim() === ''
      ? clientes
      : clientes.filter(c => {
          const q = clienteQuery.trim().toLowerCase()
          return c.nombre.toLowerCase().includes(q) || (c.rtn ?? '').includes(clienteQuery.trim())
        })

  const caiActivo = cais.find(c => c.punto_emision === caja.punto_emision) ?? null
  const estadoCaiActivo = caiActivo ? estadoCai(caiActivo, new Date()) : null

  return (
    <div>
      <header className={styles.header}>
        <Link href="/admin" className={styles.headerBack}>← Admin</Link>
        <span className={styles.headerCaja}>{caja.nombre}</span>
        <span className={styles.headerSesion}>Sesión abierta desde {abiertaDesde}</span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnGhost} disabled title="Disponible en una próxima iteración">
            Espera
          </button>
          <button type="button" className={styles.btnGhost} disabled title="Disponible en una próxima iteración">
            Cerrar caja
          </button>
        </div>
      </header>

      {!caiActivo && (
        <div className={`${styles.caiBanner} ${styles.caiBannerError}`}>
          No hay un CAI activo configurado para el punto de emisión &quot;{caja.punto_emision}&quot;.
        </div>
      )}
      {caiActivo && estadoCaiActivo && !estadoCaiActivo.vigente && (
        <div className={`${styles.caiBanner} ${styles.caiBannerError}`}>{estadoCaiActivo.alerta}</div>
      )}
      {caiActivo && estadoCaiActivo && estadoCaiActivo.vigente && estadoCaiActivo.alerta && (
        <div className={`${styles.caiBanner} ${styles.caiBannerWarn}`}>{estadoCaiActivo.alerta}</div>
      )}

      <div className={styles.ventaGrid}>
        {/* Columna izquierda: catálogo */}
        <section className={styles.catalogo}>
          <input
            ref={searchRef}
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nombre o escanear SKU…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />

          {productosFiltrados.length === 0 ? (
            <div className={styles.empty}>
              {productos.length === 0 ? 'No hay productos disponibles para mostrador.' : 'Sin resultados.'}
            </div>
          ) : (
            <div className={styles.catalogoGrid}>
              {productosFiltrados.map(p => {
                const variantes = toStoreVariantes(p.precio, p.producto_variantes ?? [])
                const stock = stockEfectivo(p.stock, variantes)
                const agotado = estaAgotado(p.stock, variantes)
                const precios = preciosCatalogo(p, tipoCliente)
                const min = Math.min(...precios)
                const varia = min !== Math.max(...precios)
                const imagen = p.imagenes?.[0]

                return (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.prodCard}
                    disabled={agotado}
                    onClick={() => handleProductoClick(p)}
                  >
                    <div className={styles.prodImgWrap}>
                      {imagen ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagen} alt={p.nombre} className={styles.prodImg} />
                      ) : (
                        <div className={styles.prodImgPlaceholder} />
                      )}
                      {agotado && <span className={styles.prodBadgeAgotado}>AGOTADO</span>}
                    </div>
                    <div className={styles.prodNombre}>{p.nombre}</div>
                    <div className={styles.prodPrecio}>{varia ? `Desde ${formatPrice(min)}` : formatPrice(min)}</div>
                    {!agotado && stock != null && (
                      <div className={styles.prodStock}>Stock: {stock}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Columna derecha: carrito */}
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
                      <button type="button" className={styles.qtyBtn} onClick={() => cambiarCantidadDelta(l.key, -1)}>
                        −
                      </button>
                      <input
                        type="number"
                        className={styles.qtyInput}
                        value={l.cantidad}
                        min={1}
                        max={tope ?? undefined}
                        onChange={e => cambiarCantidadInput(l.key, e.target.value)}
                      />
                      <button type="button" className={styles.qtyBtn} onClick={() => cambiarCantidadDelta(l.key, 1)}>
                        +
                      </button>
                    </div>
                    <input
                      type="number"
                      className={styles.lineaPrecio}
                      min={0}
                      step="0.01"
                      value={l.precio_unitario}
                      onChange={e => cambiarPrecio(l.key, e.target.value)}
                    />
                    <div className={styles.lineaDescuentoGroup}>
                      <input
                        type="number"
                        className={styles.lineaDescuento}
                        min={0}
                        step="0.01"
                        value={l.descuentoModo === 'monto' ? l.descuento : pctValue}
                        onChange={e => cambiarDescuento(l.key, e.target.value)}
                      />
                      <select
                        className={styles.descuentoModoSelect}
                        value={l.descuentoModo}
                        onChange={e => cambiarModoDescuento(l.key, e.target.value as DescuentoModo)}
                      >
                        <option value="monto">L.</option>
                        <option value="porcentaje">%</option>
                      </select>
                    </div>
                    <div className={styles.lineaSubtotal}>{formatPrice(subtotal)}</div>
                    <button type="button" className={styles.btnQuitar} onClick={() => quitarLinea(l.key)} aria-label="Quitar línea">
                      ×
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <button type="button" className={styles.btnItemLibre} onClick={() => setLibreModal(true)}>
            + Ítem libre
          </button>

          <div className={styles.descuentoGlobalRow}>
            <label>Descuento global (L.)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={descuentoGlobal}
              onChange={e => setDescuentoGlobal(Math.max(0, Number(e.target.value) || 0))}
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
              onChange={e => setVendedorId(e.target.value || null)}
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
            onClick={() => {
              // TODO (Task 11): abrir modal de cobro con el carrito actual
              // ({ lineas: lineasPos, descuentoGlobal, clienteId, vendedorId }
              // — ver CarritoPos) y los datos del cliente seleccionado;
              // confirma llamando a emitirVenta.
            }}
          >
            Cobrar {formatPrice(totales.total)}
          </button>
        </section>
      </div>

      {varianteModal && (
        <Modal title={`Elige variante — ${varianteModal.nombre}`} onClose={() => setVarianteModal(null)}>
          <div className={styles.varianteList}>
            {variantesActivasDe(varianteModal).map(v => {
              const precio = precioLineaPos(tipoCliente, varianteModal, v)
              const agotada = v.stock === 0
              return (
                <button
                  key={v.id}
                  type="button"
                  className={styles.varianteOption}
                  disabled={agotada}
                  onClick={() => elegirVariante(varianteModal, v)}
                >
                  <span>{v.nombre}</span>
                  <span>{formatPrice(precio)}</span>
                  <span>{agotada ? 'AGOTADO' : v.stock == null ? 'Stock ilimitado' : `Stock: ${v.stock}`}</span>
                </button>
              )
            })}
          </div>
        </Modal>
      )}

      {libreModal && <ItemLibreModal onClose={() => setLibreModal(false)} onSave={agregarItemLibre} />}
    </div>
  )
}

interface ItemLibreModalProps {
  onClose: () => void
  onSave: (descripcion: string, cantidad: number, precio: number, isv: IsvTipo) => void
}

function ItemLibreModal({ onClose, onSave }: ItemLibreModalProps) {
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [isv, setIsv] = useState<IsvTipo>('15')
  const [formError, setFormError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cantidadNum = Number(cantidad)
    const precioNum = Number(precio)
    if (!descripcion.trim()) {
      setFormError('La descripción es requerida.')
      return
    }
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setFormError('La cantidad debe ser mayor a 0.')
      return
    }
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      setFormError('El precio debe ser un número válido.')
      return
    }
    onSave(descripcion.trim(), cantidadNum, precioNum, isv)
  }

  // Reutiliza las clases del formulario de apertura de sesión (pos.module.css)
  // para evitar duplicar estilos casi idénticos.
  return (
    <Modal title="Ítem libre" onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.formLabel}>
          Descripción
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} autoFocus />
        </label>
        <label className={styles.formLabel}>
          Cantidad
          <input type="number" min="1" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </label>
        <label className={styles.formLabel}>
          Precio (L.)
          <input type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} />
        </label>
        <label className={styles.formLabel}>
          ISV
          <select value={isv} onChange={e => setIsv(e.target.value as IsvTipo)}>
            <option value="15">15%</option>
            <option value="18">18%</option>
            <option value="exento">Exento</option>
          </select>
        </label>

        {formError && <div className={styles.formError}>{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`}>Agregar</button>
        </div>
      </form>
    </Modal>
  )
}
