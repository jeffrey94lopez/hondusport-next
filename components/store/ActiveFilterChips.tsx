'use client'
import styles from './ActiveFilterChips.module.css'
import { formatPrice } from '@/lib/store/format'
import type { FilterState } from '@/lib/store/filters'
import type { FilterTipo } from '@/lib/store/filterParams'

interface ActiveFilterChipsProps {
  filters: FilterState
  maxPriceLimit: number
  onClearOne: (tipo: FilterTipo, valor: string) => void
  onClearAll: () => void
}

interface Chip {
  tipo: FilterTipo
  valor: string
}

export default function ActiveFilterChips({ filters, maxPriceLimit, onClearOne, onClearAll }: ActiveFilterChipsProps) {
  const chips: Chip[] = [
    ...filters.cats.map(valor => ({ tipo: 'cat' as const, valor })),
    ...filters.subcats.map(valor => ({ tipo: 'subcat' as const, valor })),
    ...filters.generos.map(valor => ({ tipo: 'genero' as const, valor })),
    ...filters.tallas.map(valor => ({ tipo: 'talla' as const, valor })),
  ]

  const hasPrice = filters.maxPrice < maxPriceLimit
  if (chips.length === 0 && !hasPrice) return null

  return (
    <div className={styles.row}>
      {chips.map(({ tipo, valor }) => (
        <button
          key={`${tipo}-${valor}`}
          className={styles.chip}
          onClick={() => onClearOne(tipo, valor)}
          aria-label={`Quitar filtro ${valor}`}
        >
          {valor} <span aria-hidden>✕</span>
        </button>
      ))}
      {hasPrice && (
        <span className={styles.chip}>Hasta {formatPrice(filters.maxPrice)}</span>
      )}
      <button className={styles.clearAll} onClick={onClearAll}>
        Limpiar todo
      </button>
    </div>
  )
}
