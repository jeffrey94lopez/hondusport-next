import Fuse from 'fuse.js'
import type { StoreProducto, Categoria } from '@/types/store'

export type SortBy = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'

export interface FilterState {
  maxPrice: number
  generos: string[]
  cats: string[]
  tallas: string[]
  subcats: string[]
}

export interface FilterParams extends FilterState {
  productos: StoreProducto[]
  search: string
  tallaFiltros: Categoria[]
}

export function filterProductos(params: FilterParams): StoreProducto[] {
  const { productos, maxPrice, generos, cats, tallas, subcats, search, tallaFiltros } = params

  let filtered = productos.filter(p => {
    const matchesPrice = p.precio <= maxPrice
    const matchesGenero = generos.length === 0 || (p.genero != null && generos.includes(p.genero))
    const matchesCat = cats.length === 0 || cats.includes(p.cat)

    let matchesTalla = true
    if (tallas.length > 0) {
      const validSizeFilters = tallaFiltros.filter(f => tallas.includes(f.valor))
      matchesTalla = validSizeFilters.some(f =>
        (f.categorias_padre ?? []).some(padre => padre.toLowerCase() === p.cat.toLowerCase())
      )
    }

    let matchesSubcat = true
    if (subcats.length > 0) matchesSubcat = p.subcat != null && subcats.includes(p.subcat)

    return matchesPrice && matchesGenero && matchesCat && matchesTalla && matchesSubcat
  })

  if (search.trim() !== '') {
    const fuse = new Fuse(filtered, {
      keys: ['nombre', 'cat', 'descripcion'],
      threshold: 0.4,
      ignoreLocation: true,
    })
    filtered = fuse.search(search).map(result => result.item)
  }

  return filtered
}

export function sortProductos(productos: StoreProducto[], sortBy: SortBy): StoreProducto[] {
  const sorted = [...productos]

  switch (sortBy) {
    case 'price-asc':
      return sorted.sort((a, b) => a.precio - b.precio)
    case 'price-desc':
      return sorted.sort((a, b) => b.precio - a.precio)
    case 'name-asc':
      return sorted.sort((a, b) => a.nombre.localeCompare(b.nombre))
    case 'name-desc':
      return sorted.sort((a, b) => b.nombre.localeCompare(a.nombre))
    default:
      return sorted
  }
}
