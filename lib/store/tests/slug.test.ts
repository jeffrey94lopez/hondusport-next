import { describe, expect, test } from 'vitest'
import { slugify, uniqueSlug } from '../slug'

describe('slugify', () => {
  test('lowercases, strips accents and non-alphanumerics', () => {
    expect(slugify('Camisetas de Algodón')).toBe('camisetas-de-algodon')
  })
  test('trims leading/trailing separators', () => {
    expect(slugify('  ¡Ofertas!  ')).toBe('ofertas')
  })
})

describe('uniqueSlug', () => {
  test('returns the base when unused', () => {
    expect(uniqueSlug('camisetas', ['shorts', 'zapatos'])).toBe('camisetas')
  })
  test('appends -2, -3 when the base collides', () => {
    expect(uniqueSlug('camisetas', ['camisetas'])).toBe('camisetas-2')
    expect(uniqueSlug('camisetas', ['camisetas', 'camisetas-2'])).toBe('camisetas-3')
  })
})
