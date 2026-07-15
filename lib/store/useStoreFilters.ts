'use client'
import { useCallback, useEffect, useMemo, useRef } from 'react'
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
  clearTipo: (tipo: FilterTipo) => void
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

  // Estado pendiente sincronico: permite encadenar escrituras dentro del mismo
  // evento (toggles rapidos) sin leer el `filters` viejo de la URL, que se
  // actualiza de forma asincrona. Se sincroniza con la URL confirmada.
  const pendingRef = useRef(filters)
  useEffect(() => {
    pendingRef.current = filters
  }, [filters])

  const write = useCallback(
    (next: FilterState) => {
      pendingRef.current = next
      const query = filtersToQuery(next, ctx)
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, ctx],
  )

  const toggle = useCallback(
    (tipo: FilterTipo, valor: string) => {
      const field = FIELD[tipo]
      const current = pendingRef.current[field]
      const nextValues = current.includes(valor)
        ? current.filter(v => v !== valor)
        : [...current, valor]
      write({ ...pendingRef.current, [field]: nextValues })
    },
    [write],
  )

  const clearOne = useCallback(
    (tipo: FilterTipo, valor: string) => {
      const field = FIELD[tipo]
      write({ ...pendingRef.current, [field]: pendingRef.current[field].filter(v => v !== valor) })
    },
    [write],
  )

  const clearTipo = useCallback(
    (tipo: FilterTipo) => write({ ...pendingRef.current, [FIELD[tipo]]: [] }),
    [write],
  )

  const setMaxPrice = useCallback((n: number) => write({ ...pendingRef.current, maxPrice: n }), [write])

  const clearAll = useCallback(
    () => write({ ...pendingRef.current, generos: [], cats: [], tallas: [], subcats: [], maxPrice: ctx.maxPriceLimit }),
    [write, ctx],
  )

  const activeCount =
    filters.cats.length + filters.subcats.length + filters.generos.length + filters.tallas.length +
    (filters.maxPrice < ctx.maxPriceLimit ? 1 : 0)

  return { filters, toggle, setMaxPrice, clearOne, clearTipo, clearAll, activeCount }
}
