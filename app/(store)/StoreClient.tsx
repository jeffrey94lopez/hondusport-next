'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import StoreHeader from '@/components/store/StoreHeader'
import HeroCarousel from '@/components/store/HeroCarousel'
import CategoryBar from '@/components/store/CategoryBar'
import ActiveFilterChips from '@/components/store/ActiveFilterChips'
import FilterSidebar from '@/components/store/FilterSidebar'
import ProductGrid from '@/components/store/ProductGrid'
import CartDrawer from '@/components/store/CartDrawer'
import WishlistDrawer from '@/components/store/WishlistDrawer'
import CheckoutModal from '@/components/store/CheckoutModal'
import MegaSearch from '@/components/store/MegaSearch'
import ExitPopup from '@/components/store/ExitPopup'
import Footer from '@/components/store/Footer'
import { useCart } from '@/lib/store/cart-context'
import { filterProductos } from '@/lib/store/filters'
import { getTallas } from '@/lib/store/getTallas'
import { useStoreFilters } from '@/lib/store/useStoreFilters'
import styles from './page.module.css'
import type { StoreProducto, Categoria, Banner, ConfigMap, Envio, Cupon } from '@/types/store'

const DEFAULT_MAX_PRICE = 5000
const DEFAULT_FREE_SHIPPING_THRESHOLD = 999
const SIN_PERSONALIZACION = 'Sin personalización'
const TALLA_UNICA = 'Única'

interface StoreClientProps {
  productos: StoreProducto[]
  categorias: Categoria[]
  banners: Banner[]
  envios: Envio[]
  cupones: Cupon[]
  config: ConfigMap
}

function isConfigActivo(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toUpperCase() !== 'FALSE'
}

export default function StoreClient({ productos, categorias, banners, envios, cupones, config }: StoreClientProps) {
  const router = useRouter()
  const { addToCart } = useCart()

  const maxPriceLimit = useMemo(() => Math.max(DEFAULT_MAX_PRICE, ...productos.map(p => p.precio)), [productos])
  const ctx = useMemo(() => ({ categorias, maxPriceLimit }), [categorias, maxPriceLimit])
  const { filters, toggle, setMaxPrice, clearOne, clearTipo, clearAll, activeCount } = useStoreFilters(ctx)

  const [cartOpen, setCartOpen] = useState(false)
  const [wishlistOpen, setWishlistOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false)

  const catsNav = categorias.filter(c => c.tipo === 'cat')
  const subcats = categorias.filter(c => c.tipo === 'subcat')
  const tallaFiltros = categorias.filter(c => c.tipo === 'talla')

  const filtered = filterProductos({ productos, ...filters, search: '', tallaFiltros })

  function openProduct(id: string) {
    router.push(`/producto/${id}`)
  }

  // StoreHeader/Footer envían '' o null para "todos" (limpiar); cualquier otro
  // valor es una categoría real.
  function handleCatLink(valor: string | null) {
    if (!valor) {
      clearAll()
      return
    }
    toggle('cat', valor)
  }

  function quickAdd(id: string) {
    const producto = productos.find(p => p.id === id)
    if (!producto) return
    const tallas = getTallas(producto, tallaFiltros)
    addToCart({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      imagen: producto.imagenes[0] ?? '',
      size: tallas[0] ?? TALLA_UNICA,
      custom: SIN_PERSONALIZACION,
      personalizable: producto.personalizable,
    })
  }

  const freeShippingActivo = isConfigActivo(config.free_shipping_activo, true)
  const parsedThreshold = Number(config.free_shipping_minimo)
  const freeShippingThreshold = config.free_shipping_minimo && Number.isFinite(parsedThreshold) ? parsedThreshold : DEFAULT_FREE_SHIPPING_THRESHOLD
  const cuponesPopupActivo = isConfigActivo(config.cupones_popup_activo, true)

  return (
    <>
      {config.promo_bar_texto && <div className={styles.promoBar}>{config.promo_bar_texto}</div>}
      <StoreHeader
        logoUrl={config.logo_url}
        categorias={catsNav}
        activeCats={filters.cats}
        onSelectCat={handleCatLink}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCart={() => setCartOpen(true)}
        onOpenWishlist={() => setWishlistOpen(true)}
      />
      <HeroCarousel banners={banners} />
      <CategoryBar
        cats={catsNav}
        subcats={subcats}
        activeCats={filters.cats}
        activeSubcats={filters.subcats}
        onToggleCat={valor => toggle('cat', valor)}
        onToggleSubcat={valor => toggle('subcat', valor)}
        onClearCats={() => { clearTipo('cat'); clearTipo('subcat') }}
      />
      <ActiveFilterChips
        filters={filters}
        maxPriceLimit={maxPriceLimit}
        onClearOne={clearOne}
        onClearAll={clearAll}
        onClearPrice={() => setMaxPrice(maxPriceLimit)}
      />
      <main className={styles.main}>
        <button className={styles.mobileFilterTrigger} onClick={() => setFilterSidebarOpen(true)}>
          🔍 FILTROS{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        <div className={styles.catalogLayout}>
          <FilterSidebar
            categorias={categorias}
            filters={filters}
            maxPriceLimit={maxPriceLimit}
            isOpen={filterSidebarOpen}
            onClose={() => setFilterSidebarOpen(false)}
            onToggle={toggle}
            onMaxPrice={setMaxPrice}
            onClearAll={clearAll}
          />
          <ProductGrid productos={filtered} totalProductos={productos.length} onQuickAdd={quickAdd} onOpen={openProduct} onClearFilters={clearAll} />
        </div>
      </main>
      <Footer config={config} categorias={catsNav} onFilterClick={handleCatLink} />
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
        productos={productos}
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
      <MegaSearch productos={productos} categorias={catsNav} isOpen={searchOpen} onClose={() => setSearchOpen(false)} onOpenProduct={openProduct} />
      <ExitPopup cupones={cupones} activo={cuponesPopupActivo} />
    </>
  )
}
