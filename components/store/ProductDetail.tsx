'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './ProductDetail.module.css'
import SizeGuideModal from './SizeGuideModal'
import { formatPrice } from '@/lib/store/format'
import { getTallas } from '@/lib/store/getTallas'
import { getReviews } from '@/lib/store/reviews'
import { addRecentView } from '@/lib/store/recentViews'
import { useCart } from '@/lib/store/cart-context'
import type { StoreProducto, Categoria } from '@/types/store'

const RECENT_VIEWS_KEY = 'hs_recent_views'
const ZOOM_SCALE = 2

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
}

export default function ProductDetail({ producto, relacionados, tallaFiltros, allProductos, siteName }: ProductDetailProps) {
  const { addToCart } = useCart()
  const tallas = getTallas(producto, tallaFiltros)
  const reviews = getReviews(producto.rating)
  const stars = '⭐'.repeat(producto.rating || 5)
  const showOriginalPrice = producto.precioOriginal != null && producto.precioOriginal > producto.precio

  const [selectedImageIdx, setSelectedImageIdx] = useState(0)
  const [selectedTalla, setSelectedTalla] = useState(tallas[0] ?? '')
  const [custom, setCustom] = useState('')
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [zoomStyle, setZoomStyle] = useState<CSSProperties>({})
  const [recentProducts] = useState(() => readRecentProducts(producto.id, allProductos))

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

  function handleAddToCart() {
    addToCart({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      imagen: producto.imagenes[0] ?? '',
      size: selectedTalla || 'Única',
      custom: custom.trim() || 'Sin personalización',
    })
  }

  function getShareUrl() {
    return `${window.location.origin}/producto/${producto.id}`
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
      <div className={styles.gallery}>
        <div className={styles.zoomContainer} onMouseMove={handleZoomMove} onMouseLeave={handleZoomLeave}>
          {producto.imagenes[selectedImageIdx] && (
            <Image
              src={producto.imagenes[selectedImageIdx]}
              alt={producto.nombre}
              fill
              sizes="(max-width: 799px) 100vw, 500px"
              style={zoomStyle}
            />
          )}
        </div>
        {producto.imagenes.length > 1 && (
          <div className={styles.thumbRow}>
            {producto.imagenes.map((img, i) => (
              <Image
                key={img}
                src={img}
                alt={`${producto.nombre} ${i + 1}`}
                className={`${styles.thumbImg} ${i === selectedImageIdx ? styles.thumbImgActive : ''}`}
                width={60}
                height={60}
                onClick={() => setSelectedImageIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <Link href="/" className={styles.backLink}>
          <i className="fa-solid fa-arrow-left" /> VOLVER AL CATÁLOGO
        </Link>

        <h1 className={styles.title}>{producto.nombre}</h1>

        <p className={styles.price}>
          {showOriginalPrice && (
            <span className={styles.originalPrice}>{formatPrice(producto.precioOriginal as number)}</span>
          )}
          <span className={styles.currentPrice}>{formatPrice(producto.precio)}</span>
        </p>

        {producto.descripcion && <p className={styles.desc}>{producto.descripcion}</p>}

        {tallas.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>SELECCIONA TU TALLA</span>
              <button className={styles.sizeGuideBtn} onClick={() => setSizeGuideOpen(true)}>
                <i className="fa-solid fa-ruler-horizontal" /> GUÍA DE TALLAS
              </button>
            </div>
            <div className={styles.tallaGroup}>
              {tallas.map(talla => (
                <button
                  key={talla}
                  className={`${styles.tallaBtn} ${selectedTalla === talla ? styles.tallaBtnActive : ''}`}
                  onClick={() => setSelectedTalla(talla)}
                >
                  {talla}
                </button>
              ))}
            </div>
          </div>
        )}

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

        <button className={styles.addBtn} onClick={handleAddToCart}>
          AGREGAR AL CARRITO
        </button>

        <div className={styles.shareGrid}>
          <button className={styles.shareBtn} onClick={shareWhatsApp}>
            <i className="fa-brands fa-whatsapp" /> WHATSAPP
          </button>
          <button className={styles.shareBtn} onClick={shareFacebook}>
            <i className="fa-brands fa-facebook-f" /> FACEBOOK
          </button>
          <button className={styles.shareBtn} onClick={copyLink}>
            <i className="fa-solid fa-copy" /> COPIAR ENLACE
          </button>
        </div>

        <div className={styles.reviewsSection}>
          <h4>RESEÑAS DE CLIENTES ({reviews.length})</h4>
          {reviews.map(review => (
            <div key={review.author} className={styles.review}>
              <span className={styles.reviewStars}>{stars}</span> <strong>{review.author}</strong>
              <p>&quot;{review.text}&quot;</p>
            </div>
          ))}
        </div>

        {relacionados.length > 0 && (
          <div className={styles.relatedSection}>
            <h4>TAMBIÉN TE PUEDE GUSTAR</h4>
            <div className={styles.relatedGrid}>
              {relacionados.map(rel => (
                <Link key={rel.id} href={`/producto/${rel.id}`} className={styles.relatedItem}>
                  {rel.imagenes[0] && (
                    <Image src={rel.imagenes[0]} alt={rel.nombre} width={50} height={50} />
                  )}
                  <div>
                    <p className={styles.relatedTitle}>{rel.nombre}</p>
                    <p className={styles.relatedPrice}>{formatPrice(rel.precio)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {recentProducts.length > 0 && (
          <div className={styles.recentSection}>
            <h4>VISTOS RECIENTEMENTE</h4>
            <div className={styles.recentScroll}>
              {recentProducts.map(rec => (
                <Link key={rec.id} href={`/producto/${rec.id}`} className={styles.recentItem}>
                  {rec.imagenes[0] && (
                    <div className={styles.recentImgWrap}>
                      <Image src={rec.imagenes[0]} alt={rec.nombre} className={styles.recentImg} fill sizes="130px" />
                    </div>
                  )}
                  <p className={styles.relatedTitle}>{rec.nombre}</p>
                  <p className={styles.relatedPrice}>{formatPrice(rec.precio)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <SizeGuideModal isOpen={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
    </div>
  )
}
