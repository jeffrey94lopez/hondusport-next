'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './Nav.module.css'
import ThemeToggle from './ThemeToggle'
import { useCart } from '@/lib/store/cart-context'
import { useWishlist } from '@/lib/store/wishlist-context'
import type { Categoria } from '@/types/store'

const SCROLL_THRESHOLD = 50

interface NavProps {
  logoUrl?: string
  categorias: Categoria[]
  activeCats: string[]
  onSelectCat: (cat: string | null) => void
  onOpenSearch: () => void
  onOpenCart: () => void
  onOpenWishlist: () => void
  onOpenMobileNav: () => void
}

export default function Nav({
  logoUrl,
  categorias,
  activeCats,
  onSelectCat,
  onOpenSearch,
  onOpenCart,
  onOpenWishlist,
  onOpenMobileNav,
}: NavProps) {
  const [scrolled, setScrolled] = useState(false)
  const { count } = useCart()
  const { ids: wishlistIds } = useWishlist()

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD)
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`}>
      <button className={styles.hamburger} onClick={onOpenMobileNav} aria-label="Abrir menú">
        <div />
        <div />
        <div />
      </button>

      <Link href="/" className={styles.logo}>
        {logoUrl ? (
          <Image src={logoUrl} alt="Hondusport" className={styles.logoImg} width={140} height={45} priority />
        ) : (
          <span className={styles.logoText}>HONDUSPORT</span>
        )}
      </Link>

      <ul className={styles.navLinks}>
        <li>
          <button
            className={`${styles.navCatBtn} ${activeCats.length === 0 ? styles.navCatBtnActive : ''}`}
            onClick={() => onSelectCat(null)}
          >
            TODOS
          </button>
        </li>
        {categorias.map(cat => (
          <li key={cat.id}>
            <button
              className={`${styles.navCatBtn} ${activeCats.includes(cat.valor) ? styles.navCatBtnActive : ''}`}
              onClick={() => onSelectCat(cat.valor)}
            >
              {cat.valor.toUpperCase()}
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.searchContainer}>
        <i className={`fa-solid fa-magnifying-glass ${styles.searchIcon}`} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="BUSCAR..."
          aria-label="Buscar"
          readOnly
          onClick={onOpenSearch}
        />
      </div>

      <div className={styles.navActions}>
        <ThemeToggle />
        <button className={styles.iconBtn} onClick={onOpenWishlist} aria-label="Ver favoritos">
          <i className="fa-solid fa-heart" />
          {wishlistIds.length > 0 && <span className={styles.badge}>{wishlistIds.length}</span>}
        </button>
        <button className={styles.iconBtn} onClick={onOpenCart} aria-label="Ver carrito">
          <i className="fa-solid fa-cart-shopping" />
          <span className={styles.badge}>{count}</span>
        </button>
      </div>
    </nav>
  )
}
