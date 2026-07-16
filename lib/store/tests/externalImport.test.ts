import { describe, it, expect } from 'vitest'
import {
  CAMPOS_PLATAFORMA, sugerirMapeo, validarMapeo, agruparPorSku, parseExternalImport,
  type Mapeo, type GrupoProducto,
} from '../externalImport'
import type { ParseContext } from '../inventoryRoundtrip'
import type { Producto } from '@/types'

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

function prod(o: Partial<Producto> = {}): Producto {
  return {
    id: 'p1', nombre: 'Viejo', slug: 'viejo', descripcion: 'd', precio: 100, precio_original: null,
    categoria_id: 'c1', subcategoria_id: null, stock: 4, genero: null, badge: null,
    tallas: ['S'], colores: ['Rojo'], imagenes: null, marca: 'M', sku: 'A10',
    personalizable: false, oferta_fin: null, activo: true, rating: 5, created_at: '', updated_at: '', ...o,
  }
}
function ctx(): ParseContext {
  return {
    existentes: [prod()],
    categorias: [{ id: 'c1', valor: 'Ropa' }, { id: 'c2', valor: 'Calzado' }],
    subcategorias: [
      { id: 's1', valor: 'Tenis', categorias_padre: ['c2'] },
      { id: 's2', valor: 'Playeras', categorias_padre: ['c1'] },
    ],
  }
}
function grupo(o: Partial<GrupoProducto> = {}): GrupoProducto {
  return { sku: 'NEW1', filas: [2], tallas: [], colores: [], nombre: 'Nuevo', precio: '50', ...o }
}

describe('parseExternalImport', () => {
  it('actualiza cuando el SKU ya existe (merge de opcionales, conserva slug)', () => {
    const g = grupo({ sku: 'A10', nombre: 'Samba OG', precio: '2720', stock: '5', tallas: ['40', '41'] })
    const r = parseExternalImport([g], ctx())
    expect(r.errors).toEqual([])
    expect(r.creates).toEqual([])
    expect(r.updates).toHaveLength(1)
    const u = r.updates[0]
    expect(u.id).toBe('p1')
    expect(u.slug).toBe('viejo')
    expect(u.precio).toBe(2720)
    expect(u.stock).toBe(5)
    expect(u.tallas).toEqual(['40', '41'])
    expect(u.colores).toEqual(['Rojo']) // no venía en el grupo → conserva
    expect(r.resumen).toEqual({ crear: 0, actualizar: 1, conError: 0 })
  })

  it('crea cuando el SKU no existe (slug generado, defaults)', () => {
    const r = parseExternalImport([grupo()], ctx())
    expect(r.errors).toEqual([])
    expect(r.creates).toHaveLength(1)
    const c = r.creates[0]
    expect(c.sku).toBe('NEW1')
    expect(c.slug).toBe('nuevo')
    expect(c.precio).toBe(50)
    expect(c.stock).toBeNull()
    expect(c.activo).toBe(true)
    expect(r.resumen.crear).toBe(1)
  })

  it('error: nombre vacío o precio inválido', () => {
    const r = parseExternalImport([grupo({ nombre: undefined, precio: '0' })], ctx())
    expect(r.updates).toEqual([]); expect(r.creates).toEqual([])
    expect(r.errors.some(e => /nombre/.test(e.motivo))).toBe(true)
    expect(r.errors.some(e => /precio/.test(e.motivo))).toBe(true)
    expect(r.resumen.conError).toBe(1)
  })

  it('error: categoría inexistente / subcat que no pertenece', () => {
    const r1 = parseExternalImport([grupo({ categoria: 'NoExiste' })], ctx())
    expect(r1.errors.some(e => /categor/.test(e.motivo))).toBe(true)
    const r2 = parseExternalImport([grupo({ categoria: 'Ropa', subcategoria: 'Tenis' })], ctx())
    expect(r2.errors.some(e => /subcategor/.test(e.motivo))).toBe(true)
  })

  it('update: cambiar la categoría dejando huérfana la subcat conservada es error', () => {
    const c = ctx()
    // producto existente (sku A10) con categoría c1 (Ropa) y subcategoría s2 (Playeras, hija de c1)
    c.existentes = [prod({ id: 'p1', sku: 'A10', categoria_id: 'c1', subcategoria_id: 's2' })]
    // el grupo cambia la categoría a Calzado (c2) y NO trae subcategoría -> la s2 conservada queda huérfana
    const g = grupo({ sku: 'A10', nombre: 'X', precio: '10', categoria: 'Calzado' })
    const r = parseExternalImport([g], c)
    expect(r.updates).toEqual([])
    expect(r.errors.some(e => /subcategor/.test(e.motivo) && /no pertenece/.test(e.motivo))).toBe(true)
  })

  it('error: SKU duplicado en la base de datos', () => {
    const c = ctx()
    c.existentes = [prod({ id: 'p1', sku: 'DUP' }), prod({ id: 'p2', sku: 'DUP', slug: 'otro' })]
    const r = parseExternalImport([grupo({ sku: 'DUP', nombre: 'X', precio: '10' })], c)
    expect(r.updates).toEqual([])
    expect(r.creates).toEqual([])
    expect(r.errors.some(e => /duplicado en la base de datos/.test(e.motivo))).toBe(true)
  })
})
