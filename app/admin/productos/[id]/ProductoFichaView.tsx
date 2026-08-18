'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import ProductoFields, { productoAForm } from '@/components/admin/ProductoFields'
import { stockEfectivo } from '@/lib/store/variantes'
import { etiquetaTipoMovimiento } from '@/lib/inventario/kardex'
import { numeroDocumento } from '@/lib/pos/documentos'
import { numeroDocumentoDevolucion } from '@/lib/pos/devoluciones'
import { formatPrice } from '@/lib/store/format'
import type { Categoria, MovimientoInventario, Producto, ProductoForm, ProductoVariante } from '@/types'
import type { VentaFila } from './page'
import { updateProducto, obtenerHistorialCosto } from '../actions'
import styles from './ficha.module.css'

interface Props {
  producto: Producto
  variantes: ProductoVariante[]
  movimientos: MovimientoInventario[]
  ventas: VentaFila[]
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
}

const CANAL_LABEL: Record<Producto['canal'], string> = {
  tienda: 'Tienda',
  mostrador: 'Mostrador',
  ambas: 'Ambas',
}

const ISV_LABEL: Record<Producto['isv'], string> = {
  '15': '15%',
  '18': '18%',
  exento: 'Exento',
}

// La consulta de ventas filtra `documento_items` solo por `producto_id`, sin
// filtro de tipo de documento: `emitir_nota_credito` reinserta los ítems
// devueltos en la misma tabla, así que una nota de crédito o una devolución
// del producto también aparecen aquí — igual que en `documentos` de la ficha
// de cliente. Por eso no se puede castear a `{ tipo: 'factura' | 'comprobante' }`
// y llamar siempre a `numeroDocumento`: nota_credito no tiene
// `numero_comprobante` (saldría siempre "C-00000000") y devolucion tiene su
// propia secuencia (`devolucion_numero_seq`) que PISARÍA el número real de un
// comprobante de venta distinto. Se ramifica por tipo, mismo criterio que
// ClienteFichaView.tsx.
const TIPO_LABEL: Record<VentaFila['documento']['tipo'], string> = {
  factura: 'Factura',
  comprobante: 'Comprobante',
  nota_credito: 'Nota de crédito',
  devolucion: 'Devolución',
}

function numeroDoc(d: VentaFila['documento']): string {
  if (d.tipo === 'nota_credito' || d.tipo === 'devolucion') return numeroDocumentoDevolucion(d)
  return numeroDocumento({ tipo: d.tipo, correlativo: d.correlativo, numero_comprobante: d.numero_comprobante })
}

// `created_at` es un timestamp real (con hora); Vercel corre en UTC, así que
// la zona horaria explícita es obligatoria para no correr la hora 6h.
function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Color por el signo real de `cantidad` (no por la `direccion` genérica de
// `etiquetaTipoMovimiento`): un mismo tipo puede entrar o salir según el
// caso concreto. Mismo criterio que MovimientosItemView.tsx.
function claseCantidad(cantidad: number): string {
  if (cantidad > 0) return styles.cantidadPositiva
  if (cantidad < 0) return styles.cantidadNegativa
  return styles.cantidadNeutra
}

export default function ProductoFichaView({
  producto,
  variantes,
  movimientos,
  ventas,
  categorias,
  subcategorias,
}: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<ProductoForm>(() => productoAForm({ ...producto, producto_variantes: variantes }))
  const [formError, setFormError] = useState('')
  const [historialCosto, setHistorialCosto] = useState(false)
  const [historialCostoVariantes, setHistorialCostoVariantes] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // Producto "completo" (con las variantes releídas aparte) que necesitan
  // tanto `productoAForm` como `ProductoFields` (vía la prop `producto`, para
  // decidir delta de stock vs. cambio de modalidad) — ver
  // components/admin/ProductoFields.tsx.
  const productoConVariantes: Producto = { ...producto, producto_variantes: variantes }

  const variantesActivas = variantes.filter(v => v.activo)
  const stock = stockEfectivo(producto.stock, variantesActivas)
  const stockBajo = producto.stock_minimo != null && stock != null && stock <= producto.stock_minimo

  function abrirEdicion() {
    setForm(productoAForm(productoConVariantes))
    setFormError('')
    setHistorialCosto(false)
    setHistorialCostoVariantes(new Set())
    setEditando(true)
    const varianteIds = variantes.map(v => v.id)
    obtenerHistorialCosto(producto.id, varianteIds).then(({ producto: p, variantes: vs }) => {
      setHistorialCosto(p)
      setHistorialCostoVariantes(new Set(vs))
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    if (form.precio <= 0) { setFormError('El precio debe ser mayor a 0'); return }
    startTransition(async () => {
      const result = await updateProducto(producto.id, form)
      if (result.error) { setFormError(result.error); return }
      if (result.aviso) alert(result.aviso)
      setEditando(false)
      router.refresh()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>{producto.nombre}</h1>
          <p className={styles.subtitle}>
            {producto.sku ?? 'Sin SKU'}
            {producto.marca && ` · ${producto.marca}`}
            {!producto.activo && ' · Inactivo'}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/productos" className={`${styles.btn} btnMerlinSecondary`}>
            ← Productos
          </Link>
          <button type="button" className={`${styles.btn} btnMerlinPrimary`} onClick={abrirEdicion}>
            Editar
          </button>
        </div>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Identidad</h2>
        <div className={styles.grid}>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>SKU</span>
            <span className={styles.datoValor}>{producto.sku ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Marca</span>
            <span className={styles.datoValor}>{producto.marca ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Categoría</span>
            <span className={styles.datoValor}>{producto.categorias?.valor ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Subcategoría</span>
            <span className={styles.datoValor}>{producto.subcategorias?.valor ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Género</span>
            <span className={styles.datoValor}>{producto.genero || '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Canal</span>
            <span className={styles.datoValor}>{CANAL_LABEL[producto.canal]}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Slug</span>
            <span className={styles.datoValor}>{producto.slug}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Activo</span>
            <span className={styles.datoValor}>{producto.activo ? 'Sí' : 'No'}</span>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Precios</h2>
        <div className={styles.grid}>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Precio</span>
            <span className={styles.datoValor}>{formatPrice(producto.precio)}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Precio original</span>
            <span className={styles.datoValor}>
              {producto.precio_original != null ? formatPrice(producto.precio_original) : '—'}
            </span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Costo</span>
            <span className={styles.datoValor}>{producto.costo != null ? formatPrice(producto.costo) : '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Precio revendedor</span>
            <span className={styles.datoValor}>
              {producto.precio_revendedor != null ? formatPrice(producto.precio_revendedor) : 'No aplica'}
            </span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>ISV</span>
            <span className={styles.datoValor}>{ISV_LABEL[producto.isv]}</span>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Stock</h2>
        <div className={styles.grid}>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Stock efectivo</span>
            {/* `stockEfectivo` devuelve `number | null`; `null` significa
                ILIMITADO (nunca se agota), no 0 — mostrarlo como "0" diría
                "agotado" de algo que nunca se agota. */}
            <span className={`${styles.datoValor} ${stockBajo ? styles.stockBajo : ''}`}>
              {stock === null ? 'Ilimitado' : stock}
            </span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Stock mínimo</span>
            <span className={styles.datoValor}>{producto.stock_minimo ?? '—'}</span>
          </div>
        </div>
        {/* El aviso de stock bajo solo aplica si hay stock_minimo configurado
            Y el stock efectivo no es null (ilimitado nunca está "bajo"). */}
        {stockBajo && <p className={styles.aviso}>Stock igual o por debajo del mínimo configurado.</p>}
      </section>

      {variantes.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Variantes</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>SKU</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Activa</th>
                </tr>
              </thead>
              <tbody>
                {variantes.map(v => (
                  <tr key={v.id}>
                    <td>{v.nombre}</td>
                    <td>{v.sku ?? '—'}</td>
                    <td>{v.precio != null ? formatPrice(Number(v.precio)) : 'Hereda'}</td>
                    <td>{v.stock === null ? 'Ilimitado' : v.stock}</td>
                    <td>
                      <span className={v.activo ? styles.badgeEmitido : styles.badgeAnulado}>
                        {v.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Movimientos recientes</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => (
                <tr key={m.id}>
                  <td>{formatFechaHora(m.created_at)}</td>
                  <td>{etiquetaTipoMovimiento(m.tipo).nombre}</td>
                  <td className={claseCantidad(m.cantidad)}>
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </td>
                  <td>{m.notas || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movimientos.length === 0 && (
            <div className={styles.empty}>Este producto no tiene movimientos registrados.</div>
          )}
        </div>
        <Link href={`/admin/productos/${producto.id}/movimientos`} className={styles.verTodo}>
          Ver kardex completo →
        </Link>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Ventas recientes</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Cantidad</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map(v => (
                <tr key={`${v.documentoId}-${v.documento.id}`}>
                  <td>
                    <Link href={`/admin/pos/documento/${v.documento.id}`} className={styles.numeroLink}>
                      {numeroDoc(v.documento)}
                    </Link>
                  </td>
                  <td>{TIPO_LABEL[v.documento.tipo]}</td>
                  <td>{formatFechaHora(v.documento.created_at)}</td>
                  <td>
                    <span className={v.documento.estado === 'anulado' ? styles.badgeAnulado : styles.badgeEmitido}>
                      {v.documento.estado === 'anulado' ? 'Anulado' : 'Emitido'}
                    </span>
                  </td>
                  <td>{v.cantidad}</td>
                  <td>{formatPrice(v.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ventas.length === 0 && (
            <div className={styles.empty}>Este producto no tiene ventas registradas.</div>
          )}
        </div>
      </section>

      {editando && (
        <Modal title="Editar producto" onClose={() => setEditando(false)} maxWidth="760px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <ProductoFields
              form={form}
              setForm={setForm}
              categorias={categorias}
              subcategorias={subcategorias}
              modo="completo"
              producto={productoConVariantes}
              historialCosto={historialCosto}
              historialCostoVariantes={historialCostoVariantes}
              layout="modal"
            />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button type="submit" className={`${styles.btn} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
