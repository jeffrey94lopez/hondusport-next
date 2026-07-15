'use client'
import { useState } from 'react'
import Image from 'next/image'
import styles from './MegaSearch.module.css'
import { formatPrice } from '@/lib/store/format'
import { searchProductos } from '@/lib/store/search'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { StoreProducto, Categoria } from '@/types/store'

interface MegaSearchProps {
  productos: StoreProducto[]
  categorias: Categoria[]
  isOpen: boolean
  onClose: () => void
  onOpenProduct?: (id: string) => void
}

export default function MegaSearch({ productos, categorias, isOpen, onClose, onOpenProduct }: MegaSearchProps) {
  const [query, setQuery] = useState('')
  const [wasOpen, setWasOpen] = useState(isOpen)

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (!isOpen) setQuery('')
  }

  useEscapeKey(isOpen, onClose)

  const popularTags = categorias.filter(c => c.tipo === 'cat').map(c => c.valor)
  const results = searchProductos(productos, query)

  function handleSelect(id: string) {
    onOpenProduct?.(id)
    onClose()
  }

  return (
    <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} onClick={onClose}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.input}
            placeholder="¿Qué estás buscando?"
            autoComplete="off"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar búsqueda">
            ✕
          </button>
        </div>

        <div className={styles.resultsContainer}>
          {query.trim() === '' ? (
            <div className={styles.suggestions}>
              <h4>BÚSQUEDAS POPULARES</h4>
              <div className={styles.popularTags}>
                {popularTags.map(tag => (
                  <button key={tag} onClick={() => setQuery(tag)}>
                    {tag.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <p className={styles.noResults}>No se encontraron resultados para &quot;{query}&quot;</p>
          ) : (
            <div className={styles.results}>
              {results.map(producto => (
                <div className={styles.resultItem} key={producto.id} onClick={() => handleSelect(producto.slug)}>
                  <div className={styles.resultImgWrap}>
                    <Image
                      src={producto.imagenes[0] ?? ''}
                      alt={producto.nombre}
                      className={styles.resultImg}
                      fill
                      sizes="150px"
                    />
                  </div>
                  <div className={styles.resultTitle}>{producto.nombre}</div>
                  <div className={styles.resultPrice}>{formatPrice(producto.precio)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
