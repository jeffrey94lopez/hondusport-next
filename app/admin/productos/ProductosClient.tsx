'use client'
import { useState, useTransition, useMemo } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import ImageUpload from '@/components/admin/ImageUpload'
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
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: p.precio,
      precio_original: p.precio_original,
      categoria_id: p.categoria_id,
      subcategoria_id: p.subcategoria_id,
      stock: p.stock,
      genero: p.genero ?? '',
      badge: p.badge ?? '',
      tallas: p.tallas?.join(', ') ?? '',
      colores: p.colores?.join(', ') ?? '',
      marca: p.marca ?? '',
      sku: p.sku ?? '',
      imagenes: p.imagenes ?? [],
      personalizable: p.personalizable,
      activo: p.activo,
    })
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

  const f = (field: keyof ProductoForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const subcategoriasDisponibles = useMemo(() => {
    const categoriaValor = categorias.find(c => c.id === form.categoria_id)?.valor
    if (!categoriaValor) return []
    return subcategorias.filter(s => s.categorias_padre?.includes(categoriaValor))
  }, [categorias, subcategorias, form.categoria_id])

  function handleCategoriaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const categoria_id = e.target.value || null
    const categoriaValor = categorias.find(c => c.id === categoria_id)?.valor
    setForm(prev => ({
      ...prev,
      categoria_id,
      subcategoria_id: subcategorias.some(
        s => s.id === prev.subcategoria_id && s.categorias_padre?.includes(categoriaValor ?? '')
      )
        ? prev.subcategoria_id
        : null,
    }))
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
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Nombre *
                <input type="text" value={form.nombre} onChange={f('nombre')} required />
              </label>
              <label className={styles.formLabel}>
                SKU / Código
                <input type="text" value={form.sku} onChange={f('sku')} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Precio (L.) *
                <input
                  type="number"
                  value={form.precio}
                  onChange={e => setForm(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label className={styles.formLabel}>
                Precio original (L.)
                <input
                  type="number"
                  value={form.precio_original ?? ''}
                  onChange={e => setForm(p => ({ ...p, precio_original: e.target.value ? parseFloat(e.target.value) : null }))}
                  min="0"
                  step="0.01"
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Categoría
                <select value={form.categoria_id ?? ''} onChange={handleCategoriaChange}>
                  <option value="">— Sin categoría —</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.valor}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formLabel}>
                Subcategoría
                <select
                  value={form.subcategoria_id ?? ''}
                  onChange={e => setForm(p => ({ ...p, subcategoria_id: e.target.value || null }))}
                  disabled={subcategoriasDisponibles.length === 0}
                >
                  <option value="">— Sin subcategoría —</option>
                  {subcategoriasDisponibles.map(s => (
                    <option key={s.id} value={s.id}>{s.valor}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Stock (vacío = ilimitado)
                <input
                  type="number"
                  value={form.stock ?? ''}
                  onChange={e => setForm(p => ({ ...p, stock: e.target.value ? parseInt(e.target.value) : null }))}
                  min="0"
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Género
                <select value={form.genero} onChange={f('genero')}>
                  <option value="">— Sin género —</option>
                  <option value="Hombre">Hombre</option>
                  <option value="Mujer">Mujer</option>
                  <option value="Unisex">Unisex</option>
                  <option value="Niños">Niños</option>
                </select>
              </label>
              <label className={styles.formLabel}>
                Badge
                <select value={form.badge} onChange={f('badge')}>
                  <option value="">— Sin badge —</option>
                  <option value="Oferta">Oferta</option>
                  <option value="Nuevo">Nuevo</option>
                  <option value="Más Vendido">Más Vendido</option>
                </select>
              </label>
            </div>
            <label className={styles.formLabel}>
              Marca
              <input type="text" value={form.marca} onChange={f('marca')} />
            </label>
            <label className={styles.formLabel}>
              Tallas (separadas por coma)
              <input type="text" value={form.tallas} onChange={f('tallas')} placeholder="S, M, L, XL, XXL" />
            </label>
            <label className={styles.formLabel}>
              Colores (separados por coma)
              <input type="text" value={form.colores} onChange={f('colores')} placeholder="Rojo, Azul, Negro" />
            </label>
            <div className={styles.formLabel}>
              Imágenes
              <div className={styles.imagesGrid}>
                {form.imagenes.map((url, idx) => (
                  <div key={url} className={styles.imageThumb}>
                    <img src={url} alt={`Imagen ${idx + 1}`} />
                    <button
                      type="button"
                      className={styles.imageRemove}
                      onClick={() => setForm(p => ({ ...p, imagenes: p.imagenes.filter((_, i) => i !== idx) }))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <ImageUpload
                  bucket="productos"
                  value=""
                  label=""
                  onChange={url => url && setForm(p => ({ ...p, imagenes: [...p.imagenes, url] }))}
                />
              </div>
            </div>
            <label className={styles.formLabel}>
              Descripción
              <textarea value={form.descripcion} onChange={f('descripcion')} rows={3} />
            </label>
            <div className={styles.formChecks}>
              <Toggle
                checked={form.personalizable}
                onChange={v => setForm(p => ({ ...p, personalizable: v }))}
                label="Personalizable"
              />
              <Toggle
                checked={form.activo}
                onChange={v => setForm(p => ({ ...p, activo: v }))}
                label="Activo"
              />
            </div>
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
