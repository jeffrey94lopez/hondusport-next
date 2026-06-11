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
  const [ids, setIds] = useState<string[]>(readWishlist)

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids))
  }, [ids])

  function has(id: string): boolean {
    return ids.includes(id)
  }

  function toggle(id: string) {
    setIds(prev => toggleWishlist(prev, id))
  }

  return <WishlistContext.Provider value={{ ids, has, toggle }}>{children}</WishlistContext.Provider>
}
