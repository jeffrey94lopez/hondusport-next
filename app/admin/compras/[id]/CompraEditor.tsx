'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import { totalCompra } from '@/lib/compras/compras'
import { parseMoneyInput, round2, valorMostrado, variantesActivasDe } from '@/app/admin/pos/pos-helpers'
import { crearClienteDesdePos } from '@/app/admin/pos/actions'
import { guardarCompra, anularCompra } from '../actions'
import type { GuardarCompraInput } from '../actions'
import RecepcionModal from './RecepcionModal'
import CompraCxpBlock from './CompraCxpBlock'
import type { CxpEditorData } from './CompraCxpBlock'
import type {
  Cliente,
  ClienteForm,
  CompraConDatos,
  CompraEstado,
  CompraMoneda,
  ConfigMap,
  CondicionPago,
  Producto,
  ProductoVariante,
} from '@/types'
import styles from '../compras.module.css'

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

const ESTADO_LABEL: Record<CompraEstado, string> = {
  borrador: 'Borrador',
  ordenada: 'Ordenada',
  parcial: 'Parcial',
  recibida: 'Recibida',
  anulada: 'Anulada',
}
const ESTADO_BADGE: Record<CompraEstado, string> = {
  borrador: styles.badgeGris,
  ordenada: styles.badgeGris,
  parcial: styles.badgeAmbar,
  recibida: styles.badgeVerde,
  anulada: styles.badgeRojo,
}

interface Props {
  compra: CompraConDatos | null
  productos: Producto[]
  proveedores: Cliente[]
  config: ConfigMap
  cxp?: CxpEditorData | null
}

// Línea de la UI: los campos de LineaCompraInput más una `key` de React
// independiente de la BD (los ids de compra_items cambian en cada guardado
// porque la action borra y reinserta).
interface LineaUI {
  key: string
  producto_id: string
  variante_id: string | null
  descripcion: string
  cantidad_ordenada: number
  costo_unitario: number
}

function formatMoneda(n: number, moneda: CompraMoneda): string {
  return moneda === 'USD' ? `$ ${n.toFixed(2)}` : formatPrice(n)
}

export default function CompraEditor({ compra, productos, proveedores, config, cxp = null }: Props) {
  const router = useRouter()

  const estado = compra?.estado ?? null
  // Solo se edita en borrador/ordenada (o al crear). parcial/recibida/anulada
  // dejan encabezado y líneas en solo lectura (la action lo revalida igual).
  const editable = estado === null || estado === 'borrador' || estado === 'ordenada'
  const compraId = compra?.id ?? null

  // ---- Contador de keys de React ----
  const nextKeyRef = useRef(compra?.items.length ?? 0)
  function nuevaKey(): string {
    const k = `l${nextKeyRef.current}`
    nextKeyRef.current += 1
    return k
  }

  // ---- Estado de líneas ----
  const [lineas, setLineas] = useState<LineaUI[]>(() =>
    (compra?.items ?? []).map((it, i) => ({
      key: `l${i}`,
      producto_id: it.producto_id,
      variante_id: it.variante_id,
      descripcion: it.descripcion,
      cantidad_ordenada: it.cantidad_ordenada,
      costo_unitario: it.costo_unitario,
    })),
  )

  // ---- Estado del encabezado ----
  const tasaDefault = Number(config.tasa_cambio_usd) || 0
  const [proveedoresLocal, setProveedoresLocal] = useState<Cliente[]>(() => {
    const base = proveedores
    if (compra?.proveedor && !base.some(p => p.id === compra.proveedor!.id)) {
      return [compra.proveedor, ...base]
    }
    return base
  })
  const [proveedorId, setProveedorId] = useState<string | null>(compra?.proveedor_id ?? null)
  const [moneda, setMoneda] = useState<CompraMoneda>(compra?.moneda ?? 'L')
  const [tasaCambio, setTasaCambio] = useState<number>(compra?.tasa_cambio ?? tasaDefault)
  const [facturaProveedor, setFacturaProveedor] = useState<string>(compra?.factura_proveedor ?? '')
  const [condicionPago, setCondicionPago] = useState<CondicionPago>(compra?.condicion_pago ?? 'contado')
  const [diasCredito, setDiasCredito] = useState<number>(compra?.dias_credito ?? 0)
  const [fecha, setFecha] = useState<string>(compra?.fecha ?? new Date().toISOString().slice(0, 10))
  const [notas, setNotas] = useState<string>(compra?.notas ?? '')

  // ---- Estado de persistencia/UI ----
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [guardando, startGuardar] = useTransition()
  const [anulandoPend, startAnular] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [varianteModal, setVarianteModal] = useState<Producto | null>(null)
  const [proveedorNuevoOpen, setProveedorNuevoOpen] = useState(false)
  const [recepcionOpen, setRecepcionOpen] = useState(false)
  const [editandoTasa, setEditandoTasa] = useState(false)
  const [tasaTexto, setTasaTexto] = useState('')
  const [editingCosto, setEditingCosto] = useState<{ key: string; texto: string } | null>(null)

  function marcarSucio() {
    setDirty(true)
  }

  // ---- Derivados ----
  const subtotalMoneda = round2(lineas.reduce((s, l) => s + l.cantidad_ordenada * l.costo_unitario, 0))
  const totalLempiras = totalCompra(lineas, moneda, tasaCambio)

  const puedeGuardar = editable && !guardando
  const puedeRecibir = compra !== null && (estado === 'ordenada' || estado === 'parcial')
  const puedeAnular = compra !== null && estado !== 'anulada' && !anulandoPend
  const puedeImprimir = compraId !== null && !dirty

  // ---- Mutadores de líneas ----
  function agregarProducto(producto: Producto, variante: ProductoVariante | null) {
    setLineas(prev => {
      const idx = prev.findIndex(
        l => l.producto_id === producto.id && l.variante_id === (variante?.id ?? null),
      )
      if (idx !== -1) {
        return prev.map((l, i) => (i === idx ? { ...l, cantidad_ordenada: l.cantidad_ordenada + 1 } : l))
      }
      const costo = variante ? variante.costo ?? producto.costo ?? 0 : producto.costo ?? 0
      const nueva: LineaUI = {
        key: nuevaKey(),
        producto_id: producto.id,
        variante_id: variante?.id ?? null,
        descripcion: variante ? `${producto.nombre} (${variante.nombre})` : producto.nombre,
        cantidad_ordenada: 1,
        costo_unitario: costo,
      }
      return [...prev, nueva]
    })
    marcarSucio()
  }

  function quitarLinea(key: string) {
    setLineas(prev => prev.filter(l => l.key !== key))
    marcarSucio()
  }

  function cambiarCantidad(key: string, valor: string) {
    const n = Math.floor(Number(valor))
    setLineas(prev =>
      prev.map(l => (l.key === key ? { ...l, cantidad_ordenada: Number.isFinite(n) && n > 0 ? n : 1 } : l)),
    )
    marcarSucio()
  }

  function cambiarCosto(key: string, texto: string) {
    setEditingCosto({ key, texto })
    const n = Math.max(0, parseMoneyInput(texto))
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, costo_unitario: n } : l)))
    marcarSucio()
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

  // ---- Proveedor ----
  function handleProveedorCreado(cliente: Cliente) {
    setProveedoresLocal(prev => [cliente, ...prev.filter(p => p.id !== cliente.id)])
    setProveedorId(cliente.id)
    setProveedorNuevoOpen(false)
    marcarSucio()
  }

  // ---- Acciones ----
  function handleGuardar() {
    if (!proveedorId) {
      setError('Elige un proveedor antes de guardar.')
      return
    }
    if (moneda === 'USD' && !(tasaCambio > 0)) {
      setError('La tasa de cambio debe ser mayor a cero para compras en USD.')
      return
    }
    setError('')
    startGuardar(async () => {
      const input: GuardarCompraInput = {
        id: compraId,
        proveedorId,
        moneda,
        tasaCambio: moneda === 'USD' ? tasaCambio : null,
        facturaProveedor: facturaProveedor.trim() || null,
        condicionPago,
        diasCredito: condicionPago === 'credito' ? diasCredito : 0,
        fecha,
        notas: notas.trim() || null,
        lineas: lineas.map(l => ({
          producto_id: l.producto_id,
          variante_id: l.variante_id,
          descripcion: l.descripcion,
          cantidad_ordenada: l.cantidad_ordenada,
          costo_unitario: l.costo_unitario,
        })),
      }
      const r = await guardarCompra(input)
      if (!r.ok || !r.data) {
        setError(r.ok ? ERROR_GENERICO : r.error)
        return
      }
      setDirty(false)
      if (compraId === null) {
        router.replace('/admin/compras/' + r.data.id)
      } else {
        // Los ids de compra_items cambiaron; se relee el server para que
        // RecepcionModal reciba los ids frescos y se refleje el nuevo estado.
        router.refresh()
      }
    })
  }

  function handleAnular() {
    if (!compraId) return
    const motivo = window.prompt('Motivo de la anulación:')
    if (motivo === null) return
    if (!motivo.trim()) {
      setError('Indica un motivo para anular.')
      return
    }
    setError('')
    startAnular(async () => {
      const r = await anularCompra(compraId, motivo.trim())
      if (!r.ok) {
        setError(r.error || ERROR_GENERICO)
        return
      }
      router.refresh()
    })
  }

  function handleImprimir() {
    if (!compraId) return
    window.open('/admin/compras/' + compraId + '/orden', '_blank')
  }

  const tasaMostrada = editandoTasa ? tasaTexto : valorMostrado(tasaCambio)

  // ---- Documento (encabezado + líneas + totales) ----
  const documento = (
    <section className={styles.docCol}>
      {/* Encabezado */}
      <div className={styles.cabecera}>
        <label className={styles.formLabel}>
          Proveedor *
          <div className={styles.proveedorRow}>
            <select
              value={proveedorId ?? ''}
              disabled={!editable}
              onChange={e => { setProveedorId(e.target.value || null); marcarSucio() }}
            >
              <option value="">Selecciona un proveedor…</option>
              {proveedoresLocal.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            {editable && (
              <button
                type="button"
                className={styles.btnAddProveedor}
                title="Nuevo proveedor"
                onClick={() => setProveedorNuevoOpen(true)}
              >
                ＋
              </button>
            )}
          </div>
        </label>

        <div className={styles.cabeceraRow}>
          <label className={styles.formLabel}>
            Moneda
            <div className={styles.monedaToggle}>
              <button
                type="button"
                className={styles.monedaBtn}
                aria-pressed={moneda === 'L'}
                disabled={!editable}
                onClick={() => { setMoneda('L'); marcarSucio() }}
              >
                L.
              </button>
              <button
                type="button"
                className={styles.monedaBtn}
                aria-pressed={moneda === 'USD'}
                disabled={!editable}
                onClick={() => { setMoneda('USD'); marcarSucio() }}
              >
                USD
              </button>
            </div>
          </label>
          {moneda === 'USD' && (
            <label className={styles.formLabel}>
              Tasa de cambio
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={tasaMostrada}
                disabled={!editable}
                onFocus={() => { setTasaTexto(valorMostrado(tasaCambio)); setEditandoTasa(true) }}
                onChange={e => { setTasaTexto(e.target.value); setTasaCambio(Math.max(0, parseMoneyInput(e.target.value))); marcarSucio() }}
                onBlur={() => setEditandoTasa(false)}
              />
            </label>
          )}
        </div>

        <div className={styles.cabeceraRow}>
          <label className={styles.formLabel}>
            Factura del proveedor
            <input
              type="text"
              value={facturaProveedor}
              disabled={!editable}
              onChange={e => { setFacturaProveedor(e.target.value); marcarSucio() }}
            />
          </label>
          <label className={styles.formLabel}>
            Fecha
            <input
              type="date"
              value={fecha}
              disabled={!editable}
              onChange={e => { setFecha(e.target.value); marcarSucio() }}
            />
          </label>
        </div>

        <div className={styles.cabeceraRow}>
          <label className={styles.formLabel}>
            Condición
            <select
              value={condicionPago}
              disabled={!editable}
              onChange={e => { setCondicionPago(e.target.value as CondicionPago); marcarSucio() }}
            >
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </label>
          {condicionPago === 'credito' && (
            <label className={styles.formLabel}>
              Días de crédito
              <input
                type="number"
                min={0}
                step="1"
                value={diasCredito}
                disabled={!editable}
                onChange={e => { const n = Math.floor(Number(e.target.value)); setDiasCredito(Number.isFinite(n) && n >= 0 ? n : 0); marcarSucio() }}
              />
            </label>
          )}
        </div>

        <label className={styles.formLabel}>
          Notas
          <textarea
            rows={2}
            value={notas}
            disabled={!editable}
            onChange={e => { setNotas(e.target.value); marcarSucio() }}
          />
        </label>
      </div>

      {/* Líneas */}
      <div className={styles.lineasList}>
        {editable ? (
          lineas.length === 0 ? (
            <div className={styles.empty}>Agrega productos desde el catálogo.</div>
          ) : (
            lineas.map(l => {
              const costoValor = editingCosto?.key === l.key ? editingCosto.texto : valorMostrado(l.costo_unitario)
              return (
                <div key={l.key} className={styles.lineaRow}>
                  <div className={styles.lineaDesc}>
                    <div className={styles.lineaNombre}>{l.descripcion}</div>
                  </div>
                  <div className={styles.lineaAcciones}>
                    <button
                      type="button"
                      className="btnMerlinIcon btnMerlinIconDanger"
                      onClick={() => quitarLinea(l.key)}
                      aria-label="Quitar línea"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.lineaCampos}>
                    <input
                      type="number"
                      className={styles.qtyInput}
                      min={1}
                      step="1"
                      value={l.cantidad_ordenada}
                      onChange={e => cambiarCantidad(l.key, e.target.value)}
                      aria-label="Cantidad ordenada"
                    />
                    <span className={styles.campoLabel}>×</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={styles.costoInput}
                      placeholder="0.00"
                      value={costoValor}
                      onFocus={() => setEditingCosto({ key: l.key, texto: valorMostrado(l.costo_unitario) })}
                      onChange={e => cambiarCosto(l.key, e.target.value)}
                      onBlur={() => setEditingCosto(null)}
                      aria-label="Costo unitario"
                    />
                    <span className={styles.lineaSubtotal}>
                      {formatMoneda(round2(l.cantidad_ordenada * l.costo_unitario), moneda)}
                    </span>
                  </div>
                </div>
              )
            })
          )
        ) : compra && compra.items.length > 0 ? (
          compra.items.map(it => (
            <div key={it.id} className={styles.lineaRow}>
              <div className={styles.lineaDesc}>
                <div className={styles.lineaNombre}>{it.descripcion}</div>
                <div className={styles.recepcionPendiente}>
                  Recibido: {it.cantidad_recibida} / {it.cantidad_ordenada}
                </div>
              </div>
              <div className={styles.lineaAcciones} />
              <div className={styles.lineaCampos}>
                <span className={styles.campoLabel}>{it.cantidad_ordenada} ×</span>
                <span className={styles.campoLabel}>{formatMoneda(it.costo_unitario, moneda)}</span>
                <span className={styles.lineaSubtotal}>
                  {formatMoneda(round2(it.cantidad_ordenada * it.costo_unitario), moneda)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.empty}>Esta compra no tiene líneas.</div>
        )}
      </div>

      {/* Totales */}
      <div className={styles.totalesPanel}>
        {moneda === 'USD' && (
          <>
            <div className={styles.totalesRow}>
              <span>Subtotal (USD)</span>
              <span>{formatMoneda(subtotalMoneda, 'USD')}</span>
            </div>
            <div className={styles.totalesRow}>
              <span>Tasa</span>
              <span>{tasaCambio > 0 ? tasaCambio : '—'}</span>
            </div>
          </>
        )}
        <div className={styles.totalesRowTotal}>
          <span>Total</span>
          <span>{formatPrice(totalLempiras)}</span>
        </div>
      </div>
    </section>
  )

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={`${styles.btnAccion} btnMerlinTertiary`} onClick={() => router.push('/admin/compras')}>
            ← Volver
          </button>
          <div>
            <h1 className={styles.title}>{compra ? `Compra ${compra.numero}` : 'Nueva compra'}</h1>
            {estado && (
              <span className={`${styles.badge} ${ESTADO_BADGE[estado]}`}>{ESTADO_LABEL[estado]}</span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          {puedeImprimir && (
            <button type="button" className={`btnMerlinSecondary ${styles.btnAccion}`} onClick={handleImprimir}>
              Imprimir orden
            </button>
          )}
          {puedeAnular && (
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnAccion}`}
              onClick={handleAnular}
              disabled={anulandoPend}
            >
              {anulandoPend ? 'Anulando…' : 'Anular'}
            </button>
          )}
          {puedeRecibir && (
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnAccion}`}
              onClick={() => setRecepcionOpen(true)}
            >
              Recibir
            </button>
          )}
          {editable && (
            <button
              type="button"
              className={`btnMerlinPrimary ${styles.btnAccion}`}
              onClick={handleGuardar}
              disabled={!puedeGuardar}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {!editable && estado && (
        <div className={styles.readonlyBanner}>
          Esta compra está en estado &laquo;{ESTADO_LABEL[estado]}&raquo; y ya no se puede editar.
        </div>
      )}

      {editable ? (
        <div className={styles.grid}>
          <section className={styles.catalogoCol}>
            <div className={styles.searchRow}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por nombre o escanear SKU…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {productosFiltrados.length === 0 ? (
              <div className={styles.empty}>
                {productos.length === 0 ? 'No hay productos activos.' : 'Sin resultados.'}
              </div>
            ) : (
              <div className={styles.catalogoGrid}>
                {productosFiltrados.map(p => {
                  const activas = variantesActivasDe(p)
                  const costoMin = activas.length > 0
                    ? Math.min(...activas.map(v => v.costo ?? p.costo ?? 0))
                    : p.costo ?? 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={styles.prodCard}
                      onClick={() => handleProductoClick(p)}
                    >
                      <div className={styles.prodNombre}>{p.nombre}</div>
                      <div className={styles.prodCosto}>Costo: {formatPrice(costoMin)}</div>
                      {p.sku && <div className={styles.prodSku}>{p.sku}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
          {documento}
        </div>
      ) : (
        documento
      )}

      {cxp && <CompraCxpBlock cxp={cxp} />}

      {/* ---- Modales ---- */}
      {varianteModal && (
        <Modal title={`Elige variante — ${varianteModal.nombre}`} onClose={() => setVarianteModal(null)}>
          <div className={styles.varianteList}>
            {variantesActivasDe(varianteModal).map(v => (
              <button
                key={v.id}
                type="button"
                className={styles.varianteOption}
                onClick={() => {
                  agregarProducto(varianteModal, v)
                  setVarianteModal(null)
                }}
              >
                <span>{v.nombre}</span>
                <span>{formatPrice(v.costo ?? varianteModal.costo ?? 0)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {proveedorNuevoOpen && (
        <ProveedorNuevoModal onCreado={handleProveedorCreado} onCerrar={() => setProveedorNuevoOpen(false)} />
      )}

      {recepcionOpen && compra && (
        <RecepcionModal
          compraId={compra.id}
          items={compra.items}
          onClose={() => setRecepcionOpen(false)}
          onRecibido={() => { setRecepcionOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ---- Modal de alta rápida de proveedor. Reusa la creación de contacto
// (crearClienteDesdePos devuelve el registro creado para poder seleccionarlo)
// forzando el rol es_proveedor=true; ver app/admin/clientes/actions.ts para la
// forma del payload. ----
const PROVEEDOR_FORM_INICIAL: ClienteForm = {
  nombre: '',
  rtn: '',
  identidad: '',
  tipo_cliente: 'final',
  exonerado: false,
  constancia_exonerado: '',
  registro_sag: '',
  direccion: '',
  telefono: '',
  correo: '',
  notas: '',
  es_cliente: false,
  es_proveedor: true,
  contacto: '',
  dias_credito: 0,
}

function ProveedorNuevoModal({
  onCreado,
  onCerrar,
}: {
  onCreado: (cliente: Cliente) => void
  onCerrar: () => void
}) {
  const [form, setForm] = useState<ClienteForm>(PROVEEDOR_FORM_INICIAL)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) {
      setError('El nombre es requerido.')
      return
    }
    setError('')
    startTransition(async () => {
      const r = await crearClienteDesdePos({ ...form, es_proveedor: true, es_cliente: false })
      if (!r.ok || !r.data) {
        setError(r.ok ? ERROR_GENERICO : r.error)
        return
      }
      onCreado(r.data.cliente)
    })
  }

  return (
    <Modal title="Nuevo proveedor" onClose={onCerrar}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.formLabel}>
          Nombre *
          <input
            type="text"
            value={form.nombre}
            onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
            autoFocus
            disabled={isPending}
          />
        </label>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            RTN
            <input
              type="text"
              value={form.rtn}
              onChange={e => setForm(p => ({ ...p, rtn: e.target.value }))}
              placeholder="14 dígitos"
              disabled={isPending}
            />
          </label>
          <label className={styles.formLabel}>
            Teléfono
            <input
              type="text"
              value={form.telefono}
              onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
              disabled={isPending}
            />
          </label>
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Persona de contacto
            <input
              type="text"
              value={form.contacto}
              onChange={e => setForm(p => ({ ...p, contacto: e.target.value }))}
              disabled={isPending}
            />
          </label>
          <label className={styles.formLabel}>
            Días de crédito
            <input
              type="number"
              min={0}
              step="1"
              value={form.dias_credito}
              onChange={e => setForm(p => ({ ...p, dias_credito: Math.max(0, Math.floor(Number(e.target.value)) || 0) }))}
              disabled={isPending}
            />
          </label>
        </div>

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onCerrar} disabled={isPending}>
            Cancelar
          </button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`} disabled={isPending}>
            {isPending ? 'Creando…' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
