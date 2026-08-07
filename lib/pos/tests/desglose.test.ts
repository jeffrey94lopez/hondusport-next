import { describe, it, expect } from 'vitest'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '../desglose'

const linea = (over = {}) => ({
  producto_id: null, variante_id: null, descripcion: 'X',
  cantidad: 1, precio_unitario: 115, descuento: 0, isv: '15' as const, ...over,
})

describe('desglosarLinea', () => {
  it('gravado 15: 115 → base 100, isv 15', () => {
    const r = desglosarLinea(linea(), false)
    expect(r).toMatchObject({ importe: 115, base: 100, isv_monto: 15 })
  })
  it('gravado 18: 118 → base 100, isv 18', () => {
    const r = desglosarLinea(linea({ precio_unitario: 118, isv: '18' }), false)
    expect(r).toMatchObject({ importe: 118, base: 100, isv_monto: 18 })
  })
  it('exento: importe = base, isv 0', () => {
    const r = desglosarLinea(linea({ isv: 'exento', precio_unitario: 80 }), false)
    expect(r).toMatchObject({ importe: 80, base: 80, isv_monto: 0 })
  })
  it('descuento reduce el bruto antes de desglosar', () => {
    const r = desglosarLinea(linea({ cantidad: 2, descuento: 30 }), false) // 230-30=200
    expect(r).toMatchObject({ importe: 200, base: 173.91, isv_monto: 26.09 })
  })
  it('exonerado: cobra la base, isv 0', () => {
    const r = desglosarLinea(linea(), true) // 115 → base 100
    expect(r).toMatchObject({ importe: 100, base: 100, isv_monto: 0 })
  })
})

describe('prorratearDescuentoGlobal', () => {
  it('proporcional al importe bruto', () => {
    const ls = [linea({ precio_unitario: 100 }), linea({ precio_unitario: 50 }), linea({ precio_unitario: 50 })]
    const r = prorratearDescuentoGlobal(ls, 10)
    expect(r.map(l => l.descuento)).toEqual([5, 2.5, 2.5])
  })
  it('residuo de redondeo a la línea mayor', () => {
    const ls = [linea({ precio_unitario: 100 }), linea({ precio_unitario: 100 }), linea({ precio_unitario: 100 })]
    const r = prorratearDescuentoGlobal(ls, 10)
    expect(r.map(l => l.descuento)).toEqual([3.34, 3.33, 3.33])
    expect(r.reduce((s, l) => s + l.descuento, 0)).toBeCloseTo(10, 2)
  })
  it('se suma al descuento de línea existente', () => {
    const ls = [linea({ descuento: 5 })]
    expect(prorratearDescuentoGlobal(ls, 10)[0].descuento).toBe(15)
  })
})

describe('totalesDocumento', () => {
  it('agrupa por columna y suma', () => {
    const ls = [
      desglosarLinea(linea(), false),                                        // g15: 100 + 15
      desglosarLinea(linea({ precio_unitario: 118, isv: '18' }), false),     // g18: 100 + 18
      desglosarLinea(linea({ isv: 'exento', precio_unitario: 50 }), false),  // exento 50
    ]
    const t = totalesDocumento(ls, 0, 'X LEMPIRAS CON 00/100')
    expect(t).toMatchObject({
      total_exento: 50, total_exonerado: 0, total_gravado15: 100, total_gravado18: 100,
      isv15: 15, isv18: 18, descuento_total: 0, total: 283,
    })
  })
  it('exonerado va a su columna', () => {
    const ls = [desglosarLinea(linea(), true)]
    const t = totalesDocumento(ls, 0, 'CIEN LEMPIRAS CON 00/100')
    expect(t).toMatchObject({ total_exonerado: 100, total_gravado15: 0, isv15: 0, total: 100 })
  })
  it('pipeline encadenado: prorratear → desglosar → totales sin doble conteo', () => {
    // 2 líneas de 100 cada una, descuento global 10
    const ls = [linea({ precio_unitario: 100 }), linea({ precio_unitario: 100 })]
    const prorrateadas = prorratearDescuentoGlobal(ls, 10)
    const desglosadas = prorrateadas.map(l => desglosarLinea(l, false))
    const t = totalesDocumento(desglosadas, 10, 'CIENTO NOVENTA LEMPIRAS CON 00/100')
    // descuento_total debe ser 10 (no 20)
    expect(t.descuento_total).toBe(10)
    // total = 2*95 (bruto con descuento) = 190 después de desgloses
    expect(t.total).toBe(190)
  })
})
