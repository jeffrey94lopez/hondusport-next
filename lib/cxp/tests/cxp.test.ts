import { describe, it, expect } from 'vitest'
import { saldoCompra, estadoPago, bucketAntiguedad, distribuirPago } from '../cxp'

describe('saldoCompra', () => {
  it('resta pagado del total, redondeado a 2', () => {
    expect(saldoCompra(1000, 300)).toBe(700)
    expect(saldoCompra(100.005, 0)).toBe(100.01)
  })
})

describe('estadoPago', () => {
  const venc = new Date('2026-08-20')
  it('pagada si el saldo es 0 o menos', () => {
    expect(estadoPago(1000, 1000, venc, new Date('2026-08-10'))).toBe('pagada')
  })
  it('vencida si hay saldo y hoy pasó el vencimiento (gana sobre parcial)', () => {
    expect(estadoPago(1000, 400, venc, new Date('2026-08-21'))).toBe('vencida')
  })
  it('parcial si hay abono pero no vencida', () => {
    expect(estadoPago(1000, 400, venc, new Date('2026-08-10'))).toBe('parcial')
  })
  it('pendiente si no hay abono y no está vencida', () => {
    expect(estadoPago(1000, 0, venc, new Date('2026-08-10'))).toBe('pendiente')
  })
})

describe('bucketAntiguedad', () => {
  const venc = new Date('2026-08-20')
  it('por vencer si no llegó el vencimiento', () => {
    expect(bucketAntiguedad(venc, new Date('2026-08-10'))).toBe('por_vencer')
    expect(bucketAntiguedad(venc, new Date('2026-08-20'))).toBe('por_vencer')
  })
  it('rangos de días vencidos', () => {
    expect(bucketAntiguedad(venc, new Date('2026-09-01'))).toBe('d1_30')   // 12 días
    expect(bucketAntiguedad(venc, new Date('2026-09-25'))).toBe('d31_60')  // 36 días
    expect(bucketAntiguedad(venc, new Date('2026-10-25'))).toBe('d61_90')  // 66 días
    expect(bucketAntiguedad(venc, new Date('2026-12-01'))).toBe('d90_mas') // 103 días
  })
})

describe('distribuirPago', () => {
  it('aplica más-antigua-primero hasta agotar el monto', () => {
    const compras = [
      { compra_id: 'a', saldo: 100 },
      { compra_id: 'b', saldo: 200 },
      { compra_id: 'c', saldo: 50 },
    ]
    const r = distribuirPago(250, compras)
    expect(r.aplicaciones).toEqual([
      { compra_id: 'a', monto: 100 },
      { compra_id: 'b', monto: 150 },
    ])
    expect(r.remanente).toBe(0)
  })
  it('devuelve remanente si el monto supera el total adeudado', () => {
    const compras = [{ compra_id: 'a', saldo: 100 }]
    const r = distribuirPago(300, compras)
    expect(r.aplicaciones).toEqual([{ compra_id: 'a', monto: 100 }])
    expect(r.remanente).toBe(200)
  })
})
