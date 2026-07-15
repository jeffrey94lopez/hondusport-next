'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './ProductGrid.module.css'
import ProductCard from './ProductCard'
import type { StoreProducto } from '@/types/store'

const ITEMS_PER_PAGE = 12
const SCROLL_AMOUNT = 200

interface ProductGridProps {
  productos: StoreProducto[]
  totalProductos: number
  onQuickAdd?: (id: string) => void
  onOpen?: (id: string) => void
  onClearFilters?: () => void
}

function FadeInItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setVisible(true)
        })
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`${styles.fadeInUp} ${visible ? styles.visible : ''} ${className ?? ''}`}>
      {children}
    </div>
  )
}

interface CarouselSectionProps {
  title: string
  badge?: React.ReactNode
  productos: StoreProducto[]
  sectionClassName: string
  rankFrom?: number
  onQuickAdd?: (id: string) => void
  onOpen?: (id: string) => void
}

function CarouselSection({ title, badge, productos, sectionClassName, rankFrom, onQuickAdd, onOpen }: CarouselSectionProps) {
  const gridRef = useRef<HTMLDivElement>(null)

  if (productos.length === 0) return null

  function scrollBy(delta: number) {
    gridRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <div className={`${styles.section} ${sectionClassName}`}>
      <h3 className={styles.sectionTitle}>
        {title}
        {badge}
        <span className={styles.sectionCount}>{productos.length} PRODUCTOS</span>
      </h3>
      <div className={styles.carouselWrapper}>
        <button className={`${styles.carouselBtn} ${styles.prev}`} onClick={() => scrollBy(-SCROLL_AMOUNT)} aria-label="Anterior">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <div ref={gridRef} className={`${styles.productsGrid} ${styles.scrollGrid}`}>
          {productos.map((p, idx) => (
            <FadeInItem key={p.id} className={styles.scrollItem}>
              <ProductCard producto={p} rank={rankFrom != null ? rankFrom + idx : undefined} onQuickAdd={onQuickAdd} onOpen={onOpen} />
            </FadeInItem>
          ))}
        </div>
        <button className={`${styles.carouselBtn} ${styles.next}`} onClick={() => scrollBy(SCROLL_AMOUNT)} aria-label="Siguiente">
          <i className="fa-solid fa-chevron-right" />
        </button>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className={`${styles.productsGrid} ${styles.todosGrid}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonImg} />
          <div className={styles.skeletonText} />
          <div className={`${styles.skeletonText} ${styles.skeletonTextShort}`} />
        </div>
      ))}
    </div>
  )
}

export default function ProductGrid({ productos, totalProductos, onQuickAdd, onOpen, onClearFilters }: ProductGridProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [prevProductos, setPrevProductos] = useState(productos)

  if (productos !== prevProductos) {
    setPrevProductos(productos)
    setCurrentPage(1)
  }

  if (totalProductos === 0) {
    return <SkeletonGrid />
  }

  if (productos.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.noResults}>🚫 NO SE ENCONTRARON PRODUCTOS.</p>
        {onClearFilters && (
          <button type="button" className={styles.emptyClearBtn} onClick={onClearFilters}>
            Limpiar filtros
          </button>
        )}
      </div>
    )
  }

  const isFullCatalog = productos.length === totalProductos

  const ofertas = isFullCatalog ? productos.filter(p => p.badge === 'Oferta') : []
  const nuevos = isFullCatalog ? productos.filter(p => p.badge === 'Nuevo') : []
  const vendidos = isFullCatalog ? productos.filter(p => p.badge === 'Más Vendido') : []
  const hasSpecials = ofertas.length > 0 || nuevos.length > 0 || vendidos.length > 0

  const todosTitle = isFullCatalog && hasSpecials ? 'VER TODO' : 'CATÁLOGO COMPLETO'

  const visibleCount = currentPage * ITEMS_PER_PAGE
  const visibleProductos = productos.slice(0, visibleCount)
  const hasMore = visibleCount < productos.length

  return (
    <>
      <CarouselSection
        title="Ofertas Especiales "
        badge={<span className={styles.offerTagPremium}>OFERTAS ACTIVAS</span>}
        productos={ofertas}
        sectionClassName={styles.sectionOfertas}
        onQuickAdd={onQuickAdd}
        onOpen={onOpen}
      />
      <CarouselSection
        title="Nuevos Productos "
        productos={nuevos}
        sectionClassName={styles.sectionNuevos}
        onQuickAdd={onQuickAdd}
        onOpen={onOpen}
      />
      <CarouselSection
        title="Más Vendidos "
        productos={vendidos}
        sectionClassName={styles.sectionVendidos}
        rankFrom={1}
        onQuickAdd={onQuickAdd}
        onOpen={onOpen}
      />

      <div className={`${styles.section} ${styles.sectionTodos}`}>
        <h3 className={styles.sectionTitle}>
          {todosTitle} <span className={styles.sectionCount}>{productos.length} PRODUCTOS</span>
        </h3>
        <div className={`${styles.productsGrid} ${styles.todosGrid}`}>
          {visibleProductos.map(p => (
            <FadeInItem key={p.id}>
              <ProductCard producto={p} onQuickAdd={onQuickAdd} onOpen={onOpen} />
            </FadeInItem>
          ))}
        </div>
        {hasMore && (
          <div className={styles.loadMoreContainer}>
            <button className={styles.loadMoreBtn} onClick={() => setCurrentPage(prev => prev + 1)}>
              MOSTRAR MÁS
            </button>
          </div>
        )}
      </div>
    </>
  )
}
