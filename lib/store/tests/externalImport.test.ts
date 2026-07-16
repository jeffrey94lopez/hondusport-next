import { describe, it, expect } from 'vitest'
import {
  CAMPOS_PLATAFORMA, sugerirMapeo, validarMapeo, agruparPorSku,
  type Mapeo,
} from '../externalImport'

describe('CAMPOS_PLATAFORMA', () => {
  it('sku, nombre y precio son obligatorios; el resto no', () => {
    const oblig = CAMPOS_PLATAFORMA.filter(c => c.obligatorio).map(c => c.campo)
    expect(oblig).toEqual(['sku', 'nombre', 'precio'])
  })
})

describe('sugerirMapeo', () => {
  it('empareja encabezados típicos del POS por nombre', () => {
    const m = sugerirMapeo(['cbarras', 'nombre_producto', 'precio_venta', 'existencia', 'tamano', 'color', 'marca', 'nombre_categoria', 'is_active'])
    expect(m.sku).toBe('cbarras')
    expect(m.nombre).toBe('nombre_producto')
    expect(m.precio).toBe('precio_venta')
    expect(m.stock).toBe('existencia')
    expect(m.talla).toBe('tamano')
    expect(m.color).toBe('color')
    expect(m.marca).toBe('marca')
    expect(m.categoria).toBe('nombre_categoria')
    expect(m.activo).toBe('is_active')
  })
  it('ignora acentos, mayúsculas y separadores', () => {
    const m = sugerirMapeo(['SKU', 'Descripción', 'Precio Venta'])
    expect(m.sku).toBe('SKU')
    expect(m.precio).toBe('Precio Venta')
  })
  it('no asigna dos campos a la misma columna', () => {
    const m = sugerirMapeo(['color'])
    // 'color' solo puede ir a un campo
    const asignaciones = Object.values(m).filter(v => v === 'color')
    expect(asignaciones.length).toBeLessThanOrEqual(1)
  })
  it('devuelve vacío cuando nada coincide', () => {
    expect(sugerirMapeo(['xyz', 'abc'])).toEqual({})
  })
  it('no mapea fecha_venta a precio (fuzzy sin ambiguos)', () => {
    const m = sugerirMapeo(['fecha_venta', 'nombre', 'sku'])
    expect(m.precio).toBeUndefined()
    expect(m.nombre).toBe('nombre')
    expect(m.sku).toBe('sku')
  })
  it('mantiene fuzzy positivo: codigo_interno mapea a sku por token', () => {
    const m = sugerirMapeo(['codigo_interno', 'nombre', 'precio'])
    expect(m.sku).toBe('codigo_interno')
  })
})

describe('validarMapeo', () => {
  it('reporta obligatorios faltantes', () => {
    const errs = validarMapeo({ sku: 'cb' } as Mapeo)
    expect(errs.length).toBe(2) // faltan nombre y precio
  })
  it('sin errores cuando están los tres obligatorios', () => {
    expect(validarMapeo({ sku: 'cb', nombre: 'n', precio: 'p' })).toEqual([])
  })
})

const MAPEO_POS = {
  sku: 'cbarras', nombre: 'nombre_producto', precio: 'precio_venta',
  stock: 'existencia', talla: 'tamano', color: 'color', marca: 'marca',
} as const

describe('agruparPorSku', () => {
  it('agrupa variantes por SKU: suma stock, une tallas/colores, primer no-vacío', () => {
    const rows = [
      { cbarras: 'A10', nombre_producto: 'Samba OG', precio_venta: 2720, existencia: 3, tamano: '40', color: 'Negro', marca: 'Adidas' },
      { cbarras: 'A10', nombre_producto: 'Samba OG', precio_venta: 2720, existencia: 2, tamano: '41', color: 'Blanco', marca: 'Adidas' },
    ]
    const { grupos, sinSku } = agruparPorSku(rows, MAPEO_POS)
    expect(sinSku).toEqual([])
    expect(grupos).toHaveLength(1)
    const g = grupos[0]
    expect(g.sku).toBe('A10')
    expect(g.nombre).toBe('Samba OG')
    expect(g.precio).toBe('2720')
    expect(g.stock).toBe('5')
    expect(g.tallas).toEqual(['40', '41'])
    expect(g.colores).toEqual(['Negro', 'Blanco'])
    expect(g.filas).toEqual([2, 3])
  })

  it('fila con datos pero sin SKU va a sinSku', () => {
    const rows = [{ cbarras: '', nombre_producto: 'X', precio_venta: 10 }]
    const { grupos, sinSku } = agruparPorSku(rows, MAPEO_POS)
    expect(grupos).toEqual([])
    expect(sinSku).toEqual([2])
  })

  it('ignora filas totalmente vacías', () => {
    const rows = [{ cbarras: '', nombre_producto: '', precio_venta: '' }]
    const { grupos, sinSku } = agruparPorSku(rows, MAPEO_POS)
    expect(grupos).toEqual([])
    expect(sinSku).toEqual([])
  })

  it('no suma stock cuando la columna no está mapeada', () => {
    const rows = [{ cbarras: 'A1', nombre_producto: 'Y', precio_venta: 5 }]
    const { grupos } = agruparPorSku(rows, { sku: 'cbarras', nombre: 'nombre_producto', precio: 'precio_venta' })
    expect(grupos[0].stock).toBeUndefined()
  })
})
