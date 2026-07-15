import { describe, it, expect } from 'vitest'
import {
  COLUMNAS, INSTRUCCIONES,
  parseBool, parseNum, cellText, cellBool, splitList, joinList, normNombre,
  buildExportData,
} from '../inventoryRoundtrip'
import type { Producto } from '@/types'

describe('helpers de celdas', () => {
  it('COLUMNAS trae id primero y las 16 columnas', () => {
    expect(COLUMNAS[0]).toBe('id')
    expect(COLUMNAS).toContain('precio')
    expect(COLUMNAS).toContain('activo')
    expect(COLUMNAS.length).toBe(16)
  })
  it('INSTRUCCIONES no está vacío', () => {
    expect(INSTRUCCIONES.length).toBeGreaterThan(3)
  })
  it('parseBool reconoce verdadero en varias formas', () => {
    expect(parseBool('VERDADERO')).toBe(true)
    expect(parseBool('true')).toBe(true)
    expect(parseBool(1)).toBe(true)
    expect(parseBool('SÍ')).toBe(true)
    expect(parseBool('FALSO')).toBe(false)
    expect(parseBool('')).toBe(false)
  })
  it('parseNum: vacío→undefined, número→number, texto→NaN', () => {
    expect(parseNum('')).toBeUndefined()
    expect(parseNum('   ')).toBeUndefined()
    expect(parseNum(null)).toBeUndefined()
    expect(parseNum('3350')).toBe(3350)
    expect(parseNum('3604.66')).toBe(3604.66)
    expect(parseNum(10)).toBe(10)
    expect(Number.isNaN(parseNum('abc'))).toBe(true)
  })
  it('cellText: vacío/espacios→undefined; si no, recorta', () => {
    expect(cellText('')).toBeUndefined()
    expect(cellText('  ')).toBeUndefined()
    expect(cellText(null)).toBeUndefined()
    expect(cellText('  hola ')).toBe('hola')
  })
  it('cellBool: vacío→undefined; si no, booleano', () => {
    expect(cellBool('')).toBeUndefined()
    expect(cellBool('VERDADERO')).toBe(true)
    expect(cellBool('FALSO')).toBe(false)
  })
  it('splitList / joinList', () => {
    expect(splitList('S, M ,L,')).toEqual(['S', 'M', 'L'])
    expect(splitList('')).toEqual([])
    expect(joinList(['Rojo', 'Azul'])).toBe('Rojo, Azul')
    expect(joinList(null)).toBe('')
  })
  it('normNombre recorta y baja a minúsculas', () => {
    expect(normNombre('  Zapatos  ')).toBe('zapatos')
  })
})

function prod(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'p1', nombre: 'Camiseta', slug: 'camiseta', descripcion: 'algodón',
    precio: 250, precio_original: null, categoria_id: 'c1', subcategoria_id: null,
    stock: 10, genero: 'Hombre', badge: null, tallas: ['S', 'M'], colores: ['Rojo'],
    imagenes: null, marca: 'Nike', sku: 'SKU1', personalizable: false,
    oferta_fin: null, activo: true, rating: 5, created_at: '', updated_at: '',
    ...overrides,
  }
}

describe('buildExportData', () => {
  const cats = [{ id: 'c1', valor: 'Ropa' }]
  const subs = [{ id: 's1', valor: 'Camisetas' }]

  it('mapea un producto a una fila con nombres de categoría', () => {
    const { actualizar } = buildExportData(
      [prod({ categoria_id: 'c1', subcategoria_id: 's1' })], cats, subs,
    )
    expect(actualizar).toHaveLength(1)
    const r = actualizar[0]
    expect(r.id).toBe('p1')
    expect(r.categoria).toBe('Ropa')
    expect(r.subcategoria).toBe('Camisetas')
    expect(r.tallas).toBe('S, M')
    expect(r.colores).toBe('Rojo')
    expect(r.personalizable).toBe('FALSO')
    expect(r.activo).toBe('VERDADERO')
  })

  it('nulos (stock, precio_original) salen como cadena vacía', () => {
    const { actualizar } = buildExportData(
      [prod({ stock: null, precio_original: null, sku: null, categoria_id: null })], cats, subs,
    )
    expect(actualizar[0].stock).toBe('')
    expect(actualizar[0].precio_original).toBe('')
    expect(actualizar[0].sku).toBe('')
    expect(actualizar[0].categoria).toBe('')
  })
})
