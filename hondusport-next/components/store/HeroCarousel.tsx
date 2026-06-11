'use client'
import { useEffect, useState } from 'react'
import styles from './HeroCarousel.module.css'
import type { Banner } from '@/types/store'

const AUTOPLAY_INTERVAL_MS = 5000

interface HeroCarouselProps {
  banners: Banner[]
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
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url('${banner.imagen}')`,
                }
              : undefined
          }
        >
          <div className={styles.slideContent}>
            <h1>{banner.titulo}</h1>
            <p>{banner.subtitulo}</p>
            <a href={banner.btn_link} className={styles.heroBtn}>
              {banner.btn_texto}
            </a>
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
