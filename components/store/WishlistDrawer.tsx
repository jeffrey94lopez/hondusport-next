'use client'
import Image from 'next/image'
import styles from './WishlistDrawer.module.css'
import { formatPrice } from '@/lib/store/format'
import { useWishlist } from '@/lib/store/wishlist-context'
import { useCart } from '@/lib/store/cart-context'
import { getTallas } from '@/lib/store/getTallas'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { StoreProducto, Categoria } from '@/types/store'

interface WishlistDrawerProps {
  productos: StoreProducto[]
  tallaFiltros: Categoria[]
  isOpen: boolean
  onClose: () => void
  onOpenProduct?: (id: string) => void
}

export default function WishlistDrawer({ productos, tallaFiltros, isOpen, onClose, onOpenProduct }: WishlistDrawerProps) {
  const { ids, toggle } = useWishlist()
  const { addToCart } = useCart()

  useEscapeKey(isOpen, onClose)

  const items = productos.filter(p => ids.includes(p.id))

  function handleAddToCart(producto: StoreProducto) {
    const tallas = getTallas(producto, tallaFiltros)
    addToCart({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      imagen: producto.imagenes[0] ?? '',
      size: tallas[0] ?? 'Única',
      custom: 'Sin personalización',
      personalizable: producto.personalizable,
    })
  }

  return (
    <>
      <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} onClick={onClose} />

      <aside className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`} role="dialog" aria-label="Mis favoritos">
        <div className={styles.header}>
          <h2>MIS FAVORITOS</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar favoritos">
            ✕
          </button>
        </div>

        <div className={styles.items}>
          {items.length === 0 ? (
            <div className={styles.emptyMsg}>
              <p className={styles.emptyText}>NO TIENES FAVORITOS GUARDADOS</p>
            </div>
          ) : (
            items.map(producto => (
              <div className={styles.item} key={producto.id}>
                <Image src={producto.imagenes[0] ?? ''} alt={producto.nombre} className={styles.itemImg} width={70} height={70} />
                <div className={styles.itemInfo}>
                  <h4 className={styles.itemTitle} onClick={() => onOpenProduct?.(producto.id)} style={{ cursor: 'pointer' }}>
                    {producto.nombre}
                  </h4>
                  <p className={styles.itemPrice}>{formatPrice(producto.precio)}</p>
                  <div className={styles.itemActions}>
                    <button className={styles.addBtn} onClick={() => handleAddToCart(producto)}>
                      + CARRITO
                    </button>
                    <button className={styles.removeBtn} onClick={() => toggle(producto.id)}>
                      ELIMINAR
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.continueBtn} onClick={onClose}>
            SEGUIR COMPRANDO
          </button>
        </div>
      </aside>
    </>
  )
}
