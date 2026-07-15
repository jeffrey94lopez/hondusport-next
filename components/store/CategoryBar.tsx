'use client'
import styles from './CategoryBar.module.css'
import type { Categoria } from '@/types/store'

interface CategoryBarProps {
  cats: Categoria[]
  subcats: Categoria[]
  activeCats: string[]
  activeSubcats: string[]
  onToggleCat: (valor: string) => void
  onToggleSubcat: (valor: string) => void
  onClearCats: () => void
}

export default function CategoryBar({ cats, subcats, activeCats, activeSubcats, onToggleCat, onToggleSubcat, onClearCats }: CategoryBarProps) {
  const noneActive = activeCats.length === 0 && activeSubcats.length === 0

  return (
    <div className={styles.bar}>
      <div className={styles.barInner}>
        <button
          className={`${styles.filterBtn} ${noneActive ? styles.filterBtnActive : ''}`}
          onClick={onClearCats}
        >
          Todos
        </button>

        {cats.map(cat => {
          const isActive = activeCats.includes(cat.valor)
          const subcatsForCat = subcats.filter(s =>
            (s.categorias_padre ?? []).includes(cat.id)
          )

          if (subcatsForCat.length > 0) {
            return (
              <div key={cat.id} className={styles.dropdownWrapper}>
                <button
                  className={`${styles.filterBtn} ${isActive ? styles.filterBtnActive : ''}`}
                  onClick={() => onToggleCat(cat.valor)}
                >
                  {cat.valor.toUpperCase()}
                </button>
                <div className={styles.dropdown}>
                  {subcatsForCat.map(sub => (
                    <button
                      key={sub.id}
                      className={`${styles.subItem} ${activeSubcats.includes(sub.valor) ? styles.filterBtnActive : ''}`}
                      onClick={() => onToggleSubcat(sub.valor)}
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
              className={`${styles.filterBtn} ${isActive ? styles.filterBtnActive : ''}`}
              onClick={() => onToggleCat(cat.valor)}
            >
              {cat.valor.toUpperCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
