import { describe, it, expect } from 'vitest'
import { numeroCompra, costoEnLempiras, totalCompra, estadoCompra, cantidadSugeridaReorden, importeLineaCompra } from '../compras'

describe('numeroCompra', () => {
  it('formatea con prefijo COMP- y 8 dígitos', () => {
    expect(numeroCompra(1)).toBe('COMP-00000001')
    expect(numeroCompra(12345678)).toBe('COMP-12345678')
  })
})

describe('costoEnLempiras', () => {
  it('en L. devuelve el costo tal cual', () => {
    expect(costoEnLempiras(100, 'L', null)).toBe(100)
  })
  it('en USD multiplica por la tasa y redondea a 2', () => {
    expect(costoEnLempiras(10, 'USD', 26.3)).toBe(263)
    expect(costoEnLempiras(9.99, 'USD', 26.3)).toBe(262.74) // 262.737 -> 262.74
  })
})

describe('totalCompra', () => {
  it('suma cantidad × costo en Lempiras', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 100 },
      { cantidad_ordenada: 3, costo_unitario: 50 },
    ]
    expect(totalCompra(items, 'L', null)).toBe(350)
  })
  it('convierte USD con la tasa', () => {
    const items = [{ cantidad_ordenada: 2, costo_unitario: 10 }]
    expect(totalCompra(items, 'USD', 26.3)).toBe(526)
  })
})

describe('estadoCompra', () => {
  it('sin líneas es borrador', () => {
    expect(estadoCompra([])).toBe('borrador')
  })
  it('nada recibido es ordenada', () => {
    expect(estadoCompra([{ cantidad_ordenada: 5, cantidad_recibida: 0 }])).toBe('ordenada')
  })
  it('algo recibido pero no todo es parcial', () => {
    expect(estadoCompra([
      { cantidad_ordenada: 5, cantidad_recibida: 2 },
      { cantidad_ordenada: 3, cantidad_recibida: 0 },
    ])).toBe('parcial')
  })
  it('todo recibido es recibida', () => {
    expect(estadoCompra([
      { cantidad_ordenada: 5, cantidad_recibida: 5 },
      { cantidad_ordenada: 3, cantidad_recibida: 3 },
    ])).toBe('recibida')
  })
})

describe('cantidadSugeridaReorden', () => {
  it('sugiere lo que falta para llegar al mínimo', () => {
    expect(cantidadSugeridaReorden(2, 10)).toBe(8)
  })
  it('no sugiere nada si ya está en o sobre el mínimo', () => {
    expect(cantidadSugeridaReorden(10, 10)).toBe(0)
    expect(cantidadSugeridaReorden(15, 10)).toBe(0)
  })
})

describe('importeLineaCompra', () => {
  it('en L. es cantidad × costo', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 3, costo_unitario: 50 }, 'L', null)).toBe(150)
  })

  it('en USD convierte con la tasa', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 2, costo_unitario: 10 }, 'USD', 26.3)).toBe(526)
  })

  // NO redondea a propósito: totalCompra redondea la suma UNA sola vez, al
  // final. Si esta función redondeara por línea, la suma de las líneas
  // dejaría de dar el total y el desglose de CxP contradiría a su fila.
  it('no redondea: devuelve el producto crudo', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 3, costo_unitario: 0.335 }, 'L', null))
      .toBeCloseTo(1.005, 10)
  })

  it('USD sin tasa vale cero, igual que totalCompra', () => {
    expect(importeLineaCompra({ cantidad_ordenada: 5, costo_unitario: 10 }, 'USD', null)).toBe(0)
  })
})

// Esta es la afirmación que protege la pantalla: el desglose que ve el
// usuario en Cuentas por pagar tiene que sumar exactamente el total de la
// fila de arriba. Si algún día alguien "arregla" importeLineaCompra
// redondeando por línea, este test es el que lo detiene.
describe('el desglose por línea reconcilia con totalCompra', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const sumaLineas = (items: { cantidad_ordenada: number; costo_unitario: number }[], moneda: 'L' | 'USD', tasa: number | null) =>
    round2(items.reduce((s, i) => s + importeLineaCompra(i, moneda, tasa), 0))

  it('cuadra en Lempiras', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 100 },
      { cantidad_ordenada: 3, costo_unitario: 50 },
    ]
    expect(sumaLineas(items, 'L', null)).toBe(totalCompra(items, 'L', null))
  })

  it('cuadra en dólares con tasa', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 10 },
      { cantidad_ordenada: 7, costo_unitario: 3.5 },
    ]
    expect(sumaLineas(items, 'USD', 26.3)).toBe(totalCompra(items, 'USD', 26.3))
  })

  // El caso que rompería un redondeo por línea: tres líneas cuyo importe
  // individual cae en el tercer decimal. Cada línea vale 1.005 y el total
  // correcto es 3.02; redondeando línea a línea daría 1.01 × 3 = 3.03, un
  // céntimo de más contra la fila de CxP. Con la función sin redondear,
  // ambos lados son idénticos por construcción.
  it('cuadra con terceros decimales, que es donde falla el redondeo por línea', () => {
    const items = [
      { cantidad_ordenada: 3, costo_unitario: 0.335 },
      { cantidad_ordenada: 3, costo_unitario: 0.335 },
      { cantidad_ordenada: 3, costo_unitario: 0.335 },
    ]
    expect(sumaLineas(items, 'L', null)).toBe(totalCompra(items, 'L', null))
  })
})
