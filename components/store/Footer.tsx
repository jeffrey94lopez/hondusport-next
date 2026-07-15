'use client'
import styles from './Footer.module.css'
import type { Categoria, ConfigMap } from '@/types/store'

const REDES: Array<{ key: string; icon: string }> = [
  { key: 'facebook_url', icon: 'fa-facebook-f' },
  { key: 'instagram_url', icon: 'fa-instagram' },
  { key: 'tiktok_url', icon: 'fa-tiktok' },
  { key: 'whatsapp_url', icon: 'fa-whatsapp' },
  { key: 'twitter_url', icon: 'fa-x-twitter' },
  { key: 'youtube_url', icon: 'fa-youtube' },
]

interface FooterProps {
  config: ConfigMap
  categorias: Categoria[]
  onFilterClick?: (value: string) => void
}

export default function Footer({ config, categorias, onFilterClick }: FooterProps) {
  const nombreNegocio = config.nombre_negocio || 'HONDU SPORT'
  const año = new Date().getFullYear()
  const redesActivas = REDES.filter(r => config[r.key]?.trim())

  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div>
          {config.slogan && <p className={styles.slogan}>{config.slogan}</p>}
          {config.direccion && (
            <p className={styles.address}>
              <i className="fa-solid fa-location-dot" />
              {config.direccion}
            </p>
          )}
        </div>

        <div>
          <h4>Tienda</h4>
          <ul className={styles.catList}>
            <li>
              <button className={styles.catFilterBtn} onClick={() => onFilterClick?.('')}>
                Colección
              </button>
            </li>
            {categorias.map(cat => (
              <li key={cat.id}>
                <button className={styles.catFilterBtn} onClick={() => onFilterClick?.(cat.valor)}>
                  {cat.valor.toUpperCase()}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.contact}>
          <h4>Contacto</h4>
          {config.telefono_visible && (
            <p>
              <i className="fa-solid fa-phone" />
              {config.telefono_visible}
            </p>
          )}
          {config.email_contacto && (
            <p>
              <i className="fa-solid fa-envelope" />
              {config.email_contacto}
            </p>
          )}
          {config.horario && (
            <p>
              <i className="fa-solid fa-clock" />
              {config.horario}
            </p>
          )}
        </div>
      </div>

      <hr className={styles.divider} />

      <div className={styles.bottomRow}>
        <p className={styles.copy}>
          © {año} {nombreNegocio}. Todos los derechos reservados.
        </p>
        {redesActivas.length > 0 && (
          <div className={styles.socialLinks}>
            {redesActivas.map(r => (
              <a
                key={r.key}
                href={config[r.key]}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialLink}
                aria-label={r.key.replace('_url', '')}
              >
                <i className={`fa-brands ${r.icon}`} />
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  )
}
