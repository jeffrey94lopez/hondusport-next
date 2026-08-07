import { describe, it, expect } from 'vitest'
import { precioLineaPos, validarEmision, validarPagos, cambioPago, esperadoCaja, traducirErrorPos } from '../emision'
import type { MetodoPagoTipo } from '@/types'

describe('precioLineaPos', () => {
  it('final: siempre precio normal', () => {
    expect(precioLineaPos('final', { precio: 100, precio_revendedor: 80 })).toBe(100)
  })
  it('revendedor: usa precio_revendedor si existe', () => {
    expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: 80 })).toBe(80)
  })
  it('revendedor: sin precio_revendedor, usa precio normal', () => {
    expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: null })).toBe(100)
  })
  it('revendedor con variante: hereda precio_revendedor del padre si la variante no tiene', () => {
    expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: 80 },
      { precio: 120, precio_revendedor: null })).toBe(80)
  })
  it('revendedor con variante: usa precio_revendedor propio de la variante', () => {
    expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: 80 },
      { precio: 120, precio_revendedor: 95 })).toBe(95)
  })
  it('final con variante: usa precio normal de la variante', () => {
    expect(precioLineaPos('final', { precio: 100, precio_revendedor: 80 },
      { precio: 120, precio_revendedor: 95 })).toBe(120)
  })
})

describe('validarEmision', () => {
  it('límite consumidor final aplica solo a facturas', () => {
    expect(validarEmision({ tipo: 'factura', clienteNombre: 'CONSUMIDOR FINAL',
      clienteRtn: null, clienteIdentidad: null, total: 15000, limite: 10000 }))
      .toMatch(/identificación/)
  })
  it('factura con identidad no requiere más', () => {
    expect(validarEmision({ tipo: 'factura', clienteNombre: 'Juan Pérez',
      clienteRtn: null, clienteIdentidad: '0801199912345', total: 15000, limite: 10000 })).toBeNull()
  })
  it('comprobante no aplica el límite', () => {
    expect(validarEmision({ tipo: 'comprobante', clienteNombre: 'CONSUMIDOR FINAL',
      clienteRtn: null, clienteIdentidad: null, total: 15000, limite: 10000 })).toBeNull()
  })
})

describe('validarPagos / cambioPago', () => {
  const ef = (monto: number) => ({ metodo_id: 'm1', tipo: 'efectivo_lps' as const, monto })
  const tj = (monto: number) => ({ metodo_id: 'm2', tipo: 'tarjeta' as const, monto })

  it('sin pagos', () => {
    expect(validarPagos([], 100)).toMatch(/pago/)
  })
  it('pagos insuficientes', () => {
    expect(validarPagos([tj(50)], 100)).toMatch(/cubren/)
  })
  it('exceso sin efectivo', () => {
    expect(validarPagos([tj(150)], 100)).toMatch(/efectivo/)
  })
  it('exceso con efectivo es válido (cambio)', () => {
    expect(validarPagos([ef(150)], 100)).toBeNull()
  })
  it('cambioPago calcula el vuelto', () => {
    expect(cambioPago([ef(150)], 100)).toBe(50)
  })
  it('cambioPago con pagos mixtos', () => {
    expect(cambioPago([tj(60), ef(50)], 100)).toBe(10)
  })
})

describe('esperadoCaja', () => {
  const doc = (total: number, pagos: Array<{ tipo: MetodoPagoTipo; monto: number }>, estado = 'emitido') =>
    ({ estado, total, pagos })

  it('anulados fuera del arqueo; el cambio resta del efectivo esperado', () => {
    const r = esperadoCaja(500, [
      doc(230, [{ tipo: 'efectivo_lps', monto: 300 }]),            // cambio 70 → neto 230
      doc(500, [{ tipo: 'tarjeta', monto: 200 }, { tipo: 'efectivo_lps', monto: 300 }]),
      doc(100, [{ tipo: 'efectivo_usd', monto: 100 }]),
      doc(999, [{ tipo: 'efectivo_lps', monto: 999 }], 'anulado'), // excluido
    ])
    expect(r.efectivoEsperado).toBe(500 + 230 + 300 + 100)
    expect(r.porMetodo.tarjeta).toBe(200)
  })
})

describe('traducirErrorPos', () => {
  it('HS_CAJA sin sesión abierta', () => {
    expect(traducirErrorPos('HS_CAJA|Caja 1')).toBe('La caja "Caja 1" no tiene una sesión abierta.')
  })
  it('HS_CAI vencido', () => {
    expect(traducirErrorPos('HS_CAI|vencido|2026-01-01')).toMatch(/venció/)
  })
  it('HS_CAI agotado', () => {
    expect(traducirErrorPos('HS_CAI|agotado|5000')).toMatch(/rango/)
  })
  it('HS_CAI sin_cai', () => {
    expect(traducirErrorPos('HS_CAI|sin_cai|002')).toMatch(/CAI/)
  })
  it('HS_TOTAL', () => {
    expect(traducirErrorPos('HS_TOTAL')).toMatch(/totales/)
  })
  it('HS_PEDIDO_DOC', () => {
    expect(traducirErrorPos('HS_PEDIDO_DOC|123')).toMatch(/pedido/)
  })
  it('HS_DOC devuelve el texto tal cual', () => {
    expect(traducirErrorPos('HS_DOC|ya está anulado')).toBe('ya está anulado')
  })
  it('delega códigos ajenos en traducirErrorPedido', () => {
    expect(traducirErrorPos('HS_STOCK|Camisa|3')).toMatch(/Solo quedan 3/)
  })
})
