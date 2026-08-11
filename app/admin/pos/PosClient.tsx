'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { abrirSesion, guardarEspera, actualizarEspera, eliminarEspera } from './actions'
import { marcarCotizacionFacturada, type CotizacionPrefillPos } from '@/app/admin/cotizaciones/actions'
import { precioLineaPos } from '@/lib/pos/emision'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { estadoCai } from '@/lib/pos/fiscal'
import {
  clampDescuentoLinea, clampDescuentoGlobal, siguienteNombrePestana, accionPersistencia,
  type LineaVenta, type DescuentoModo, type PestanaVenta,
} from '@/lib/pos/carrito'
import { toStoreVariantes, stockEfectivo } from '@/lib/store/variantes'
import { variantesActivasDe, topeStock, parseMoneyInput } from './pos-helpers'
import CatalogoPanel from './components/CatalogoPanel'
import CarritoPanel from './components/CarritoPanel'
import PestanasBar from './components/PestanasBar'
import ClienteNuevoModal from './components/ClienteNuevoModal'
import ItemLibreModal from './components/ItemLibreModal'
import LineaEditorModal from './components/LineaEditorModal'
import CobroModal from './components/CobroModal'
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
  DescuentoPreset,
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
  // Task 8 (POS P3): prefill al abrir /admin/pos?cotizacion=<id>. Opcional —
  // el flujo normal del POS (sin query) lo recibe como null y lo ignora.
  cotizacionPrefill?: CotizacionPrefillPos | null
  // R2b Task 5: presets activos de descuento (chips de LineaEditorModal y,
  // Task 6, del descuento global en el pie del carrito). Se resuelven una
  // sola vez en el server component; ninguna pantalla del POS los edita.
  descuentos: DescuentoPreset[]
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

// Revalida las líneas de una pestaña (al hidratarla desde `ventas_espera` o
// al cargarla en el editor al cambiar de pestaña/cerrar otra) contra el
// catálogo VIGENTE: si el producto ya no existe, está inactivo, o la
// variante ya no está activa, la línea se quita y se agrega un aviso — mismo
// criterio que ya aplicaba el antiguo "Retomar" de EsperaModal, generalizado
// para que corra en cualquier punto donde una pestaña pasa a ser la que se
// edita. Función module-level (no closure sobre estado del componente) para
// no arrastrar problemas de dependencias inestables en los efectos que la
// usan — recibe `productosPorId` y el generador de `key` como parámetros.
function revalidarLineasCatalogo(
  entrada: ReadonlyArray<LineaPos & { precioManual: boolean; descuentoModo: DescuentoModo }>,
  nombreOrigen: string,
  productosPorId: Map<string, Producto>,
  nuevaKey: () => string,
): { lineas: LineaVenta[]; avisos: string[] } {
  const avisos: string[] = []
  const lineas: LineaVenta[] = []
  for (const l of entrada) {
    if (l.producto_id) {
      const producto = productosPorId.get(l.producto_id)
      const varianteOk = !l.variante_id || (producto ? variantesActivasDe(producto).some(v => v.id === l.variante_id) : false)
      if (!producto || !producto.activo || !varianteOk) {
        avisos.push(`"${l.descripcion}" ya no está disponible y se quitó de "${nombreOrigen}".`)
        continue
      }
    }
    lineas.push({ ...l, key: nuevaKey() })
  }
  return { lineas, avisos }
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
  cotizacionPrefill,
  descuentos,
}: Props) {
  const router = useRouter()
  const [cajaId, setCajaId] = useState<string | null>(() => leerCajaGuardada(cajas))
  const [montoInicial, setMontoInicial] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Se calculan aquí (antes que el resto de estado/efectos) porque el efecto
  // de hidratación de pestañas más abajo los necesita disponibles en su
  // cuerpo — son solo derivaciones de props + `cajaId`, no hooks, así que
  // adelantarlos no cambia el orden de hooks de React.
  const caja = cajaId ? (cajas.find(c => c.id === cajaId) ?? null) : null
  const sesion = caja ? (sesionesAbiertas.find(s => s.caja_id === caja.id) ?? null) : null

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

  // Task 10 (Fix final review): clientes creados desde el POS (ClienteNuevoModal)
  // que aún no llegaron en `clientes` (prop del server component). No se
  // espeja `clientes` en un useState — eso congelaba la lista al montar y un
  // cliente creado/corregido desde otra pantalla no aparecía hasta recargar
  // toda la página. `clientesLocal` combina la prop fresca (que gana siempre
  // que ya trae el registro) con los creados localmente que todavía no están
  // en ella, para que el recién creado no desaparezca antes de que
  // `router.refresh()` la traiga del servidor.
  const [clientesCreados, setClientesCreados] = useState<Cliente[]>([])
  const clientesLocal = useMemo(() => {
    const ids = new Set(clientes.map(c => c.id))
    return [...clientes, ...clientesCreados.filter(c => !ids.has(c.id))]
  }, [clientes, clientesCreados])
  const [clienteNuevoAbierto, setClienteNuevoAbierto] = useState(false)

  const nextKeyRef = useRef(0)
  const nextPestanaKeyRef = useRef(0)

  // Task 8 (POS P3): mapa `pestanaId → cotizacionId` para recordar de qué
  // cotización proviene cada pestaña sin tocar el tipo compartido
  // `PestanaVenta` (lib/pos/carrito). Se consulta al emitir (handleEmitido)
  // para ligar el documento a su cotización. `prefillProcesadoRef` es el guard
  // que asegura que el prefill se procese una sola vez (efecto abajo).
  const cotizacionPorPestanaRef = useRef<Record<string, string>>({})
  const prefillProcesadoRef = useRef(false)

  // ---- Pestañas de ventas en curso (reemplaza el modal de espera de Task 12) ----
  // `lineas`/`descuentoGlobal`/`clienteId`/`vendedorId` (arriba) SIGUEN siendo
  // la única fuente de verdad de la pestaña ACTIVA mientras se edita —
  // `pestanas` guarda el resto (inactivas) más metadatos (nombre, esperaId)
  // de TODAS, incluida la activa, pero su entrada para la activa solo se
  // sincroniza en los puntos de cambio (ver datosPestana/seleccionarPestana
  // más abajo), nunca en cada tecleo. Así se evita una segunda fuente de
  // verdad para el contenido de la venta que se está editando.
  const [pestanas, setPestanas] = useState<PestanaVenta[]>([])
  const [pestanaActivaId, setPestanaActivaId] = useState<string | null>(null)
  // Caja para la que ya se hidrataron `pestanas` desde `esperas` — evita
  // reconstruirlas en cada render y permite reinicializar solo cuando el
  // cajero cambia de caja (ver el efecto de hidratación más abajo).
  const [pestanasCajaId, setPestanasCajaId] = useState<string | null>(null)
  const [, startEsperaTransition] = useTransition()

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

  function nuevaPestanaId(): string {
    nextPestanaKeyRef.current += 1
    return `t${nextPestanaKeyRef.current}`
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
    setClientesCreados(prev => [...prev, cliente])
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
    // Task 8 (POS P3): si la pestaña activa proviene de una cotización, ligar
    // el documento recién emitido a esa cotización (la mueve a `ganada`). Corre
    // en segundo plano (startEsperaTransition, sin bloquear la UI de venta); la
    // acción es idempotente. Se hace ANTES de finalizarPestanaEmitida (que
    // resetea la pestaña). El documento YA se emitió: si el ligado falla (red),
    // NO se puede volver a facturar la cotización (emitiría un segundo documento
    // fiscal) — por eso la entrada del ref se limpia solo si el ligado tuvo
    // éxito, y el fallo se surfacéa por el banner con una instrucción explícita.
    if (pestanaActivaId) {
      const pestId = pestanaActivaId
      const cotizacionId = cotizacionPorPestanaRef.current[pestId]
      if (cotizacionId) {
        startEsperaTransition(async () => {
          const res = await marcarCotizacionFacturada(cotizacionId, documentoId)
          if (res.ok) {
            delete cotizacionPorPestanaRef.current[pestId]
          } else {
            setAvisoRetomar(prev => [prev, 'El documento se emitió, pero no se pudo ligar la cotización. NO vuelvas a facturarla (evita un documento duplicado); actualiza el tablero de cotizaciones.'].filter(Boolean).join(' '))
          }
        })
      }
    }
    finalizarPestanaEmitida()
    if (config.pos_documento_modal !== 'false') {
      setDocumentoModalId(documentoId)
      return
    }
    limpiarCarritoCobrado()
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

  // ---- Pestañas de ventas en curso ----

  // Hidrata `pestanas` desde las esperas de ESTA caja la primera vez que se
  // conoce (y de nuevo si el cajero cambia de caja, ver `pestanasCajaId` en
  // la declaración de estado): cada espera se abre como una pestaña, ninguna
  // se pierde. Si la caja no tiene esperas, arranca con una pestaña vacía —
  // siempre hay exactamente una pestaña activa, nunca cero. Orden ascendente
  // por fecha de creación (la prop llega en orden descendente desde
  // page.tsx) para que la pestaña más antigua quede primera, como al abrir
  // pestañas de navegador en el orden en que se crearon.
  useEffect(() => {
    if (!caja || pestanasCajaId === caja.id) return

    const esperasCaja = esperas
      .filter(e => e.caja_id === caja.id)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))

    const avisos: string[] = []
    const construidas: PestanaVenta[] = []
    for (const espera of esperasCaja) {
      const payload = parseEsperaPayload(espera.payload)
      if (!payload) {
        avisos.push(`"${espera.nombre}" tiene un formato inválido y no se pudo abrir como pestaña.`)
        continue
      }
      const { lineas: lineasValidas, avisos: avisosLinea } =
        revalidarLineasCatalogo(payload.lineas, espera.nombre, productosPorId, nuevaKey)
      avisos.push(...avisosLinea)
      construidas.push({
        id: nuevaPestanaId(),
        esperaId: espera.id,
        nombre: espera.nombre,
        lineas: lineasValidas,
        descuentoGlobal: clampDescuentoGlobal(lineasValidas, payload.descuentoGlobal),
        clienteId: payload.clienteId,
        vendedorId: payload.vendedorId,
      })
    }

    if (construidas.length === 0) {
      construidas.push({
        id: nuevaPestanaId(), esperaId: null, nombre: siguienteNombrePestana([]),
        lineas: [], descuentoGlobal: 0, clienteId: null, vendedorId: null,
      })
    }

    const activa = construidas[0]
    // Hidratación deliberada de estado derivado de props (esperas/productos)
    // una sola vez por caja (guardada por `pestanasCajaId`, ver el guard de
    // arriba) — no es el caso "sincronizar con un sistema externo en cada
    // cambio" que el lint intenta prevenir, mismo criterio que el guard de
    // `mounted` más arriba.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPestanas(construidas)
    setPestanaActivaId(activa.id)
    setLineas(activa.lineas)
    setDescuentoGlobal(activa.descuentoGlobal)
    setClienteId(activa.clienteId)
    setVendedorId(activa.vendedorId)
    if (avisos.length > 0) setAvisoRetomar(avisos.join(' '))
    setPestanasCajaId(caja.id)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [caja, pestanasCajaId, esperas, productosPorId])

  // Task 8 (POS P3): precarga desde una cotización (/admin/pos?cotizacion=<id>).
  // Corre UNA sola vez (guard `prefillProcesadoRef`), solo en cliente y solo
  // cuando ya estamos en la vista de venta con las pestañas hidratadas
  // (`caja`, `sesion` y `pestanasCajaId === caja.id`) — así la pestaña de la
  // cotización se abre ENCIMA de las que ya venían, sin perder ninguna. Si la
  // cotización ya fue facturada, no se precarga: solo se avisa. Tras procesar,
  // se limpia el query param con `router.replace` para que un refresh no vuelva
  // a reprocesar la misma cotización.
  useEffect(() => {
    if (prefillProcesadoRef.current) return
    if (!cotizacionPrefill) return
    if (!caja || !sesion || pestanasCajaId !== caja.id) return

    prefillProcesadoRef.current = true

    if (cotizacionPrefill.yaFacturada) {
      // Precarga guardada por `prefillProcesadoRef` (corre una sola vez), no es
      // el caso de "sincronizar con un sistema externo" que el lint previene —
      // mismo criterio que el efecto de hidratación de pestañas.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAvisoRetomar('Esta cotización ya fue facturada.')
      router.replace('/admin/pos')
      return
    }

    // Las cotizaciones no guardan modo de descuento por línea: se asume 'monto'
    // (el editor de cotizaciones trabaja en monto), luego se revalida contra el
    // catálogo vigente igual que una espera retomada.
    const { lineas: lineasValidas, avisos } = revalidarLineasCatalogo(
      cotizacionPrefill.lineas.map(l => ({ ...l, descuentoModo: 'monto' as DescuentoModo })),
      'Cotización',
      productosPorId,
      nuevaKey,
    )

    // Abre una pestaña nueva como `crearPestana`: persiste la saliente si
    // aplica y la deja como venta activa. Recuerda su cotización en el ref.
    const saliente = pestanaActivaId ? datosPestana(pestanaActivaId) : undefined
    const nueva: PestanaVenta = {
      id: nuevaPestanaId(),
      esperaId: null,
      nombre: siguienteNombrePestana(pestanas.map(p => p.nombre)),
      lineas: lineasValidas,
      descuentoGlobal: clampDescuentoGlobal(lineasValidas, cotizacionPrefill.descuentoGlobal),
      clienteId: cotizacionPrefill.clienteId,
      vendedorId: null,
    }
    cotizacionPorPestanaRef.current[nueva.id] = cotizacionPrefill.cotizacionId

    setPestanas(prev => [...prev.map(p => (saliente && p.id === saliente.id ? saliente : p)), nueva])
    setLineas(nueva.lineas)
    setDescuentoGlobal(nueva.descuentoGlobal)
    setClienteId(nueva.clienteId)
    setVendedorId(nueva.vendedorId)
    setPestanaActivaId(nueva.id)
    // Concatena (no reemplaza) por si el efecto de hidratación acaba de dejar un
    // aviso (p.ej. una espera con formato corrupto) que no se debe pisar.
    if (avisos.length > 0) setAvisoRetomar(prev => [prev, avisos.join(' ')].filter(Boolean).join(' '))

    if (saliente) persistirPestana(caja.id, saliente)

    router.replace('/admin/pos')
    // `datosPestana`/`persistirPestana` se recrean cada render; el guard
    // `prefillProcesadoRef` asegura que este efecto de precarga corra una sola
    // vez, así que no se incluyen como dependencias (mismo criterio que el
    // efecto de hidratación de pestañas de arriba).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacionPrefill, caja, sesion, pestanasCajaId, productosPorId, pestanaActivaId, pestanas, router])

  // Snapshot "verdadero" de una pestaña por id: si es la activa, se arma con
  // el estado de edición en vivo (única fuente de verdad mientras se edita);
  // si es otra, con lo último que quedó guardado en `pestanas` la última vez
  // que se cambió de pestaña. Centraliza esta regla para que
  // seleccionar/crear/cerrar/renombrar pestaña no la reimplementen cada uno.
  function datosPestana(id: string): PestanaVenta | undefined {
    const base = pestanas.find(p => p.id === id)
    if (!base) return undefined
    return id === pestanaActivaId ? { ...base, lineas, descuentoGlobal, clienteId, vendedorId } : base
  }

  // Carga una pestaña en el estado de edición (revalidando sus líneas contra
  // el catálogo vigente) y la marca activa. Devuelve las líneas ya validadas
  // porque el llamador también necesita escribirlas de vuelta en `pestanas`.
  function cargarPestanaEnEdicion(pestana: PestanaVenta): LineaVenta[] {
    const { lineas: lineasValidas, avisos } = revalidarLineasCatalogo(pestana.lineas, pestana.nombre, productosPorId, nuevaKey)
    setLineas(lineasValidas)
    setDescuentoGlobal(clampDescuentoGlobal(lineasValidas, pestana.descuentoGlobal))
    setClienteId(pestana.clienteId)
    setVendedorId(pestana.vendedorId)
    setPestanaActivaId(pestana.id)
    setAvisoRetomar(avisos.length > 0 ? avisos.join(' ') : '')
    return lineasValidas
  }

  // Decide qué hacer en BD con una pestaña que deja de estar activa
  // (accionPersistencia, lib/pos/carrito.ts) y lo ejecuta: crea la fila la
  // primera vez que la pestaña tiene líneas, la actualiza si ya existía, o la
  // elimina si quedó vacía — nunca dos pestañas comparten fila. Corre en
  // segundo plano (no bloquea el cambio de pestaña, ya aplicado de forma
  // optimista por el llamador) — mismo patrón que ya usaban
  // guardarEspera/eliminarEspera antes de esta tarea.
  function persistirPestana(cajaIdActual: string, pestana: PestanaVenta) {
    const accion = accionPersistencia(pestana)
    if (accion.tipo === 'ninguna') return

    const payload: EsperaPayload = {
      version: 1,
      lineas: pestana.lineas.map(toLineaEsperaGuardada),
      descuentoGlobal: pestana.descuentoGlobal,
      clienteId: pestana.clienteId,
      vendedorId: pestana.vendedorId,
    }

    startEsperaTransition(async () => {
      if (accion.tipo === 'eliminar') {
        const result = await eliminarEspera(accion.esperaId)
        if (result.ok) {
          setPestanas(prev => prev.map(p => (p.id === pestana.id ? { ...p, esperaId: null } : p)))
          router.refresh()
        } else {
          setAvisoRetomar(prev => [prev, `No se pudo actualizar "${pestana.nombre}": ${result.error}`].filter(Boolean).join(' '))
        }
        return
      }
      if (accion.tipo === 'crear') {
        const result = await guardarEspera(cajaIdActual, pestana.nombre, payload)
        if (result.ok && result.data) {
          const esperaId = result.data.id
          setPestanas(prev => prev.map(p => (p.id === pestana.id ? { ...p, esperaId } : p)))
          router.refresh()
        } else if (!result.ok) {
          setAvisoRetomar(prev => [prev, `No se pudo guardar "${pestana.nombre}": ${result.error}`].filter(Boolean).join(' '))
        }
        return
      }
      const result = await actualizarEspera(accion.esperaId, pestana.nombre, payload)
      if (result.ok) {
        router.refresh()
      } else {
        setAvisoRetomar(prev => [prev, `No se pudo actualizar "${pestana.nombre}": ${result.error}`].filter(Boolean).join(' '))
      }
    })
  }

  // Cambiar de pestaña con un clic: la saliente se persiste en segundo plano
  // (crea/actualiza/elimina su fila según corresponda) y la entrante se carga
  // de inmediato — nunca hay que esperar a la red para ver el cambio.
  function seleccionarPestana(id: string) {
    if (id === pestanaActivaId || !caja) return
    const entrante = pestanas.find(p => p.id === id)
    if (!entrante) return

    const saliente = pestanaActivaId ? datosPestana(pestanaActivaId) : undefined
    const lineasEntrante = cargarPestanaEnEdicion(entrante)

    setPestanas(prev => prev.map(p => {
      if (saliente && p.id === saliente.id) return saliente
      if (p.id === id) return { ...p, lineas: lineasEntrante }
      return p
    }))

    if (saliente) persistirPestana(caja.id, saliente)
  }

  // Botón "+": persiste la saliente igual que un cambio de pestaña y abre una
  // venta nueva vacía (no se persiste hasta que tenga líneas, ver
  // accionPersistencia).
  function crearPestana() {
    if (!caja) return
    const saliente = pestanaActivaId ? datosPestana(pestanaActivaId) : undefined
    const nueva: PestanaVenta = {
      id: nuevaPestanaId(),
      esperaId: null,
      nombre: siguienteNombrePestana(pestanas.map(p => p.nombre)),
      lineas: [],
      descuentoGlobal: 0,
      clienteId: null,
      vendedorId: null,
    }

    setPestanas(prev => [...prev.map(p => (saliente && p.id === saliente.id ? saliente : p)), nueva])
    setLineas([])
    setDescuentoGlobal(0)
    setClienteId(null)
    setVendedorId(null)
    setPestanaActivaId(nueva.id)
    setAvisoRetomar('')

    if (saliente) persistirPestana(caja.id, saliente)
  }

  // Cierra una pestaña (×): confirma si tiene líneas (mismo patrón que ya
  // usaba el descarte de esperas), elimina su fila si tenía, y si era la
  // activa elige otra (la vecina de la izquierda) o abre una nueva vacía si
  // era la única — nunca se queda sin pestaña activa.
  function cerrarPestana(id: string) {
    const pestana = datosPestana(id)
    if (!pestana) return

    if (pestana.lineas.length > 0) {
      const confirmado = window.confirm(
        `"${pestana.nombre}" tiene ${pestana.lineas.length} línea(s) sin cobrar. ¿Cerrarla de todas formas?`,
      )
      if (!confirmado) return
    }

    // Task 8 (POS P3): si la pestaña venía de una cotización sin facturar, se
    // descarta su vínculo — evita basura acumulada en el ref por sesión.
    delete cotizacionPorPestanaRef.current[id]

    if (pestana.esperaId) {
      const idEliminar = pestana.esperaId
      startEsperaTransition(async () => {
        const result = await eliminarEspera(idEliminar)
        if (result.ok) {
          router.refresh()
        } else {
          setAvisoRetomar(prev => [prev, `No se pudo eliminar la venta en espera de "${pestana.nombre}".`].filter(Boolean).join(' '))
        }
      })
    }

    const restantes = pestanas.filter(p => p.id !== id)

    if (id !== pestanaActivaId) {
      setPestanas(restantes)
      return
    }

    if (restantes.length === 0) {
      const nueva: PestanaVenta = {
        id: nuevaPestanaId(), esperaId: null, nombre: siguienteNombrePestana([]),
        lineas: [], descuentoGlobal: 0, clienteId: null, vendedorId: null,
      }
      setPestanas([nueva])
      cargarPestanaEnEdicion(nueva)
      return
    }

    const indiceCerrada = pestanas.findIndex(p => p.id === id)
    const siguiente = restantes[Math.max(0, indiceCerrada - 1)]
    const lineasSiguiente = cargarPestanaEnEdicion(siguiente)
    setPestanas(restantes.map(p => (p.id === siguiente.id ? { ...p, lineas: lineasSiguiente } : p)))
  }

  // Doble clic o botón ✎ (PestanasBar): renombra en memoria de inmediato y,
  // si la pestaña ya tiene fila en `ventas_espera`, persiste el nombre nuevo
  // sin esperar al próximo cambio de pestaña — evita que una recarga
  // inmediata después de renombrar revierta el nombre.
  function renombrarPestana(id: string, nombreCrudo: string) {
    const nombre = nombreCrudo.trim()
    if (!nombre) return
    setPestanas(prev => prev.map(p => (p.id === id ? { ...p, nombre } : p)))

    if (!caja) return
    const pestana = datosPestana(id)
    if (pestana?.esperaId) persistirPestana(caja.id, { ...pestana, nombre })
  }

  // Al emitir, la venta de la pestaña activa ya quedó cobrada (emitirVenta
  // corrió la RPC) — su fila de espera (si tenía) ya no representa nada
  // pendiente y se elimina de inmediato, sin esperar a que el cajero cierre
  // el modal del documento. Decisión: la pestaña NO se cierra, se resetea a
  // venta nueva vacía con un nombre por defecto (no conserva el nombre del
  // cliente ya facturado) y queda abierta en el mismo lugar de la barra —
  // más predecible que decidir caso a caso si cerrarla, y evita reordenar el
  // resto de pestañas justo cuando el cajero acaba de cobrar.
  function finalizarPestanaEmitida() {
    if (!pestanaActivaId) return
    const activa = pestanas.find(p => p.id === pestanaActivaId)
    // Si el ligado a cotización (handleEmitido) falló, la entrada de esta
    // pestaña en el ref se queda apuntando a la cotización vieja. Se limpia
    // aquí siempre (haya o no fallado) para que, si el cajero reutiliza la
    // misma pestaña para una venta nueva, esa venta no herede una
    // cotizacionId ajena y termine ligando el documento equivocado.
    delete cotizacionPorPestanaRef.current[pestanaActivaId]
    if (activa?.esperaId) {
      const idEliminar = activa.esperaId
      startEsperaTransition(async () => {
        const result = await eliminarEspera(idEliminar)
        if (result.ok) {
          router.refresh()
        } else {
          setAvisoRetomar(prev => [prev, 'No se pudo limpiar la venta en espera asociada a esta pestaña.'].filter(Boolean).join(' '))
        }
      })
    }
    setPestanas(prev => {
      const otrosNombres = prev.filter(p => p.id !== pestanaActivaId).map(p => p.nombre)
      return prev.map(p => (p.id === pestanaActivaId
        ? { ...p, esperaId: null, nombre: siguienteNombrePestana(otrosNombres), lineas: [], descuentoGlobal: 0, clienteId: null, vendedorId: null }
        : p))
    })
  }

  // ---- Cierre de caja (Task 12) ----
  // Decisión: cerrar caja YA NO limpia la pestaña activa (antes vaciaba el
  // carrito sin persistir nada). Las esperas sobreviven al cierre de caja
  // por diseño (ver brief); forzar el reset aquí sin persistir podía borrar
  // en memoria contenido que sí tenía fila guardada, dejando una fila
  // "fantasma" desactualizada o, peor, provocando que el próximo cambio de
  // pestaña la interpretara como vacía y la eliminara. Cerrar caja no debe
  // tocar el contenido de ninguna pestaña.
  function handleCierreCerrado() {
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

  function handleAbrirSesion(e: FormEvent) {
    e.preventDefault()
    if (!caja) return

    const monto = parseMoneyInput(montoInicial)
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
                type="text"
                inputMode="decimal"
                placeholder="0.00"
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
                className={`btnMerlinTertiary ${styles.btnCancel}`}
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

  // Sesiones cerradas llegan sin filtrar por caja desde page.tsx (ver Props):
  // se filtran aquí, una vez que se conoce `caja.id`. (Las esperas se filtran
  // y se convierten en pestañas en el efecto de hidratación más arriba.)
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
          <button type="button" className={`btnMerlinTertiary ${styles.btnGhost}`} onClick={() => setHistorialAbierto(true)}>
            Sesiones
          </button>
          <button type="button" className={`btnMerlinTertiary ${styles.btnGhost}`} onClick={() => setCierreAbierto(true)}>
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
        {/* Columna izquierda: las pestañas de ventas viven ARRIBA del
            catálogo (fuera de su scroll, siempre visibles); el catálogo
            ocupa el resto y scrollea internamente. PestanasBar se renderiza
            aquí (no dentro de CatalogoPanel) para no acoplar la lógica de
            pestañas con la del catálogo — PosClient ya es dueño de ambas. */}
        <div className={styles.catalogoCol}>
          <PestanasBar
            pestanas={pestanas}
            activaId={pestanaActivaId}
            conteoActiva={lineas.length}
            onSeleccionar={seleccionarPestana}
            onNueva={crearPestana}
            onCerrar={cerrarPestana}
            onRenombrar={renombrarPestana}
          />
          <CatalogoPanel
            productos={productos}
            categorias={categorias}
            tipoCliente={tipoCliente}
            onAgregar={agregarProducto}
            onError={setAvisoRetomar}
            onItemLibre={() => setLibreModal(true)}
          />
        </div>

        <CarritoPanel
          lineas={lineas}
          descuentoGlobal={descuentoGlobal}
          descuentos={descuentos}
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
            descuentos={descuentos}
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
