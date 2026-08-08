'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { abrirSesion, guardarEspera, eliminarEspera } from './actions'
import { precioLineaPos } from '@/lib/pos/emision'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { estadoCai } from '@/lib/pos/fiscal'
import { clampDescuentoLinea, clampDescuentoGlobal, type LineaVenta, type DescuentoModo } from '@/lib/pos/carrito'
import { toStoreVariantes, stockEfectivo } from '@/lib/store/variantes'
import { variantesActivasDe, topeStock } from './pos-helpers'
import CatalogoPanel from './components/CatalogoPanel'
import CarritoPanel from './components/CarritoPanel'
import ClienteNuevoModal from './components/ClienteNuevoModal'
import ItemLibreModal from './components/ItemLibreModal'
import LineaEditorModal from './components/LineaEditorModal'
import CobroModal from './components/CobroModal'
import EsperaModal from './components/EsperaModal'
import CierreModal from './components/CierreModal'
import HistorialModal from './components/HistorialModal'
import DocumentoModal from './components/DocumentoModal'
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
  VentaEspera,
  DocumentoParaArqueo,
  Categoria,
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
  categorias: Categoria[]
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
  categorias,
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

  const [libreModal, setLibreModal] = useState(false)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  // Task 7: key de la línea que edita LineaEditorModal (null = cerrado).
  const [lineaEditando, setLineaEditando] = useState<string | null>(null)
  // Task 11: id del documento recién emitido cuando `pos_documento_modal` está
  // activo (null = modal cerrado). El carrito NO se limpia al abrir el modal
  // (ver handleEmitido) — solo al confirmar "Nueva venta" desde el modal.
  const [documentoModalId, setDocumentoModalId] = useState<string | null>(null)

  // Task 10: lista de clientes propia del componente, seedeada con la que
  // llega del server component. Un cliente creado desde el POS (ClienteNuevoModal)
  // se agrega aquí para aparecer de inmediato en el selector, sin esperar a
  // que `clientes` (prop del server component) se refresque.
  const [clientesLocal, setClientesLocal] = useState<Cliente[]>(clientes)
  const [clienteNuevoAbierto, setClienteNuevoAbierto] = useState(false)

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

  const productosPorId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const clienteActual = clienteId ? (clientesLocal.find(c => c.id === clienteId) ?? null) : null
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

  // Task 7: reemplaza la línea completa editada en LineaEditorModal (que ya
  // aplicó sus propios clamps de cantidad/precio/descuento) y reclampa el
  // descuento global — mismo criterio que el resto de mutadores de arriba,
  // ver el comentario de esa nota más arriba.
  function guardarLineaEditada(editada: LineaVenta) {
    const next = lineas.map(l => (l.key === editada.key ? editada : l))
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
    setLineaEditando(null)
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

  // Recalcula precios de línea para el cliente dado (p.ej. tarifa de
  // revendedor) sin tocar líneas con precioManual, y reclampa el descuento
  // global — el nuevo precio puede ser menor al anterior. Se separa de
  // `seleccionarCliente` para que `handleClienteCreado` pueda aplicar el
  // cliente recién insertado sin depender de que `clientesLocal` ya lo
  // contenga en este mismo render (el setState de la lista es asíncrono).
  function aplicarCliente(cliente: Cliente | null) {
    setClienteId(cliente?.id ?? null)
    const tipo = cliente?.tipo_cliente ?? 'final'
    const next = lineas.map(l => {
      if (!l.producto_id || l.precioManual) return l
      const producto = productosPorId.get(l.producto_id)
      if (!producto) return l
      const variante = l.variante_id ? variantesActivasDe(producto).find(v => v.id === l.variante_id) ?? null : null
      return clampDescuentoLinea({ ...l, precio_unitario: precioLineaPos(tipo, producto, variante) })
    })
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
  }

  function seleccionarCliente(id: string | null) {
    const cliente = id ? (clientesLocal.find(c => c.id === id) ?? null) : null
    aplicarCliente(cliente)
  }

  // Task 10: alta de cliente desde el POS — se agrega a la lista local y
  // queda seleccionado de inmediato (dispara el mismo recálculo de precios
  // que seleccionarCliente).
  function handleClienteCreado(cliente: Cliente) {
    setClientesLocal(prev => [...prev, cliente])
    aplicarCliente(cliente)
    setClienteNuevoAbierto(false)
  }

  // Emisión exitosa (llamada por CobroModal). Task 11: si el interruptor
  // `pos_documento_modal` está activo (ausente = activo, ver brief), el
  // documento se abre en un modal SOBRE el POS sin navegar — el carrito se
  // deja intacto hasta que el usuario confirme "Nueva venta" en el modal
  // (handleNuevaVentaDesdeModal). Si está apagado, se conserva el
  // comportamiento anterior: limpiar y navegar de una vez a la página del
  // documento.
  function handleEmitido(documentoId: string) {
    setCobroAbierto(false)
    if (config.pos_documento_modal !== 'false') {
      setDocumentoModalId(documentoId)
      return
    }
    setLineas([])
    setDescuentoGlobal(0)
    setClienteId(null)
    setVendedorId(null)
    router.push(`/admin/pos/documento/${documentoId}?volver=pos`)
  }

  // Fix round 1 (revisión Task 11): al momento de abrir el modal, la venta ya
  // quedó EMITIDA (emitirVenta ya corrió la RPC y descontó stock/correlativo).
  // Las líneas que siguen en el carrito son solo el eco visual de esa venta
  // ya cobrada — dejarlas vivas y permitir volver a tocar "Cobrar" emitiría
  // un SEGUNDO documento fiscal (otro correlativo, doble descuento de stock).
  // Por eso "Cerrar" limpia el carrito exactamente igual que "Nueva venta":
  // la única diferencia entre ambos botones es de intención/copy, no de
  // efecto sobre el carrito.
  function limpiarCarritoCobrado() {
    setLineas([])
    setDescuentoGlobal(0)
    setClienteId(null)
    setVendedorId(null)
  }

  function handleNuevaVentaDesdeModal() {
    limpiarCarritoCobrado()
    setDocumentoModalId(null)
  }

  function handleCerrarDocumentoModal() {
    limpiarCarritoCobrado()
    setDocumentoModalId(null)
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

  // Esperas/sesiones llegan sin filtrar por caja desde page.tsx (ver Props):
  // se filtran aquí, una vez que se conoce `caja.id`.
  const esperasCaja = esperas.filter(e => e.caja_id === caja.id)
  const sesionesCerradasCaja = sesionesCerradas.filter(s => s.caja_id === caja.id)
  const documentosSesionActual = documentosPorSesion[sesion.id] ?? []

  const caiActivo = cais.find(c => c.punto_emision === caja.punto_emision) ?? null
  const estadoCaiActivo = caiActivo ? estadoCai(caiActivo, new Date()) : null

  return (
    <>
      {/* Task 11: `.ventaWrap` se oculta en impresión (`display: none`) para
          que solo el papel del DocumentoModal se imprima. DocumentoModal se
          renderiza FUERA de este contenedor (no dentro), a propósito:
          `.ventaRoot` es `overflow: hidden; height: 100%` y en impresión un
          descendiente `position: static` (el modal neutralizado, ver
          documento.module.css) quedaría igual de truncado que el `fixed`
          original — la misma trampa que ya mordió a `.overlay` en P2.
          Sacándolo de este árbol, cuelga directo de `.overlay`
          (pos.module.css), que ya se neutraliza en print. */}
      <div className={`${styles.ventaRoot} ${styles.ventaWrap}`}>
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
        <CatalogoPanel
          productos={productos}
          categorias={categorias}
          tipoCliente={tipoCliente}
          onAgregar={agregarProducto}
          onError={setAvisoRetomar}
        />

        <CarritoPanel
          lineas={lineas}
          descuentoGlobal={descuentoGlobal}
          clientes={clientesLocal}
          vendedores={vendedores}
          clienteId={clienteId}
          vendedorId={vendedorId}
          productosPorId={productosPorId}
          totales={totales}
          onCantidad={cambiarCantidadDelta}
          onCantidadInput={cambiarCantidadInput}
          onEditarLinea={setLineaEditando}
          onQuitarLinea={quitarLinea}
          onDescuentoGlobal={setDescuentoGlobal}
          onCliente={seleccionarCliente}
          onNuevoCliente={() => setClienteNuevoAbierto(true)}
          onVendedor={setVendedorId}
          onItemLibre={() => setLibreModal(true)}
          onCobrar={() => setCobroAbierto(true)}
        />
      </div>

      {clienteNuevoAbierto && (
        <ClienteNuevoModal
          onCreado={handleClienteCreado}
          onCerrar={() => setClienteNuevoAbierto(false)}
        />
      )}

      {libreModal && <ItemLibreModal onClose={() => setLibreModal(false)} onSave={agregarItemLibre} />}

      {lineaEditando && (() => {
        const linea = lineas.find(l => l.key === lineaEditando)
        if (!linea) return null
        return (
          <LineaEditorModal
            linea={linea}
            stockDisponible={topeStock(linea, productosPorId)}
            onGuardar={guardarLineaEditada}
            onCerrar={() => setLineaEditando(null)}
          />
        )
      })()}

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

      {documentoModalId && (
        <DocumentoModal
          documentoId={documentoModalId}
          formatoDefault={caja.formato_impresion}
          onNuevaVenta={handleNuevaVentaDesdeModal}
          onCerrar={handleCerrarDocumentoModal}
        />
      )}
    </>
  )
}
