'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from './ProductCard.module.css'
import { formatPrice, getBadgeColor, getDiscountPercent } from '@/lib/store/format'
import { getOfferSecondsRemaining } from '@/lib/store/offerTimer'
import { precioDesde, stockEfectivo, estaAgotado } from '@/lib/store/variantes'
import { useWishlist } from '@/lib/store/wishlist-context'
import { useCart } from '@/lib/store/cart-context'
import { getCountForProduct } from '@/lib/store/cart'
import type { StoreProducto } from '@/types/store'

const STOCK_LIMITE = 5
// Cuanto dura la confirmacion del boton de agregar al carrito.
const ADDED_MS = 1200

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
  // Devuelve true solo si el clic AGREGO al carrito. Un producto con variantes
  // manda a la ficha en vez de agregar, y confirmar ahi seria mentir.
  onQuickAdd?: (id: string) => boolean
  onOpen?: (id: string) => void
}

export default function ProductCard({ producto, rank, onQuickAdd, onOpen }: ProductCardProps) {
  const { has, toggle } = useWishlist()
  const isWished = has(producto.id)
  const { cart } = useCart()
  const enCarrito = getCountForProduct(cart, producto.id)

  const [justAdded, setJustAdded] = useState(false)
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (addedTimer.current) clearTimeout(addedTimer.current)
  }, [])

  function handleAdd() {
    if (!onQuickAdd?.(producto.id)) return
    setJustAdded(true)
    // Reclick antes de que expire: reinicia la cuenta en vez de encadenar dos
    // temporizadores, que apagarian la confirmacion antes de tiempo.
    if (addedTimer.current) clearTimeout(addedTimer.current)
    addedTimer.current = setTimeout(() => setJustAdded(false), ADDED_MS)
  }

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
            className={`${styles.addBtn} ${justAdded ? styles.addBtnAdded : ''}`}
            onClick={handleAdd}
            aria-label={
              justAdded
                ? 'Agregado al carrito'
                : enCarrito > 0
                  ? `Agregar al carrito (${enCarrito} en el carrito)`
                  : 'Agregar al carrito'
            }
          >
            <i className={`fa-solid ${justAdded ? 'fa-check' : 'fa-cart-shopping'}`} />
            {enCarrito > 0 && (
              <span className={styles.addBtnCount} data-testid="card-cart-count" aria-hidden="true">
                {enCarrito}
              </span>
            )}
          </button>
        </div>
        {showStockWarning && <span className={styles.stockWarning}>ÚLTIMAS {stock} UNIDADES</span>}
      </div>
    </article>
  )
}
