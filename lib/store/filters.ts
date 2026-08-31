import Fuse from 'fuse.js'
import type { StoreProducto, Categoria } from '@/types/store'
import { getTallas } from './getTallas'

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
      const efectivas = getTallas(p, tallaFiltros)
      matchesTalla = tallas.some(t => efectivas.includes(t))
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
