import { describe, it, expect } from 'vitest'
import { numeroDocumento, TIPO_DOCUMENTO_LABEL, type TipoDocumento } from '../documentos'

describe('numeroDocumento', () => {
  it('factura usa el correlativo fiscal tal cual', () => {
    expect(numeroDocumento({ tipo: 'factura', correlativo: '000-001-01-00000123', numero_comprobante: null }))
      .toBe('000-001-01-00000123')
  })

  it('comprobante usa numero_comprobante con prefijo C- a 8 digitos', () => {
    expect(numeroDocumento({ tipo: 'comprobante', correlativo: null, numero_comprobante: 7 }))
      .toBe('C-00000007')
  })

  // La NC lleva correlativo fiscal propio (CAI '03'), igual que una factura.
  // Antes se la trataba como comprobante y, al no tener numero_comprobante,
  // TODAS salian como 'C-00000000': un numero que no existe y ademas el mismo
  // para todas las notas de credito del cliente.
  it('nota de credito usa su correlativo, no el prefijo de comprobante', () => {
    const n = numeroDocumento({ tipo: 'nota_credito', correlativo: '000-001-03-00000045', numero_comprobante: null })
    expect(n).toBe('000-001-03-00000045')
    expect(n).not.toContain('C-')
  })

  // La devolucion tiene su propia secuencia. Tratarla como comprobante producia
  // un numero que COLISIONA con un comprobante real y distinto: dos filas de la
  // misma pantalla con el mismo numero, una la venta y otra su reverso.
  it('devolucion usa su propia secuencia DEV-, sin colisionar con un comprobante', () => {
    const dev = numeroDocumento({ tipo: 'devolucion', correlativo: null, numero_comprobante: 7 })
    const comp = numeroDocumento({ tipo: 'comprobante', correlativo: null, numero_comprobante: 7 })
    expect(dev).toBe('DEV-00000007')
    expect(dev).not.toBe(comp)
  })

  it('factura y nota de credito sin correlativo devuelven guion, no un numero inventado', () => {
    expect(numeroDocumento({ tipo: 'factura', correlativo: null, numero_comprobante: null })).toBe('—')
    expect(numeroDocumento({ tipo: 'nota_credito', correlativo: null, numero_comprobante: null })).toBe('—')
  })

  it('comprobante y devolucion sin numero caen a cero acolchado', () => {
    expect(numeroDocumento({ tipo: 'comprobante', correlativo: null, numero_comprobante: null })).toBe('C-00000000')
    expect(numeroDocumento({ tipo: 'devolucion', correlativo: null, numero_comprobante: null })).toBe('DEV-00000000')
  })

  // Los cuatro tipos deben producir formatos DISTINGUIBLES entre si: es lo que
  // permite leer una lista mezclada sin confundir una venta con su reverso.
  it('los cuatro tipos no se confunden entre si con el mismo numero de origen', () => {
    const base = { correlativo: 'COR-1', numero_comprobante: 1 }
    const nums = (['factura', 'comprobante', 'nota_credito', 'devolucion'] as TipoDocumento[])
      .map(tipo => numeroDocumento({ ...base, tipo }))
    // factura y nota_credito comparten criterio (correlativo), asi que ahi el
    // desempate lo da la etiqueta del tipo, no el numero.
    expect(new Set(nums).size).toBe(3)
    expect(nums[1]).not.toBe(nums[3])
  })
})

describe('TIPO_DOCUMENTO_LABEL', () => {
  it('cubre los cuatro tipos', () => {
    expect(Object.keys(TIPO_DOCUMENTO_LABEL).sort())
      .toEqual(['comprobante', 'devolucion', 'factura', 'nota_credito'])
  })

  it('ninguna etiqueta se repite', () => {
    const vals = Object.values(TIPO_DOCUMENTO_LABEL)
    expect(new Set(vals).size).toBe(vals.length)
  })
})
