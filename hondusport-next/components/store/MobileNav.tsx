'use client'
import styles from './MobileNav.module.css'
import type { Categoria } from '@/types/store'

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  logoUrl?: string
  categorias: Categoria[]
  activeCat: string | null
  onSelectCat: (cat: string | null) => void
}

export default function MobileNav({
  isOpen,
  onClose,
  logoUrl,
  categorias,
  activeCat,
  onSelectCat,
}: MobileNavProps) {
  function selectAndClose(cat: string | null) {
    onSelectCat(cat)
    onClose()
  }

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <div className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo URL viene de configuracion (CMS), revisado en Task 15
            <img src={logoUrl} alt="Hondusport" className={styles.drawerLogo} width={120} height={40} />
          ) : (
            <span>HONDUSPORT</span>
          )}
          <button onClick={onClose} className={styles.closeBtn} aria-label="Cerrar menú">
            ✕
          </button>
        </div>
        <ul className={styles.links}>
          <li>
            <button
              className={activeCat === null ? styles.linkActive : ''}
              onClick={() => selectAndClose(null)}
            >
              Todos los productos
            </button>
          </li>
          {categorias.map(cat => (
            <li key={cat.id}>
              <button
                className={activeCat === cat.valor ? styles.linkActive : ''}
                onClick={() => selectAndClose(cat.valor)}
              >
                {cat.valor.toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
