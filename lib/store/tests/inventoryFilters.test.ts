import { describe, it, expect } from 'vitest'
import type { Producto } from '@/types'
import {
  sinCategoria, sinImagen, sinDescripcion, sinPrecio, sinSku,
  filtrarInventario, UMBRAL_STOCK_BAJO,
} from '../inventoryFilters'

function make(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    nombre: 'Producto', slug: 'producto', descripcion: 'desc',
    precio: 100, precio_original: null,
    categoria_id: 'cat-1', subcategoria_id: null,
    stock: 10, genero: null, badge: null,
    tallas: null, colores: null, imagenes: ['http://x/img.jpg'],
    marca: null, sku: 'SKU1', personalizable: false,
    oferta_fin: null, activo: true, rating: 5,
    created_at: '', updated_at: '',
    ...overrides,
  }
}

describe('predicados de faltantes', () => {
  it('sinCategoria: true cuando categoria_id es null/vacio', () => {
    expect(sinCategoria(make({ categoria_id: null }))).toBe(true)
    expect(sinCategoria(make({ categoria_id: '' }))).toBe(true)
    expect(sinCategoria(make({ categoria_id: 'cat-1' }))).toBe(false)
  })
  it('sinImagen: true cuando no hay imagenes no vacias', () => {
    expect(sinImagen(make({ imagenes: null }))).toBe(true)
    expect(sinImagen(make({ imagenes: [] }))).toBe(true)
    expect(sinImagen(make({ imagenes: [''] }))).toBe(true)
    expect(sinImagen(make({ imagenes: ['http://x/i.jpg'] }))).toBe(false)
  })
  it('sinDescripcion: true cuando descripcion vacia/espacios/null', () => {
    expect(sinDescripcion(make({ descripcion: null }))).toBe(true)
    expect(sinDescripcion(make({ descripcion: '   ' }))).toBe(true)
    expect(sinDescripcion(make({ descripcion: 'algo' }))).toBe(false)
  })
  it('sinPrecio: true cuando precio 0 o menor', () => {
    expect(sinPrecio(make({ precio: 0 }))).toBe(true)
    expect(sinPrecio(make({ precio: -1 }))).toBe(true)
    expect(sinPrecio(make({ precio: 100 }))).toBe(false)
  })
  it('sinSku: true cuando sku vacio/null', () => {
    expect(sinSku(make({ sku: null }))).toBe(true)
    expect(sinSku(make({ sku: '  ' }))).toBe(true)
    expect(sinSku(make({ sku: 'SKU1' }))).toBe(false)
  })
})

describe('filtrarInventario', () => {
  it('sin criterios devuelve todos', () => {
    const ps = [make(), make(), make()]
    expect(filtrarInventario(ps, {})).toHaveLength(3)
  })
  it('AND entre dos faltantes: sin categoria Y sin imagen', () => {
    const soloSinCat = make({ categoria_id: null, imagenes: ['http://x/i.jpg'] })
    const ambos = make({ categoria_id: null, imagenes: [] })
    const res = filtrarInventario([soloSinCat, ambos], { sinCategoria: true, sinImagen: true })
    expect(res).toEqual([ambos])
  })
  it('filtra por categoriaIds', () => {
    const a = make({ categoria_id: 'cat-A' })
    const b = make({ categoria_id: 'cat-B' })
    expect(filtrarInventario([a, b], { categoriaIds: ['cat-A'] })).toEqual([a])
  })
  it('filtra por generos', () => {
    const h = make({ genero: 'Hombre' })
    const m = make({ genero: 'Mujer' })
    expect(filtrarInventario([h, m], { generos: ['Mujer'] })).toEqual([m])
  })
  it('stockBajo OR sinStock dentro de la dimension stock', () => {
    const bajo = make({ stock: 3 })
    const cero = make({ stock: 0 })
    const nulo = make({ stock: null })
    const ok = make({ stock: 50 })
    const res = filtrarInventario([bajo, cero, nulo, ok], { stockBajo: true, sinStock: true })
    expect(res).toEqual([bajo, cero, nulo])
  })
  it('stockBajo respeta el umbral (0 < stock < UMBRAL)', () => {
    expect(UMBRAL_STOCK_BAJO).toBe(5)
    const res = filtrarInventario([make({ stock: 0 }), make({ stock: 4 }), make({ stock: 5 })], { stockBajo: true })
    expect(res.map(p => p.stock)).toEqual([4])
  })
  it('activo filtra por estado', () => {
    const on = make({ activo: true })
    const off = make({ activo: false })
    expect(filtrarInventario([on, off], { activo: true })).toEqual([on])
    expect(filtrarInventario([on, off], { activo: false })).toEqual([off])
    expect(filtrarInventario([on, off], {})).toHaveLength(2)
  })
})
