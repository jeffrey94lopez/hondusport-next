import { describe, it, expect } from 'vitest'
import {
  COLUMNAS, INSTRUCCIONES,
  parseBool, parseNum, cellText, cellBool, splitList, joinList, normNombre,
  buildExportData, parseInventoryUpload,
} from '../inventoryRoundtrip'
import type { Producto } from '@/types'
import type { ParseContext } from '../inventoryRoundtrip'

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

function ctxBase(): ParseContext {
  return {
    existentes: [
      prod({ id: 'p1', nombre: 'Camiseta', slug: 'camiseta', precio: 250, stock: 10,
             sku: 'SKU1', categoria_id: 'c1', subcategoria_id: 's1', tallas: ['S'], colores: ['Rojo'],
             descripcion: 'vieja', precio_original: null, marca: 'Nike', activo: true, personalizable: false }),
    ],
    categorias: [{ id: 'c1', valor: 'Ropa' }, { id: 'c2', valor: 'Calzado' }],
    subcategorias: [
      { id: 's1', valor: 'Camisetas', categorias_padre: ['c1'] },
      { id: 's2', valor: 'Tenis', categorias_padre: ['c2'] },
    ],
  }
}

describe('parseInventoryUpload — actualizar', () => {
  it('actualiza precio y stock, conserva opcionales vacíos y el slug', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 300, stock: 5,
        descripcion: '', categoria: 'Ropa', subcategoria: 'Camisetas' }],
      nuevos: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.creates).toEqual([])
    expect(res.updates).toHaveLength(1)
    const u = res.updates[0]
    expect(u.id).toBe('p1')
    expect(u.precio).toBe(300)
    expect(u.stock).toBe(5)
    expect(u.descripcion).toBe('vieja') // opcional vacío = no cambia
    expect(u.slug).toBe('camiseta')     // no se regenera
    expect(u.categoria_id).toBe('c1')
    expect(u.subcategoria_id).toBe('s1')
  })

  it('stock vacío = no cambia; stock 0 = agotado', () => {
    const c = ctxBase()
    const r1 = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: '' }], nuevos: [] }, c)
    expect(r1.updates[0].stock).toBe(10)
    const r2 = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 0 }], nuevos: [] }, c)
    expect(r2.updates[0].stock).toBe(0)
  })

  it('error: id inexistente', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'zzz', nombre: 'X', precio: 10 }], nuevos: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors[0]).toMatchObject({ pestaña: 'Actualizar', fila: 2 })
    expect(res.errors[0].motivo).toContain('id')
  })

  it('error: nombre vacío y precio ≤ 0', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: '', precio: 0 }], nuevos: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors.map(e => e.motivo).join(' ')).toMatch(/nombre/)
    expect(res.errors.map(e => e.motivo).join(' ')).toMatch(/precio/)
  })

  it('error: categoría inexistente', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Zapatoss' }], nuevos: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('categoría')
  })

  it('error: subcategoría no pertenece a la categoría', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Ropa', subcategoria: 'Tenis' }], nuevos: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('subcategoría')
  })
})

describe('parseInventoryUpload — nuevos', () => {
  it('crea un producto con slug generado y defaults', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: 'Gorra', precio: 120, categoria: 'Ropa', tallas: 'Única' }],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.creates).toHaveLength(1)
    const c = res.creates[0]
    expect(c.nombre).toBe('Gorra')
    expect(c.slug).toBe('gorra')
    expect(c.precio).toBe(120)
    expect(c.stock).toBeNull()          // nuevo sin stock = ilimitado
    expect(c.activo).toBe(true)         // default
    expect(c.personalizable).toBe(false)
    expect(c.categoria_id).toBe('c1')
    expect(c.tallas).toEqual(['Única'])
  })

  it('ignora filas totalmente vacías', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{}, { nombre: '', precio: '' }] }, ctxBase())
    expect(res.creates).toEqual([])
    expect(res.errors).toEqual([])
  })

  it('error: fila nueva con id', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ id: 'x', nombre: 'Y', precio: 10 }] }, ctxBase())
    expect(res.errors[0].motivo).toContain('id')
  })

  it('genera slug único cuando choca con uno existente', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Camiseta', precio: 10 }] }, ctxBase())
    expect(res.creates[0].slug).toBe('camiseta-2')
  })
})

describe('parseInventoryUpload — SKU único', () => {
  it('error: alta con SKU ya existente en BD', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Otro', precio: 10, sku: 'SKU1' }] }, ctxBase())
    expect(res.errors[0].motivo).toContain('SKU')
  })
  it('error: dos filas con el mismo SKU', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: 'A', precio: 10, sku: 'DUP' }, { nombre: 'B', precio: 10, sku: 'DUP' }],
    }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('SKU'))).toBe(true)
  })
  it('actualizar conservando su propio SKU no es conflicto', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, sku: 'SKU1' }], nuevos: [] }, ctxBase())
    expect(res.errors).toEqual([])
  })
})

describe('parseInventoryUpload — atomicidad de datos', () => {
  it('devuelve updates y creates juntos cuando todo es válido', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 300 }],
      nuevos: [{ nombre: 'Nuevo', precio: 50 }],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.updates).toHaveLength(1)
    expect(res.creates).toHaveLength(1)
  })
})
