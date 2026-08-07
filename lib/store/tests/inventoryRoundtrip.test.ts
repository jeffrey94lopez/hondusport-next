import { describe, it, expect } from 'vitest'
import {
  COLUMNAS, INSTRUCCIONES, VARIANTES_COLUMNAS, NOTA_VENDE_POR_VARIANTES,
  parseBool, parseNum, cellText, cellBool, splitList, joinList, normNombre,
  buildExportData, parseInventoryUpload, parseCostoEntrada,
} from '../inventoryRoundtrip'
import type { Producto, ProductoVariante } from '@/types'
import type { ParseContext } from '../inventoryRoundtrip'

describe('helpers de celdas', () => {
  it('COLUMNAS trae id primero y las 21 columnas (incluye canal/isv/precio_revendedor/stock_minimo/costo_entrada)', () => {
    expect(COLUMNAS[0]).toBe('id')
    expect(COLUMNAS).toContain('precio')
    expect(COLUMNAS).toContain('activo')
    expect(COLUMNAS).toContain('canal')
    expect(COLUMNAS).toContain('isv')
    expect(COLUMNAS).toContain('precio_revendedor')
    expect(COLUMNAS).toContain('stock_minimo')
    expect(COLUMNAS).toContain('costo_entrada')
    expect(COLUMNAS.length).toBe(21)
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
  it('parseCostoEntrada: vacío→null; negativo o cero→error y null; positivo→número', () => {
    const errs1: string[] = []
    expect(parseCostoEntrada('', errs1)).toBeNull()
    expect(errs1).toEqual([])

    const errs2: string[] = []
    expect(parseCostoEntrada(-5, errs2)).toBeNull()
    expect(errs2.some(e => e.includes('costo_entrada'))).toBe(true)

    const errs3: string[] = []
    expect(parseCostoEntrada(0, errs3)).toBeNull()
    expect(errs3.some(e => e.includes('costo_entrada'))).toBe(true)

    const errs4: string[] = []
    expect(parseCostoEntrada(50, errs4)).toBe(50)
    expect(errs4).toEqual([])
  })
})

function prod(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'p1', nombre: 'Camiseta', slug: 'camiseta', descripcion: 'algodón',
    precio: 250, precio_original: null, categoria_id: 'c1', subcategoria_id: null,
    stock: 10, genero: 'Hombre', badge: null, tallas: ['S', 'M'], colores: ['Rojo'],
    imagenes: null, marca: 'Nike', sku: 'SKU1', personalizable: false,
    canal: 'ambas', isv: '15', costo: null, precio_revendedor: null, stock_minimo: null,
    oferta_fin: null, activo: true, rating: 5, created_at: '', updated_at: '',
    ...overrides,
  }
}

function varianteBD(overrides: Partial<ProductoVariante> = {}): ProductoVariante {
  return {
    id: 'v1', producto_id: 'p1', nombre: 'M', sku: null, precio: null, stock: null,
    costo: null, precio_revendedor: null,
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

  it('VARIANTES_COLUMNAS trae las 11 columnas esperadas (incluye costo/precio_revendedor/costo_entrada)', () => {
    expect(VARIANTES_COLUMNAS).toEqual([
      'producto_id', 'producto', 'variante_id', 'variante', 'sku', 'precio', 'stock',
      'costo', 'precio_revendedor', 'costo_entrada', 'activo',
    ])
  })

  it('exporta la pestaña Variantes con una fila por variante', () => {
    const { variantes } = buildExportData([prod()], [], [], [
      varianteBD({ id: 'v1', producto_id: prod().id, nombre: 'M', sku: 'SKU-M', precio: 150, stock: 3, orden: 0 }),
      varianteBD({ id: 'v2', producto_id: prod().id, nombre: 'L', sku: null, precio: null, stock: null, orden: 1 }),
    ])
    expect(variantes).toEqual([
      { producto_id: prod().id, producto: prod().nombre, variante_id: 'v1', variante: 'M', sku: 'SKU-M', precio: 150, stock: 3, costo: '', precio_revendedor: '', costo_entrada: '', activo: 'VERDADERO' },
      { producto_id: prod().id, producto: prod().nombre, variante_id: 'v2', variante: 'L', sku: '', precio: '', stock: '', costo: '', precio_revendedor: '', costo_entrada: '', activo: 'VERDADERO' },
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

  it('exporta canal/isv/precio_revendedor/stock_minimo; costo_entrada siempre vacío (es de entrada, no informativo)', () => {
    const { actualizar } = buildExportData(
      [prod({ canal: 'tienda', isv: '18', precio_revendedor: 200, stock_minimo: 3 })], [], [], [],
    )
    expect(actualizar[0].canal).toBe('tienda')
    expect(actualizar[0].isv).toBe('18')
    expect(actualizar[0].precio_revendedor).toBe(200)
    expect(actualizar[0].stock_minimo).toBe(3)
    expect(actualizar[0].costo_entrada).toBe('')
  })

  it('nulos en precio_revendedor/stock_minimo salen como cadena vacía', () => {
    const { actualizar } = buildExportData([prod({ precio_revendedor: null, stock_minimo: null })], [], [], [])
    expect(actualizar[0].precio_revendedor).toBe('')
    expect(actualizar[0].stock_minimo).toBe('')
  })

  it('exporta costo (solo-lectura) y precio_revendedor de variante; costo_entrada siempre vacío', () => {
    const { variantes } = buildExportData([prod()], [], [], [
      varianteBD({ id: 'v1', producto_id: prod().id, nombre: 'M', costo: 80, precio_revendedor: 150 }),
    ])
    expect(variantes[0].costo).toBe(80)
    expect(variantes[0].precio_revendedor).toBe(150)
    expect(variantes[0].costo_entrada).toBe('')
  })

  it('costo/precio_revendedor null de variante salen como cadena vacía', () => {
    const { variantes } = buildExportData([prod()], [], [], [
      varianteBD({ id: 'v1', producto_id: prod().id, nombre: 'M', costo: null, precio_revendedor: null }),
    ])
    expect(variantes[0].costo).toBe('')
    expect(variantes[0].precio_revendedor).toBe('')
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

describe('parseInventoryUpload — canal/isv/precio_revendedor/stock_minimo', () => {
  it('actualiza canal, isv, precio_revendedor y stock_minimo', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, canal: 'tienda', isv: '18', precio_revendedor: 200, stock_minimo: 3 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    const u = res.updates[0]
    expect(u.canal).toBe('tienda')
    expect(u.isv).toBe('18')
    expect(u.precio_revendedor).toBe(200)
    expect(u.stock_minimo).toBe(3)
  })

  it('vacío = no cambia (conserva canal/isv/precio_revendedor/stock_minimo previos)', () => {
    const c = ctxBase()
    c.existentes[0].canal = 'mostrador'
    c.existentes[0].isv = 'exento'
    c.existentes[0].precio_revendedor = 180
    c.existentes[0].stock_minimo = 2
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250 }], nuevos: [], variantes: [] }, c)
    const u = res.updates[0]
    expect(u.canal).toBe('mostrador')
    expect(u.isv).toBe('exento')
    expect(u.precio_revendedor).toBe(180)
    expect(u.stock_minimo).toBe(2)
  })

  it('error: canal inválido', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, canal: 'x' }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('canal'))).toBe(true)
  })

  it('error: isv inválido', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, isv: '99' }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('isv'))).toBe(true)
  })

  it('error: precio_revendedor debe ser mayor a 0', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, precio_revendedor: 0 }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('precio_revendedor'))).toBe(true)
  })

  it('error: stock_minimo debe ser entero de 0 o más', () => {
    const res = parseInventoryUpload({ actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock_minimo: -1 }], nuevos: [], variantes: [] }, ctxBase())
    expect(res.errors.some(e => e.motivo.includes('stock_minimo'))).toBe(true)
  })

  it('altas: defaults canal=ambas, isv=15, precio_revendedor=null, stock_minimo=null', () => {
    const res = parseInventoryUpload({ actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120 }], variantes: [] }, ctxBase())
    const c = res.creates[0]
    expect(c.canal).toBe('ambas')
    expect(c.isv).toBe('15')
    expect(c.precio_revendedor).toBeNull()
    expect(c.stock_minimo).toBeNull()
  })

  it('altas: toma canal/isv/precio_revendedor/stock_minimo de la fila', () => {
    const res = parseInventoryUpload({
      actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120, canal: 'mostrador', isv: 'exento', precio_revendedor: 90, stock_minimo: 1 }], variantes: [],
    }, ctxBase())
    const c = res.creates[0]
    expect(c.canal).toBe('mostrador')
    expect(c.isv).toBe('exento')
    expect(c.precio_revendedor).toBe(90)
    expect(c.stock_minimo).toBe(1)
  })
})

describe('parseInventoryUpload — movimientos de stock (Actualizar)', () => {
  it('aumento de stock con costo_entrada genera movimiento tipo entrada', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 15, costo_entrada: 100 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.movimientos).toEqual([
      { producto_id: 'p1', variante_id: null, tipo: 'entrada', cantidad: 5, costo_unitario: 100, stock_anterior: 10, referencia: expect.any(String) },
    ])
  })

  it('aumento de stock sin costo_entrada genera movimiento tipo ajuste', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 15 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.movimientos[0]).toMatchObject({ tipo: 'ajuste', cantidad: 5, costo_unitario: null, stock_anterior: 10 })
  })

  it('disminución de stock genera ajuste sin costo', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 4 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.movimientos[0]).toMatchObject({ tipo: 'ajuste', cantidad: -6, costo_unitario: null, stock_anterior: 10 })
  })

  it('error: costo_entrada en fila con disminución de stock', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 4, costo_entrada: 100 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.movimientos).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('costo_entrada'))).toBe(true)
  })

  it('error: costo_entrada en fila sin cambio de stock', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, costo_entrada: 100 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.updates).toEqual([])
    expect(res.movimientos).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('costo_entrada'))).toBe(true)
  })

  it('cambio de modalidad (ilimitado <-> número) no genera movimiento', () => {
    const c = ctxBase()
    c.existentes[0].stock = null
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 20 }],
      nuevos: [], variantes: [],
    }, c)
    expect(res.errors).toEqual([])
    expect(res.movimientos).toEqual([])
  })

  it('error: costo_entrada presente durante un cambio de modalidad (ilimitado -> número)', () => {
    const c = ctxBase()
    c.existentes[0].stock = null
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 20, costo_entrada: 50 }],
      nuevos: [], variantes: [],
    }, c)
    expect(res.updates).toEqual([])
    expect(res.movimientos).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('costo_entrada'))).toBe(true)
  })

  it('sin cambio de stock no genera movimiento', () => {
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 10 }],
      nuevos: [], variantes: [],
    }, ctxBase())
    expect(res.movimientos).toEqual([])
  })

  it('producto con variantes: stock se ignora en Actualizar; costo_entrada ahí es error (no hay aumento real)', () => {
    const c = ctxBase()
    const ctxV = { ...c, variantesExistentes: [varianteBD({ id: 'v1', producto_id: 'p1', nombre: 'M' })] }
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 999, costo_entrada: 50 }],
      nuevos: [], variantes: [],
    }, ctxV)
    expect(res.updates).toEqual([])
    expect(res.movimientos).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('costo_entrada'))).toBe(true)
  })
})

describe('parseInventoryUpload — movimientos de stock (Nuevos/altas)', () => {
  it('alta con stock inicial > 0 y costo_entrada genera movimiento entrada con stock_anterior 0', () => {
    const res = parseInventoryUpload({
      actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120, stock: 8, costo_entrada: 40 }], variantes: [],
    }, ctxBase())
    expect(res.errors).toEqual([])
    expect(res.movimientos).toEqual([
      { producto_id: null, productoSlugTemp: 'gorra', variante_id: null, tipo: 'entrada', cantidad: 8, costo_unitario: 40, stock_anterior: 0, referencia: expect.any(String) },
    ])
  })

  it('alta con stock inicial > 0 sin costo genera ajuste', () => {
    const res = parseInventoryUpload({
      actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120, stock: 8 }], variantes: [],
    }, ctxBase())
    expect(res.movimientos[0]).toMatchObject({ tipo: 'ajuste', cantidad: 8, costo_unitario: null, stock_anterior: 0 })
  })

  it('alta sin stock (vacío = ilimitado) no genera movimiento', () => {
    const res = parseInventoryUpload({
      actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120 }], variantes: [],
    }, ctxBase())
    expect(res.movimientos).toEqual([])
  })

  it('alta con stock 0 no genera movimiento', () => {
    const res = parseInventoryUpload({
      actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120, stock: 0 }], variantes: [],
    }, ctxBase())
    expect(res.movimientos).toEqual([])
  })

  it('error: costo_entrada en alta sin stock inicial', () => {
    const res = parseInventoryUpload({
      actualizar: [], nuevos: [{ nombre: 'Gorra', precio: 120, costo_entrada: 40 }], variantes: [],
    }, ctxBase())
    expect(res.creates).toEqual([])
    expect(res.movimientos).toEqual([])
    expect(res.errors.some(e => e.motivo.includes('costo_entrada'))).toBe(true)
  })
})

describe('parseInventoryUpload — Variantes: precio_revendedor y movimientos', () => {
  const ctx = ctxBase()
  const prodV = ctx.existentes[0]

  it('actualiza precio_revendedor de variante; vacío conserva (hereda si base es null)', () => {
    const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prodV.id, nombre: 'M', precio_revendedor: null })] }
    const r1 = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante_id: 'v1', variante: 'M', precio_revendedor: 90 },
    ] }, ctxV)
    expect(r1.errors).toEqual([])
    expect(r1.variantes.updates[0].precio_revendedor).toBe(90)

    const r2 = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante_id: 'v1', variante: 'M' },
    ] }, ctxV)
    expect(r2.variantes.updates[0].precio_revendedor).toBeNull()
  })

  it('error: precio_revendedor de variante <= 0', () => {
    const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prodV.id, nombre: 'M' })] }
    const r = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante_id: 'v1', variante: 'M', precio_revendedor: 0 },
    ] }, ctxV)
    expect(r.errors.some(e => e.motivo.includes('precio_revendedor'))).toBe(true)
  })

  it('variante nueva sin precio_revendedor hereda (null)', () => {
    const ctxV = { ...ctx, variantesExistentes: [] }
    const r = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante: 'L' },
    ] }, ctxV)
    expect(r.variantes.creates[0].precio_revendedor).toBeNull()
  })

  it('aumento de stock de variante existente con costo_entrada genera movimiento entrada con variante_id', () => {
    const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prodV.id, nombre: 'M', stock: 3 })] }
    const r = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante_id: 'v1', variante: 'M', stock: 10, costo_entrada: 55 },
    ] }, ctxV)
    expect(r.errors).toEqual([])
    expect(r.movimientos).toEqual([
      { producto_id: prodV.id, variante_id: 'v1', tipo: 'entrada', cantidad: 7, costo_unitario: 55, stock_anterior: 3, referencia: expect.any(String) },
    ])
  })

  it('variante nueva con stock inicial > 0 genera movimiento con variante_id null, producto_id conocido (stock_anterior 0)', () => {
    const ctxV = { ...ctx, variantesExistentes: [] }
    const r = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante: 'L', stock: 4, costo_entrada: 20 },
    ] }, ctxV)
    expect(r.errors).toEqual([])
    expect(r.movimientos).toEqual([
      { producto_id: prodV.id, variante_id: null, orden: 0, tipo: 'entrada', cantidad: 4, costo_unitario: 20, stock_anterior: 0, referencia: expect.any(String) },
    ])
  })

  it('el orden del movimiento de alta de variante coincide con el orden del VarianteCreate correspondiente', () => {
    const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prodV.id, nombre: 'S', orden: 0 })] }
    const r = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante: 'M', stock: 3, costo_entrada: 10 },
      { producto_id: prodV.id, variante: 'L', stock: 2, costo_entrada: 10 },
    ] }, ctxV)
    expect(r.errors).toEqual([])
    expect(r.variantes.creates.map(c => c.orden)).toEqual([1, 2])
    expect(r.movimientos.map(m => m.orden)).toEqual([1, 2])
  })

  it('error: costo_entrada en variante sin aumento de stock', () => {
    const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prodV.id, nombre: 'M', stock: 3 })] }
    const r = parseInventoryUpload({ actualizar: [], nuevos: [], variantes: [
      { producto_id: prodV.id, variante_id: 'v1', variante: 'M', costo_entrada: 55 },
    ] }, ctxV)
    expect(r.variantes.updates).toEqual([])
    expect(r.movimientos).toEqual([])
    expect(r.errors.some(e => e.motivo.includes('costo_entrada'))).toBe(true)
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

  it('una fila que falla por sku no reserva su nombre (la fila válida posterior pasa)', () => {
    const r = parseInventoryUpload({ ...vacio, variantes: [
      { producto_id: prod.id, variante: 'Z', sku: 'SKU-M' },   // sku de otra variante BD → fila inválida
      { producto_id: prod.id, variante: 'Z', stock: '5' },      // fila válida, mismo nombre
    ] }, ctxV)
    expect(r.errors).toHaveLength(1)                             // solo el error de sku
    expect(r.variantes.creates).toHaveLength(1)
    expect(r.variantes.creates[0]).toMatchObject({ nombre: 'Z', stock: 5 })
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
