'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './Nav.module.css'
import ThemeToggle from './ThemeToggle'
import { useCart } from '@/lib/store/cart-context'
import { useWishlist } from '@/lib/store/wishlist-context'
import { usePulseOnIncrease } from '@/lib/store/usePulseOnIncrease'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { Categoria } from '@/types/store'

const SCROLL_THRESHOLD = 50

interface NavProps {
  logoUrl?: string
  categorias: Categoria[]
  subcategorias: Categoria[]
  activeCats: string[]
  activeSubcats: string[]
  onSelectCat: (cat: string | null) => void
  onSelectSubcat: (cat: string, subcat: string) => void
  onOpenSearch: () => void
  onOpenCart: () => void
  onOpenWishlist: () => void
  onOpenMobileNav: () => void
}

export default function Nav({
  logoUrl,
  categorias,
  subcategorias,
  activeCats,
  activeSubcats,
  onSelectCat,
  onSelectSubcat,
  onOpenSearch,
  onOpenCart,
  onOpenWishlist,
  onOpenMobileNav,
}: NavProps) {
  const [scrolled, setScrolled] = useState(false)
  const [catsMenuOpen, setCatsMenuOpen] = useState(false)
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null)
  const { count } = useCart()
  const { ids: wishlistIds } = useWishlist()
  const cartPulsing = usePulseOnIncrease(count)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD)
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEscapeKey(catsMenuOpen, () => setCatsMenuOpen(false))

  function openCatsMenu() {
    // Al abrir, se precarga la categoría activa (o la primera) para que el
    // panel de subcategorías no aparezca vacío.
    const activa = categorias.find(c => activeCats.includes(c.valor))
    setExpandedCatId((activa ?? categorias[0])?.id ?? null)
    setCatsMenuOpen(true)
  }

  function closeCatsMenu() {
    setCatsMenuOpen(false)
  }

  function selectCat(valor: string) {
    onSelectCat(valor)
    closeCatsMenu()
  }

  function selectSubcat(catValor: string, subValor: string) {
    onSelectSubcat(catValor, subValor)
    closeCatsMenu()
  }

  const subcatsExpandidas = subcategorias.filter(s => (s.categorias_padre ?? []).includes(expandedCatId ?? ''))
  const catsMenuActivo = activeCats.length > 0 || activeSubcats.length > 0

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
            className={`${styles.navCatBtn} ${activeCats.length === 0 && activeSubcats.length === 0 ? styles.navCatBtnActive : ''}`}
            onClick={() => onSelectCat(null)}
          >
            TODOS
          </button>
        </li>
        <li className={styles.catsMenuWrapper}>
          <button
            className={`${styles.navCatBtn} ${catsMenuActivo ? styles.navCatBtnActive : ''}`}
            onClick={() => (catsMenuOpen ? closeCatsMenu() : openCatsMenu())}
            aria-expanded={catsMenuOpen}
          >
            CATEGORÍAS <i className={`fa-solid fa-chevron-down ${styles.catsMenuChevron} ${catsMenuOpen ? styles.catsMenuChevronOpen : ''}`} />
          </button>

          {catsMenuOpen && (
            <>
              <div className={styles.catsMenuBackdrop} onClick={closeCatsMenu} />
              <div className={styles.catsMenuPanel}>
                <div className={styles.catsMenuList}>
                  {categorias.map(cat => (
                    <button
                      key={cat.id}
                      className={`${styles.catsMenuItem} ${cat.id === expandedCatId ? styles.catsMenuItemActive : ''} ${activeCats.includes(cat.valor) ? styles.catsMenuItemSelected : ''}`}
                      onMouseEnter={() => setExpandedCatId(cat.id)}
                      onClick={() => selectCat(cat.valor)}
                    >
                      {cat.valor}
                      <i className="fa-solid fa-chevron-right" />
                    </button>
                  ))}
                </div>
                <div key={expandedCatId ?? 'none'} className={styles.catsMenuSubpanel}>
                  {subcatsExpandidas.length > 0 ? (
                    subcatsExpandidas.map(sub => (
                      <button
                        key={sub.id}
                        className={`${styles.catsMenuSubItem} ${activeSubcats.includes(sub.valor) ? styles.catsMenuItemSelected : ''}`}
                        onClick={() => {
                          const cat = categorias.find(c => c.id === expandedCatId)
                          if (cat) selectSubcat(cat.valor, sub.valor)
                        }}
                      >
                        {sub.valor}
                      </button>
                    ))
                  ) : (
                    <span className={styles.catsMenuSubEmpty}>Sin subcategorías</span>
                  )}
                </div>
              </div>
            </>
          )}
        </li>
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
          <span className={`${styles.badgeGold} ${cartPulsing ? styles.badgePulse : ''}`}>{count}</span>
        </button>
      </div>
    </nav>
  )
}
