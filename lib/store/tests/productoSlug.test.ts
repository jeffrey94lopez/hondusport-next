import { describe, it, expect } from 'vitest'
import { esUuid } from '../productoSlug'

describe('esUuid', () => {
  it('reconoce un UUID v4 en minusculas', () => {
    expect(esUuid('5c5a519b-02ce-430d-8c46-03b04a45c0ea')).toBe(true)
  })

  it('reconoce un UUID en mayusculas', () => {
    expect(esUuid('5C5A519B-02CE-430D-8C46-03B04A45C0EA')).toBe(true)
  })

  it('un slug legible no es UUID', () => {
    expect(esUuid('camiseta-roja')).toBe(false)
  })

  it('un slug con sufijo numerico no es UUID', () => {
    expect(esUuid('camiseta-roja-2')).toBe(false)
  })

  it('cadena vacia no es UUID', () => {
    expect(esUuid('')).toBe(false)
  })

  it('un UUID con texto extra no matchea (anclado)', () => {
    expect(esUuid('5c5a519b-02ce-430d-8c46-03b04a45c0ea-extra')).toBe(false)
  })
})
