'use client'
import styles from './FilterSidebar.module.css'
import { formatPrice } from '@/lib/store/format'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { FilterState } from '@/lib/store/filters'
import type { FilterTipo } from '@/lib/store/filterParams'
import type { Categoria } from '@/types/store'

const PRICE_MIN = 500
const PRICE_STEP = 100

interface FilterSidebarProps {
  categorias: Categoria[]
  filters: FilterState
  maxPriceLimit?: number
  isOpen?: boolean
  onClose?: () => void
  onToggle: (tipo: FilterTipo, valor: string) => void
  onMaxPrice: (n: number) => void
  onClearAll: () => void
}

export default function FilterSidebar({
  categorias,
  filters,
  maxPriceLimit = 5000,
  isOpen,
  onClose,
  onToggle,
  onMaxPrice,
  onClearAll,
}: FilterSidebarProps) {
  useEscapeKey(isOpen ?? false, () => onClose?.())

  const generoFiltros = categorias.filter(c => c.tipo === 'genero')
  const catFiltros = categorias.filter(c => c.tipo === 'cat')
  const tallaFiltros = categorias.filter(c => c.tipo === 'talla')
  const subcatFiltros = categorias.filter(c => c.tipo === 'subcat')

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarActive : ''}`}>
      <button className={styles.closeBtn} onClick={() => onClose?.()} aria-label="Cerrar filtros">
        ✕
      </button>

      {generoFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>GÉNERO</h4>
          {generoFiltros.map(f => (
            <label key={f.id} className={styles.checkLabel}>
              <input
                type="checkbox"
                className={styles.filterCheck}
                checked={filters.generos.includes(f.valor)}
                onChange={() => onToggle('genero', f.valor)}
              />
              {f.valor}
            </label>
          ))}
        </div>
      )}

      {catFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>CATEGORÍA</h4>
          {catFiltros.map(f => (
            <label key={f.id} className={styles.checkLabel}>
              <input
                type="checkbox"
                className={styles.filterCheck}
                checked={filters.cats.includes(f.valor)}
                onChange={() => onToggle('cat', f.valor)}
              />
              {f.valor}
            </label>
          ))}
        </div>
      )}

      {tallaFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>TALLA</h4>
          <div className={styles.tallaBtnGroup}>
            {tallaFiltros.map(f => (
              <button
                key={f.id}
                className={`${styles.tallaBtn} ${filters.tallas.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => onToggle('talla', f.valor)}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </div>
      )}

      {subcatFiltros.length > 0 && (
        <div className={styles.filterGroup}>
          <h4>SUBCATEGORÍA</h4>
          <div className={styles.tallaBtnGroup}>
            {subcatFiltros.map(f => (
              <button
                key={f.id}
                className={`${styles.tallaBtn} ${filters.subcats.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => onToggle('subcat', f.valor)}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.filterGroup}>
        <h4>
          PRECIO MÁXIMO: <span>{formatPrice(filters.maxPrice)}</span>
        </h4>
        <input
          type="range"
          className={styles.priceRange}
          min={PRICE_MIN}
          max={maxPriceLimit}
          step={PRICE_STEP}
          value={filters.maxPrice}
          onChange={e => onMaxPrice(Number(e.target.value))}
        />
      </div>

      <button className={styles.clearBtn} onClick={onClearAll}>
        <i className="fa-solid fa-trash-can" /> LIMPIAR FILTROS
      </button>
    </aside>
  )
}
