'use client'
import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import ProductoFields, { productoAForm } from '@/components/admin/ProductoFields'
import type { Producto, Categoria, ProductoForm } from '@/types'
import {
  createProducto,
  updateProducto,
  deleteProducto,
  toggleProductoActivo,
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
  activo: true,
}

export default function ProductosClient({ productos, categorias, subcategorias }: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState<ProductoForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [importing, setImporting] = useState(false)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const json = await res.json()
      if (json.error) { alert('Error: ' + json.error); return }
      alert(`✓ Importados ${json.imported} productos`)
      window.location.reload()
    } finally {
      setImporting(false)
      e.target.value = ''
    }
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
    setModal('create')
  }

  function openEdit(p: Producto) {
    setForm(productoAForm(p))
    setFormError('')
    setEditing(p)
    setModal('edit')
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
          <input
            type="text"
            placeholder="Buscar por nombre, marca o SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.search}
          />
          <label className={`${styles.btnSecondary} ${importing ? styles.importing : ''}`}>
            {importing ? 'Importando…' : '↑ Importar XLSX'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              style={{ display: 'none' }}
              disabled={importing}
            />
          </label>
          <Link href="/admin/productos/carrusel" className={styles.btnSecondary}>Modo carrusel</Link>
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Nuevo producto
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Categoría</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>
                  <div className={styles.productName}>{p.nombre}</div>
                  {p.marca && <div className={styles.productMeta}>{p.marca}</div>}
                </td>
                <td>
                  <div className={styles.precio}>L. {p.precio.toLocaleString()}</div>
                  {p.precio_original && (
                    <div className={styles.precioOriginal}>L. {p.precio_original.toLocaleString()}</div>
                  )}
                </td>
                <td>
                  <span className={p.stock !== null && p.stock < 5 ? styles.stockLow : ''}>
                    {p.stock ?? '∞'}
                  </span>
                </td>
                <td>{p.categorias?.valor ?? '—'}</td>
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
                    <button className={styles.btnDelete} onClick={() => handleDelete(p.id, p.nombre)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
            <ProductoFields form={form} setForm={setForm} categorias={categorias} subcategorias={subcategorias} modo="completo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
