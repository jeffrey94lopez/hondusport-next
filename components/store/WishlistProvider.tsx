'use client'
import { useEffect, useState } from 'react'
import { WishlistContext } from '@/lib/store/wishlist-context'
import { toggleWishlist } from '@/lib/store/wishlist'

const WISHLIST_KEY = 'hs_wishlist'

function readWishlist(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WISHLIST_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

interface WishlistProviderProps {
  children: React.ReactNode
}

export default function WishlistProvider({ children }: WishlistProviderProps) {
  // Guard de montaje (mismo motivo que PosClient): el SSR pinta wishlist
  // vacía; si el initializer leyera localStorage, el primer render del
  // cliente ya tendría los ids guardados y React reportaría un hydration
  // mismatch. La wishlist se carga después de montar.
  const [ids, setIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Carga diferida a propósito: leer localStorage en el initializer
    // reintroduce el hydration mismatch (ver comentario del guard).
    /* eslint-disable react-hooks/set-state-in-effect */
    setIds(readWishlist())
    setLoaded(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    // Sin `loaded`, el primer render (wishlist vacía) sobreescribiría lo
    // guardado antes de que el efecto de carga lo lea.
    if (!loaded) return
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids))
  }, [loaded, ids])

  function has(id: string): boolean {
    return ids.includes(id)
  }

  function toggle(id: string) {
    setIds(prev => toggleWishlist(prev, id))
  }

  return <WishlistContext.Provider value={{ ids, has, toggle }}>{children}</WishlistContext.Provider>
}
