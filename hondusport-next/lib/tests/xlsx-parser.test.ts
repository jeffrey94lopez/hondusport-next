import { describe, it, expect } from 'vitest'
import { agruparProductos } from '../xlsx-parser'
import type { XlsxRow } from '@/types'

describe('agruparProductos', () => {
  it('agrupa filas con mismo nombre como un producto', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: 'Camiseta Nike', precio_venta: '350', existencia: '5', tamano: 'S', color: 'Rojo', marca: 'Nike', cbarras: 'ABC123', nombre_categoria: 'Camisetas', is_active: 'VERDADERO' },
      { nombre_producto: 'Camiseta Nike', precio_venta: '350', existencia: '3', tamano: 'M', color: 'Rojo', marca: 'Nike', cbarras: 'ABC123', nombre_categoria: 'Camisetas', is_active: 'VERDADERO' },
    ]
    const result = agruparProductos(rows)
    expect(result).toHaveLength(1)
    expect(result[0].tallas).toEqual(['S', 'M'])
    expect(result[0].stock).toBe(8)
    expect(result[0].precio).toBe(350)
  })

  it('deduplica tallas y colores', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: 'Shorts', precio_venta: '200', existencia: '2', tamano: 'L', color: 'Azul', marca: 'Adidas', cbarras: 'X1', nombre_categoria: 'Shorts', is_active: 'VERDADERO' },
      { nombre_producto: 'Shorts', precio_venta: '200', existencia: '2', tamano: 'L', color: 'Negro', marca: 'Adidas', cbarras: 'X1', nombre_categoria: 'Shorts', is_active: 'VERDADERO' },
    ]
    const result = agruparProductos(rows)
    expect(result[0].tallas).toEqual(['L'])
    expect(result[0].colores).toEqual(['Azul', 'Negro'])
  })

  it('excluye filas con is_active FALSO', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: 'Inactivo', precio_venta: '100', existencia: '1', is_active: 'FALSO' },
    ]
    const result = agruparProductos(rows)
    expect(result).toHaveLength(0)
  })

  it('omite filas sin nombre_producto', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: '', precio_venta: '100', existencia: '1', is_active: 'VERDADERO' },
    ]
    const result = agruparProductos(rows)
    expect(result).toHaveLength(0)
  })
})
