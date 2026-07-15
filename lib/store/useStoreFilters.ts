'use client'
import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { FilterState } from './filters'
import { parseFilters, filtersToQuery, type FilterTipo, type FilterParamsCtx } from './filterParams'

const FIELD: Record<FilterTipo, keyof Omit<FilterState, 'maxPrice'>> = {
  cat: 'cats',
  subcat: 'subcats',
  genero: 'generos',
  talla: 'tallas',
}

export interface UseStoreFilters {
  filters: FilterState
  toggle: (tipo: FilterTipo, valor: string) => void
  setMaxPrice: (n: number) => void
  clearOne: (tipo: FilterTipo, valor: string) => void
  clearAll: () => void
  activeCount: number
}

export function useStoreFilters(ctx: FilterParamsCtx): UseStoreFilters {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString()), ctx),
    [searchParams, ctx],
  )

  const write = useCallback(
    (next: FilterState) => {
      const query = filtersToQuery(next, ctx)
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, ctx],
  )

  const toggle = useCallback(
    (tipo: FilterTipo, valor: string) => {
      const field = FIELD[tipo]
      const current = filters[field]
      const nextValues = current.includes(valor)
        ? current.filter(v => v !== valor)
        : [...current, valor]
      write({ ...filters, [field]: nextValues })
    },
    [filters, write],
  )

  const clearOne = useCallback(
    (tipo: FilterTipo, valor: string) => {
      const field = FIELD[tipo]
      write({ ...filters, [field]: filters[field].filter(v => v !== valor) })
    },
    [filters, write],
  )

  const setMaxPrice = useCallback((n: number) => write({ ...filters, maxPrice: n }), [filters, write])

  const clearAll = useCallback(() => write({ ...filters, generos: [], cats: [], tallas: [], subcats: [], maxPrice: ctx.maxPriceLimit }), [filters, write, ctx])

  const activeCount =
    filters.cats.length + filters.subcats.length + filters.generos.length + filters.tallas.length +
    (filters.maxPrice < ctx.maxPriceLimit ? 1 : 0)

  return { filters, toggle, setMaxPrice, clearOne, clearAll, activeCount }
}
