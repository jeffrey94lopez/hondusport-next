import type { FilterState } from './filters'
import type { Categoria } from '@/types/store'

export type FilterTipo = 'cat' | 'subcat' | 'genero' | 'talla'

export interface FilterParamsCtx {
  categorias: Categoria[]
  maxPriceLimit: number
}

// tipo de filtro -> (clave de query, campo de FilterState, tipo de categoria)
const MAP: Record<FilterTipo, { key: string; field: keyof Omit<FilterState, 'maxPrice'>; catTipo: Categoria['tipo'] }> = {
  cat: { key: 'cat', field: 'cats', catTipo: 'cat' },
  subcat: { key: 'subcat', field: 'subcats', catTipo: 'subcat' },
  genero: { key: 'genero', field: 'generos', catTipo: 'genero' },
  talla: { key: 'talla', field: 'tallas', catTipo: 'talla' },
}

export function slugify(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function valoresDeTipo(ctx: FilterParamsCtx, catTipo: Categoria['tipo']): string[] {
  return ctx.categorias.filter(c => c.tipo === catTipo).map(c => c.valor)
}

export function filtersToQuery(filters: FilterState, ctx: FilterParamsCtx): string {
  const params = new URLSearchParams()
  for (const tipo of Object.keys(MAP) as FilterTipo[]) {
    const { key, field } = MAP[tipo]
    const values = filters[field]
    if (values.length > 0) params.set(key, values.map(slugify).join(','))
  }
  if (filters.maxPrice < ctx.maxPriceLimit) params.set('max', String(filters.maxPrice))
  return params.toString()
}

export function parseFilters(params: URLSearchParams, ctx: FilterParamsCtx): FilterState {
  const result: FilterState = { maxPrice: ctx.maxPriceLimit, generos: [], cats: [], tallas: [], subcats: [] }

  for (const tipo of Object.keys(MAP) as FilterTipo[]) {
    const { key, field, catTipo } = MAP[tipo]
    const raw = params.get(key)
    if (!raw) continue
    const slugs = raw.split(',').map(s => s.trim()).filter(Boolean)
    const valores = valoresDeTipo(ctx, catTipo)
    result[field] = slugs
      .map(slug => valores.find(v => slugify(v) === slug))
      .filter((v): v is string => v != null)
  }

  const max = Number(params.get('max'))
  if (Number.isFinite(max) && max > 0) result.maxPrice = max

  return result
}
