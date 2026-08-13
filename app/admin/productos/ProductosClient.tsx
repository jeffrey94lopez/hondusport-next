'use client'
import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import ProductoFields, { productoAForm } from '@/components/admin/ProductoFields'
import ImportarPlantilla from '@/components/admin/ImportarPlantilla'
import type { Producto, Categoria, ProductoForm } from '@/types'
import type { ImportError } from '@/lib/store/inventoryRoundtrip'
import { stockEfectivo } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'
import {
  createProducto,
  updateProducto,
  deleteProducto,
  toggleProductoActivo,
  obtenerHistorialCosto,
} from './actions'
import styles from './productos.module.css'

interface Props {
  productos: Producto[]
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
}

const EMPTY_FORM: ProductoForm = {
  nombre: '',
  slug: '',
  descripcion: '',
  precio: 0,
  precio_original: null,
  categoria_id: null,
  subcategoria_id: null,
  stock: null,
  genero: '',
  badge: '',
  tallas: '',
  colores: '',
  marca: '',
  sku: '',
  imagenes: [],
  personalizable: false,
  canal: 'ambas',
  isv: '15',
  costo: null,
  precio_revendedor: null,
  stock_minimo: null,
  activo: true,
  variantes: [],
  costoEntrada: null,
}

const CANAL_LABEL: Record<Producto['canal'], string> = {
  tienda: 'Tienda',
  mostrador: 'Mostrador',
  ambas: 'Ambas',
}

export default function ProductosClient({ productos, categorias, subcategorias }: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState<ProductoForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [historialCosto, setHistorialCosto] = useState(false)
  const [historialCostoVariantes, setHistorialCostoVariantes] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<
    | { tipo: 'ok'; actualizados: number; creados: number; variantesActualizadas: number; variantesCreadas: number; movimientos: number }
    | { tipo: 'error'; mensaje: string; errores?: ImportError[] }
    | null
  >(null)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/inventario/import', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) {
        setResultado({ tipo: 'error', mensaje: json.error ?? 'Error al importar', errores: json.errores })
        return
      }
      setResultado({
        tipo: 'ok',
        actualizados: json.actualizados,
        creados: json.creados,
        variantesActualizadas: json.variantesActualizadas ?? 0,
        variantesCreadas: json.variantesCreadas ?? 0,
        movimientos: json.movimientos ?? 0,
      })
    } catch {
      setResultado({ tipo: 'error', mensaje: 'No se pudo importar (error de red o del servidor).' })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  function cerrarResultado() {
    const exito = resultado?.tipo === 'ok'
    setResultado(null)
    if (exito) window.location.reload()
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return productos
    const q = search.toLowerCase()
    return productos.filter(
      p =>
        p.nombre.toLowerCase().includes(q) ||
        p.marca?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    )
  }, [productos, search])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setHistorialCosto(false)
    setHistorialCostoVariantes(new Set())
    setModal('create')
  }

  function openEdit(p: Producto) {
    setForm(productoAForm(p))
    setFormError('')
    setEditing(p)
    setHistorialCosto(false)
    setHistorialCostoVariantes(new Set())
    setModal('edit')
    const varianteIds = (p.producto_variantes ?? []).map(v => v.id)
    obtenerHistorialCosto(p.id, varianteIds).then(({ producto, variantes }) => {
      setHistorialCosto(producto)
      setHistorialCostoVariantes(new Set(variantes))
    })
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      await toggleProductoActivo(id, activo)
    })
  }

  function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const result = await deleteProducto(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    if (form.precio <= 0) { setFormError('El precio debe ser mayor a 0'); return }

    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateProducto(editing.id, form)
        : await createProducto(form)
      if (result.error) { setFormError(result.error); return }
      if (result.aviso) alert(result.aviso)
      closeModal()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Productos</h1>
          <p className={styles.subtitle}>{filtered.length} de {productos.length} productos</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, marca o SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <a href="/api/inventario/export" className={styles.btnSecondary}>↓ Descargar inventario</a>
          <label className={`${styles.btnSecondary} ${importing ? styles.importing : ''}`}>
            {importing ? 'Importando…' : '↑ Importar inventario'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              style={{ display: 'none' }}
              disabled={importing}
            />
          </label>
          <ImportarPlantilla />
          <Link href="/admin/productos/carrusel" className={styles.btnSecondary}>Modo carrusel</Link>
          <button className={`${styles.btnPrimary} btnMerlinPrimary`} onClick={openCreate}>
            + Nuevo producto
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Img</th>
              <th>Nombre</th>
              <th>SKU</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const stock = stockEfectivo(p.stock, (p.producto_variantes ?? []).filter(v => v.activo))
              const stockBajo = p.stock_minimo != null && stock != null && stock <= p.stock_minimo
              const stockLow = stock !== null && stock < 5
              const thumb = p.imagenes?.[0]
              return (
              <tr key={p.id} className={stockBajo ? styles.rowWarning : undefined}>
                <td className={styles.thumbCell}>
                  {thumb ? (
                    <img src={thumb} alt="" className={styles.thumb} />
                  ) : (
                    <div className={styles.thumbPlaceholder} />
                  )}
                </td>
                <td>
                  <div className={styles.productName}>
                    {p.nombre}
                    <span className={styles.canalBadge} data-canal={p.canal}>{CANAL_LABEL[p.canal]}</span>
                  </div>
                  {p.marca && <div className={styles.productMeta}>{p.marca}</div>}
                </td>
                <td className={styles.skuCell}>{p.sku ?? '—'}</td>
                <td>{p.categorias?.valor ?? '—'}</td>
                <td>
                  <div className={styles.precio}>{formatPrice(p.precio)}</div>
                  {p.precio_original && (
                    <div className={styles.precioOriginal}>{formatPrice(p.precio_original)}</div>
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.stockBadge} ${stockBajo ? styles.stockBadgeAlert : stockLow ? styles.stockLow : ''}`}
                    title={stockBajo ? 'Stock igual o por debajo del mínimo' : undefined}
                  >
                    {stock ?? '∞'}
                  </span>
                  {p.producto_variantes && p.producto_variantes.length > 0 && (
                    <span className={styles.productMeta}> · {p.producto_variantes.length} var.</span>
                  )}
                </td>
                <td>
                  <Toggle
                    checked={p.activo}
                    onChange={checked => handleToggle(p.id, checked)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(p)}>Editar</button>
                    <Link href={`/admin/productos/${p.id}/movimientos`} className={styles.btnKardex}>
                      Kardex
                    </Link>
                    <button className={styles.btnDelete} onClick={() => handleDelete(p.id, p.nombre)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {search ? `No hay productos que coincidan con "${search}"` : 'No hay productos aún.'}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar producto' : 'Nuevo producto'}
          onClose={closeModal}
          maxWidth="640px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <ProductoFields
              form={form}
              setForm={setForm}
              categorias={categorias}
              subcategorias={subcategorias}
              modo="completo"
              producto={editing}
              historialCosto={historialCosto}
              historialCostoVariantes={historialCostoVariantes}
            />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={`${styles.btnPrimary} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resultado && (
        <Modal
          title={resultado.tipo === 'ok' ? 'Importación completada' : 'No se importó'}
          onClose={cerrarResultado}
          maxWidth="560px"
        >
          {resultado.tipo === 'ok' ? (
            <p>
              ✓ {resultado.actualizados} actualizados, {resultado.creados} creados.
              {(resultado.variantesActualizadas > 0 || resultado.variantesCreadas > 0) && (
                <> {resultado.variantesActualizadas} variantes actualizadas, {resultado.variantesCreadas} creadas.</>
              )}
              {resultado.movimientos > 0 && (
                <> {resultado.movimientos} movimiento{resultado.movimientos === 1 ? '' : 's'} de inventario registrado{resultado.movimientos === 1 ? '' : 's'}.</>
              )}
            </p>
          ) : (
            <div>
              <p>{resultado.mensaje}</p>
              {resultado.errores && resultado.errores.length > 0 && (
                <ul>
                  {resultado.errores.map((er, i) => (
                    <li key={i}>Pestaña {er.pestaña}, fila {er.fila}: {er.motivo}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <button className={`${styles.btnPrimary} btnMerlinPrimary`} onClick={cerrarResultado}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
