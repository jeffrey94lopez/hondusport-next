'use client'
import { useMemo } from 'react'
import ImageUpload from './ImageUpload'
import Toggle from './Toggle'
import type { Producto, ProductoForm, Categoria, VarianteForm } from '@/types'
import { slugify } from '@/lib/store/slug'
import { calcularCambioStock, margen } from '@/lib/store/costeo'
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
    canal: p.canal,
    isv: p.isv,
    costo: p.costo,
    precio_revendedor: p.precio_revendedor,
    stock_minimo: p.stock_minimo,
    activo: p.activo,
    variantes: [...(p.producto_variantes ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map(v => ({
        id: v.id,
        nombre: v.nombre,
        sku: v.sku ?? '',
        precio: v.precio != null ? Number(v.precio) : null,
        stock: v.stock,
        costo: v.costo,
        precio_revendedor: v.precio_revendedor,
        activo: v.activo,
        costoEntrada: null,
      })),
    // Campo transitorio para el "costo de esta entrada": nunca viene de BD,
    // se resetea cada vez que se carga un producto en el form.
    costoEntrada: null,
  }
}

interface Props {
  form: ProductoForm
  setForm: React.Dispatch<React.SetStateAction<ProductoForm>>
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
  modo?: 'completo' | 'rapido'
  // Producto original en BD (null al crear): sirve de base para decidir si un
  // cambio de stock es un delta (aumento/reducción) o un cambio de modalidad.
  producto?: Producto | null
  // true si el producto YA tiene movimientos propios (no de sus variantes):
  // el costo se muestra solo-lectura con margen en vez de editable.
  historialCosto?: boolean
  // ids de variantes que YA tienen movimientos propios en movimientos_inventario
  // (historial real, no simplemente "ya tiene id"): determina qué filas de
  // variante muestran el costo solo-lectura con margen.
  historialCostoVariantes?: ReadonlySet<string>
  // Presentación únicamente (re-skin R5a Task 3): 'modal' agrupa los mismos
  // campos en cards por tema (look Stitch) para el editor de ProductosClient;
  // 'flat' (default) preserva el layout de siempre, usado por CarruselClient
  // (modo rápido/completo del recorrido) para no alterar esa pantalla.
  layout?: 'flat' | 'modal'
}

// Iconos "feather" locales (mismo estilo que components/admin/icons.tsx) para
// los encabezados de sección del editor re-skineado.
function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconPrecio() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 15.3c0 1 1 1.7 2.1 1.7h1.3c1.1 0 2.1-.7 2.1-1.8 0-1.1-1-1.5-2.6-1.9-1.6-.4-2.6-.9-2.6-2 0-1.1 1.1-1.8 2.4-1.8 1 0 1.9.4 2.3 1.1" />
      <line x1="12" y1="7.4" x2="12" y2="9.5" />
      <line x1="12" y1="17" x2="12" y2="19.1" />
    </svg>
  )
}
function IconImagen() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
    </svg>
  )
}
function IconVariantes() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 4-8 4-8-4 8-4z" />
      <path d="M4 11l8 4 8-4" />
      <path d="M4 15l8 4 8-4" />
    </svg>
  )
}
function IconTallas() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.6 13.4L11 3.8a2 2 0 00-1.4-.6L4 3a1 1 0 00-1 1l.2 5.6a2 2 0 00.6 1.4l9.6 9.6a2 2 0 002.8 0l4.4-4.4a2 2 0 000-2.8z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Envuelve un grupo de campos como card con encabezado (icono + título) —
// solo presentación, no toca lógica ni valores de los campos que recibe.
function SeccionCard({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.formSection}>
      <h3 className={styles.formSectionHeader}>{icono}{titulo}</h3>
      <div className={styles.formSectionBody}>{children}</div>
    </section>
  )
}

export default function ProductoFields({
  form, setForm, categorias, subcategorias, modo = 'completo', producto = null, historialCosto = false,
  historialCostoVariantes, layout = 'flat',
}: Props) {
  const completo = modo === 'completo'
  const sectioned = layout === 'modal'

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

  const setVariante = (i: number, patch: Partial<VarianteForm>) =>
    setForm(prev => ({ ...prev, variantes: prev.variantes.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }))

  const agregarVariante = () =>
    setForm(prev => ({
      ...prev,
      variantes: [...prev.variantes, { nombre: '', sku: '', precio: null, stock: null, costo: null, precio_revendedor: null, activo: true, costoEntrada: null }],
    }))

  // Stock base de cada variante existente (BD), para saber si su stock subió
  // (y por tanto mostrar el campo de costo de la entrada) o es un cambio de
  // modalidad (sin campo de costo, no es kardexable).
  const stockBaseVariantes = useMemo(
    () => new Map((producto?.producto_variantes ?? []).map(v => [v.id, v.stock])),
    [producto]
  )

  const cambioStockProducto = producto ? calcularCambioStock(producto.stock, form.stock) : { tipo: 'sin_cambio' as const }
  const mostrarCostoEntradaProducto = cambioStockProducto.tipo === 'delta' && cambioStockProducto.delta > 0

  const quitarVariante = (i: number) =>
    setForm(prev => ({ ...prev, variantes: prev.variantes.filter((_, idx) => idx !== i) }))

  const moverVariante = (i: number, delta: number) =>
    setForm(prev => {
      const j = i + delta
      if (j < 0 || j >= prev.variantes.length) return prev
      const copia = [...prev.variantes]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return { ...prev, variantes: copia }
    })

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

  // Cada bloque se calcula una sola vez con el JSX/handlers ORIGINALES (sin
  // cambios de lógica); layout='flat' los imprime en el orden de siempre
  // (usado por CarruselClient) y layout='modal' solo los reagrupa en cards
  // por tema (re-skin R5a Task 3) — mover un bloque completo de sección no
  // afecta su contenido interno.
  const bloqueIdentidad = completo && (
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
  )

  const bloquePrecio = completo ? (
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
  )

  const bloqueCategoria = (
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
  )

  const bloqueStock = (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>
        Stock (vacío = ilimitado)
        <input
          type="number"
          value={form.stock ?? ''}
          onChange={e => setForm(p => ({ ...p, stock: e.target.value ? parseInt(e.target.value) : null }))}
          min="0"
          disabled={form.variantes.length > 0}
        />
        {completo && mostrarCostoEntradaProducto && (
          <input
            type="number"
            placeholder="Costo de esta entrada (opcional)"
            value={form.costoEntrada ?? ''}
            onChange={e => setForm(p => ({ ...p, costoEntrada: e.target.value === '' ? null : Number(e.target.value) }))}
            min="0"
            step="0.01"
          />
        )}
        {form.variantes.length > 0 && (
          <small>Este producto vende por variantes; el stock y las tallas del padre no se usan</small>
        )}
      </label>
    </div>
  )

  const bloqueCanalIsv = completo && (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>
        Canal
        <select value={form.canal} onChange={e => setForm(p => ({ ...p, canal: e.target.value as ProductoForm['canal'] }))}>
          <option value="tienda">Tienda</option>
          <option value="mostrador">Mostrador</option>
          <option value="ambas">Ambas</option>
        </select>
      </label>
      <label className={styles.formLabel}>
        ISV
        <select value={form.isv} onChange={e => setForm(p => ({ ...p, isv: e.target.value as ProductoForm['isv'] }))}>
          <option value="15">15%</option>
          <option value="18">18%</option>
          <option value="exento">Exento</option>
        </select>
      </label>
    </div>
  )

  const bloqueCostoRevendedor = completo && (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>
        Costo (L.)
        {historialCosto ? (
          <>
            <input type="text" value={form.costo != null ? `L. ${form.costo}` : '—'} disabled readOnly />
            {(() => {
              const m = form.costo != null ? margen(form.precio, form.costo) : null
              return m ? <small>Margen: L. {m.ganancia} ({m.porcentaje}%)</small> : null
            })()}
            <small>Ya tiene movimientos de inventario; usa &quot;Registrar entrada&quot; para actualizarlo</small>
          </>
        ) : (
          <input
            type="number"
            placeholder="Costo inicial (opcional)"
            value={form.costo ?? ''}
            onChange={e => setForm(p => ({ ...p, costo: e.target.value === '' ? null : Number(e.target.value) }))}
            min="0"
            step="0.01"
          />
        )}
      </label>
      <label className={styles.formLabel}>
        Precio revendedor (L., vacío = no aplica)
        <input
          type="number"
          value={form.precio_revendedor ?? ''}
          onChange={e => setForm(p => ({ ...p, precio_revendedor: e.target.value === '' ? null : Number(e.target.value) }))}
          min="0"
          step="0.01"
        />
      </label>
    </div>
  )

  const bloqueStockMinimo = completo && (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>
        Stock mínimo (alerta de stock bajo)
        <input
          type="number"
          value={form.stock_minimo ?? ''}
          onChange={e => setForm(p => ({ ...p, stock_minimo: e.target.value === '' ? null : parseInt(e.target.value) }))}
          min="0"
        />
      </label>
    </div>
  )

  const bloqueGeneroBadge = completo && (
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
  )

  const bloqueMarca = completo && (
    <label className={styles.formLabel}>
      Marca
      <input type="text" value={form.marca} onChange={f('marca')} />
    </label>
  )

  const bloqueTallas = completo && (
    <label className={styles.formLabel}>
      Tallas (separadas por coma)
      <input
        type="text"
        value={form.tallas}
        onChange={f('tallas')}
        placeholder="S, M, L, XL, XXL"
        disabled={form.variantes.length > 0}
      />
      {form.variantes.length > 0 && (
        <small>Este producto vende por variantes; el stock y las tallas del padre no se usan</small>
      )}
    </label>
  )

  const bloqueColores = completo && (
    <label className={styles.formLabel}>
      Colores (separados por coma)
      <input type="text" value={form.colores} onChange={f('colores')} placeholder="Rojo, Azul, Negro" />
    </label>
  )

  const bloqueVariantes = completo && (
    <div className={styles.variantesSection}>
      <label className={styles.formLabel}>
        Variantes (opcional) — si agregas variantes, el producto se vende por variante
      </label>
      {form.variantes.length > 0 && (
        <div className={styles.varianteHeadRow} aria-hidden="true">
          <span>Nombre</span>
          <span>SKU</span>
          <span>Precio (vacío = hereda)</span>
          <span>Stock (vacío = ilimitado)</span>
          <span>Costo</span>
          <span>P. revendedor</span>
          <span>Activa</span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
      {form.variantes.map((v, i) => {
        const stockBase = v.id ? stockBaseVariantes.get(v.id) ?? null : null
        const cambioVariante = v.id ? calcularCambioStock(stockBase, v.stock) : { tipo: 'sin_cambio' as const }
        const mostrarCostoEntradaVariante = cambioVariante.tipo === 'delta' && cambioVariante.delta > 0
        // Solo-lectura + margen cuando la variante YA tiene movimientos reales
        // (no simplemente por tener id): igual que a nivel de producto.
        const costoBloqueado = !!v.id && !!historialCostoVariantes?.has(v.id)
        const precioEfectivoVariante = v.precio ?? form.precio
        const margenVariante = v.costo != null ? margen(precioEfectivoVariante, v.costo) : null
        return (
        <div key={v.id ?? `nueva-${i}`} className={styles.varianteRow}>
          <input
            className={sectioned ? styles.varianteInput : undefined}
            placeholder="Nombre (ej. M, Edición retro)"
            value={v.nombre}
            onChange={e => setVariante(i, { nombre: e.target.value })}
          />
          <input
            className={sectioned ? styles.varianteInput : undefined}
            placeholder="SKU"
            value={v.sku}
            onChange={e => setVariante(i, { sku: e.target.value })}
          />
          <input
            className={sectioned ? styles.varianteInput : undefined}
            type="number"
            placeholder="Precio (vacío = hereda)"
            value={v.precio ?? ''}
            onChange={e => setVariante(i, { precio: e.target.value === '' ? null : Number(e.target.value) })}
            min="0"
            step="0.01"
          />
          <div className={styles.varianteStockCell}>
            <input
              className={sectioned ? styles.varianteStockInput : undefined}
              type="number"
              placeholder="Stock (vacío = ilimitado)"
              value={v.stock ?? ''}
              onChange={e => setVariante(i, { stock: e.target.value === '' ? null : Number(e.target.value) })}
              min="0"
            />
            {mostrarCostoEntradaVariante && (
              <input
                type="number"
                className={styles.varianteCostoEntrada}
                placeholder="Costo de esta entrada (opcional)"
                value={v.costoEntrada ?? ''}
                onChange={e => setVariante(i, { costoEntrada: e.target.value === '' ? null : Number(e.target.value) })}
                min="0"
                step="0.01"
              />
            )}
          </div>
          {costoBloqueado ? (
            <div className={styles.varianteCostoBloqueado}>
              <input
                className={sectioned ? styles.varianteInput : undefined}
                type="text"
                value={v.costo != null ? `L. ${v.costo}` : '—'}
                disabled
                readOnly
                title="Ya tiene movimientos de inventario; usa Registrar entrada para ajustarlo"
              />
              {margenVariante && (
                <small>Margen: L. {margenVariante.ganancia} ({margenVariante.porcentaje}%)</small>
              )}
            </div>
          ) : (
            <input
              className={sectioned ? styles.varianteInput : undefined}
              type="number"
              placeholder="Costo inicial (vacío = hereda)"
              value={v.costo ?? ''}
              onChange={e => setVariante(i, { costo: e.target.value === '' ? null : Number(e.target.value) })}
              min="0"
              step="0.01"
            />
          )}
          <input
            className={sectioned ? styles.varianteInput : undefined}
            type="number"
            placeholder="P. revendedor (vacío = hereda)"
            value={v.precio_revendedor ?? ''}
            onChange={e => setVariante(i, { precio_revendedor: e.target.value === '' ? null : Number(e.target.value) })}
            min="0"
            step="0.01"
          />
          <label className={styles.varianteActiva}>
            <input
              type="checkbox"
              checked={v.activo}
              onChange={e => setVariante(i, { activo: e.target.checked })}
            />{' '}
            Activa
          </label>
          <button type="button" onClick={() => moverVariante(i, -1)} disabled={i === 0}>↑</button>
          <button type="button" onClick={() => moverVariante(i, 1)} disabled={i === form.variantes.length - 1}>↓</button>
          <button type="button" className={styles.btnQuitarVariante} onClick={() => quitarVariante(i)}>Quitar</button>
        </div>
        )
      })}
      <button type="button" className={sectioned ? styles.btnAgregarVariante : styles.btnSecondary} onClick={agregarVariante}>+ Agregar variante</button>
    </div>
  )

  const bloqueImagenes = (
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
  )

  const bloqueDescripcion = (
    <label className={styles.formLabel}>
      Descripción
      <textarea value={form.descripcion} onChange={f('descripcion')} rows={3} />
    </label>
  )

  const bloqueToggles = completo && (
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
  )

  if (sectioned) {
    return (
      <>
        <SeccionCard titulo="Datos generales" icono={<IconInfo />}>
          {bloqueIdentidad}
          {bloqueMarca}
          {bloqueGeneroBadge}
          {bloqueCanalIsv}
          {bloqueDescripcion}
          {bloqueToggles}
        </SeccionCard>
        <SeccionCard titulo="Precios" icono={<IconPrecio />}>
          {bloquePrecio}
          {bloqueCostoRevendedor}
        </SeccionCard>
        <SeccionCard titulo="Imágenes" icono={<IconImagen />}>
          {bloqueImagenes}
        </SeccionCard>
        <SeccionCard titulo="Variantes" icono={<IconVariantes />}>
          {bloqueVariantes}
        </SeccionCard>
        <SeccionCard titulo="Tallas y categorías" icono={<IconTallas />}>
          {bloqueCategoria}
          {bloqueTallas}
          {bloqueColores}
          {bloqueStock}
          {bloqueStockMinimo}
        </SeccionCard>
      </>
    )
  }

  return (
    <>
      {bloqueIdentidad}
      {bloquePrecio}
      {bloqueCategoria}
      {bloqueStock}
      {bloqueCanalIsv}
      {bloqueCostoRevendedor}
      {bloqueStockMinimo}
      {bloqueGeneroBadge}
      {bloqueMarca}
      {bloqueTallas}
      {bloqueColores}
      {bloqueVariantes}
      {bloqueImagenes}
      {bloqueDescripcion}
      {bloqueToggles}
    </>
  )
}
