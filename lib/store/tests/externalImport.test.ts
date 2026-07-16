import { describe, it, expect } from 'vitest'
import {
  CAMPOS_PLATAFORMA, sugerirMapeo, validarMapeo,
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
