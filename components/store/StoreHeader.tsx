'use client'
import { useState } from 'react'
import Nav from './Nav'
import MobileNav from './MobileNav'
import BottomNav from './BottomNav'
import type { Categoria } from '@/types/store'

interface StoreHeaderProps {
  logoUrl?: string
  categorias: Categoria[]
  subcategorias?: Categoria[]
  activeCats?: string[]
  activeSubcats?: string[]
  onSelectCat?: (cat: string | null) => void
  onSelectSubcat?: (cat: string, subcat: string) => void
  onOpenSearch?: () => void
  onOpenCart?: () => void
  onOpenWishlist?: () => void
}

export default function StoreHeader({
  logoUrl,
  categorias,
  subcategorias = [],
  activeCats = [],
  activeSubcats = [],
  onSelectCat,
  onSelectSubcat,
  onOpenSearch,
  onOpenCart,
  onOpenWishlist,
}: StoreHeaderProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const noop = () => {}

  return (
    <>
      <Nav
        logoUrl={logoUrl}
        categorias={categorias}
        subcategorias={subcategorias}
        activeCats={activeCats}
        activeSubcats={activeSubcats}
        onSelectCat={onSelectCat ?? noop}
        onSelectSubcat={onSelectSubcat ?? (() => {})}
        onOpenSearch={onOpenSearch ?? noop}
        onOpenCart={onOpenCart ?? noop}
        onOpenWishlist={onOpenWishlist ?? noop}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />
      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        logoUrl={logoUrl}
        categorias={categorias}
        activeCats={activeCats}
        onSelectCat={onSelectCat ?? noop}
      />
      <BottomNav
        onOpenSearch={onOpenSearch ?? noop}
        onOpenCart={onOpenCart ?? noop}
        onOpenWishlist={onOpenWishlist ?? noop}
      />
    </>
  )
}
