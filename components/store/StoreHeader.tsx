'use client'
import { useState } from 'react'
import Nav from './Nav'
import MobileNav from './MobileNav'
import BottomNav from './BottomNav'
import type { Categoria } from '@/types/store'

interface StoreHeaderProps {
  logoUrl?: string
  categorias: Categoria[]
  activeCats?: string[]
  onSelectCat?: (cat: string | null) => void
  onOpenSearch?: () => void
  onOpenCart?: () => void
  onOpenWishlist?: () => void
}

export default function StoreHeader({
  logoUrl,
  categorias,
  activeCats = [],
  onSelectCat,
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
        activeCats={activeCats}
        onSelectCat={onSelectCat ?? noop}
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
