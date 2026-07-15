'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StoreHeader from './StoreHeader'
import CartDrawer from './CartDrawer'
import WishlistDrawer from './WishlistDrawer'
import CheckoutModal from './CheckoutModal'
import MegaSearch from './MegaSearch'
import type { StoreProducto, Categoria, ConfigMap, Envio, Cupon } from '@/types/store'

const DEFAULT_FREE_SHIPPING_THRESHOLD = 999

interface ProductPageShellProps {
  logoUrl?: string
  catsNav: Categoria[]
  tallaFiltros: Categoria[]
  allProductos: StoreProducto[]
  envios: Envio[]
  cupones: Cupon[]
  config: ConfigMap
  children: React.ReactNode
}

function isConfigActivo(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toUpperCase() !== 'FALSE'
}

export default function ProductPageShell({
  logoUrl,
  catsNav,
  tallaFiltros,
  allProductos,
  envios,
  cupones,
  config,
  children,
}: ProductPageShellProps) {
  const router = useRouter()
  const [cartOpen, setCartOpen] = useState(false)
  const [wishlistOpen, setWishlistOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  function openProduct(slug: string) {
    router.push(`/producto/${slug}`)
  }

  function selectCat() {
    router.push('/')
  }

  const freeShippingActivo = isConfigActivo(config.free_shipping_activo, true)
  const parsedThreshold = Number(config.free_shipping_minimo)
  const freeShippingThreshold =
    config.free_shipping_minimo && Number.isFinite(parsedThreshold) ? parsedThreshold : DEFAULT_FREE_SHIPPING_THRESHOLD

  return (
    <>
      <StoreHeader
        logoUrl={logoUrl}
        categorias={catsNav}
        onSelectCat={selectCat}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCart={() => setCartOpen(true)}
        onOpenWishlist={() => setWishlistOpen(true)}
      />
      {children}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false)
          setCheckoutOpen(true)
        }}
        onOpenProduct={openProduct}
        freeShippingActivo={freeShippingActivo}
        freeShippingThreshold={freeShippingThreshold}
        cupones={cupones}
      />
      <WishlistDrawer
        productos={allProductos}
        tallaFiltros={tallaFiltros}
        isOpen={wishlistOpen}
        onClose={() => setWishlistOpen(false)}
        onOpenProduct={openProduct}
      />
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        envios={envios}
        cupones={cupones}
        whatsappNumber={config.whatsapp_principal ?? ''}
        freeShippingActivo={freeShippingActivo}
        freeShippingThreshold={freeShippingThreshold}
      />
      <MegaSearch
        productos={allProductos}
        categorias={catsNav}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenProduct={openProduct}
      />
    </>
  )
}
