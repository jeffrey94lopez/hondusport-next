import { describe, it, expect } from 'vitest'
import {
  COLUMNAS, INSTRUCCIONES,
  parseBool, parseNum, cellText, cellBool, splitList, joinList, normNombre,
} from '../inventoryRoundtrip'

describe('helpers de celdas', () => {
  it('COLUMNAS trae id primero y las 16 columnas', () => {
    expect(COLUMNAS[0]).toBe('id')
    expect(COLUMNAS).toContain('precio')
    expect(COLUMNAS).toContain('activo')
    expect(COLUMNAS.length).toBe(16)
  })
  it('INSTRUCCIONES no está vacío', () => {
    expect(INSTRUCCIONES.length).toBeGreaterThan(3)
  })
  it('parseBool reconoce verdadero en varias formas', () => {
    expect(parseBool('VERDADERO')).toBe(true)
    expect(parseBool('true')).toBe(true)
    expect(parseBool(1)).toBe(true)
    expect(parseBool('SÍ')).toBe(true)
    expect(parseBool('FALSO')).toBe(false)
    expect(parseBool('')).toBe(false)
  })
  it('parseNum: vacío→undefined, número→number, texto→NaN', () => {
    expect(parseNum('')).toBeUndefined()
    expect(parseNum('   ')).toBeUndefined()
    expect(parseNum(null)).toBeUndefined()
    expect(parseNum('3350')).toBe(3350)
    expect(parseNum('3604.66')).toBe(3604.66)
    expect(parseNum(10)).toBe(10)
    expect(Number.isNaN(parseNum('abc'))).toBe(true)
  })
  it('cellText: vacío/espacios→undefined; si no, recorta', () => {
    expect(cellText('')).toBeUndefined()
    expect(cellText('  ')).toBeUndefined()
    expect(cellText(null)).toBeUndefined()
    expect(cellText('  hola ')).toBe('hola')
  })
  it('cellBool: vacío→undefined; si no, booleano', () => {
    expect(cellBool('')).toBeUndefined()
    expect(cellBool('VERDADERO')).toBe(true)
    expect(cellBool('FALSO')).toBe(false)
  })
  it('splitList / joinList', () => {
    expect(splitList('S, M ,L,')).toEqual(['S', 'M', 'L'])
    expect(splitList('')).toEqual([])
    expect(joinList(['Rojo', 'Azul'])).toBe('Rojo, Azul')
    expect(joinList(null)).toBe('')
  })
  it('normNombre recorta y baja a minúsculas', () => {
    expect(normNombre('  Zapatos  ')).toBe('zapatos')
  })
})
