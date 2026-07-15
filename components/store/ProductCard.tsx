'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import styles from './ProductCard.module.css'
import { formatPrice, getBadgeColor } from '@/lib/store/format'
import { getOfferSecondsRemaining } from '@/lib/store/offerTimer'
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

  const showStockWarning = producto.stock != null && producto.stock > 0 && producto.stock <= STOCK_LIMITE
  const showOriginalPrice = producto.precioOriginal != null && producto.precioOriginal > producto.precio
  const imagen = producto.imagenes[0] ?? ''

  return (
    <article className={styles.card}>
      {rank != null && <span className={styles.rank}>{rank}</span>}
      {producto.badge && (
        <span className={styles.badge} style={{ background: getBadgeColor(producto.badge) }}>
          {producto.badge}
        </span>
      )}

      <button
        className={`${styles.wishlistBtn} ${isWished ? styles.wishlistBtnActive : ''}`}
        onClick={() => toggle(producto.id)}
        aria-label={isWished ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <i className={`${isWished ? 'fa-solid' : 'fa-regular'} fa-heart`} />
      </button>

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
        {producto.badge === 'Oferta' && secondsRemaining > 0 && (
          <div className={styles.offerTimer}>{formatTimer(secondsRemaining)}</div>
        )}
      </div>

      <div className={styles.info}>
        <div onClick={() => onOpen?.(producto.slug)} style={{ cursor: 'pointer' }}>
          <div className={styles.stars}>
            {'★'.repeat(producto.rating || 5)}
            {'☆'.repeat(5 - (producto.rating || 5))}
          </div>
          <h3>{producto.nombre}</h3>
          <p className={styles.price}>
            {showOriginalPrice && (
              <span className={styles.originalPrice}>{formatPrice(producto.precioOriginal as number)}</span>
            )}
            {formatPrice(producto.precio)}
          </p>
          {showStockWarning && (
            <span className={styles.stockWarning}>ÚLTIMAS {producto.stock} UNIDADES</span>
          )}
        </div>
        <div className={styles.btnRow}>
          <button className={`${styles.btnAddMain} ${styles.btnHalf}`} onClick={() => onOpen?.(producto.slug)}>
            VER
          </button>
          <button
            className={`${styles.btnAddMain} ${styles.btnHalf} ${styles.btnAddCart}`}
            onClick={() => onQuickAdd?.(producto.id)}
          >
            + CARRITO
          </button>
        </div>
        <button className={styles.cardMobileAddBtn} onClick={() => onQuickAdd?.(producto.id)}>
          + CARRITO
        </button>
      </div>
    </article>
  )
}
