import { describe, it, expect } from 'vitest'
import { saldoCompra, estadoPago, bucketAntiguedad, distribuirPago, excedeLimite, sumaAplicaciones, validarAplicaciones } from '../cxp'

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

describe('excedeLimite', () => {
  it('sin límite (null) nunca excede', () => {
    expect(excedeLimite(5000, 2000, null)).toEqual({ excede: false, excedente: 0 })
  })
  it('no excede si saldo + nuevo <= límite', () => {
    expect(excedeLimite(3000, 2000, 5000)).toEqual({ excede: false, excedente: 0 })
  })
  it('excede y reporta el excedente', () => {
    expect(excedeLimite(4000, 2000, 5000)).toEqual({ excede: true, excedente: 1000 })
  })
})

describe('sumaAplicaciones', () => {
  it('suma redondeando a 2 decimales', () => {
    expect(sumaAplicaciones([100.1, 200.25, 0.05])).toBe(300.4)
  })

  it('sin montos devuelve cero', () => {
    expect(sumaAplicaciones([])).toBe(0)
  })

  // Sin redondeo, 0.1 + 0.2 da 0.30000000000000004 y el total mostrado
  // divergiría del que registra el servidor.
  it('no arrastra error de coma flotante', () => {
    expect(sumaAplicaciones([0.1, 0.2])).toBe(0.3)
  })
})

describe('validarAplicaciones', () => {
  it('acepta un reparto válido', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 100, saldo: 500 },
      { numero: 'C-002', monto: 0, saldo: 200 },
    ])).toBeNull()
  })

  it('rechaza si todo es cero', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 0, saldo: 500 },
    ])).toBe('Aplica un monto a por lo menos una compra.')
  })

  it('rechaza una lista vacía', () => {
    expect(validarAplicaciones([])).toBe('Aplica un monto a por lo menos una compra.')
  })

  // Un monto negativo invalida TODO el formulario, no solo su línea: el
  // llamador filtra las líneas <= 0 antes de enviar, así que una fila en -50
  // junto a otra en 150 registraría 150 mientras el total mostrado dice 100.
  it('rechaza cualquier monto negativo', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: -50, saldo: 500 },
      { numero: 'C-002', monto: 150, saldo: 500 },
    ])).toBe('Los montos no pueden ser negativos.')
  })

  it('rechaza un abono que excede el saldo de su compra, nombrandola', () => {
    expect(validarAplicaciones([
      { numero: 'C-007', monto: 600, saldo: 500 },
    ])).toBe('El abono a C-007 excede su saldo.')
  })

  // Tolerancia de medio centavo, igual que el resto del módulo.
  it('tolera medio centavo por encima del saldo', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 500.004, saldo: 500 },
    ])).toBeNull()
  })

  // El lado opuesto del mismo límite: sin este caso, alguien podría ampliar la
  // tolerancia de 0.005 a 0.05 y ningún test lo detectaría — se estaría dejando
  // pasar un abono cinco centavos por encima del saldo de la compra.
  it('rechaza justo por encima de la tolerancia', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 500.006, saldo: 500 },
    ])).toBe('El abono a C-001 excede su saldo.')
  })
})
