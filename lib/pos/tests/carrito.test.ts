import { describe, it, expect } from 'vitest'
import {
  brutoLinea, clampDescuentoLinea, brutoTotalLineas, clampDescuentoGlobal,
  descuentoDesdePorcentaje, topeCantidad, type LineaVenta,
} from '../carrito'

const linea = (over: Partial<LineaVenta> = {}): LineaVenta => ({
  key: 'k1', producto_id: null, variante_id: null, descripcion: 'X',
  cantidad: 2, precio_unitario: 100, descuento: 0, isv: '15',
  precioManual: false, descuentoModo: 'monto', ...over,
})

describe('brutoLinea', () => {
  it('cantidad × precio', () => expect(brutoLinea(linea())).toBe(200))
  it('redondea a 2 decimales', () =>
    expect(brutoLinea(linea({ cantidad: 3, precio_unitario: 33.333 }))).toBe(100))
})

describe('clampDescuentoLinea', () => {
  it('deja pasar un descuento menor al bruto', () =>
    expect(clampDescuentoLinea(linea({ descuento: 50 })).descuento).toBe(50))
  it('recorta el descuento al bruto', () =>
    expect(clampDescuentoLinea(linea({ descuento: 500 })).descuento).toBe(200))
  it('recorta cuando baja la cantidad', () =>
    expect(clampDescuentoLinea(linea({ cantidad: 1, descuento: 150 })).descuento).toBe(100))
  it('nunca deja descuento negativo', () =>
    expect(clampDescuentoLinea(linea({ descuento: -10 })).descuento).toBe(0))
})

describe('brutoTotalLineas', () => {
  it('suma brutos menos descuentos de línea', () =>
    expect(brutoTotalLineas([linea({ descuento: 20 }), linea({ cantidad: 1 })])).toBe(280))
})

describe('clampDescuentoGlobal', () => {
  it('recorta al bruto total disponible', () =>
    expect(clampDescuentoGlobal([linea()], 500)).toBe(200))
  it('respeta un global válido', () =>
    expect(clampDescuentoGlobal([linea()], 30)).toBe(30))
  it('cero cuando no hay líneas', () =>
    expect(clampDescuentoGlobal([], 30)).toBe(0))
})

describe('descuentoDesdePorcentaje', () => {
  it('convierte % a monto sobre el bruto', () =>
    expect(descuentoDesdePorcentaje(linea(), 10)).toBe(20))
  it('tope 100%', () =>
    expect(descuentoDesdePorcentaje(linea(), 150)).toBe(200))
  it('piso 0%', () =>
    expect(descuentoDesdePorcentaje(linea(), -5)).toBe(0))
})

describe('topeCantidad', () => {
  it('stock null = ilimitado devuelve Infinity', () =>
    expect(topeCantidad(null, 3)).toBe(Infinity))
  it('devuelve el stock cuando es mayor que lo actual', () =>
    expect(topeCantidad(5, 2)).toBe(5))
  it('nunca baja de la cantidad ya en el carrito', () =>
    expect(topeCantidad(1, 3)).toBe(3))
})
