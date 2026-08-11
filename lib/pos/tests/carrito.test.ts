import { describe, it, expect } from 'vitest'
import {
  brutoLinea, clampDescuentoLinea, brutoTotalLineas, clampDescuentoGlobal,
  descuentoDesdePorcentaje, topeCantidad, sugerenciasEfectivo,
  pestanaVacia, siguienteNombrePestana, accionPersistencia,
  presetToDescuento,
  type LineaVenta, type PestanaVenta,
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

describe('sugerenciasEfectivo', () => {
  it('pendiente L.230 → 500 y 1000 (200 no alcanza)', () =>
    expect(sugerenciasEfectivo(230)).toEqual([500, 1000]))
  it('pendiente L.85 → 100, 200, 500 (las 3 primeras mayores)', () =>
    expect(sugerenciasEfectivo(85)).toEqual([100, 200, 500]))
  it('pendiente 0 → las 3 denominaciones más chicas', () =>
    expect(sugerenciasEfectivo(0)).toEqual([20, 50, 100]))
  it('pendiente mayor a la denominación más alta → sin sugerencias', () =>
    expect(sugerenciasEfectivo(1500)).toEqual([]))
  it('nunca sugiere una denominación igual al pendiente exacto', () =>
    expect(sugerenciasEfectivo(500)).toEqual([1000]))
})

const pestana = (over: Partial<PestanaVenta> = {}): PestanaVenta => ({
  id: 't1', esperaId: null, nombre: 'Venta 1', lineas: [], descuentoGlobal: 0,
  clienteId: null, vendedorId: null, ...over,
})

describe('pestanaVacia', () => {
  it('true sin líneas', () => expect(pestanaVacia(pestana())).toBe(true))
  it('false con al menos una línea', () =>
    expect(pestanaVacia(pestana({ lineas: [linea()] }))).toBe(false))
})

describe('siguienteNombrePestana', () => {
  it('Venta 1 cuando no hay ninguna', () => expect(siguienteNombrePestana([])).toBe('Venta 1'))
  it('siguiente correlativo', () =>
    expect(siguienteNombrePestana(['Venta 1', 'Venta 2'])).toBe('Venta 3'))
  it('rellena el primer hueco libre', () =>
    expect(siguienteNombrePestana(['Venta 1', 'Venta 3'])).toBe('Venta 2'))
  it('ignora nombres renombrados a mano', () =>
    expect(siguienteNombrePestana(['señora del vestido azul', 'Venta 1'])).toBe('Venta 2'))
  it('no se confunde con nombres parecidos pero distintos', () =>
    expect(siguienteNombrePestana(['Venta 1 (extra)', 'Venta1'])).toBe('Venta 1'))
})

describe('accionPersistencia', () => {
  it('pestaña vacía sin espera → ninguna', () =>
    expect(accionPersistencia(pestana())).toEqual({ tipo: 'ninguna' }))
  it('pestaña vacía con espera → eliminar', () =>
    expect(accionPersistencia(pestana({ esperaId: 'e1' }))).toEqual({ tipo: 'eliminar', esperaId: 'e1' }))
  it('pestaña con líneas sin espera → crear', () =>
    expect(accionPersistencia(pestana({ lineas: [linea()] }))).toEqual({ tipo: 'crear' }))
  it('pestaña con líneas y espera → actualizar', () =>
    expect(accionPersistencia(pestana({ lineas: [linea()], esperaId: 'e1' })))
      .toEqual({ tipo: 'actualizar', esperaId: 'e1' }))
})

describe('presetToDescuento', () => {
  it('porcentaje: aplica el % sobre el bruto', () => {
    expect(presetToDescuento({ tipo: 'porcentaje', valor: 10 }, 200)).toBe(20)
  })
  it('monto: devuelve el monto tal cual si cabe en el bruto', () => {
    expect(presetToDescuento({ tipo: 'monto', valor: 50 }, 200)).toBe(50)
  })
  it('recorta el monto al bruto', () => {
    expect(presetToDescuento({ tipo: 'monto', valor: 500 }, 200)).toBe(200)
  })
  it('recorta el porcentaje al bruto (nunca lo supera)', () => {
    expect(presetToDescuento({ tipo: 'porcentaje', valor: 150 }, 200)).toBe(200)
  })
  it('bruto 0 -> 0', () => {
    expect(presetToDescuento({ tipo: 'porcentaje', valor: 10 }, 0)).toBe(0)
  })
  it('nunca negativo', () => {
    expect(presetToDescuento({ tipo: 'monto', valor: -10 }, 200)).toBe(0)
  })
})
