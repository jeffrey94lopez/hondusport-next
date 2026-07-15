import { describe, expect, test } from 'vitest'
import { slugify, parseFilters, filtersToQuery } from '../filterParams'
import type { FilterState } from '../filters'
import type { Categoria } from '@/types/store'

function cat(tipo: Categoria['tipo'], valor: string): Categoria {
  return { id: valor, tipo, valor, imagen: null, slug: valor.toLowerCase(), categorias_padre: null, orden: 0, activo: true }
}

const categorias: Categoria[] = [
  cat('cat', 'Camisetas'),
  cat('cat', 'Zapatos'),
  cat('subcat', 'Manga Larga'),
  cat('genero', 'Hombre'),
  cat('genero', 'Mujer'),
  cat('talla', 'M'),
  cat('talla', 'L'),
]
const ctx = { categorias, maxPriceLimit: 5000 }

describe('slugify', () => {
  test('lowercases, strips accents and spaces', () => {
    expect(slugify('Camisetas de Algodón')).toBe('camisetas-de-algodon')
  })
})

describe('filtersToQuery / parseFilters round-trip', () => {
  test('serializes readable slugs and parses them back to valores', () => {
    const filters: FilterState = {
      maxPrice: 2500,
      generos: ['Hombre'],
      cats: ['Camisetas'],
      tallas: ['M', 'L'],
      subcats: ['Manga Larga'],
    }
    const query = filtersToQuery(filters, ctx)
    expect(query).toContain('cat=camisetas')
    expect(query).toContain('genero=hombre')
    expect(query).toContain('talla=m%2Cl')
    expect(query).toContain('subcat=manga-larga')
    expect(query).toContain('max=2500')

    const parsed = parseFilters(new URLSearchParams(query), ctx)
    expect(parsed).toEqual(filters)
  })

  test('omits max when at the price limit', () => {
    const filters: FilterState = { maxPrice: 5000, generos: [], cats: [], tallas: [], subcats: [] }
    expect(filtersToQuery(filters, ctx)).toBe('')
  })

  test('parse defaults maxPrice to the limit when absent', () => {
    const parsed = parseFilters(new URLSearchParams(''), ctx)
    expect(parsed).toEqual({ maxPrice: 5000, generos: [], cats: [], tallas: [], subcats: [] })
  })

  test('ignores unknown slugs', () => {
    const parsed = parseFilters(new URLSearchParams('cat=camisetas,inexistente'), ctx)
    expect(parsed.cats).toEqual(['Camisetas'])
  })
})
