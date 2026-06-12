'use client'
import Image from 'next/image'
import styles from './CategoryGallery.module.css'
import type { Categoria } from '@/types/store'

interface CategoryGalleryProps {
  cats: Categoria[]
  onSelectCat?: (cat: string) => void
}

export default function CategoryGallery({ cats, onSelectCat }: CategoryGalleryProps) {
  if (cats.length === 0) return null

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Nuestras Categorías</h2>
      <div className={styles.grid}>
        {cats.map(cat => (
          <button key={cat.id} className={styles.card} onClick={() => onSelectCat?.(cat.valor)}>
            {cat.imagen && (
              <Image src={cat.imagen} alt={cat.valor} className={styles.cardImg} fill sizes="200px" />
            )}
            <div className={styles.overlay} />
            <div className={styles.cardTitle}>{cat.valor.toUpperCase()}</div>
          </button>
        ))}
      </div>
    </section>
  )
}
