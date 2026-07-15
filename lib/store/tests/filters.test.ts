import { describe, expect, test } from 'vitest'
import { filterProductos, sortProductos } from '../filters'
import type { StoreProducto, Categoria } from '@/types/store'

function makeProducto(overrides: Partial<StoreProducto> = {}): StoreProducto {
  return {
    id: '1',
    nombre: 'Camiseta Roja',
    descripcion: 'Una camiseta deportiva',
    precio: 500,
    precioOriginal: null,
    cat: 'Camisetas',
    subcat: null,
    genero: 'Hombre',
    badge: null,
    tallas: [],
    imagenes: [],
    stock: null,
    rating: 5,
    ofertaFin: null,
    personalizable: false,
    ...overrides,
  }
}

const tallaFiltros: Categoria[] = [
  {
    id: 't1',
    tipo: 'talla',
    valor: 'M',
    imagen: null,
    categorias_padre: ['Camisetas'],
    orden: 1,
    activo: true,
  },
  {
    id: 't2',
    tipo: 'talla',
    valor: '42',
    imagen: null,
    categorias_padre: ['Zapatos'],
    orden: 2,
    activo: true,
  },
]

describe('filterProductos', () => {
  const productos = [
    makeProducto({ id: '1', nombre: 'Camiseta Roja', precio: 500, cat: 'Camisetas', genero: 'Hombre' }),
    makeProducto({ id: '2', nombre: 'Camiseta Azul', precio: 1500, cat: 'Camisetas', genero: 'Mujer' }),
    makeProducto({ id: '3', nombre: 'Zapatos Deportivos', precio: 2500, cat: 'Zapatos', genero: 'Hombre', subcat: 'Running' }),
  ]

  test('filters by max price', () => {
    const result = filterProductos({
      productos,
      maxPrice: 1000,
      generos: [],
      cats: [],
      tallas: [],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['1'])
  })

  test('filters by genero', () => {
    const result = filterProductos({
      productos,
      maxPrice: 5000,
      generos: ['Mujer'],
      cats: [],
      tallas: [],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['2'])
  })

  test('filters by cat', () => {
    const result = filterProductos({
      productos,
      maxPrice: 5000,
      generos: [],
      cats: ['Zapatos'],
      tallas: [],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['3'])
  })

  test('filters by talla using tallaFiltros categorias_padre', () => {
    const result = filterProductos({
      productos,
      maxPrice: 5000,
      generos: [],
      cats: [],
      tallas: ['42'],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['3'])
  })

  test('excludes a product whose explicit tallas do not include the selected size', () => {
    const conTallas = [
      makeProducto({ id: '1', cat: 'Camisetas', tallas: ['S'] }),
      makeProducto({ id: '2', cat: 'Camisetas', tallas: ['M', 'L'] }),
    ]
    const result = filterProductos({
      productos: conTallas,
      maxPrice: 5000,
      generos: [],
      cats: [],
      tallas: ['M'],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['2'])
  })

  test('filters by subcat', () => {
    const result = filterProductos({
      productos,
      maxPrice: 5000,
      generos: [],
      cats: [],
      tallas: [],
      subcats: ['Running'],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['3'])
  })

  test('combines multiple filters', () => {
    const result = filterProductos({
      productos,
      maxPrice: 1600,
      generos: ['Mujer'],
      cats: ['Camisetas'],
      tallas: [],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['2'])
  })

  test('fuzzy searches by nombre', () => {
    const result = filterProductos({
      productos,
      maxPrice: 5000,
      generos: [],
      cats: [],
      tallas: [],
      subcats: [],
      search: 'zapatos',
      tallaFiltros,
    })
    expect(result.map(p => p.id)).toEqual(['3'])
  })

  test('returns empty array when nothing matches', () => {
    const result = filterProductos({
      productos,
      maxPrice: 100,
      generos: [],
      cats: [],
      tallas: [],
      subcats: [],
      search: '',
      tallaFiltros,
    })
    expect(result).toEqual([])
  })
})

describe('sortProductos', () => {
  const productos = [
    makeProducto({ id: '1', nombre: 'Bermuda', precio: 800 }),
    makeProducto({ id: '2', nombre: 'Abrigo', precio: 2000 }),
    makeProducto({ id: '3', nombre: 'Calceta', precio: 200 }),
  ]

  test('price-asc sorts ascending by precio', () => {
    const result = sortProductos(productos, 'price-asc')
    expect(result.map(p => p.id)).toEqual(['3', '1', '2'])
  })

  test('price-desc sorts descending by precio', () => {
    const result = sortProductos(productos, 'price-desc')
    expect(result.map(p => p.id)).toEqual(['2', '1', '3'])
  })

  test('name-asc sorts alphabetically by nombre', () => {
    const result = sortProductos(productos, 'name-asc')
    expect(result.map(p => p.id)).toEqual(['2', '1', '3'])
  })

  test('name-desc sorts reverse alphabetically by nombre', () => {
    const result = sortProductos(productos, 'name-desc')
    expect(result.map(p => p.id)).toEqual(['3', '1', '2'])
  })

  test('default does not change order', () => {
    const result = sortProductos(productos, 'default')
    expect(result.map(p => p.id)).toEqual(['1', '2', '3'])
  })

  test('does not mutate the original array', () => {
    const original = [...productos]
    sortProductos(productos, 'price-asc')
    expect(productos).toEqual(original)
  })
})
