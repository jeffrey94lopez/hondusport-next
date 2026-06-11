import { describe, it, expect } from 'vitest'
import { toConfigMap, toStoreProducto } from '../adapters'
import type { Producto, ConfigEntry } from '@/types'

const BASE_PRODUCTO: Producto = {
  id: 'p1',
  nombre: 'Camiseta Nike',
  descripcion: 'Camiseta deportiva',
  precio: 350,
  precio_original: null,
  categoria_id: 'cat-1',
  subcategoria_id: null,
  stock: 5,
  genero: 'Hombre',
  badge: 'Nuevo',
  tallas: ['S', 'M'],
  colores: ['Rojo'],
  imagenes: ['img1.jpg', null as unknown as string],
  marca: 'Nike',
  sku: 'ABC123',
  personalizable: false,
  oferta_fin: null,
  activo: true,
  rating: 5,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  categorias: { valor: 'Camisetas' },
  subcategorias: null,
}

describe('toConfigMap', () => {
  it('returns empty map for empty rows', () => {
    expect(toConfigMap([])).toEqual({})
  })

  it('maps key/value rows into a record', () => {
    const rows: ConfigEntry[] = [
      { key: 'site_name', value: 'Hondusport' },
      { key: 'eslogan', value: 'Elite Performance' },
    ]
    expect(toConfigMap(rows)).toEqual({
      site_name: 'Hondusport',
      eslogan: 'Elite Performance',
    })
  })

  it('falls back to empty string for null values', () => {
    const rows: ConfigEntry[] = [{ key: 'logo_url', value: null as unknown as string }]
    expect(toConfigMap(rows)).toEqual({ logo_url: '' })
  })

  it('keeps the last value when keys are duplicated', () => {
    const rows: ConfigEntry[] = [
      { key: 'color_principal', value: '#000000' },
      { key: 'color_principal', value: '#C9A84C' },
    ]
    expect(toConfigMap(rows)).toEqual({ color_principal: '#C9A84C' })
  })
})

describe('toStoreProducto', () => {
  it('maps a Supabase producto with category and subcategory joins', () => {
    const result = toStoreProducto({
      ...BASE_PRODUCTO,
      subcategoria_id: 'sub-1',
      subcategorias: { valor: 'Botines' },
    })

    expect(result).toEqual({
      id: 'p1',
      nombre: 'Camiseta Nike',
      descripcion: 'Camiseta deportiva',
      precio: 350,
      precioOriginal: null,
      cat: 'Camisetas',
      subcat: 'Botines',
      genero: 'Hombre',
      badge: 'Nuevo',
      tallas: ['S', 'M'],
      imagenes: ['img1.jpg'],
      stock: 5,
      rating: 5,
      ofertaFin: null,
    })
  })

  it('falls back to empty cat and null subcat when joins are missing', () => {
    const result = toStoreProducto({ ...BASE_PRODUCTO, categorias: null, subcategorias: null })
    expect(result.cat).toBe('')
    expect(result.subcat).toBeNull()
  })

  it('converts numeric strings and filters empty image entries', () => {
    const result = toStoreProducto({
      ...BASE_PRODUCTO,
      precio: '199.99' as unknown as number,
      precio_original: '299.99' as unknown as number,
      imagenes: ['', 'img1.jpg', null as unknown as string],
    })
    expect(result.precio).toBe(199.99)
    expect(result.precioOriginal).toBe(299.99)
    expect(result.imagenes).toEqual(['img1.jpg'])
  })

  it('defaults rating to 5 and tallas/imagenes to empty arrays when null', () => {
    const result = toStoreProducto({ ...BASE_PRODUCTO, rating: null as unknown as number, tallas: null, imagenes: null })
    expect(result.rating).toBe(5)
    expect(result.tallas).toEqual([])
    expect(result.imagenes).toEqual([])
  })
})
