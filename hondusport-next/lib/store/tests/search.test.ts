import { describe, expect, test } from 'vitest'
import { searchProductos } from '../search'
import type { StoreProducto } from '@/types/store'

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
    ...overrides,
  }
}

describe('searchProductos', () => {
  const productos: StoreProducto[] = [
    makeProducto({ id: '1', nombre: 'Camiseta Roja', cat: 'Camisetas' }),
    makeProducto({ id: '2', nombre: 'Pantalón Negro', cat: 'Pantalones', descripcion: 'Un pantalón deportivo' }),
    makeProducto({ id: '3', nombre: 'Camiseta Azul', cat: 'Camisetas' }),
  ]

  test('returns empty array when query is empty', () => {
    expect(searchProductos(productos, '')).toEqual([])
  })

  test('returns empty array when query is only whitespace', () => {
    expect(searchProductos(productos, '   ')).toEqual([])
  })

  test('returns matching productos by name', () => {
    const result = searchProductos(productos, 'camiseta')
    expect(result.map(p => p.id).sort()).toEqual(['1', '3'])
  })

  test('returns matching productos by category', () => {
    const result = searchProductos(productos, 'pantalones')
    expect(result.map(p => p.id)).toEqual(['2'])
  })

  test('returns at most 8 results', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeProducto({ id: String(i), nombre: `Camiseta ${i}` })
    )
    const result = searchProductos(many, 'camiseta')
    expect(result.length).toBeLessThanOrEqual(8)
  })

  test('returns empty array when nothing matches', () => {
    expect(searchProductos(productos, 'zapatos')).toEqual([])
  })
})
