import { describe, it, expect } from 'vitest'
import { getTallas } from '../getTallas'
import type { StoreProducto, Categoria } from '@/types/store'

const BASE_PRODUCTO: StoreProducto = {
  id: 'p1',
  nombre: 'Camiseta',
  slug: 'camiseta',
  descripcion: '',
  precio: 100,
  precioOriginal: null,
  cat: 'Camisetas',
  catId: 'c-camisetas',
  subcat: null,
  subcatId: null,
  genero: 'Hombre',
  badge: null,
  tallas: [],
  imagenes: [],
  stock: 5,
  rating: 5,
  ofertaFin: null,
  personalizable: false,
}

const TALLA_FILTROS: Categoria[] = [
  { id: 't1', tipo: 'talla', valor: 'S', imagen: null, slug: 's', categorias_padre: ['c-camisetas', 'c-shorts'], orden: 0, activo: true },
  { id: 't2', tipo: 'talla', valor: 'M', imagen: null, slug: 'm', categorias_padre: ['c-camisetas'], orden: 1, activo: true },
  { id: 't3', tipo: 'talla', valor: '38', imagen: null, slug: '38', categorias_padre: ['c-zapatos'], orden: 2, activo: true },
]

describe('getTallas', () => {
  it('returns the product own tallas when present', () => {
    const result = getTallas({ ...BASE_PRODUCTO, tallas: ['L', 'XL'] }, TALLA_FILTROS)
    expect(result).toEqual(['L', 'XL'])
  })

  it('derives tallas from category filters when product has none', () => {
    const result = getTallas(BASE_PRODUCTO, TALLA_FILTROS)
    expect(result).toEqual(['S', 'M'])
  })

  it('matches by category id, not name', () => {
    const result = getTallas({ ...BASE_PRODUCTO, cat: 'Camisetas', catId: 'c-camisetas' }, TALLA_FILTROS)
    expect(result).toEqual(['S', 'M'])
  })

  it('returns an empty array when no talla filter matches the category', () => {
    const result = getTallas({ ...BASE_PRODUCTO, catId: 'c-accesorios' }, TALLA_FILTROS)
    expect(result).toEqual([])
  })
})
