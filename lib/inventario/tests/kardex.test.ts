import { describe, it, expect } from 'vitest'
import { parseReferencia, etiquetaTipoMovimiento, saldoCorrido } from '../kardex'

describe('parseReferencia', () => {
  it('null → otra', () => expect(parseReferencia(null)).toEqual({ clase: 'otra', valor: null }))
  it('documento:uuid', () => expect(parseReferencia('documento:abc')).toEqual({ clase: 'documento', valor: 'abc' }))
  it('nota_credito:uuid', () => expect(parseReferencia('nota_credito:xyz')).toEqual({ clase: 'nota_credito', valor: 'xyz' }))
  it('pedido:uuid', () => expect(parseReferencia('pedido:p1')).toEqual({ clase: 'pedido', valor: 'p1' }))
  it('conteo:numero', () => expect(parseReferencia('conteo:CONTEO-00000007')).toEqual({ clase: 'conteo', valor: 'CONTEO-00000007' }))
  it('alta/manual/modalidad', () => {
    expect(parseReferencia('alta')).toEqual({ clase: 'alta', valor: null })
    expect(parseReferencia('manual')).toEqual({ clase: 'manual', valor: null })
    expect(parseReferencia('modalidad')).toEqual({ clase: 'modalidad', valor: null })
  })
  it('otro sin prefijo conocido → compra (candidato por número)', () =>
    expect(parseReferencia('COMPRA-00000045')).toEqual({ clase: 'compra', valor: 'COMPRA-00000045' }))
})

describe('etiquetaTipoMovimiento', () => {
  it('venta_pos → salida', () => expect(etiquetaTipoMovimiento('venta_pos')).toEqual({ nombre: 'Venta mostrador', direccion: 'salida' }))
  it('compra → entrada', () => expect(etiquetaTipoMovimiento('compra')).toEqual({ nombre: 'Compra', direccion: 'entrada' }))
  it('conteo → neutro', () => expect(etiquetaTipoMovimiento('conteo')).toEqual({ nombre: 'Conteo físico', direccion: 'neutro' }))
  it('desconocido → tal cual, neutro', () => expect(etiquetaTipoMovimiento('otro')).toEqual({ nombre: 'otro', direccion: 'neutro' }))
})

describe('saldoCorrido', () => {
  it('acumula la cantidad en orden', () => {
    expect(saldoCorrido([{ cantidad: 10 }, { cantidad: -3 }, { cantidad: 5 }]))
      .toEqual([{ cantidad: 10, saldo: 10 }, { cantidad: -3, saldo: 7 }, { cantidad: 5, saldo: 12 }])
  })
})
