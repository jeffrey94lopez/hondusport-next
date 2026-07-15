import type { FilterState } from './filters'
import type { Categoria } from '@/types/store'
import { slugify } from './slug'

export type FilterTipo = 'cat' | 'subcat' | 'genero' | 'talla'

export interface FilterParamsCtx {
  categorias: Categoria[]
  maxPriceLimit: number
}

const MAP: Record<FilterTipo, { key: string; field: keyof Omit<FilterState, 'maxPrice'>; catTipo: Categoria['tipo'] }> = {
  cat: { key: 'cat', field: 'cats', catTipo: 'cat' },
  subcat: { key: 'subcat', field: 'subcats', catTipo: 'subcat' },
  genero: { key: 'genero', field: 'generos', catTipo: 'genero' },
  talla: { key: 'talla', field: 'tallas', catTipo: 'talla' },
}

// valor (nombre) -> slug estable de la categoria de ese tipo
function slugDeValor(ctx: FilterParamsCtx, catTipo: Categoria['tipo'], valor: string): string | undefined {
  return ctx.categorias.find(c => c.tipo === catTipo && c.valor === valor)?.slug
}

// slug -> valor (nombre) de la categoria de ese tipo
function valorDeSlug(ctx: FilterParamsCtx, catTipo: Categoria['tipo'], slug: string): string | undefined {
  return ctx.categorias.find(c => c.tipo === catTipo && c.slug === slug)?.valor
}

export function filtersToQuery(filters: FilterState, ctx: FilterParamsCtx): string {
  const params = new URLSearchParams()
  for (const tipo of Object.keys(MAP) as FilterTipo[]) {
    const { key, field, catTipo } = MAP[tipo]
    const slugs = filters[field]
      .map(valor => slugDeValor(ctx, catTipo, valor))
      .filter((s): s is string => s != null)
    if (slugs.length > 0) params.set(key, slugs.join(','))
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
    result[field] = slugs
      .map(slug => valorDeSlug(ctx, catTipo, slug))
      .filter((v): v is string => v != null)
  }

  const max = Number(params.get('max'))
  if (Number.isFinite(max) && max > 0) result.maxPrice = max

  return result
}

export { slugify }
