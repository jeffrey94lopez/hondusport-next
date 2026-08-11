'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import styles from './ProductCard.module.css'
import { formatPrice, getBadgeColor, getDiscountPercent } from '@/lib/store/format'
import { getOfferSecondsRemaining } from '@/lib/store/offerTimer'
import { precioDesde, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { useWishlist } from '@/lib/store/wishlist-context'
import type { StoreProducto } from '@/types/store'

const STOCK_LIMITE = 5

function formatTimer(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `⏳ ${pad(h)}:${pad(m)}:${pad(s)}`
}

interface TagInfo {
  label: string
  className: string
  color?: string
}

// Prioridad del tag superior-izquierda: agotado > descuento > "Nuevo" > resto de badges
// existentes (Oferta/Más Vendido/Sustentable/Últimas unidades), que conservan su color
// original vía getBadgeColor para no perder esa señal.
function getTag(producto: StoreProducto, agotado: boolean, discountPercent: number | null): TagInfo | null {
  if (agotado) return { label: 'AGOTADO', className: styles.tagError }
  if (discountPercent != null) return { label: `-${discountPercent}%`, className: styles.tagError }
  if (producto.badge === 'Nuevo') return { label: 'NUEVO', className: styles.tagBrand }
  if (producto.badge) return { label: producto.badge.toUpperCase(), className: '', color: getBadgeColor(producto.badge) }
  return null
}

interface ProductCardProps {
  producto: StoreProducto
  rank?: number
  onQuickAdd?: (id: string) => void
  onOpen?: (id: string) => void
}

export default function ProductCard({ producto, rank, onQuickAdd, onOpen }: ProductCardProps) {
  const { has, toggle } = useWishlist()
  const isWished = has(producto.id)

  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    producto.badge === 'Oferta' ? getOfferSecondsRemaining(producto.ofertaFin) : 0
  )

  useEffect(() => {
    if (producto.badge !== 'Oferta' || secondsRemaining <= 0) return

    const id = setInterval(() => {
      setSecondsRemaining(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => clearInterval(id)
  }, [producto.badge, secondsRemaining])

  const desde = precioDesde(producto.precio, producto.variantes)
  const stock = stockEfectivo(producto.stock, producto.variantes)
  const agotado = estaAgotado(producto.stock, producto.variantes)

  const discountPercent = !desde.varia ? getDiscountPercent(producto.precio, producto.precioOriginal) : null
  const showOriginalPrice = discountPercent != null
  const showStockWarning = !agotado && stock != null && stock > 0 && stock <= STOCK_LIMITE
  const imagen = producto.imagenes[0] ?? ''
  const categoria = producto.subcat ?? producto.cat
  const ratingValue = producto.rating || 5
  const tag = getTag(producto, agotado, discountPercent)

  return (
    <article className={styles.card}>
      <div className={styles.imgContainer} onClick={() => onOpen?.(producto.slug)}>
        {imagen && (
          <Image
            src={imagen}
            alt={producto.nombre}
            className={styles.img}
            fill
            sizes="(max-width: 768px) 50vw, 200px"
          />
        )}
        {tag && (
          <span className={`${styles.tag} ${tag.className}`} style={tag.color ? { background: tag.color } : undefined}>
            {tag.label}
          </span>
        )}
        {rank != null && <span className={styles.rank}>{rank}</span>}
        <button
          className={`${styles.wishlistBtn} ${isWished ? styles.wishlistBtnActive : ''}`}
          onClick={() => toggle(producto.id)}
          aria-label={isWished ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <i className={`${isWished ? 'fa-solid' : 'fa-regular'} fa-heart`} />
        </button>
        {producto.badge === 'Oferta' && secondsRemaining > 0 && (
          <div className={styles.offerTimer}>{formatTimer(secondsRemaining)}</div>
        )}
      </div>

      <div className={styles.info}>
        <div onClick={() => onOpen?.(producto.slug)} style={{ cursor: 'pointer' }}>
          <div className={styles.stars}>
            <span className={styles.starsFilled}>{'★'.repeat(ratingValue)}</span>
            <span className={styles.starsEmpty}>{'☆'.repeat(5 - ratingValue)}</span>
          </div>
          <h3>{producto.nombre}</h3>
          {categoria && <p className={styles.category}>{categoria}</p>}
        </div>
        <div className={styles.priceRow}>
          <p className={`${styles.price} ${showOriginalPrice ? styles.priceDiscounted : ''}`}>
            {showOriginalPrice && (
              <span className={styles.originalPrice}>{formatPrice(producto.precioOriginal as number)}</span>
            )}
            {desde.varia ? `Desde ${formatPrice(desde.min)}` : formatPrice(producto.precio)}
          </p>
          <button
            className={styles.addBtn}
            onClick={() => onQuickAdd?.(producto.id)}
            aria-label="Agregar al carrito"
          >
            <i className="fa-solid fa-plus" />
          </button>
        </div>
        {showStockWarning && <span className={styles.stockWarning}>ÚLTIMAS {stock} UNIDADES</span>}
      </div>
    </article>
  )
}
