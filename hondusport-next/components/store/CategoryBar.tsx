'use client'
import { useState } from 'react'
import styles from './CategoryBar.module.css'
import type { Categoria } from '@/types/store'

interface CategoryBarProps {
  cats: Categoria[]
  subcats: Categoria[]
  onSelectCat?: (cat: string | null) => void
  onSelectSubcat?: (subcat: string) => void
}

export default function CategoryBar({ cats, subcats, onSelectCat, onSelectSubcat }: CategoryBarProps) {
  const [activeCat, setActiveCat] = useState<string | null>(null)

  function selectCat(cat: string | null) {
    setActiveCat(cat)
    onSelectCat?.(cat)
  }

  return (
    <div className={styles.bar}>
      <div className={styles.barInner}>
        <button
          className={`${styles.filterBtn} ${activeCat === null ? styles.filterBtnActive : ''}`}
          onClick={() => selectCat(null)}
        >
          Todos
        </button>

        {cats.map(cat => {
          const subcatsForCat = subcats.filter(s =>
            (s.categorias_padre ?? []).some(parent => parent.toLowerCase() === cat.valor.toLowerCase())
          )

          if (subcatsForCat.length > 0) {
            return (
              <div key={cat.id} className={styles.dropdownWrapper}>
                <button
                  className={`${styles.filterBtn} ${activeCat === cat.valor ? styles.filterBtnActive : ''}`}
                  onClick={() => selectCat(cat.valor)}
                >
                  {cat.valor.toUpperCase()}
                </button>
                <div className={styles.dropdown}>
                  {subcatsForCat.map(sub => (
                    <button
                      key={sub.id}
                      className={styles.subItem}
                      onClick={() => {
                        selectCat(cat.valor)
                        onSelectSubcat?.(sub.valor)
                      }}
                    >
                      {sub.valor.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <button
              key={cat.id}
              className={`${styles.filterBtn} ${activeCat === cat.valor ? styles.filterBtnActive : ''}`}
              onClick={() => selectCat(cat.valor)}
            >
              {cat.valor.toUpperCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
