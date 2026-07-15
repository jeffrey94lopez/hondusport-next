'use client'
import Image from 'next/image'
import styles from './MobileNav.module.css'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { Categoria } from '@/types/store'

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  logoUrl?: string
  categorias: Categoria[]
  activeCats: string[]
  onSelectCat: (cat: string | null) => void
}

export default function MobileNav({
  isOpen,
  onClose,
  logoUrl,
  categorias,
  activeCats,
  onSelectCat,
}: MobileNavProps) {
  function selectAndClose(cat: string | null) {
    onSelectCat(cat)
    onClose()
  }

  useEscapeKey(isOpen, onClose)

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <div className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          {logoUrl ? (
            <Image src={logoUrl} alt="Hondusport" className={styles.drawerLogo} width={120} height={40} />
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
              className={activeCats.length === 0 ? styles.linkActive : ''}
              onClick={() => selectAndClose(null)}
            >
              Todos los productos
            </button>
          </li>
          {categorias.map(cat => (
            <li key={cat.id}>
              <button
                className={activeCats.includes(cat.valor) ? styles.linkActive : ''}
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
