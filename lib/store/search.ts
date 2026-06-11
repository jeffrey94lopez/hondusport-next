import Fuse from 'fuse.js'
import type { StoreProducto } from '@/types/store'

const SEARCH_RESULT_LIMIT = 8

export function searchProductos(productos: StoreProducto[], query: string): StoreProducto[] {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const fuse = new Fuse(productos, {
    keys: ['nombre', 'cat', 'subcat', 'descripcion'],
    threshold: 0.4,
    ignoreLocation: true,
  })

  return fuse
    .search(trimmed)
    .map(result => result.item)
    .slice(0, SEARCH_RESULT_LIMIT)
}
