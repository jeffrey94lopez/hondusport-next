'use client'
import styles from './MobileNav.module.css'
import { useCart } from '@/lib/store/cart-context'

interface BottomNavProps {
  onOpenSearch: () => void
  onOpenCart: () => void
  onOpenWishlist: () => void
}

export default function BottomNav({ onOpenSearch, onOpenCart, onOpenWishlist }: BottomNavProps) {
  const { count } = useCart()

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav className={styles.bottomNav}>
      <button className={styles.bottomNavItem} onClick={scrollToTop}>
        <i className="fa-solid fa-house" />
        <span>Inicio</span>
      </button>
      <button className={styles.bottomNavItem} onClick={onOpenSearch}>
        <i className="fa-solid fa-magnifying-glass" />
        <span>Buscar</span>
      </button>
      <button className={styles.bottomNavItem} onClick={onOpenCart}>
        <i className="fa-solid fa-cart-shopping" />
        <span>Carrito</span>
        {count > 0 && <span className={styles.bottomBadge}>{count}</span>}
      </button>
      <button className={styles.bottomNavItem} onClick={onOpenWishlist}>
        <i className="fa-solid fa-heart" />
        <span>Favoritos</span>
      </button>
    </nav>
  )
}
