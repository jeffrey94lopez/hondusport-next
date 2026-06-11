'use client'
import { useEffect, useState } from 'react'
import styles from './FilterSidebar.module.css'
import { formatPrice } from '@/lib/store/format'
import type { FilterState } from '@/lib/store/filters'
import type { Categoria } from '@/types/store'

const PRICE_MIN = 500
const PRICE_STEP = 100

interface FilterSidebarProps {
  categorias: Categoria[]
  maxPriceLimit?: number
  isOpen?: boolean
  onClose?: () => void
  onChange?: (state: FilterState) => void
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter(v => v !== value) : [...values, value]
}

export default function FilterSidebar({ categorias, maxPriceLimit = 5000, isOpen, onClose, onChange }: FilterSidebarProps) {
  const [maxPrice, setMaxPrice] = useState(maxPriceLimit)
  const [generos, setGeneros] = useState<string[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [tallas, setTallas] = useState<string[]>([])
  const [subcats, setSubcats] = useState<string[]>([])

  useEffect(() => {
    onChange?.({ maxPrice, generos, cats, tallas, subcats })
  }, [maxPrice, generos, cats, tallas, subcats, onChange])

  const generoFiltros = categorias.filter(c => c.tipo === 'genero')
  const catFiltros = categorias.filter(c => c.tipo === 'cat')
  const tallaFiltros = categorias.filter(c => c.tipo === 'talla')
  const subcatFiltros = categorias.filter(c => c.tipo === 'subcat')

  function clearAll() {
    setMaxPrice(maxPriceLimit)
    setGeneros([])
    setCats([])
    setTallas([])
    setSubcats([])
  }

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
                checked={generos.includes(f.valor)}
                onChange={() => setGeneros(prev => toggleValue(prev, f.valor))}
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
                checked={cats.includes(f.valor)}
                onChange={() => setCats(prev => toggleValue(prev, f.valor))}
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
                className={`${styles.tallaBtn} ${tallas.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => setTallas(prev => toggleValue(prev, f.valor))}
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
                className={`${styles.tallaBtn} ${subcats.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => setSubcats(prev => toggleValue(prev, f.valor))}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.filterGroup}>
        <h4>
          PRECIO MÁXIMO: <span>{formatPrice(maxPrice)}</span>
        </h4>
        <input
          type="range"
          className={styles.priceRange}
          min={PRICE_MIN}
          max={maxPriceLimit}
          step={PRICE_STEP}
          value={maxPrice}
          onChange={e => setMaxPrice(Number(e.target.value))}
        />
      </div>

      <button className={styles.clearBtn} onClick={clearAll}>
        <i className="fa-solid fa-trash-can" /> LIMPIAR FILTROS
      </button>
    </aside>
  )
}
