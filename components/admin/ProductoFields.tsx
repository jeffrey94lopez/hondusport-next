'use client'
import { useMemo } from 'react'
import ImageUpload from './ImageUpload'
import Toggle from './Toggle'
import type { Producto, ProductoForm, Categoria } from '@/types'
import { slugify } from '@/lib/store/slug'
import styles from '@/app/admin/productos/productos.module.css'

export function productoAForm(p: Producto): ProductoForm {
  return {
    nombre: p.nombre,
    slug: p.slug,
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
  }
}

interface Props {
  form: ProductoForm
  setForm: React.Dispatch<React.SetStateAction<ProductoForm>>
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
  modo?: 'completo' | 'rapido'
}

export default function ProductoFields({ form, setForm, categorias, subcategorias, modo = 'completo' }: Props) {
  const completo = modo === 'completo'

  const f = (field: keyof ProductoForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const subcategoriasDisponibles = useMemo(() => {
    if (!form.categoria_id) return []
    // categorias_padre guarda IDs de la categoria padre (no nombres).
    return subcategorias.filter(s => s.categorias_padre?.includes(form.categoria_id!))
  }, [subcategorias, form.categoria_id])

  function handleNombreChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nombre = e.target.value
    setForm(prev => {
      const autoPrev = slugify(prev.nombre)
      // si el slug estaba vacio o seguia al nombre, se re-autogenera
      const slug = !prev.slug || prev.slug === autoPrev ? slugify(nombre) : prev.slug
      return { ...prev, nombre, slug }
    })
  }

  function handleCategoriaChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const categoria_id = e.target.value || null
    setForm(prev => ({
      ...prev,
      categoria_id,
      subcategoria_id: subcategorias.some(
        s => s.id === prev.subcategoria_id && s.categorias_padre?.includes(categoria_id ?? '')
      )
        ? prev.subcategoria_id
        : null,
    }))
  }

  return (
    <>
      {completo && (
        <>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              Nombre *
              <input type="text" value={form.nombre} onChange={handleNombreChange} required />
            </label>
            <label className={styles.formLabel}>
              SKU / Código
              <input type="text" value={form.sku} onChange={f('sku')} />
            </label>
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              Slug (URL)
              <input type="text" value={form.slug} onChange={f('slug')} placeholder="camiseta-roja" />
              <small>Se usa en la URL del producto: /producto/{form.slug || '…'}</small>
            </label>
          </div>
        </>
      )}
      {completo ? (
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
      ) : (
        <label className={styles.formLabel}>
          Precio (L.) *
          <input type="number" value={form.precio} min="0" step="0.01" required
            onChange={e => setForm(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))} />
        </label>
      )}
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
      {completo && (
        <>
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
        </>
      )}
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
      {completo && (
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
      )}
    </>
  )
}
