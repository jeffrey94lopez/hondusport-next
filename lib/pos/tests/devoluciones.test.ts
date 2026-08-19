import { describe, it, expect } from 'vitest'
import {
  cantidadDevolvible,
  recalcularLineaDevuelta,
  totalNotaCredito,
  validarReembolsos,
  numeroDevolucion,
  numeroDocumentoDevolucion,
  estadoDevolucionDocumento,
  puedeDevolverDocumento,
  sumarDevueltoPorLinea,
} from '../devoluciones'

describe('cantidadDevolvible', () => {
  it('original menos ya devuelto', () => expect(cantidadDevolvible(3, 1)).toBe(2))
  it('nunca negativo', () => expect(cantidadDevolvible(2, 2)).toBe(0))
})

describe('numeroDevolucion', () => {
  it('formatea 8 dígitos', () => expect(numeroDevolucion(5)).toBe('DEV-00000005'))
})

describe('numeroDocumentoDevolucion', () => {
  it('nota_credito usa el correlativo', () => {
    expect(numeroDocumentoDevolucion({ tipo: 'nota_credito', correlativo: 'FAC-001-001-03-00000007', numero_comprobante: null })).toBe('FAC-001-001-03-00000007')
  })
  it('devolucion usa numeroDevolucion sobre numero_comprobante', () => {
    expect(numeroDocumentoDevolucion({ tipo: 'devolucion', correlativo: null, numero_comprobante: 5 })).toBe('DEV-00000005')
  })
})

describe('recalcularLineaDevuelta', () => {
  const original = { producto_id: 'p1', variante_id: null, descripcion: 'Camiseta', cantidad: 3, precio_unitario: 230, descuento: 0, isv: '15' as const, importe: 690, base: 600, isv_monto: 90 }
  it('devolver 1 de 3 acredita 1/3 con ISV derivado de la base', () => {
    const r = recalcularLineaDevuelta(original, 1)
    expect(r.importe).toBe(230)
    expect(r.base).toBe(200)
    expect(r.isv_monto).toBe(30)
    expect(r.cantidad).toBe(1)
  })
  it('prorratea el descuento de la línea por unidad', () => {
    const conDesc = { ...original, descuento: 30, importe: 660, base: 574 } // bruto 690-30=660
    const r = recalcularLineaDevuelta(conDesc, 1)
    // bruto unidad = (690-30)/3 = 220 ; base = 220/1.15 = 191.30 ; isv = 28.70
    expect(r.importe).toBe(220)
    expect(r.base).toBe(191.3)
    expect(r.isv_monto).toBe(28.7)
  })
})

describe('totalNotaCredito', () => {
  it('suma los importes de las líneas devueltas', () => {
    expect(totalNotaCredito([{ importe: 230 }, { importe: 115 }])).toBe(345)
  })
})

describe('validarReembolsos', () => {
  const base = { saldoCxc: 0, sinEfectivo: false, clienteRegistrado: true }
  it('ok si suma el total', () => {
    expect(validarReembolsos([{ tipo: 'efectivo', monto: 230 }], 230, base)).toBeNull()
  })
  it('error si no suma el total', () => {
    expect(validarReembolsos([{ tipo: 'efectivo', monto: 100 }], 230, base)).toMatch(/no cubre|no coincide/i)
  })
  it('bloquea efectivo si la regla está activa', () => {
    expect(validarReembolsos([{ tipo: 'efectivo', monto: 230 }], 230, { ...base, sinEfectivo: true })).toMatch(/efectivo/i)
  })
  it('saldo a favor exige cliente registrado', () => {
    expect(validarReembolsos([{ tipo: 'saldo_favor', monto: 230 }], 230, { ...base, clienteRegistrado: false })).toMatch(/cliente/i)
  })
  it('cxc no puede exceder el saldo pendiente', () => {
    expect(validarReembolsos([{ tipo: 'cxc', monto: 230 }], 230, { ...base, saldoCxc: 100 })).toMatch(/cuenta por cobrar|saldo/i)
  })
})

describe('estadoDevolucionDocumento', () => {
  it('ninguna si no hay nada devuelto', () => {
    expect(estadoDevolucionDocumento('factura', 230, 0)).toBe('ninguna')
  })
  it('parcial si lo devuelto es menor al total', () => {
    expect(estadoDevolucionDocumento('comprobante', 230, 100)).toBe('parcial')
  })
  it('total si lo devuelto iguala el total (con tolerancia de redondeo)', () => {
    expect(estadoDevolucionDocumento('factura', 230, 229.995)).toBe('total')
    expect(estadoDevolucionDocumento('factura', 230, 230)).toBe('total')
  })
  it('ninguna para documentos que no son factura/comprobante (nota_credito/devolucion no tienen devueltos propios)', () => {
    expect(estadoDevolucionDocumento('nota_credito', 230, 230)).toBe('ninguna')
  })
})

describe('puedeDevolverDocumento', () => {
  it('true para factura emitida con algo devolvible', () => {
    expect(puedeDevolverDocumento('factura', 'emitido', 'ninguna')).toBe(true)
    expect(puedeDevolverDocumento('comprobante', 'emitido', 'parcial')).toBe(true)
  })
  it('false si ya se devolvió todo', () => {
    expect(puedeDevolverDocumento('factura', 'emitido', 'total')).toBe(false)
  })
  it('false si el documento está anulado', () => {
    expect(puedeDevolverDocumento('factura', 'anulado', 'ninguna')).toBe(false)
  })
  it('false para nota_credito/devolucion', () => {
    expect(puedeDevolverDocumento('nota_credito', 'emitido', 'ninguna')).toBe(false)
  })
})

describe('sumarDevueltoPorLinea', () => {
  const fila = (origen: string | null, cantidad: number, estado = 'emitido') =>
    ({ origen_item_id: origen, cantidad, documentos: { estado } })

  it('agrupa por linea de origen y suma las cantidades', () => {
    const m = sumarDevueltoPorLinea([fila('a', 2), fila('b', 1), fila('a', 3)])
    expect(m.get('a')).toBe(5)
    expect(m.get('b')).toBe(1)
  })

  // Al anular una devolucion la mercancia vuelve a estar vendida: su cantidad
  // tiene que poder devolverse otra vez, asi que NO cuenta como ya devuelta.
  it('ignora las devoluciones anuladas', () => {
    const m = sumarDevueltoPorLinea([fila('a', 2), fila('a', 3, 'anulado')])
    expect(m.get('a')).toBe(2)
  })

  it('ignora filas sin linea de origen', () => {
    const m = sumarDevueltoPorLinea([fila(null, 9), fila('a', 1)])
    expect(m.get('a')).toBe(1)
    expect(m.size).toBe(1)
  })

  // Sin fila de documento embebida no se puede afirmar que este anulada; se
  // cuenta, que es el lado conservador: contar de MENOS es lo que permitiria
  // devolver mas de lo vendido.
  it('cuenta la fila si no trae el documento embebido', () => {
    const m = sumarDevueltoPorLinea([{ origen_item_id: 'a', cantidad: 4, documentos: null }])
    expect(m.get('a')).toBe(4)
  })

  it('sin filas devuelve un mapa vacio', () => {
    expect(sumarDevueltoPorLinea([]).size).toBe(0)
  })

  // La consulta devuelve `cantidad` como numeric de Postgres, que PostgREST
  // puede entregar como cadena: sumarla sin convertir concatenaria en vez de
  // sumar ("2" + "3" = "23"), y 23 devolvibles de menos es dinero.
  it('convierte a numero antes de sumar', () => {
    const m = sumarDevueltoPorLinea([
      { origen_item_id: 'a', cantidad: '2' as unknown as number, documentos: { estado: 'emitido' } },
      { origen_item_id: 'a', cantidad: '3' as unknown as number, documentos: { estado: 'emitido' } },
    ])
    expect(m.get('a')).toBe(5)
  })
})
