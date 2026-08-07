'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { abrirSesion, emitirVenta, guardarEspera, eliminarEspera, cerrarSesion } from './actions'
import Modal from '@/components/admin/Modal'
import { precioLineaPos, validarPagos, cambioPago, validarEmision, esperadoCaja } from '@/lib/pos/emision'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { estadoCai } from '@/lib/pos/fiscal'
import { toStoreVariantes, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'
import type {
  Caja,
  SesionCaja,
  Vendedor,
  MetodoPago,
  MetodoPagoTipo,
  Producto,
  ProductoVariante,
  Cliente,
  CaiAutorizacion,
  ConfigMap,
  LineaPos,
  PagoPos,
  IsvTipo,
  VentaEspera,
  DocumentoParaArqueo,
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
  // Task 12: el page no conoce la caja seleccionada (vive en localStorage,
  // solo se lee en el cliente), así que trae TODAS las esperas/sesiones
  // cerradas y este componente filtra por `caja.id` una vez resuelta.
  esperas: VentaEspera[]
  sesionesCerradas: SesionCaja[]
  documentosPorSesion: Record<string, DocumentoParaArqueo[]>
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

// ---- Ventas en espera (Task 12) ----
// Decisión de payload: `guardarEspera(cajaId, nombre, payload)` recibe
// `payload: unknown` (columna jsonb) — se guardan las líneas de UI COMPLETAS
// (con `precioManual`/`descuentoModo`), no solo `LineaPos`. Es un payload
// interno que solo esta pantalla lee y escribe: al retomar hay que
// reconstruir el carrito exacto (qué precios fueron editados a mano, en qué
// modo se estaba viendo el descuento de cada línea), no solo los datos que
// espera `emitirVenta`. `key` se descarta al guardar (id de React efímero,
// se regenera al retomar) y `version` deja la puerta abierta a migrar el
// formato sin romper esperas ya guardadas.
interface LineaEsperaGuardada extends LineaPos {
  precioManual: boolean
  descuentoModo: DescuentoModo
}

interface EsperaPayload {
  version: 1
  lineas: LineaEsperaGuardada[]
  descuentoGlobal: number
  clienteId: string | null
  vendedorId: string | null
}

function toLineaEsperaGuardada(l: LineaVenta): LineaEsperaGuardada {
  return {
    producto_id: l.producto_id,
    variante_id: l.variante_id,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    descuento: l.descuento,
    isv: l.isv,
    precioManual: l.precioManual,
    descuentoModo: l.descuentoModo,
  }
}

// El payload viaja como `unknown` desde la BD (jsonb sin schema): se valida
// la forma mínima antes de confiar en él (una espera corrupta o de un
// formato futuro no debe tumbar la pantalla).
function parseEsperaPayload(raw: unknown): EsperaPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<EsperaPayload>
  if (!Array.isArray(p.lineas)) return null
  return {
    version: 1,
    lineas: p.lineas as LineaEsperaGuardada[],
    descuentoGlobal: typeof p.descuentoGlobal === 'number' ? p.descuentoGlobal : 0,
    clienteId: typeof p.clienteId === 'string' ? p.clienteId : null,
    vendedorId: typeof p.vendedorId === 'string' ? p.vendedorId : null,
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

function brutoLinea(l: LineaVenta): number {
  return l.cantidad * l.precio_unitario
}

// Nunca deja que el descuento de una línea supere su propio bruto (cantidad
// × precio_unitario) — evita que emitirVenta (que NO relee precio/descuento,
// el override es intencional) reciba un total negativo en un documento
// fiscal cuando cantidad o precio bajan después de haber puesto un descuento.
function clampDescuentoLinea(l: LineaVenta): LineaVenta {
  const bruto = brutoLinea(l)
  return { ...l, descuento: Math.min(Math.max(l.descuento, 0), bruto) }
}

// Bruto disponible para el descuento global: suma de cada línea ya neta de
// su propio descuento (mismo criterio que usa `prorratearDescuentoGlobal`
// para repartirlo). El descuento global nunca puede superar esto.
function brutoTotalLineas(ls: LineaVenta[]): number {
  return round2(ls.reduce((s, l) => s + (brutoLinea(l) - l.descuento), 0))
}

function clampDescuentoGlobal(next: LineaVenta[], descuentoGlobal: number): number {
  return Math.min(Math.max(descuentoGlobal, 0), brutoTotalLineas(next))
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

// tasa 0 (o config faltante/NaN) = no permitir pago en USD; el modal de cobro
// deshabilita el método efectivo_usd en ese caso con un mensaje explícito.
function parseTasaUsd(config: ConfigMap): number {
  const n = Number(config.tasa_cambio_usd)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Límite de identificación de CONSUMIDOR FINAL en factura; default 10000 si
// la config falta o no es un número (mismo default que usa la Server Action).
function parseLimiteConsumidorFinal(config: ConfigMap): number {
  const n = Number(config.pos_limite_consumidor_final)
  return Number.isFinite(n) ? n : 10000
}

export default function PosClient({
  cajas,
  sesionesAbiertas,
  vendedores,
  metodos,
  productos,
  clientes,
  cais,
  config,
  esperas,
  sesionesCerradas,
  documentosPorSesion,
}: Props) {
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
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const nextKeyRef = useRef(0)

  // ---- Espera / cierre de caja (Task 12) ----
  const [esperaAbierta, setEsperaAbierta] = useState(false)
  const [esperaError, setEsperaError] = useState('')
  const [esperaPending, startEsperaTransition] = useTransition()
  const [cierreAbierto, setCierreAbierto] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [avisoRetomar, setAvisoRetomar] = useState('')

  const tasaCambioUsd = parseTasaUsd(config)
  const limiteConsumidorFinal = parseLimiteConsumidorFinal(config)

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

  // Las mutaciones que pueden reducir el bruto disponible (bajar cantidad o
  // precio de una línea, subir su descuento, quitarla, o recalcular precios
  // al cambiar de cliente) reclaman tanto el descuento de esa línea
  // (clampDescuentoLinea) como el descuento global (clampDescuentoGlobal),
  // para que el estado nunca quede con un descuento mayor que el bruto que
  // lo respalda — ver nota del Fix round 1 en task-10-report.md.
  function quitarLinea(key: string) {
    const next = lineas.filter(l => l.key !== key)
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
  }

  function cambiarCantidadDelta(key: string, delta: number) {
    const next = lineas
      .map(l => {
        if (l.key !== key) return l
        if (delta <= 0) return clampDescuentoLinea({ ...l, cantidad: l.cantidad + delta })
        const tope = topeStock(l, productosPorId) ?? Infinity
        return clampDescuentoLinea({ ...l, cantidad: Math.min(l.cantidad + delta, Math.max(tope, l.cantidad)) })
      })
      .filter(l => l.cantidad > 0)
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
  }

  function cambiarCantidadInput(key: string, valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    const next = lineas.map(l => {
      if (l.key !== key) return l
      const tope = topeStock(l, productosPorId) ?? Infinity
      return clampDescuentoLinea({ ...l, cantidad: Math.max(1, Math.min(Math.round(n), tope)) })
    })
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
  }

  function cambiarPrecio(key: string, valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    const next = lineas.map(l =>
      l.key === key ? clampDescuentoLinea({ ...l, precio_unitario: Math.max(0, n), precioManual: true }) : l,
    )
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
  }

  function cambiarModoDescuento(key: string, modo: DescuentoModo) {
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, descuentoModo: modo } : l)))
  }

  function cambiarDescuento(key: string, valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n) || n < 0) return
    const next = lineas.map(l => {
      if (l.key !== key) return l
      const brutoBase = brutoLinea(l)
      if (l.descuentoModo === 'monto') return { ...l, descuento: Math.min(n, brutoBase) }
      const pct = Math.min(n, 100)
      return { ...l, descuento: brutoBase > 0 ? round2((brutoBase * pct) / 100) : 0 }
    })
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
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
    // El nuevo precio (p.ej. revendedor) puede ser menor al anterior: se
    // reclampa el descuento de cada línea recalculada, igual que en
    // cambiarPrecio, para no dejar un descuento mayor que el nuevo bruto.
    const next = lineas.map(l => {
      if (!l.producto_id || l.precioManual) return l
      const producto = productosPorId.get(l.producto_id)
      if (!producto) return l
      const variante = l.variante_id ? variantesActivasDe(producto).find(v => v.id === l.variante_id) ?? null : null
      return clampDescuentoLinea({ ...l, precio_unitario: precioLineaPos(tipo, producto, variante) })
    })
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
    setClienteQuery('')
    setClienteOpen(false)
  }

  // Emisión exitosa (llamada por CobroModal): limpia el carrito completo y
  // navega al documento recién creado. La página del documento es Task 13
  // (aún no existe); el 404 temporal es esperado.
  function handleEmitido(documentoId: string) {
    setLineas([])
    setDescuentoGlobal(0)
    setClienteId(null)
    setVendedorId(null)
    setCobroAbierto(false)
    router.push(`/admin/pos/documento/${documentoId}?volver=pos`)
  }

  // ---- Espera (Task 12) ----

  function handleGuardarEspera(cajaIdActual: string, nombre: string) {
    if (!nombre.trim()) {
      setEsperaError('El nombre es requerido.')
      return
    }
    if (lineas.length === 0) {
      setEsperaError('Agrega productos antes de guardar en espera.')
      return
    }
    setEsperaError('')
    const payload: EsperaPayload = {
      version: 1,
      lineas: lineas.map(toLineaEsperaGuardada),
      descuentoGlobal,
      clienteId,
      vendedorId,
    }
    startEsperaTransition(async () => {
      const result = await guardarEspera(cajaIdActual, nombre.trim(), payload)
      if (!result.ok) {
        setEsperaError(result.error)
        return
      }
      setLineas([])
      setDescuentoGlobal(0)
      setClienteId(null)
      setVendedorId(null)
      setEsperaAbierta(false)
      router.refresh()
    })
  }

  function handleDescartarEspera(id: string) {
    setEsperaError('')
    startEsperaTransition(async () => {
      const result = await eliminarEspera(id)
      if (!result.ok) {
        setEsperaError(result.error)
        return
      }
      router.refresh()
    })
  }

  // Al retomar: revalida cada línea contra el catálogo actual (producto
  // inexistente/inactivo, o variante que ya no está activa → se quita con
  // aviso, tal como pide el brief); si el carrito actual tiene líneas, pide
  // confirmación antes de reemplazarlas. La fila de espera se elimina siempre
  // que se retome (con o sin avisos), igual que si el usuario la descartara.
  function handleRetomarEspera(espera: VentaEspera) {
    if (lineas.length > 0) {
      const confirmado = window.confirm(
        'Ya tienes productos en el carrito actual. Retomar esta venta en espera reemplazará el carrito. ¿Continuar?',
      )
      if (!confirmado) return
    }

    const payload = parseEsperaPayload(espera.payload)
    if (!payload) {
      setEsperaError('Esta venta en espera tiene un formato inválido y no se puede retomar.')
      return
    }

    const avisos: string[] = []
    const lineasRestauradas: LineaVenta[] = []
    for (const l of payload.lineas) {
      if (l.producto_id) {
        const producto = productosPorId.get(l.producto_id)
        if (!producto || !producto.activo) {
          avisos.push(`"${l.descripcion}" ya no está disponible y se quitó de la venta.`)
          continue
        }
        if (l.variante_id && !variantesActivasDe(producto).some(v => v.id === l.variante_id)) {
          avisos.push(`"${l.descripcion}" ya no está disponible y se quitó de la venta.`)
          continue
        }
      }
      lineasRestauradas.push({ ...l, key: nuevaKey() })
    }

    setLineas(lineasRestauradas)
    setDescuentoGlobal(clampDescuentoGlobal(lineasRestauradas, payload.descuentoGlobal))
    setClienteId(payload.clienteId)
    setVendedorId(payload.vendedorId)
    setAvisoRetomar(avisos.length > 0 ? avisos.join(' ') : '')
    setEsperaAbierta(false)
    setEsperaError('')

    // El carrito ya se cargó en el estado de arriba (síncrono): si el delete
    // falla (red/BD), la fila de espera queda viva sin que el usuario se
    // entere — la misma venta podría retomarse doble desde otra caja/pestaña.
    // Se conserva el carrito ya cargado (no tiene sentido descartarlo) y se
    // avisa para que la borre manualmente.
    startEsperaTransition(async () => {
      const result = await eliminarEspera(espera.id)
      if (!result.ok) {
        setAvisoRetomar(prev =>
          [prev, 'La venta se retomó, pero no se pudo quitar de la lista de espera — descártala manualmente.']
            .filter(Boolean)
            .join(' '),
        )
        return
      }
      router.refresh()
    })
  }

  // ---- Cierre de caja (Task 12) ----

  function handleCierreCerrado() {
    setLineas([])
    setDescuentoGlobal(0)
    setClienteId(null)
    setVendedorId(null)
    setAvisoRetomar('')
    setCierreAbierto(false)
    router.refresh()
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
  const brutoTotalActual = brutoTotalLineas(lineas)

  // Esperas/sesiones llegan sin filtrar por caja desde page.tsx (ver Props):
  // se filtran aquí, una vez que se conoce `caja.id`.
  const esperasCaja = esperas.filter(e => e.caja_id === caja.id)
  const sesionesCerradasCaja = sesionesCerradas.filter(s => s.caja_id === caja.id)
  const documentosSesionActual = documentosPorSesion[sesion.id] ?? []

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
          <button type="button" className={styles.btnGhost} onClick={() => setHistorialAbierto(true)}>
            Sesiones
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => setEsperaAbierta(true)}>
            Espera{esperasCaja.length > 0 ? ` (${esperasCaja.length})` : ''}
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => setCierreAbierto(true)}>
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
      {avisoRetomar && (
        <div className={`${styles.caiBanner} ${styles.caiBannerWarn} ${styles.avisoBanner}`}>
          <span>{avisoRetomar}</span>
          <button
            type="button"
            className={styles.avisoCerrar}
            onClick={() => setAvisoRetomar('')}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
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
              max={brutoTotalActual}
              step="0.01"
              value={descuentoGlobal}
              onChange={e => setDescuentoGlobal(Math.min(Math.max(0, Number(e.target.value) || 0), brutoTotalActual))}
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
            onClick={() => setCobroAbierto(true)}
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

      {cobroAbierto && (
        <CobroModal
          total={totales.total}
          lineas={lineasPos}
          descuentoGlobal={descuentoGlobal}
          cajaId={caja.id}
          vendedorId={vendedorId}
          clienteActual={clienteActual}
          metodos={metodos}
          tasaCambioUsd={tasaCambioUsd}
          limite={limiteConsumidorFinal}
          onClose={() => setCobroAbierto(false)}
          onEmitido={handleEmitido}
        />
      )}

      {esperaAbierta && (
        <EsperaModal
          esperas={esperasCaja}
          carritoVacio={lineas.length === 0}
          isPending={esperaPending}
          error={esperaError}
          onGuardar={nombre => handleGuardarEspera(caja.id, nombre)}
          onRetomar={handleRetomarEspera}
          onDescartar={handleDescartarEspera}
          onClose={() => {
            setEsperaAbierta(false)
            setEsperaError('')
          }}
        />
      )}

      {cierreAbierto && (
        <CierreModal
          sesion={sesion}
          documentos={documentosSesionActual}
          cartLineasPendientes={lineas.length}
          onClose={() => setCierreAbierto(false)}
          onCerrado={handleCierreCerrado}
        />
      )}

      {historialAbierto && (
        <HistorialModal sesiones={sesionesCerradasCaja} onClose={() => setHistorialAbierto(false)} />
      )}
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

// ---- Modal de cobro (Task 11) ----

// Línea de UI de un pago: `monto` es el string editado a mano para métodos
// que no son efectivo_usd; `montoUsd` es el string editado a mano SOLO para
// efectivo_usd (el monto en L. se deriva multiplicando por la tasa, nunca se
// edita directo). `referencia` solo se envía si el método es tarjeta o
// transferencia (el resto la ignora, pero se limpia igual al cambiar de
// método para no arrastrar datos de otro tipo de pago).
interface PagoRow {
  key: string
  metodoId: string
  tipo: MetodoPagoTipo
  monto: string
  montoUsd: string
  referencia: string
}

interface CobroModalProps {
  total: number
  lineas: LineaPos[]
  descuentoGlobal: number
  cajaId: string
  vendedorId: string | null
  clienteActual: Cliente | null
  metodos: MetodoPago[]
  tasaCambioUsd: number
  limite: number
  onClose: () => void
  onEmitido: (documentoId: string) => void
}

function CobroModal({
  total,
  lineas,
  descuentoGlobal,
  cajaId,
  vendedorId,
  clienteActual,
  metodos,
  tasaCambioUsd,
  limite,
  onClose,
  onEmitido,
}: CobroModalProps) {
  const [tipo, setTipo] = useState<'factura' | 'comprobante'>('factura')
  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [identNombre, setIdentNombre] = useState('')
  const [identIdentidad, setIdentIdentidad] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const nextPagoKeyRef = useRef(0)

  function nuevaPagoKey(): string {
    nextPagoKeyRef.current += 1
    return `p${nextPagoKeyRef.current}`
  }

  // Primer método sin usar efectivo_usd sin tasa configurada, para preseleccionar
  // al agregar una fila nueva.
  const metodoDisponible = metodos.find(m => !(m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0)) ?? null

  function agregarPago() {
    if (!metodoDisponible) return
    setPagos(prev => [
      ...prev,
      { key: nuevaPagoKey(), metodoId: metodoDisponible.id, tipo: metodoDisponible.tipo, monto: '', montoUsd: '', referencia: '' },
    ])
  }

  function cambiarMetodoPago(key: string, metodoId: string) {
    const m = metodos.find(x => x.id === metodoId)
    if (!m) return
    // Los campos monto/montoUsd/referencia dependen del tipo de método: se
    // limpian al cambiar para no arrastrar un valor con el sentido equivocado
    // (p.ej. un monto en USD quedando como si fuera Lempiras).
    setPagos(prev => prev.map(p => (p.key === key ? { key, metodoId: m.id, tipo: m.tipo, monto: '', montoUsd: '', referencia: '' } : p)))
  }

  function cambiarMontoPago(key: string, valor: string) {
    setPagos(prev => prev.map(p => (p.key === key ? { ...p, monto: valor } : p)))
  }

  function cambiarMontoUsdPago(key: string, valor: string) {
    setPagos(prev => prev.map(p => (p.key === key ? { ...p, montoUsd: valor } : p)))
  }

  function cambiarReferenciaPago(key: string, valor: string) {
    setPagos(prev => prev.map(p => (p.key === key ? { ...p, referencia: valor } : p)))
  }

  function quitarPago(key: string) {
    setPagos(prev => prev.filter(p => p.key !== key))
  }

  function montoLps(p: PagoRow): number {
    if (p.tipo === 'efectivo_usd') {
      const usd = Number(p.montoUsd)
      return Number.isFinite(usd) ? round2(usd * tasaCambioUsd) : 0
    }
    const n = Number(p.monto)
    return Number.isFinite(n) ? n : 0
  }

  const pagosPos: PagoPos[] = pagos.map(p => ({
    metodo_id: p.metodoId,
    tipo: p.tipo,
    monto: montoLps(p),
    monto_usd: p.tipo === 'efectivo_usd' ? (Number.isFinite(Number(p.montoUsd)) ? Number(p.montoUsd) : 0) : null,
    tasa: p.tipo === 'efectivo_usd' ? tasaCambioUsd : null,
    referencia: p.referencia.trim() || null,
  }))

  const sumaPagos = round2(pagosPos.reduce((s, p) => s + p.monto, 0))
  const restante = Math.max(0, round2(total - sumaPagos))
  const cambio = cambioPago(pagosPos, total)

  // Art. 11: cualquier factura que supere el límite exige RTN o identidad,
  // sin importar el nombre — aplica igual a CONSUMIDOR FINAL (clienteActual
  // null) que a un cliente ya registrado sin esos datos capturados.
  const necesitaIdentificacion =
    tipo === 'factura' && total > limite && !clienteActual?.rtn && !clienteActual?.identidad

  function clientePayload() {
    if (clienteActual) {
      return {
        id: clienteActual.id,
        nombre: clienteActual.nombre,
        rtn: clienteActual.rtn,
        identidad: necesitaIdentificacion ? (identIdentidad.trim() || null) : clienteActual.identidad,
        exonerado: clienteActual.exonerado,
        ordenCompraExenta: null,
        constanciaExonerado: clienteActual.constancia_exonerado,
        registroSag: clienteActual.registro_sag,
      }
    }
    if (necesitaIdentificacion) {
      return {
        id: null,
        nombre: identNombre.trim(),
        rtn: null,
        identidad: identIdentidad.trim(),
        exonerado: false,
        ordenCompraExenta: null,
        constanciaExonerado: null,
        registroSag: null,
      }
    }
    return {
      id: null,
      nombre: 'CONSUMIDOR FINAL',
      rtn: null,
      identidad: null,
      exonerado: false,
      ordenCompraExenta: null,
      constanciaExonerado: null,
      registroSag: null,
    }
  }

  function handleEmitir() {
    setError('')

    if (necesitaIdentificacion && ((!clienteActual && !identNombre.trim()) || !identIdentidad.trim())) {
      setError(clienteActual ? 'Completa la identidad del cliente.' : 'Completa el nombre y la identidad del cliente.')
      return
    }

    const cliente = clientePayload()

    // Duplicado client-side de las mismas puras que usa emitirVenta, solo
    // para UX temprana (mensaje inmediato sin round-trip); el server vuelve a
    // validar todo con los datos releídos de BD.
    const errorEmision = validarEmision({
      tipo,
      clienteNombre: cliente.nombre,
      clienteRtn: cliente.rtn,
      clienteIdentidad: cliente.identidad,
      total,
      limite,
    })
    if (errorEmision) {
      setError(errorEmision)
      return
    }

    const errorPagos = validarPagos(pagosPos, total)
    if (errorPagos) {
      setError(errorPagos)
      return
    }

    startTransition(async () => {
      const result = await emitirVenta({
        tipo,
        cajaId,
        vendedorId,
        cliente,
        lineas,
        descuentoGlobal,
        pagos: pagosPos,
        notas: null,
      })
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo completar la operación. Intenta de nuevo.' : result.error)
        return
      }
      onEmitido(result.data.documentoId)
    })
  }

  return (
    <Modal title="Cobrar" onClose={onClose} maxWidth="640px">
      <div className={styles.cobroModal}>
        <div className={styles.tipoDocRow}>
          <button
            type="button"
            className={`${styles.tipoDocBtn} ${tipo === 'factura' ? styles.tipoDocBtnActive : ''}`}
            onClick={() => setTipo('factura')}
            disabled={isPending}
          >
            Factura
          </button>
          <button
            type="button"
            className={`${styles.tipoDocBtn} ${tipo === 'comprobante' ? styles.tipoDocBtnActive : ''}`}
            onClick={() => setTipo('comprobante')}
            disabled={isPending}
          >
            Comprobante
          </button>
        </div>

        {necesitaIdentificacion && (
          <div className={styles.identBlock}>
            <div className={styles.identNota}>
              El total supera {formatPrice(limite)}: identifica al cliente para emitir la factura.
            </div>
            {!clienteActual && (
              <label className={styles.formLabel}>
                Nombre completo
                <input type="text" value={identNombre} onChange={e => setIdentNombre(e.target.value)} disabled={isPending} />
              </label>
            )}
            <label className={styles.formLabel}>
              Identidad
              <input type="text" value={identIdentidad} onChange={e => setIdentIdentidad(e.target.value)} disabled={isPending} />
            </label>
          </div>
        )}

        <div className={styles.pagosSection}>
          <div className={styles.pagosHeader}>
            <span>Pagos</span>
            <button type="button" className={styles.btnItemLibre} onClick={agregarPago} disabled={isPending || !metodoDisponible}>
              + Agregar pago
            </button>
          </div>

          {metodos.length === 0 ? (
            <div className={styles.empty}>No hay métodos de pago activos configurados.</div>
          ) : pagos.length === 0 ? (
            <div className={styles.empty}>Agrega al menos un método de pago.</div>
          ) : (
            <div className={styles.pagosList}>
              {pagos.map(p => (
                <div key={p.key} className={styles.pagoRow}>
                  <select value={p.metodoId} onChange={e => cambiarMetodoPago(p.key, e.target.value)} disabled={isPending}>
                    {metodos.map(m => (
                      <option key={m.id} value={m.id} disabled={m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0}>
                        {m.nombre}
                        {m.tipo === 'efectivo_usd' && tasaCambioUsd <= 0 ? ' (sin tasa configurada)' : ''}
                      </option>
                    ))}
                  </select>

                  {p.tipo === 'efectivo_usd' ? (
                    <div className={styles.pagoUsdGroup}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="USD"
                        value={p.montoUsd}
                        onChange={e => cambiarMontoUsdPago(p.key, e.target.value)}
                        disabled={isPending}
                      />
                      <span className={styles.pagoUsdConversion}>≈ {formatPrice(montoLps(p))}</span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Monto (L.)"
                      value={p.monto}
                      onChange={e => cambiarMontoPago(p.key, e.target.value)}
                      disabled={isPending}
                    />
                  )}

                  {(p.tipo === 'tarjeta' || p.tipo === 'transferencia') && (
                    <input
                      type="text"
                      placeholder="Referencia (opcional)"
                      value={p.referencia}
                      onChange={e => cambiarReferenciaPago(p.key, e.target.value)}
                      disabled={isPending}
                    />
                  )}

                  <button
                    type="button"
                    className={styles.btnQuitar}
                    onClick={() => quitarPago(p.key)}
                    aria-label="Quitar pago"
                    disabled={isPending}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.cobroResumen}>
          <div className={styles.totalesRow}><span>Total</span><span>{formatPrice(total)}</span></div>
          <div className={styles.totalesRow}><span>Pagado</span><span>{formatPrice(sumaPagos)}</span></div>
          {restante > 0 && (
            <div className={styles.totalesRow}><span>Restante</span><span>{formatPrice(restante)}</span></div>
          )}
          {cambio > 0 && (
            <div className={styles.totalesRowTotal}><span>Cambio</span><span>{formatPrice(cambio)}</span></div>
          )}
        </div>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={isPending}>
            Cancelar
          </button>
          <button type="button" className={`btnMerlinPrimary ${styles.btnSubmit}`} onClick={handleEmitir} disabled={isPending}>
            {isPending ? 'Emitiendo...' : 'Emitir'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---- Modal de espera (Task 12) ----

interface EsperaModalProps {
  esperas: VentaEspera[]
  carritoVacio: boolean
  isPending: boolean
  error: string
  onGuardar: (nombre: string) => void
  onRetomar: (espera: VentaEspera) => void
  onDescartar: (id: string) => void
  onClose: () => void
}

function EsperaModal({ esperas, carritoVacio, isPending, error, onGuardar, onRetomar, onDescartar, onClose }: EsperaModalProps) {
  const [nombre, setNombre] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // No se limpia `nombre` aquí: si `onGuardar` falla, el modal permanece
    // abierto (el padre solo actualiza `error`) y el usuario no debería tener
    // que re-escribirlo. Si tiene éxito, el padre cierra este modal
    // (`esperaAbierta` pasa a `false`), lo desmonta, y el estado local se
    // descarta solo — no hace falta limpiarlo a mano.
    onGuardar(nombre)
  }

  return (
    <Modal title="Ventas en espera" onClose={onClose}>
      <div className={styles.esperaModal}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.formLabel}>
            Guardar carrito actual en espera
            <input
              type="text"
              placeholder="Nombre del cliente o referencia"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              disabled={isPending || carritoVacio}
              autoFocus={!carritoVacio}
            />
          </label>
          {carritoVacio && (
            <div className={styles.empty}>Agrega productos al carrito para poder guardarlo en espera.</div>
          )}
          {error && <div className={styles.formError}>{error}</div>}
          <div className={styles.formFooter}>
            <button
              type="submit"
              className={`btnMerlinPrimary ${styles.btnSubmit}`}
              disabled={isPending || carritoVacio || !nombre.trim()}
            >
              {isPending ? 'Guardando...' : 'Guardar en espera'}
            </button>
          </div>
        </form>

        <div>
          <div className={styles.esperaListTitle}>Esperas de esta caja</div>
          {esperas.length === 0 ? (
            <div className={styles.empty}>No hay ventas en espera.</div>
          ) : (
            <div className={styles.esperaList}>
              {esperas.map(e => (
                <div key={e.id} className={styles.esperaRow}>
                  <div>
                    <div className={styles.esperaNombre}>{e.nombre}</div>
                    <div className={styles.esperaFecha}>
                      {new Date(e.created_at).toLocaleString('es-HN', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className={styles.esperaAcciones}>
                    <button type="button" className={styles.btnCancel} onClick={() => onRetomar(e)} disabled={isPending}>
                      Retomar
                    </button>
                    <button
                      type="button"
                      className={styles.btnQuitar}
                      onClick={() => onDescartar(e.id)}
                      disabled={isPending}
                      aria-label="Descartar espera"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ---- Modal de cierre de caja con arqueo (Task 12) ----

const NOMBRES_METODO: Record<MetodoPagoTipo, string> = {
  efectivo_lps: 'Efectivo L.',
  efectivo_usd: 'Efectivo USD',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
}

interface CierreModalProps {
  sesion: SesionCaja
  documentos: DocumentoParaArqueo[]
  cartLineasPendientes: number
  onClose: () => void
  onCerrado: () => void
}

function CierreModal({ sesion, documentos, cartLineasPendientes, onClose, onCerrado }: CierreModalProps) {
  const [montoContado, setMontoContado] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Resumen previo (no persiste nada): la misma pura que usa `cerrarSesion`
  // en el server para el cálculo definitivo al confirmar.
  const { efectivoEsperado, porMetodo } = esperadoCaja(Number(sesion.monto_inicial), documentos)
  const contadoNum = Number(montoContado)
  const contadoValido = montoContado.trim() !== '' && Number.isFinite(contadoNum) && contadoNum >= 0
  const diferencia = contadoValido ? round2(contadoNum - efectivoEsperado) : null

  function handleCerrar() {
    setError('')
    if (!contadoValido) {
      setError('Ingresa el monto contado en efectivo.')
      return
    }
    startTransition(async () => {
      const result = await cerrarSesion(sesion.id, contadoNum, notas.trim())
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCerrado()
    })
  }

  return (
    <Modal title="Cerrar caja" onClose={onClose}>
      <div className={styles.cierreModal}>
        {cartLineasPendientes > 0 && (
          <div className={styles.identBlock}>
            <div className={styles.identNota}>
              Tienes {cartLineasPendientes} línea(s) sin cobrar en el carrito actual; se perderán al cerrar la caja
              si no las guardas en espera antes.
            </div>
          </div>
        )}

        <div className={styles.totalesPanel}>
          {(Object.keys(porMetodo) as MetodoPagoTipo[])
            .filter(tipo => porMetodo[tipo] > 0)
            .map(tipo => (
              <div key={tipo} className={styles.totalesRow}>
                <span>{NOMBRES_METODO[tipo]}</span>
                <span>{formatPrice(porMetodo[tipo])}</span>
              </div>
            ))}
          <div className={styles.totalesRowTotal}>
            <span>Efectivo esperado</span>
            <span>{formatPrice(efectivoEsperado)}</span>
          </div>
        </div>

        <label className={styles.formLabel}>
          Monto contado en efectivo (L.)
          <input
            type="number"
            min="0"
            step="0.01"
            value={montoContado}
            onChange={e => setMontoContado(e.target.value)}
            autoFocus
            disabled={isPending}
          />
        </label>

        {diferencia !== null && (
          <div
            className={styles.diferenciaRow}
            style={{ color: diferencia < 0 ? 'var(--danger)' : 'var(--success)' }}
          >
            <span>{diferencia === 0 ? 'Cuadra exacto' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
            <span>{formatPrice(Math.abs(diferencia))}</span>
          </div>
        )}

        <label className={styles.formLabel}>
          Notas (opcional)
          <textarea
            className={styles.notasInput}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            disabled={isPending}
            rows={2}
          />
        </label>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={isPending}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btnMerlinPrimary ${styles.btnSubmit}`}
            onClick={handleCerrar}
            disabled={isPending}
          >
            {isPending ? 'Cerrando...' : 'Cerrar caja'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---- Modal de historial de sesiones (Task 12) ----

interface HistorialModalProps {
  sesiones: SesionCaja[]
  onClose: () => void
}

function HistorialModal({ sesiones, onClose }: HistorialModalProps) {
  return (
    <Modal title="Sesiones de esta caja" onClose={onClose} maxWidth="640px">
      {sesiones.length === 0 ? (
        <div className={styles.empty}>Aún no hay sesiones cerradas para esta caja.</div>
      ) : (
        <div className={styles.historialList}>
          {sesiones.map(s => {
            const fecha = new Date(s.cerrada_at ?? s.abierta_at).toLocaleString('es-HN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
            const diferencia = s.diferencia ?? 0
            return (
              <div key={s.id} className={styles.historialRow}>
                <div className={styles.historialFecha}>{fecha}</div>
                <div className={styles.historialCol}>
                  <span>Inicial</span>
                  <span>{formatPrice(s.monto_inicial)}</span>
                </div>
                <div className={styles.historialCol}>
                  <span>Esperado</span>
                  <span>{formatPrice(s.monto_esperado ?? 0)}</span>
                </div>
                <div className={styles.historialCol}>
                  <span>Contado</span>
                  <span>{formatPrice(s.monto_contado ?? 0)}</span>
                </div>
                <div
                  className={styles.historialCol}
                  style={{ color: diferencia < 0 ? 'var(--danger)' : diferencia > 0 ? 'var(--success)' : undefined }}
                >
                  <span>Diferencia</span>
                  <span>{formatPrice(diferencia)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
