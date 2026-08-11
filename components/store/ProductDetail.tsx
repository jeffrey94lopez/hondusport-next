'use client'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import styles from './ProductDetail.module.css'
import SizeGuideModal from './SizeGuideModal'
import ProductCard from './ProductCard'
import { formatPrice } from '@/lib/store/format'
import { getTallas } from '@/lib/store/getTallas'
import { getReviews } from '@/lib/store/reviews'
import { addRecentView } from '@/lib/store/recentViews'
import { useCart } from '@/lib/store/cart-context'
import { useWishlist } from '@/lib/store/wishlist-context'
import type { StoreProducto, Categoria } from '@/types/store'

const RECENT_VIEWS_KEY = 'hs_recent_views'
const ZOOM_SCALE = 2
const RELATED_SCROLL_AMOUNT = 300
const DEFAULT_FREE_SHIPPING_THRESHOLD = 999
const SIN_PERSONALIZACION = 'Sin personalización'
const TALLA_UNICA = 'Única'

function readRecentViewIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_VIEWS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function readRecentProducts(currentId: string, allProductos: StoreProducto[]): StoreProducto[] {
  return readRecentViewIds()
    .filter(id => id !== currentId)
    .map(id => allProductos.find(p => p.id === id))
    .filter((p): p is StoreProducto => p != null)
}

interface ProductDetailProps {
  producto: StoreProducto
  relacionados: StoreProducto[]
  tallaFiltros: Categoria[]
  allProductos: StoreProducto[]
  siteName?: string
  // Mismo patrón que CartDrawer/CheckoutModal/ProductPageShell: el shell calcula
  // el umbral real desde `configuracion` y lo pasa por prop; el default de acá
  // solo cubre el caso sin config (no se usa para inventar un valor de negocio).
  freeShippingActivo?: boolean
  freeShippingThreshold?: number
}

export default function ProductDetail({
  producto,
  relacionados,
  tallaFiltros,
  allProductos,
  siteName,
  freeShippingActivo = true,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
}: ProductDetailProps) {
  const router = useRouter()
  const { addToCart } = useCart()
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist()
  const tallas = getTallas(producto, tallaFiltros)
  const reviews = getReviews(producto.rating)
  const ratingValue = producto.rating || 5
  const showOriginalPrice = producto.precioOriginal != null && producto.precioOriginal > producto.precio
  const eyebrow = producto.subcat ?? producto.cat

  const variantes = producto.variantes
  const conVariantes = variantes.length > 0
  const [selectedImageIdx, setSelectedImageIdx] = useState(0)
  const [selectedTalla, setSelectedTalla] = useState(tallas[0] ?? '')
  const [selectedVarianteId, setSelectedVarianteId] = useState(
    () => variantes.find(v => !v.agotada)?.id ?? ''
  )
  const [custom, setCustom] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [zoomStyle, setZoomStyle] = useState<CSSProperties>({})
  const [recentProducts] = useState(() => readRecentProducts(producto.id, allProductos))
  const relatedScrollRef = useRef<HTMLDivElement>(null)

  const selectedVariante = variantes.find(v => v.id === selectedVarianteId) ?? null
  const precioActual = selectedVariante?.precioEfectivo ?? producto.precio
  const todasAgotadas = conVariantes && variantes.every(v => v.agotada)
  const stockDisponible = selectedVariante ? selectedVariante.stock : producto.stock
  const maxCantidad = Math.max(stockDisponible ?? Infinity, 1)
  // Deriva el valor mostrado/usado en vez de sincronizar `cantidad` con un efecto:
  // si el stock disponible baja (p.ej. al cambiar de variante), la cantidad
  // efectiva se recorta al renderizar sin necesitar un setState en efecto.
  const cantidadEfectiva = Math.min(cantidad, maxCantidad)

  useEffect(() => {
    localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(addRecentView(readRecentViewIds(), producto.id)))
  }, [producto.id])

  function handleZoomMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomStyle({ transformOrigin: `${x}% ${y}%`, transform: `scale(${ZOOM_SCALE})` })
  }

  function handleZoomLeave() {
    setZoomStyle({ transformOrigin: 'center center', transform: 'scale(1)' })
  }

  function incCantidad() {
    setCantidad(c => Math.min(Math.min(c, maxCantidad) + 1, maxCantidad))
  }

  function decCantidad() {
    setCantidad(c => Math.max(Math.min(c, maxCantidad) - 1, 1))
  }

  function handleAddToCart() {
    if (conVariantes && (!selectedVariante || selectedVariante.agotada)) return
    const item = {
      id: producto.id,
      nombre: producto.nombre,
      precio: precioActual,
      imagen: producto.imagenes[0] ?? '',
      size: conVariantes ? '' : selectedTalla || TALLA_UNICA,
      custom: custom.trim() || SIN_PERSONALIZACION,
      personalizable: producto.personalizable,
      ...(selectedVariante
        ? { varianteId: selectedVariante.id, variante: selectedVariante.nombre, stockDisponible: selectedVariante.stock }
        : {}),
    }
    // addToCart ya fusiona líneas iguales incrementando `qty` (lib/store/cart.ts);
    // llamarlo `cantidadEfectiva` veces reusa esa misma regla en vez de duplicarla aquí.
    for (let i = 0; i < cantidadEfectiva; i++) addToCart(item)
    setCantidad(1)
  }

  function openRelated(slug: string) {
    router.push(`/producto/${slug}`)
  }

  function quickAddRelated(id: string) {
    const rel = allProductos.find(p => p.id === id)
    if (!rel) return
    if (rel.variantes.length > 0) {
      router.push(`/producto/${rel.slug}`)
      return
    }
    const relTallas = getTallas(rel, tallaFiltros)
    addToCart({
      id: rel.id,
      nombre: rel.nombre,
      precio: rel.precio,
      imagen: rel.imagenes[0] ?? '',
      size: relTallas[0] ?? TALLA_UNICA,
      custom: SIN_PERSONALIZACION,
      personalizable: rel.personalizable,
    })
  }

  function scrollRelated(delta: number) {
    relatedScrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  function getShareUrl() {
    return `${window.location.origin}/producto/${producto.slug}`
  }

  function shareWhatsApp() {
    const url = getShareUrl()
    const text = `¡Mira este producto en ${siteName || 'Hondu Sport'}!\n*${producto.nombre}*\nPrecio: ${formatPrice(producto.precio)}\n\nVer producto: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function shareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`, '_blank')
  }

  function copyLink() {
    navigator.clipboard.writeText(getShareUrl())
  }

  return (
    <div className={styles.productPage}>
      <Link href="/" className={styles.backLink}>
        <i className="fa-solid fa-arrow-left" /> VOLVER AL CATÁLOGO
      </Link>

      <div className={styles.topGrid}>
        <div className={styles.gallery}>
          <div className={styles.mainImageCard}>
            {producto.badge === 'Nuevo' && <span className={styles.newTag}>Nuevo</span>}
            <div className={styles.zoomContainer} onMouseMove={handleZoomMove} onMouseLeave={handleZoomLeave}>
              {producto.imagenes[selectedImageIdx] && (
                <Image
                  src={producto.imagenes[selectedImageIdx]}
                  alt={producto.nombre}
                  fill
                  sizes="(max-width: 899px) 100vw, 600px"
                  style={zoomStyle}
                />
              )}
            </div>
          </div>
          {producto.imagenes.length > 1 && (
            <div className={styles.thumbRow}>
              {producto.imagenes.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  className={`${styles.thumbBtn} ${i === selectedImageIdx ? styles.thumbBtnActive : ''}`}
                  onClick={() => setSelectedImageIdx(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                >
                  <Image src={img} alt={`${producto.nombre} ${i + 1}`} className={styles.thumbImg} width={80} height={80} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.infoCard}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{producto.nombre}</h1>

          <div className={styles.ratingRow}>
            <span className={styles.starsFilled}>{'★'.repeat(ratingValue)}</span>
            <span className={styles.starsEmpty}>{'☆'.repeat(5 - ratingValue)}</span>
          </div>

          <p className={styles.price}>
            {showOriginalPrice && (
              <span className={styles.originalPrice}>{formatPrice(producto.precioOriginal as number)}</span>
            )}
            <span className={`${styles.currentPrice} ${showOriginalPrice ? styles.currentPriceDiscounted : ''}`}>
              {formatPrice(precioActual)}
            </span>
          </p>

          {producto.descripcion && <p className={styles.desc}>{producto.descripcion}</p>}

          {conVariantes && (
            <div className={styles.section}>
              <label className={styles.label} htmlFor="variante-select">ELIGE UNA OPCIÓN</label>
              <select
                id="variante-select"
                className={styles.varianteSelect}
                value={selectedVarianteId}
                onChange={e => setSelectedVarianteId(e.target.value)}
              >
                {selectedVarianteId === '' && <option value="">Selecciona…</option>}
                {variantes.map(v => (
                  <option key={v.id} value={v.id} disabled={v.agotada}>
                    {v.nombre}
                    {v.precioEfectivo !== producto.precio ? ` — ${formatPrice(v.precioEfectivo)}` : ''}
                    {v.agotada ? ' (Agotada)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!conVariantes && tallas.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span>SELECCIONA TU TALLA</span>
                <button type="button" className={styles.sizeGuideBtn} onClick={() => setSizeGuideOpen(true)}>
                  Guía de tallas
                </button>
              </div>
              <div className={styles.tallaGroup}>
                {tallas.map(talla => (
                  <button
                    key={talla}
                    type="button"
                    className={`${styles.tallaChip} ${selectedTalla === talla ? styles.tallaChipActive : ''}`}
                    onClick={() => setSelectedTalla(talla)}
                  >
                    {talla}
                  </button>
                ))}
              </div>
            </div>
          )}

          {producto.personalizable && (
            <div className={styles.section}>
              <label className={styles.label} htmlFor="custom-input">
                PERSONALIZACIÓN (OPCIONAL)
              </label>
              <div className={styles.customInputBox}>
                <i className="fa-solid fa-pen" />
                <input
                  id="custom-input"
                  type="text"
                  placeholder="EJ. NOMBRE Y NÚMERO"
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                />
              </div>
              <span className={styles.hint}>Se imprimirá exactamente como lo escribas</span>
            </div>
          )}

          <div className={styles.purchaseRow}>
            <div className={styles.qtyStepper}>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={decCantidad}
                disabled={cantidadEfectiva <= 1}
                aria-label="Disminuir cantidad"
              >
                <i className="fa-solid fa-minus" />
              </button>
              <span className={styles.qtyValue}>{cantidadEfectiva}</span>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={incCantidad}
                disabled={cantidadEfectiva >= maxCantidad}
                aria-label="Aumentar cantidad"
              >
                <i className="fa-solid fa-plus" />
              </button>
            </div>

            <button
              type="button"
              className={styles.addBtn}
              onClick={handleAddToCart}
              disabled={todasAgotadas || (conVariantes && !selectedVariante)}
            >
              <span>{todasAgotadas ? 'AGOTADO' : 'Agregar al carrito'}</span>
              {!todasAgotadas && <i className="fa-solid fa-arrow-right" />}
            </button>

            <button
              type="button"
              className={`${styles.wishBtn} ${isWishlisted(producto.id) ? styles.wishBtnActive : ''}`}
              onClick={() => toggleWishlist(producto.id)}
              aria-label={isWishlisted(producto.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <i className={`${isWishlisted(producto.id) ? 'fa-solid' : 'fa-regular'} fa-heart`} />
            </button>
          </div>

          <div className={styles.infoBox}>
            {freeShippingActivo && (
              <div className={styles.infoBoxRow}>
                <i className="fa-solid fa-truck" />
                <p>Envío gratis en compras mayores a {formatPrice(freeShippingThreshold)}.</p>
              </div>
            )}
            <div className={styles.infoBoxRow}>
              <i className="fa-solid fa-rotate-left" />
              <p>Devoluciones fáciles en 30 días.</p>
            </div>
          </div>

          <div className={styles.shareGrid}>
            <button type="button" className={`${styles.shareBtn} btnMerlinTertiary`} onClick={shareWhatsApp}>
              <i className="fa-brands fa-whatsapp" /> WHATSAPP
            </button>
            <button type="button" className={`${styles.shareBtn} btnMerlinTertiary`} onClick={shareFacebook}>
              <i className="fa-brands fa-facebook-f" /> FACEBOOK
            </button>
            <button type="button" className={`${styles.shareBtn} btnMerlinTertiary`} onClick={copyLink}>
              <i className="fa-solid fa-copy" /> COPIAR ENLACE
            </button>
          </div>
        </div>
      </div>

      <div className={styles.reviewsSection}>
        <h4>RESEÑAS DE CLIENTES ({reviews.length})</h4>
        {reviews.map(review => (
          <div key={review.author} className={styles.review}>
            <span className={styles.reviewStars}>{'★'.repeat(ratingValue)}</span> <strong>{review.author}</strong>
            <p>&quot;{review.text}&quot;</p>
          </div>
        ))}
      </div>

      {relacionados.length > 0 && (
        <section className={styles.relatedSection}>
          <div className={styles.relatedHeader}>
            <h2>Productos relacionados</h2>
            <div className={styles.carouselNav}>
              <button type="button" className={styles.carouselBtn} onClick={() => scrollRelated(-RELATED_SCROLL_AMOUNT)} aria-label="Anterior">
                <i className="fa-solid fa-chevron-left" />
              </button>
              <button type="button" className={styles.carouselBtn} onClick={() => scrollRelated(RELATED_SCROLL_AMOUNT)} aria-label="Siguiente">
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          </div>
          <div ref={relatedScrollRef} className={styles.relatedScroll}>
            {relacionados.map(rel => (
              <div key={rel.id} className={styles.relatedItem}>
                <ProductCard producto={rel} onOpen={openRelated} onQuickAdd={quickAddRelated} />
              </div>
            ))}
          </div>
        </section>
      )}

      {recentProducts.length > 0 && (
        <section className={styles.recentSection}>
          <h4>VISTOS RECIENTEMENTE</h4>
          <div className={styles.recentScroll}>
            {recentProducts.map(rec => (
              <Link key={rec.id} href={`/producto/${rec.slug}`} className={styles.recentItem}>
                {rec.imagenes[0] && (
                  <div className={styles.recentImgWrap}>
                    <Image src={rec.imagenes[0]} alt={rec.nombre} className={styles.recentImg} fill sizes="130px" />
                  </div>
                )}
                <p className={styles.recentTitle}>{rec.nombre}</p>
                <p className={styles.recentPrice}>{formatPrice(rec.precio)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SizeGuideModal isOpen={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
    </div>
  )
}
