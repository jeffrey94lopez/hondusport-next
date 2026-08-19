'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Modal from '@/components/admin/Modal'
import ClienteNuevoModal from '@/app/admin/pos/components/ClienteNuevoModal'
import { precioLineaPos } from '@/lib/pos/emision'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import {
  brutoLinea,
  clampDescuentoGlobal,
  clampDescuentoLinea,
  descuentoDesdePorcentaje,
  topeCantidad,
} from '@/lib/pos/carrito'
import type { DescuentoModo, LineaVenta } from '@/lib/pos/carrito'
import { toStoreVariantes, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'
import { parseMoneyInput, preciosCatalogo, round2, topeStock, valorMostrado, variantesActivasDe } from '@/app/admin/pos/pos-helpers'
import { duplicarCotizacion, guardarCotizacion } from '../actions'
import type { GuardarCotizacionInput } from '../actions'
import { puedeEditarCotizacion } from '@/lib/cotizaciones/cotizaciones'
import { numeroDocumento, TIPO_DOCUMENTO_LABEL } from '@/lib/pos/documentos'
import type { TipoDocumento } from '@/lib/pos/documentos'
import type {
  Cliente,
  ConfigMap,
  CotizacionConDatos,
  CotizacionEtapa,
  IsvTipo,
  Producto,
  ProductoVariante,
  Vendedor,
} from '@/types'
import styles from './editor.module.css'

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'
const ESTILOS_PDF: { id: string; nombre: string }[] = [
  { id: 'ejecutivo', nombre: 'Ejecutivo' },
  { id: 'minimalista', nombre: 'Minimalista' },
  { id: 'catalogo', nombre: 'Catálogo' },
]

// Iconos "feather" locales (mismo estilo que components/admin/icons.tsx y los
// encabezados de sección del editor de producto, R5a) — solo presentación,
// para los títulos de las cards del re-skin R5b Task 5.
function IconCatalogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8V6a6 6 0 0112 0v2" />
      <path d="M4 8h16l-1.2 12.2a2 2 0 01-2 1.8H7.2a2 2 0 01-2-1.8L4 8z" />
    </svg>
  )
}
function IconCliente() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </svg>
  )
}
function IconLineas() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconTotales() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 15.3c0 1 1 1.7 2.1 1.7h1.3c1.1 0 2.1-.7 2.1-1.8 0-1.1-1-1.5-2.6-1.9-1.6-.4-2.6-.9-2.6-2 0-1.1 1.1-1.8 2.4-1.8 1 0 1.9.4 2.3 1.1" />
      <line x1="12" y1="7.4" x2="12" y2="9.5" />
      <line x1="12" y1="17" x2="12" y2="19.1" />
    </svg>
  )
}
function IconTerminos() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 13h7M8.5 16.5h7" />
    </svg>
  )
}

// D3: lo mínimo del documento que produjo esta cotización, para que el badge
// "Facturada" enlace a él con su número real. Lo carga page.tsx.
export interface DocumentoEnlace {
  id: string
  tipo: TipoDocumento
  correlativo: string | null
  numero_comprobante: number | null
}

interface Props {
  cotizacion: CotizacionConDatos | null
  documento: DocumentoEnlace | null
  productos: Producto[]
  clientes: Cliente[]
  vendedores: Vendedor[]
  etapas: CotizacionEtapa[]
  config: ConfigMap
}

// El modelo de línea de la UI reutiliza `LineaVenta` del carrito del POS
// (LineaPos + `key` de React + `precioManual` + `descuentoModo`): así las
// puras de clamp de lib/pos/carrito operan sin conversión. `descuentoModo`
// solo afecta cómo se edita el descuento (L. o %); el valor persistido
// siempre es un monto en Lempiras. Al guardar se mapea a LineaCotizacionInput.
type LineaUI = LineaVenta

export default function CotizacionEditor({ cotizacion, documento, productos, clientes, vendedores, etapas, config }: Props) {
  const router = useRouter()

  // ---- Contador de keys de React (independiente de la BD) ----
  const nextKeyRef = useRef(cotizacion?.items.length ?? 0)
  function nuevaKey(): string {
    const k = `l${nextKeyRef.current}`
    nextKeyRef.current += 1
    return k
  }

  // ---- Estado del documento ----
  const [lineas, setLineas] = useState<LineaUI[]>(() =>
    (cotizacion?.items ?? []).map((it, i) => ({
      key: `l${i}`,
      producto_id: it.producto_id,
      variante_id: it.variante_id,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      descuento: it.descuento,
      isv: it.isv,
      precioManual: it.precio_manual,
      descuentoModo: 'monto' as DescuentoModo,
    })),
  )
  const [descuentoGlobal, setDescuentoGlobal] = useState(cotizacion?.descuento_global ?? 0)
  const [clientesLocal, setClientesLocal] = useState<Cliente[]>(clientes)
  const [clienteId, setClienteId] = useState<string | null>(cotizacion?.cliente_id ?? null)
  const [vendedorId, setVendedorId] = useState<string | null>(cotizacion?.vendedor_id ?? null)
  const [etapaId, setEtapaId] = useState<string>(cotizacion?.etapa_id ?? etapas[0]?.id ?? '')
  const [validezDias, setValidezDias] = useState<number>(
    cotizacion?.validez_dias ?? (Number(config.cotizacion_validez_dias) || 15),
  )
  const [condiciones, setCondiciones] = useState<string>(
    cotizacion?.condiciones ?? config.cotizacion_condiciones_default ?? '',
  )
  const [notas, setNotas] = useState<string>(cotizacion?.notas ?? '')

  // ---- Estado de identidad/persistencia ----
  const [cotizacionId, setCotizacionId] = useState<string | null>(cotizacion?.id ?? null)
  const documentoId = cotizacion?.documento_id ?? null
  // D3 — UNA sola variable gobierna el modo lectura. Todo campo, botón y
  // acción de escritura la consulta; no hay una segunda versión del
  // formulario. La regla es la misma que aplican las Server Actions
  // (puedeEditarCotizacion), así que pantalla y servidor no pueden divergir.
  const bloqueada = !puedeEditarCotizacion(documentoId)
  const numero = cotizacion?.numero ?? null
  // `dirty` habilita/inhabilita Ver PDF y Facturar: ambos leen la cotización
  // YA persistida (PDF relee de BD, Facturar arranca el POS desde la fila), así
  // que no deben poder dispararse con cambios sin guardar en pantalla.
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [guardando, startGuardar] = useTransition()
  const [duplicando, startDuplicar] = useTransition()

  // ---- Estado de UI (modales / buscador / dropdowns) ----
  const [busqueda, setBusqueda] = useState('')
  const [varianteModal, setVarianteModal] = useState<Producto | null>(null)
  const [libreModal, setLibreModal] = useState(false)
  const [lineaEditando, setLineaEditando] = useState<string | null>(null)
  const [clienteNuevoOpen, setClienteNuevoOpen] = useState(false)
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)
  const [descuentoTexto, setDescuentoTexto] = useState('')
  const [editandoDescuento, setEditandoDescuento] = useState(false)
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)

  // ---- Derivados ----
  const productosPorId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])
  const clienteActual = clienteId ? (clientesLocal.find(c => c.id === clienteId) ?? null) : null
  const tipoCliente: 'final' | 'revendedor' = clienteActual?.tipo_cliente ?? 'final'
  const exonerado = clienteActual?.exonerado ?? false

  // Totales en vivo (mismo pipeline que PosClient, sin useMemo: el React
  // Compiler lo memoiza y así se evita el warning de preserve-manual-memoization
  // que dispara `prorratearDescuentoGlobal` al reconstruir las líneas).
  const lineasProrrateadas = prorratearDescuentoGlobal(lineas, descuentoGlobal)
  const lineasDesglosadas = lineasProrrateadas.map(l => desglosarLinea(l, exonerado))
  const totales = totalesDocumento(lineasDesglosadas, descuentoGlobal, '')

  const puedeGuardar = etapaId !== '' && !guardando
  const hayLineas = lineas.length > 0
  const puedePdf = cotizacionId !== null && !dirty && hayLineas
  const puedeFacturar = cotizacionId !== null && !dirty && documentoId === null && hayLineas
  const puedeDuplicar = cotizacionId !== null && !dirty && !duplicando

  function marcarSucio() {
    setDirty(true)
  }

  // ---- Mutadores de líneas (mismo criterio de clamps que el POS) ----
  function agregarProducto(producto: Producto, variante: ProductoVariante | null) {
    setLineas(prev => {
      const idx = prev.findIndex(l => l.producto_id === producto.id && l.variante_id === (variante?.id ?? null))
      const variantes = toStoreVariantes(producto.precio, producto.producto_variantes ?? [])
      const tope =
        (variante ? variantes.find(v => v.id === variante.id)?.stock : stockEfectivo(producto.stock, variantes)) ??
        Infinity
      if (idx === -1) {
        if (tope <= 0) return prev
        const nueva: LineaUI = {
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
      return prev.map((l, i) =>
        i === idx ? { ...l, cantidad: Math.min(l.cantidad + 1, Math.max(tope, l.cantidad)) } : l,
      )
    })
    marcarSucio()
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
    marcarSucio()
  }

  function quitarLinea(key: string) {
    const next = lineas.filter(l => l.key !== key)
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
    marcarSucio()
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
    marcarSucio()
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
    marcarSucio()
  }

  function guardarLineaEditada(editada: LineaUI) {
    const next = lineas.map(l => (l.key === editada.key ? editada : l))
    setLineas(next)
    setDescuentoGlobal(dg => clampDescuentoGlobal(next, dg))
    setLineaEditando(null)
    marcarSucio()
  }

  // Recalcula precios de línea para el tipo del cliente elegido (p.ej. tarifa
  // de revendedor) sin tocar líneas con precioManual, y reclampa el descuento
  // global — el nuevo precio puede ser menor. Mismo criterio que el POS.
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
    marcarSucio()
  }

  function seleccionarCliente(id: string | null) {
    const cliente = id ? (clientesLocal.find(c => c.id === id) ?? null) : null
    aplicarCliente(cliente)
    setClienteQuery('')
    setClienteOpen(false)
  }

  function handleClienteCreado(cliente: Cliente) {
    setClientesLocal(prev => [cliente, ...prev])
    aplicarCliente(cliente)
    setClienteNuevoOpen(false)
  }

  // ---- Descuento global (input de dinero en texto plano, sin cero forzado) ----
  const brutoTotalActual = round2(lineas.reduce((s, l) => s + (brutoLinea(l) - l.descuento), 0))
  const descuentoMostrado = editandoDescuento ? descuentoTexto : valorMostrado(descuentoGlobal)

  function handleDescuentoGlobalChange(texto: string) {
    setDescuentoTexto(texto)
    const n = parseMoneyInput(texto)
    setDescuentoGlobal(Math.min(Math.max(0, n), brutoTotalActual))
    marcarSucio()
  }

  // ---- Acciones ----
  function handleGuardar() {
    if (etapaId === '') {
      setError('Elige una etapa antes de guardar.')
      return
    }
    setError('')
    startGuardar(async () => {
      const input: GuardarCotizacionInput = {
        id: cotizacionId,
        etapaId,
        clienteId,
        vendedorId,
        descuentoGlobal,
        validezDias,
        condiciones: condiciones.trim() || null,
        notas: notas.trim() || null,
        lineas: lineas.map(l => ({
          producto_id: l.producto_id,
          variante_id: l.variante_id,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          precioManual: l.precioManual,
          descuento: l.descuento,
          isv: l.isv,
        })),
      }
      const r = await guardarCotizacion(input)
      if (!r.ok || !r.data) {
        setError(r.ok ? ERROR_GENERICO : r.error)
        return
      }
      const eraNueva = cotizacionId === null
      setDirty(false)
      if (eraNueva) {
        router.replace('/admin/cotizaciones/' + r.data.id)
      } else {
        setCotizacionId(r.data.id)
      }
    })
  }

  function abrirPdf(estilo: string) {
    if (!cotizacionId) return
    window.open(`/admin/cotizaciones/${cotizacionId}/pdf?estilo=${estilo}`, '_blank')
    setPdfMenuOpen(false)
  }

  function facturar() {
    if (!cotizacionId) return
    router.push('/admin/pos?cotizacion=' + cotizacionId)
  }

  // Ofrece una copia editable de la cotización (sin documento_id), útil sobre
  // todo cuando ya fue facturada y "Facturar" está deshabilitado.
  function duplicar() {
    if (!cotizacionId) return
    setError('')
    startDuplicar(async () => {
      const r = await duplicarCotizacion(cotizacionId)
      if (!r.ok || !r.data) {
        setError(r.ok ? ERROR_GENERICO : r.error)
        return
      }
      router.push('/admin/cotizaciones/' + r.data.id)
    })
  }

  // ---- Buscador de catálogo ----
  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q === '') return productos
    return productos.filter(p => {
      if (p.nombre.toLowerCase().includes(q)) return true
      if (p.sku && p.sku.trim().toLowerCase() === q) return true
      return variantesActivasDe(p).some(v => v.sku && v.sku.trim().toLowerCase() === q)
    })
  }, [productos, busqueda])

  function handleProductoClick(producto: Producto) {
    const activas = variantesActivasDe(producto)
    if (activas.length === 0) {
      agregarProducto(producto, null)
      return
    }
    setVarianteModal(producto)
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const q = busqueda.trim().toLowerCase()
    if (!q) return
    for (const p of productos) {
      if (p.sku && p.sku.trim().toLowerCase() === q) {
        e.preventDefault()
        agregarProducto(p, null)
        setBusqueda('')
        return
      }
      const v = variantesActivasDe(p).find(x => x.sku && x.sku.trim().toLowerCase() === q)
      if (v) {
        e.preventDefault()
        agregarProducto(p, v)
        setBusqueda('')
        return
      }
    }
  }

  const clientesFiltrados =
    clienteQuery.trim() === ''
      ? clientesLocal
      : clientesLocal.filter(c => {
          const q = clienteQuery.trim().toLowerCase()
          return c.nombre.toLowerCase().includes(q) || (c.rtn ?? '').includes(clienteQuery.trim())
        })

  const lineaEnEdicion = lineaEditando ? lineas.find(l => l.key === lineaEditando) ?? null : null

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={`${styles.btnAccion} btnMerlinTertiary`} onClick={() => router.push('/admin/cotizaciones')}>
            ← Volver
          </button>
          <div>
            <h1 className={styles.title}>{numero ? `Cotización ${numero}` : 'Nueva cotización'}</h1>
            {/* D3: el badge deja de ser decorativo — enlaza al documento que
                produjo la cotización, rotulado con numeroDocumento, que cubre
                los cuatro tipos (D1). Si por lo que sea no se pudo cargar el
                documento, se conserva el badge sin enlace: un enlace que no
                lleva a ninguna parte es peor que texto plano. */}
            {documentoId && (
              documento
                ? (
                  <Link href={`/admin/pos/documento/${documento.id}`} className={styles.badgeFacturadaLink}>
                    {TIPO_DOCUMENTO_LABEL[documento.tipo]} {numeroDocumento(documento)}
                  </Link>
                )
                : <span className={styles.badgeFacturada}>Facturada</span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.pdfWrap}>
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnAccion}`}
              disabled={!puedePdf}
              onClick={() => setPdfMenuOpen(o => !o)}
            >
              Ver PDF ▾
            </button>
            {pdfMenuOpen && puedePdf && (
              <div className={styles.pdfMenu} onMouseLeave={() => setPdfMenuOpen(false)}>
                {ESTILOS_PDF.map(e => (
                  <button key={e.id} type="button" className={styles.pdfMenuItem} onClick={() => abrirPdf(e.id)}>
                    {e.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`btnMerlinSecondary ${styles.btnAccion}`}
            disabled={!puedeFacturar}
            onClick={facturar}
          >
            Facturar
          </button>
          {cotizacion !== null && (
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnAccion}`}
              disabled={!puedeDuplicar}
              onClick={duplicar}
            >
              {duplicando ? 'Duplicando…' : 'Duplicar'}
            </button>
          )}
          {/* D3: en una cotización facturada Guardar DESAPARECE y en su lugar
              va la explicación. Un botón deshabilitado sin decir por qué deja
              al usuario adivinando; aquí además existe una salida concreta
              (Duplicar, el botón de al lado) y hay que nombrarla. */}
          {bloqueada ? (
            <span className={styles.avisoBloqueada}>
              Facturada: no se puede modificar. Usa Duplicar para trabajar sobre una copia.
            </span>
          ) : (
            <button
              type="button"
              className={`btnMerlinPrimary ${styles.btnAccion}`}
              disabled={!puedeGuardar}
              onClick={handleGuardar}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.grid}>
        {/* ---- Columna izquierda: catálogo ---- */}
        {/* D3: sin catálogo no hay forma de agregar líneas; ocupar media
            pantalla con un buscador inerte es peor que quitarlo. */}
        {!bloqueada && (
        <section className={styles.catalogoCol}>
          <h2 className={styles.seccionHeader}><IconCatalogo />Catálogo</h2>
          <div className={styles.seccionBody}>
          <div className={styles.searchRow}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Buscar por nombre o escanear SKU…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnItemLibre}`}
              onClick={() => setLibreModal(true)}
            >
              + Ítem libre
            </button>
          </div>

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
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className={styles.prodCard}
                    aria-disabled={agotado}
                    onClick={() => {
                      if (!agotado) handleProductoClick(p)
                    }}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget || agotado) return
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      handleProductoClick(p)
                    }}
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
                    {!agotado && stock != null && <div className={styles.prodStock}>Stock: {stock}</div>}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </section>
        )}

        {/* ---- Columna derecha: documento en construcción ---- */}
        <section className={styles.docCol}>
          {/* Cliente */}
          <div className={styles.seccion}>
          <h2 className={styles.seccionHeader}><IconCliente />Cliente</h2>
          <div className={styles.seccionBody}>
          <div className={styles.clienteBlock}>
            <div className={styles.clienteBlockHeader}>
              <label className={styles.formLabel}>Cliente</label>
              {!bloqueada && (
                <button type="button" className={styles.btnNuevoCliente} onClick={() => setClienteNuevoOpen(true)}>
                  + Nuevo
                </button>
              )}
            </div>
            <div className={styles.clienteCombo}>
              <input
                type="text"
                className={styles.clienteInput}
                value={clienteOpen ? clienteQuery : clienteActual?.nombre ?? 'CONSUMIDOR FINAL'}
                disabled={bloqueada}
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
                    <button
                      key={c.id}
                      type="button"
                      className={styles.clienteOption}
                      onClick={() => seleccionarCliente(c.id)}
                    >
                      {c.nombre} {c.rtn ? `· ${c.rtn}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {exonerado && <span className={styles.badgeExonerado}>Exonerado</span>}
          </div>
          </div>
          </div>

          {/* Líneas */}
          <div className={styles.seccion}>
          <h2 className={styles.seccionHeader}><IconLineas />Líneas</h2>
          <div className={styles.seccionBody}>
          <div className={styles.lineasList}>
            {lineas.length === 0 ? (
              <div className={styles.empty}>
                {bloqueada
                  ? 'Esta cotización no tiene líneas.'
                  : 'Agrega productos desde el catálogo o un ítem libre.'}
              </div>
            ) : (
              lineas.map(l => {
                const subtotal = brutoLinea(l) - l.descuento
                const tope = topeStock(l, productosPorId)
                return (
                  <div key={l.key} className={styles.lineaRow}>
                    <div className={styles.lineaDesc}>
                      <div className={styles.lineaNombre}>{l.descripcion}</div>
                      {l.descuento > 0 && <div className={styles.lineaDescuentoTag}>−{formatPrice(l.descuento)}</div>}
                    </div>
                    <div className={styles.lineaQty}>
                      <button
                        type="button"
                        className="btnMerlinIcon"
                        disabled={bloqueada}
                        onClick={() => cambiarCantidadDelta(l.key, -1)}
                        aria-label="Restar cantidad"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        className={styles.qtyInput}
                        value={l.cantidad}
                        min={1}
                        max={tope ?? undefined}
                        disabled={bloqueada}
                        onChange={e => cambiarCantidadInput(l.key, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btnMerlinIcon"
                        disabled={bloqueada}
                        onClick={() => cambiarCantidadDelta(l.key, 1)}
                        aria-label="Sumar cantidad"
                      >
                        +
                      </button>
                    </div>
                    <div className={styles.lineaSubtotal}>{formatPrice(subtotal)}</div>
                    <div className={styles.lineaAcciones}>
                      {!bloqueada && (
                        <button
                          type="button"
                          className={styles.btnEditarLinea}
                          onClick={() => setLineaEditando(l.key)}
                          aria-label="Editar línea"
                        >
                          ✎
                        </button>
                      )}
                      {!bloqueada && (
                        <button
                          type="button"
                          className="btnMerlinIcon btnMerlinIconDanger"
                          onClick={() => quitarLinea(l.key)}
                          aria-label="Quitar línea"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          </div>
          </div>

          {/* Descuento global + totales */}
          <div className={styles.seccion}>
          <h2 className={styles.seccionHeader}><IconTotales />Totales</h2>
          <div className={styles.seccionBody}>
          <div className={styles.descuentoGlobalRow}>
            <label>Descuento global (L.)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={styles.descuentoGlobalInput}
              value={descuentoMostrado}
              disabled={bloqueada}
              onFocus={() => {
                setDescuentoTexto(valorMostrado(descuentoGlobal))
                setEditandoDescuento(true)
              }}
              onChange={e => handleDescuentoGlobalChange(e.target.value)}
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
          </div>
          </div>

          {/* Cabecera de la cotización */}
          <div className={styles.seccion}>
          <h2 className={styles.seccionHeader}><IconTerminos />Términos y notas</h2>
          <div className={styles.seccionBody}>
          <div className={styles.cabecera}>
            <div className={styles.cabeceraRow}>
              <label className={styles.formLabel}>
                Etapa
                <select className={styles.cabeceraCampo} value={etapaId} disabled={bloqueada} onChange={e => { setEtapaId(e.target.value); marcarSucio() }}>
                  {etapas.map(et => (
                    <option key={et.id} value={et.id}>{et.nombre}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formLabel}>
                Vendedor
                <select className={styles.cabeceraCampo} value={vendedorId ?? ''} disabled={bloqueada} onChange={e => { setVendedorId(e.target.value || null); marcarSucio() }}>
                  <option value="">Sin vendedor</option>
                  {vendedores.map(v => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formLabel}>
                Validez (días)
                <input
                  type="number"
                  className={styles.cabeceraCampo}
                  min={1}
                  step="1"
                  value={validezDias}
                  disabled={bloqueada}
                  onChange={e => {
                    const n = Number(e.target.value)
                    setValidezDias(Number.isFinite(n) && n > 0 ? Math.round(n) : 1)
                    marcarSucio()
                  }}
                />
              </label>
            </div>
            <label className={styles.formLabel}>
              Condiciones
              <textarea className={styles.cabeceraCampo} rows={2} value={condiciones} disabled={bloqueada} onChange={e => { setCondiciones(e.target.value); marcarSucio() }} />
            </label>
            <label className={styles.formLabel}>
              Notas
              <textarea className={styles.cabeceraCampo} rows={2} value={notas} disabled={bloqueada} onChange={e => { setNotas(e.target.value); marcarSucio() }} />
            </label>
          </div>
          </div>
          </div>
        </section>
      </div>

      {/* ---- Modales ---- */}
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
                  onClick={() => {
                    agregarProducto(varianteModal, v)
                    setVarianteModal(null)
                  }}
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

      {lineaEnEdicion && (
        <LineaEditor
          linea={lineaEnEdicion}
          stockDisponible={topeStock(lineaEnEdicion, productosPorId)}
          onGuardar={guardarLineaEditada}
          onCerrar={() => setLineaEditando(null)}
        />
      )}

      {clienteNuevoOpen && (
        <ClienteNuevoModal onCreado={handleClienteCreado} onCerrar={() => setClienteNuevoOpen(false)} />
      )}
    </div>
  )
}

// ---- Modal de ítem libre (producto_id null, precioManual true) ----
function ItemLibreModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (descripcion: string, cantidad: number, precio: number, isv: IsvTipo) => void
}) {
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [isv, setIsv] = useState<IsvTipo>('15')
  const [formError, setFormError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cantidadNum = Number(cantidad)
    const precioNum = parseMoneyInput(precio)
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
    onSave(descripcion.trim(), Math.round(cantidadNum), precioNum, isv)
  }

  return (
    <Modal title="Ítem libre" onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.formLabel}>
          Descripción
          <input type="text" className={styles.formCampo} value={descripcion} onChange={e => setDescripcion(e.target.value)} autoFocus />
        </label>
        <label className={styles.formLabel}>
          Cantidad
          <input type="number" className={styles.formCampo} min="1" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </label>
        <label className={styles.formLabel}>
          Precio (L.)
          <input
            type="text"
            inputMode="decimal"
            className={styles.formCampo}
            placeholder="0.00"
            value={precio}
            onChange={e => setPrecio(e.target.value)}
          />
        </label>
        <label className={styles.formLabel}>
          ISV
          <select className={styles.formCampo} value={isv} onChange={e => setIsv(e.target.value as IsvTipo)}>
            <option value="15">15%</option>
            <option value="18">18%</option>
            <option value="exento">Exento</option>
          </select>
        </label>

        {formError && <div className={styles.formError}>{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onClose}>Cancelar</button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`}>Agregar</button>
        </div>
      </form>
    </Modal>
  )
}

// ---- Modal de edición de línea (cantidad, precio, descuento; ítem libre
// además descripción/ISV). Editar el precio marca precioManual. Mismo criterio
// de clamps que el POS (clampDescuentoLinea). ----
function LineaEditor({
  linea,
  stockDisponible,
  onGuardar,
  onCerrar,
}: {
  linea: LineaUI
  stockDisponible: number | null
  onGuardar: (linea: LineaUI) => void
  onCerrar: () => void
}) {
  const [borrador, setBorrador] = useState<LineaUI>(linea)
  const [formError, setFormError] = useState('')

  const esLibre = linea.producto_id === null
  const tope = topeCantidad(stockDisponible, linea.cantidad)
  const bruto = brutoLinea(borrador)
  const pctActual = bruto > 0 ? round2((borrador.descuento / bruto) * 100) : 0
  const subtotal = bruto - borrador.descuento

  const [precioTexto, setPrecioTexto] = useState(valorMostrado(linea.precio_unitario))
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  const [descuentoTexto, setDescuentoTexto] = useState(
    valorMostrado(linea.descuentoModo === 'monto' ? linea.descuento : pctActual),
  )
  const [editandoDescuento, setEditandoDescuento] = useState(false)

  const precioMostrado = editandoPrecio ? precioTexto : valorMostrado(borrador.precio_unitario)
  const descuentoMostrado = editandoDescuento
    ? descuentoTexto
    : valorMostrado(borrador.descuentoModo === 'monto' ? borrador.descuento : pctActual)

  function handleCantidad(valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    setBorrador(b => ({ ...b, cantidad: Math.max(1, Math.min(Math.round(n), tope)) }))
  }

  function handlePrecio(texto: string) {
    setPrecioTexto(texto)
    const n = parseMoneyInput(texto)
    setBorrador(b => ({ ...b, precio_unitario: Math.max(0, n), precioManual: true }))
  }

  function handleDescuento(texto: string) {
    setDescuentoTexto(texto)
    const n = Math.max(0, parseMoneyInput(texto))
    setBorrador(b =>
      b.descuentoModo === 'monto' ? { ...b, descuento: n } : { ...b, descuento: descuentoDesdePorcentaje(b, n) },
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (esLibre && !borrador.descripcion.trim()) {
      setFormError('La descripción es requerida.')
      return
    }
    const final = esLibre ? { ...borrador, descripcion: borrador.descripcion.trim() } : borrador
    onGuardar(clampDescuentoLinea(final))
  }

  return (
    <Modal title="Editar línea" onClose={onCerrar}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {esLibre && (
          <label className={styles.formLabel}>
            Descripción
            <input
              type="text"
              className={styles.formCampo}
              value={borrador.descripcion}
              onChange={e => setBorrador(b => ({ ...b, descripcion: e.target.value }))}
              autoFocus
            />
          </label>
        )}

        <label className={styles.formLabel}>
          Cantidad
          <input
            type="number"
            className={styles.formCampo}
            min={1}
            max={Number.isFinite(tope) ? tope : undefined}
            step="1"
            value={borrador.cantidad}
            onChange={e => handleCantidad(e.target.value)}
          />
        </label>

        <label className={styles.formLabel}>
          Precio unitario (L.)
          <input
            type="text"
            inputMode="decimal"
            className={styles.formCampo}
            placeholder="0.00"
            value={precioMostrado}
            onFocus={() => {
              setPrecioTexto(valorMostrado(borrador.precio_unitario))
              setEditandoPrecio(true)
            }}
            onChange={e => handlePrecio(e.target.value)}
            onBlur={() => setEditandoPrecio(false)}
          />
        </label>

        <label className={styles.formLabel}>
          Descuento
          <div className={styles.editorDescuentoRow}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={`${styles.formCampo} ${styles.editorDescuentoInput}`}
              value={descuentoMostrado}
              onFocus={() => {
                setDescuentoTexto(valorMostrado(borrador.descuentoModo === 'monto' ? borrador.descuento : pctActual))
                setEditandoDescuento(true)
              }}
              onChange={e => handleDescuento(e.target.value)}
              onBlur={() => setEditandoDescuento(false)}
            />
            <select
              className={`${styles.formCampo} ${styles.editorModoSelect}`}
              value={borrador.descuentoModo}
              onChange={e => setBorrador(b => ({ ...b, descuentoModo: e.target.value as DescuentoModo }))}
            >
              <option value="monto">L.</option>
              <option value="porcentaje">%</option>
            </select>
          </div>
        </label>

        {esLibre && (
          <label className={styles.formLabel}>
            ISV
            <select className={styles.formCampo} value={borrador.isv} onChange={e => setBorrador(b => ({ ...b, isv: e.target.value as IsvTipo }))}>
              <option value="15">15%</option>
              <option value="18">18%</option>
              <option value="exento">Exento</option>
            </select>
          </label>
        )}

        <div className={styles.editorSubtotal}>Subtotal: {formatPrice(subtotal)}</div>

        {formError && <div className={styles.formError}>{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onCerrar}>Cancelar</button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
