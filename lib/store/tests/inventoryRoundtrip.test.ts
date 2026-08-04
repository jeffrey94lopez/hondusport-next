import { describe, it, expect } from 'vitest'
import {
  COLUMNAS, INSTRUCCIONES, VARIANTES_COLUMNAS, NOTA_VENDE_POR_VARIANTES,
  parseBool, parseNum, cellText, cellBool, splitList, joinList, normNombre,
  buildExportData, parseInventoryUpload,
} from '../inventoryRoundtrip'
import type { Producto, ProductoVariante } from '@/types'
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

function varianteBD(overrides: Partial<ProductoVariante> = {}): ProductoVariante {
  return {
    id: 'v1', producto_id: 'p1', nombre: 'M', sku: null, precio: null, stock: null,
    activo: true, orden: 0, created_at: '', updated_at: '',
    ...overrides,
  }
}

describe('buildExportData', () => {
  const cats = [{ id: 'c1', valor: 'Ropa' }]
  const subs = [{ id: 's1', valor: 'Camisetas' }]

  it('mapea un producto a una fila con nombres de categoría', () => {
    const { actualizar } = buildExportData(
      [prod({ categoria_id: 'c1', subcategoria_id: 's1' })], cats, subs, [],
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
      [prod({ stock: null, precio_original: null, sku: null, categoria_id: null })], cats, subs, [],
    )
    expect(actualizar[0].stock).toBe('')
    expect(actualizar[0].precio_original).toBe('')
    expect(actualizar[0].sku).toBe('')
    expect(actualizar[0].categoria).toBe('')
  })

  it('VARIANTES_COLUMNAS trae las 8 columnas esperadas', () => {
    expect(VARIANTES_COLUMNAS).toEqual([
      'producto_id', 'producto', 'variante_id', 'variante', 'sku', 'precio', 'stock', 'activo',
    ])
  })

  it('exporta la pestaña Variantes con una fila por variante', () => {
    const { variantes } = buildExportData([prod()], [], [], [
      varianteBD({ id: 'v1', producto_id: prod().id, nombre: 'M', sku: 'SKU-M', precio: 150, stock: 3, orden: 0 }),
      varianteBD({ id: 'v2', producto_id: prod().id, nombre: 'L', sku: null, precio: null, stock: null, orden: 1 }),
    ])
    expect(variantes).toEqual([
      { producto_id: prod().id, producto: prod().nombre, variante_id: 'v1', variante: 'M', sku: 'SKU-M', precio: 150, stock: 3, activo: 'VERDADERO' },
      { producto_id: prod().id, producto: prod().nombre, variante_id: 'v2', variante: 'L', sku: '', precio: '', stock: '', activo: 'VERDADERO' },
    ])
  })

  it('un producto con variantes exporta stock y tallas con la nota', () => {
    const { actualizar } = buildExportData([prod()], [], [], [varianteBD({ producto_id: prod().id })])
    expect(actualizar[0].stock).toBe(NOTA_VENDE_POR_VARIANTES)
    expect(actualizar[0].tallas).toBe(NOTA_VENDE_POR_VARIANTES)
  })

  it('un producto sin variantes exporta stock y tallas normales', () => {
    const { actualizar } = buildExportData([prod({ stock: 4 })], [], [], [])
    expect(actualizar[0].stock).toBe(4)
    expect(actualizar[0].tallas).toBe('S, M')
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
    variantesExistentes: [],
  }
}

describe('parseInventoryUpload — actualizar', () => {
  it('actualiza precio y stock, conserva opcionales vacíos y el slug', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 300, stock: 5,
        descripcion: '', categoria: 'Ropa', subcategoria: 'Camisetas' }],
      nuevos: [],
      variantes: [],
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
    const r1 = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: '' }], nuevos: [], variantes: [] }, c)
    expect(r1.updates[0].stock).toBe(10)
    const r2 = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 0 }], nuevos: [], variantes: [] }, c)
    expect(r2.updates[0].stock).toBe(0)
  })

  it('error: id inexistente', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'zzz', nombre: 'X', precio: 10 }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors[0]).toMatchObject({ pestaña: 'Actualizar', fila: 2 })
    expect(res.errors[0].motivo).toContain('id')
  })

  it('error: nombre vacío y precio ≤ 0', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: '', precio: 0 }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors.map(e => e.motivo).join(' ')).toMatch(/nombre/)
    expect(res.errors.map(e => e.motivo).join(' ')).toMatch(/precio/)
  })

  it('error: categoría inexistente', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Zapatoss' }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('categoría')
  })

  it('error: subcategoría no pertenece a la categoría', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Ropa', subcategoria: 'Tenis' }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('subcategoría')
  })
})

describe('parseInventoryUpload — nuevos', () => {
  it('crea un producto con slug generado y defaults', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: 'Gorra', precio: 120, categoria: 'Ropa', tallas: 'Única' }],
      variantes: [],
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
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{}, { nombre: '', precio: '' }], variantes: [] }, ctxBase())
    expect(res.creates).toEqual([])
    expect(res.errors).toEqual([])
  })

  it('error: fila nueva con id', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ id: 'x', nombre: 'Y', precio: 10 }], variantes: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('id')
  })

  it('genera slug único cuando choca con uno existente', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Camiseta', precio: 10 }], variantes: [] }, ctxBase())
    expect(res.creates[0].slug).toBe('camiseta-2')
  })
})

describe('parseInventoryUpload — SKU único', () => {
  it('error: alta con SKU ya existente en BD', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Otro', precio: 10, sku: 'SKU1' }], variantes: [] }, ctxBase())
    expect(res.errors[0].motivo).toContain('SKU')
  })
  it('error: dos filas con el mismo SKU', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: 'A', precio: 10, sku: 'DUP' }, { nombre: 'B', precio: 10, sku: 'DUP' }],
      variantes: [],
    }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('SKU'))).toBe(true)
  })
  it('actualizar conservando su propio SKU no es conflicto', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, sku: 'SKU1' }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.errors).toEqual([])
  })
  it('SKU no se reserva en fila inválida: una fila inválida con SKU X1 no bloquea una fila válida posterior con el mismo SKU', () => {
    const res = parseInventoryUpload({
      actualizar: [],
      nuevos: [{ nombre: '', precio: 10, sku: 'X1' }, { nombre: 'Valido', precio: 20, sku: 'X1' }],
      variantes: [],
    }, ctxBase())
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].motivo).toContain('nombre')
    expect(res.creates).toHaveLength(1)
    expect(res.creates[0].nombre).toBe('Valido')
    expect(res.errors.some(e => e.motivo.includes('repetido'))).toBe(false)
  })
})

describe('parseInventoryUpload — id único en Actualizar', () => {
  it('error: dos filas de Actualizar con el mismo id', () => {
    // SKUs distintos a propósito para que la única forma de fallar sea la
    // detección de id duplicado (no un choque incidental de SKU).
    const res = parseInventoryUpload({
      actualizar: [
        { id: 'p1', nombre: 'Camiseta', precio: 250, sku: 'AAA' },
        { id: 'p1', nombre: 'Camiseta', precio: 300, sku: 'BBB' },
      ],
      nuevos: [],
      variantes: [],
    }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('repetido'))).toBe(true)
    expect(res.errors.some(e => e.motivo.includes('id'))).toBe(true)
    expect(res.updates.filter(u => u.id === 'p1').length).toBeLessThanOrEqual(1)
  })
})

describe('parseInventoryUpload — re-validación de subcategoría al cambiar categoría', () => {
  it('error: cambia la categoría y deja subcategoría vacía, quedando la subcat anterior huérfana', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, categoria: 'Calzado' }],
      nuevos: [],
      variantes: [],
    }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('subcategoría'))).toBe(true)
  })
})

describe('parseInventoryUpload — atomicidad de datos', () => {
  it('devuelve updates y creates juntos cuando todo es válido', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 300 }],
      nuevos: [{ nombre: 'Nuevo', precio: 50 }],
      variantes: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.updates).toHaveLength(1)
    expect(res.creates).toHaveLength(1)
  })
})

describe('parseInventoryUpload — pestaña Variantes', () => {
  const ctx = ctxBase()
  const prod = ctx.existentes[0]
  const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prod.id, nombre: 'M', sku: 'SKU-M', stock: 3 })] }
  const vacio = { actualizar: [], nuevos: [] }

  it('actualiza una variante existente por variante_id', () => {
    const r = parseInventoryUpload({ ...vacio, variantes: [
      { producto_id: prod.id, variante_id: 'v1', variante: 'M', stock: '10' },
    ] }, ctxV)
    expect(r.errors).toEqual([])
    expect(r.variantes.updates[0]).toMatchObject({ id: 'v1', stock: 10, nombre: 'M' })
  })

  it('celda vacía = no cambia (stock/precio/sku conservan el valor de BD)', () => {
    const r = parseInventoryUpload({ ...vacio, variantes: [
      { producto_id: prod.id, variante_id: 'v1', variante: 'M' },
    ] }, ctxV)
    expect(r.variantes.updates[0]).toMatchObject({ stock: 3, sku: 'SKU-M' })
  })

  it('fila sin variante_id crea la variante', () => {
    const r = parseInventoryUpload({ ...vacio, variantes: [
      { producto_id: prod.id, variante: 'L', stock: '5' },
    ] }, ctxV)
    expect(r.variantes.creates[0]).toMatchObject({ producto_id: prod.id, nombre: 'L', stock: 5 })
  })

  it('errores: producto_id desconocido, variante_id ajeno, nombre duplicado, sku repetido', () => {
    const r = parseInventoryUpload({ ...vacio, variantes: [
      { producto_id: 'no-existe', variante: 'M' },
      { producto_id: prod.id, variante_id: 'v-ajeno', variante: 'M' },
      { producto_id: prod.id, variante: 'M' },                    // ya existe 'M' en BD
      { producto_id: prod.id, variante: 'XL', sku: 'SKU-M' },     // sku de otra variante
    ] }, ctxV)
    expect(r.errors).toHaveLength(4)
    expect(r.errors.every(e => e.pestaña === 'Variantes')).toBe(true)
  })

  it('los productos con variantes ignoran stock y tallas en Actualizar', () => {
    const r = parseInventoryUpload({
      actualizar: [{ id: prod.id, nombre: prod.nombre, precio: prod.precio, stock: '99', tallas: 'S, M' }],
      nuevos: [], variantes: [],
    }, ctxV)
    expect(r.updates[0].stock).toBe(prod.stock)
    expect(r.updates[0].tallas).toEqual(prod.tallas)
  })

  it('salta filas totalmente vacías en Variantes', () => {
    const r = parseInventoryUpload({ ...vacio, variantes: [{}] }, ctxV)
    expect(r.errors).toEqual([])
    expect(r.variantes.updates).toEqual([])
    expect(r.variantes.creates).toEqual([])
  })
})
