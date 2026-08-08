'use client'
import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import Modal from '@/components/admin/Modal'
import { precioLineaPos } from '@/lib/pos/emision'
import { toStoreVariantes, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'
import { filtrarInventario } from '@/lib/store/inventoryFilters'
import { variantesActivasDe, preciosCatalogo } from '../pos-helpers'
import type { Categoria, Producto, ProductoVariante } from '@/types'
import styles from '../pos.module.css'

// Contrato ajustado sobre el mínimo del brief (task-3-brief.md): se agregó
// `tipoCliente` porque el precio mostrado en el card y en el selector de
// variante depende del tipo de cliente (revendedor puede tener precio propio
// por variante) — sin este dato el panel no podría calcular el precio que
// hoy calcula PosClient, y el catálogo mostraría precios incorrectos al
// elegir un cliente revendedor. `categorias` se agregó en Task 5 para los
// chips de categoría/subcategoría (brief task-5).
export interface CatalogoPanelProps {
  productos: Producto[]
  categorias: Categoria[]
  tipoCliente: 'final' | 'revendedor'
  onAgregar: (producto: Producto, variante: ProductoVariante | null) => void
}

// Predicado de búsqueda por texto (nombre / SKU del producto / SKU de
// variante, case-insensitive) — extraído del `.filter()` inline original sin
// cambiar su comportamiento, para poder combinarlo con el filtro de
// categoría/subcategoría en `productosFiltrados`.
function coincideBusqueda(producto: Producto, texto: string): boolean {
  const query = texto.trim().toLowerCase()
  if (query === '') return true
  if (producto.nombre.toLowerCase().includes(query)) return true
  if (producto.sku && producto.sku.trim().toLowerCase() === query) return true
  return variantesActivasDe(producto).some(v => v.sku && v.sku.trim().toLowerCase() === query)
}

function buscarPorSkuExacto(
  productos: Producto[],
  q: string,
): { producto: Producto; variante: ProductoVariante | null } | null {
  const query = q.trim().toLowerCase()
  if (!query) return null
  for (const p of productos) {
    if (p.sku && p.sku.trim().toLowerCase() === query) return { producto: p, variante: null }
    const variante = variantesActivasDe(p).find(v => v.sku && v.sku.trim().toLowerCase() === query)
    if (variante) return { producto: p, variante }
  }
  return null
}

export default function CatalogoPanel({ productos, categorias, tipoCliente, onAgregar }: CatalogoPanelProps) {
  const [busqueda, setBusqueda] = useState('')
  const [varianteModal, setVarianteModal] = useState<Producto | null>(null)
  const [catId, setCatId] = useState<string | null>(null)
  const [subcatId, setSubcatId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const cats = useMemo(() => categorias.filter(c => c.tipo === 'cat'), [categorias])
  const subcats = useMemo(
    () => (catId ? categorias.filter(c => c.tipo === 'subcat' && (c.categorias_padre ?? []).includes(catId)) : []),
    [categorias, catId],
  )

  function elegirCategoria(id: string | null) {
    setCatId(id)
    setSubcatId(null)
  }

  // El foco de vuelta al buscador (para flujo de escáner de código de barras)
  // vivía dentro de `agregarProducto` en PosClient porque ese componente era
  // dueño tanto del carrito como del input de búsqueda. Ahora que el input
  // vive aquí, este wrapper conserva el mismo efecto: notifica al padre
  // (estado del carrito) y refoca el buscador, sin importar si el padre
  // terminó agregando la línea o la ignoró (p.ej. tope de stock en 0).
  function handleAgregar(producto: Producto, variante: ProductoVariante | null) {
    onAgregar(producto, variante)
    searchRef.current?.focus()
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const match = buscarPorSkuExacto(productos, busqueda)
    if (!match) return
    e.preventDefault()
    handleAgregar(match.producto, match.variante)
    setBusqueda('')
  }

  function handleProductoClick(producto: Producto) {
    const activas = variantesActivasDe(producto)
    if (activas.length === 0) {
      handleAgregar(producto, null)
      return
    }
    setVarianteModal(producto)
  }

  function elegirVariante(producto: Producto, variante: ProductoVariante) {
    handleAgregar(producto, variante)
    setVarianteModal(null)
  }

  const productosFiltrados = useMemo(() => {
    const base = filtrarInventario(productos, {
      categoriaIds: catId ? [catId] : undefined,
      subcategoriaIds: subcatId ? [subcatId] : undefined,
    })
    return base.filter(p => coincideBusqueda(p, busqueda))
  }, [productos, catId, subcatId, busqueda])

  return (
    <section className={styles.catalogo}>
      <input
        ref={searchRef}
        type="text"
        className={styles.searchInput}
        placeholder="Buscar por nombre o escanear SKU…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        autoFocus
      />

      {cats.length > 0 && (
        <div className={styles.chipsRow}>
          <button
            type="button"
            className={catId === null ? styles.chipActivo : styles.chip}
            aria-pressed={catId === null}
            onClick={() => elegirCategoria(null)}
          >
            Todos
          </button>
          {cats.map(c => (
            <button
              key={c.id}
              type="button"
              className={catId === c.id ? styles.chipActivo : styles.chip}
              aria-pressed={catId === c.id}
              onClick={() => elegirCategoria(c.id)}
            >
              {c.valor}
            </button>
          ))}
        </div>
      )}

      {catId !== null && subcats.length > 0 && (
        <div className={styles.chipsRow}>
          {subcats.map(sc => (
            <button
              key={sc.id}
              type="button"
              className={subcatId === sc.id ? styles.chipActivo : styles.chip}
              aria-pressed={subcatId === sc.id}
              onClick={() => setSubcatId(sc.id)}
            >
              {sc.valor}
            </button>
          ))}
        </div>
      )}

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
              <button
                key={p.id}
                type="button"
                className={styles.prodCard}
                disabled={agotado}
                onClick={() => handleProductoClick(p)}
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
                {!agotado && stock != null && (
                  <div className={styles.prodStock}>Stock: {stock}</div>
                )}
              </button>
            )
          })}
        </div>
      )}

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
                  onClick={() => elegirVariante(varianteModal, v)}
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
    </section>
  )
}
