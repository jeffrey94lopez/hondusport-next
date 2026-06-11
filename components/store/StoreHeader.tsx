'use client'
import { useState } from 'react'
import Nav from './Nav'
import MobileNav from './MobileNav'
import BottomNav from './BottomNav'
import type { Categoria } from '@/types/store'

interface StoreHeaderProps {
  logoUrl?: string
  categorias: Categoria[]
  onSelectCat?: (cat: string | null) => void
  onOpenSearch?: () => void
  onOpenCart?: () => void
  onOpenWishlist?: () => void
}

export default function StoreHeader({
  logoUrl,
  categorias,
  onSelectCat,
  onOpenSearch,
  onOpenCart,
  onOpenWishlist,
}: StoreHeaderProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  function selectCat(cat: string | null) {
    setActiveCat(cat)
    onSelectCat?.(cat)
  }

  const noop = () => {}

  return (
    <>
      <Nav
        logoUrl={logoUrl}
        categorias={categorias}
        activeCat={activeCat}
        onSelectCat={selectCat}
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
        activeCat={activeCat}
        onSelectCat={selectCat}
      />
      <BottomNav
        onOpenSearch={onOpenSearch ?? noop}
        onOpenCart={onOpenCart ?? noop}
        onOpenWishlist={onOpenWishlist ?? noop}
      />
    </>
  )
}
