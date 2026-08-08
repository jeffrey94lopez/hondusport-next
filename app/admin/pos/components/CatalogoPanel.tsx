'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import Modal from '@/components/admin/Modal'
import { precioLineaPos } from '@/lib/pos/emision'
import { toStoreVariantes, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'
import { filtrarInventario } from '@/lib/store/inventoryFilters'
import { variantesActivasDe, preciosCatalogo } from '../pos-helpers'
import { toggleFavoritoPos } from '../actions'
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
  // Task 6: la sección "Anclados" agrega/quita `favorito_pos` con su propia
  // server action; el POS ya tiene un banner de avisos compartido en
  // `PosClient` (`avisoRetomar`) — se reutiliza ese, no se inventa otro.
  onError: (mensaje: string) => void
  // El botón "+ Ítem libre" vive a la derecha de la barra de búsqueda (antes
  // estaba en el carrito): agregar un ítem libre es una acción del catálogo,
  // no del carrito, y queda a mano junto al buscador/escáner.
  onItemLibre: () => void
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

export default function CatalogoPanel({ productos, categorias, tipoCliente, onAgregar, onError, onItemLibre }: CatalogoPanelProps) {
  const [busqueda, setBusqueda] = useState('')
  const [varianteModal, setVarianteModal] = useState<Producto | null>(null)
  const [catId, setCatId] = useState<string | null>(null)
  const [subcatId, setSubcatId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [, startFavoritoTransition] = useTransition()

  // `favorito_pos` llega en la prop `productos` (releída del servidor solo
  // tras un `router.refresh()`, que esta pantalla no dispara al alternar un
  // ancla). Para que la estrella y la sección "Anclados" respondan al
  // instante, se guarda un override local por producto que gana sobre el
  // valor de la prop hasta que llega uno nuevo; si la action falla, se
  // revierte el override y se avisa por el banner del POS.
  const [favoritoOverrides, setFavoritoOverrides] = useState<Record<string, boolean>>({})

  function esFavorito(producto: Producto): boolean {
    return favoritoOverrides[producto.id] ?? producto.favorito_pos
  }

  function alternarFavorito(producto: Producto, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    const nuevoValor = !esFavorito(producto)
    setFavoritoOverrides(prev => ({ ...prev, [producto.id]: nuevoValor }))
    startFavoritoTransition(async () => {
      const result = await toggleFavoritoPos(producto.id, nuevoValor)
      if (!result.ok) {
        setFavoritoOverrides(prev => ({ ...prev, [producto.id]: !nuevoValor }))
        onError(result.error)
      }
    })
  }

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

  // Anclados: respetan el buscador pero IGNORAN los chips de categoría (por
  // eso parten de `productos`, no de `productosFiltrados`/`filtrarInventario`).
  // La sección es visible mientras exista al menos un producto anclado, aun
  // si el buscador no deja ninguno tras filtrar.
  const anclados = useMemo(
    () => productos.filter(p => favoritoOverrides[p.id] ?? p.favorito_pos),
    [productos, favoritoOverrides],
  )
  const ancladosFiltrados = useMemo(() => anclados.filter(p => coincideBusqueda(p, busqueda)), [anclados, busqueda])

  function renderCard(p: Producto) {
    const variantes = toStoreVariantes(p.precio, p.producto_variantes ?? [])
    const stock = stockEfectivo(p.stock, variantes)
    const agotado = estaAgotado(p.stock, variantes)
    const precios = preciosCatalogo(p, tipoCliente)
    const min = Math.min(...precios)
    const varia = min !== Math.max(...precios)
    const imagen = p.imagenes?.[0]
    const favorito = esFavorito(p)

    // Fix arrastrado de Task 6 (revisión): esta tarjeta era un <button> con
    // la estrella (otro botón) anidada dentro — HTML inválido que el parser
    // de SSR corta antes de tiempo y React descarta/re-renderiza al
    // hidratar (parpadeo + warning de validateDOMNesting en cada carga de
    // /admin/pos), además de controles interactivos anidados (accesibilidad).
    // Ahora es un <div role="button"> con su propio manejo de teclado; la
    // estrella queda como botón HERMANO dentro de la tarjeta.
    //
    // Fix round 1 (revisión de este mismo fix): el keydown de la estrella
    // burbujea hasta este div (React solo tiene delegación, no captura por
    // target real), así que sin el guard de abajo, Tab hasta la estrella +
    // Enter/Espacio activaba TAMBIÉN el onKeyDown de la tarjeta — abría la
    // ficha del producto y de paso el preventDefault() de aquí suprimía la
    // activación nativa del <button> de la estrella (el favorito nunca se
    // alternaba por teclado). Se ignora cualquier evento que no se haya
    // originado en la propia tarjeta (e.target !== e.currentTarget): la
    // estrella maneja su propia activación de teclado de forma nativa, al
    // ser un <button>.
    function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      if (e.target !== e.currentTarget) return
      if (agotado) return
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      handleProductoClick(p)
    }

    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        className={styles.prodCard}
        aria-disabled={agotado}
        onClick={() => { if (!agotado) handleProductoClick(p) }}
        onKeyDown={handleCardKeyDown}
      >
        <button
          type="button"
          className={`btnMerlinIcon ${styles.estrella}`}
          aria-pressed={favorito}
          aria-label={favorito ? 'Quitar de anclados' : 'Anclar al POS'}
          onClick={e => alternarFavorito(p, e)}
        >
          {favorito ? '★' : '☆'}
        </button>
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
      </div>
    )
  }

  return (
    <section className={styles.catalogo}>
      <div className={styles.searchRow}>
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
        <button type="button" className={`btnMerlinSecondary ${styles.btnItemLibre}`} onClick={onItemLibre}>
          + Ítem libre
        </button>
      </div>

      {anclados.length > 0 && (
        <div className={styles.anclados}>
          <div className={styles.ancladosTitulo}>Anclados</div>
          <div className={styles.catalogoGrid}>{ancladosFiltrados.map(p => renderCard(p))}</div>
        </div>
      )}

      {cats.length > 0 && (
        <div className={styles.chipsRow}>
          <button
            type="button"
            className="btnMerlinChip"
            aria-pressed={catId === null}
            onClick={() => elegirCategoria(null)}
          >
            Todos
          </button>
          {cats.map(c => (
            <button
              key={c.id}
              type="button"
              className="btnMerlinChip"
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
              className="btnMerlinChip"
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
        <div className={styles.catalogoGrid}>{productosFiltrados.map(p => renderCard(p))}</div>
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
