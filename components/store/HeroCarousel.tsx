'use client'
import { useEffect, useState } from 'react'
import styles from './HeroCarousel.module.css'
import type { Banner } from '@/types/store'

const AUTOPLAY_INTERVAL_MS = 5000

interface HeroCarouselProps {
  banners: Banner[]
}

// Acento dorado sobre la última palabra del título (patrón del diseño Stitch:
// "Desata tu Potencial" -> "Potencial" en dorado). Puramente cosmético — no es
// una regla de negocio, por eso vive junto al componente y no en lib/store/.
function renderTituloConAcento(titulo: string | null) {
  if (!titulo) return null
  const partes = titulo.trim().split(/\s+/)
  const ultima = partes.pop()
  const resto = partes.join(' ')
  return (
    <>
      {resto ? `${resto} ` : ''}
      <span className={styles.accent}>{ultima}</span>
    </>
  )
}

function scrollToCatalogo() {
  document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' })
}

export default function HeroCarousel({ banners }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (banners.length <= 1) return
    const id = setInterval(() => {
      setCurrent(prev => (prev + 1) % banners.length)
    }, AUTOPLAY_INTERVAL_MS)
    return () => clearInterval(id)
  }, [banners.length])

  if (banners.length === 0) return null

  return (
    <header className={styles.hero}>
      {banners.map((banner, i) => (
        <div
          key={banner.id}
          className={`${styles.slide} ${i === current ? styles.slideActive : ''}`}
          style={
            banner.imagen
              ? {
                  backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0) 100%), url('${banner.imagen}')`,
                }
              : undefined
          }
        >
          <div className={styles.slideContent}>
            <h1>{renderTituloConAcento(banner.titulo)}</h1>
            {banner.subtitulo && <p>{banner.subtitulo}</p>}
            <div className={styles.ctaRow}>
              <a href={banner.btn_link} className={styles.heroBtn}>
                {banner.btn_texto}
              </a>
              <button type="button" className={styles.heroBtnSecondary} onClick={scrollToCatalogo}>
                Ver catálogo
              </button>
            </div>
          </div>
        </div>
      ))}

      {banners.length > 1 && (
        <div className={styles.indicators}>
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              className={`${styles.indicator} ${i === current ? styles.indicatorActive : ''}`}
              aria-label={`Ir a la diapositiva ${i + 1}`}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
      )}

      <div className={styles.scrollHint}>
        <i className="fa-solid fa-chevron-down" />
      </div>
    </header>
  )
}
