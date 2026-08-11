'use client'
import styles from './Nav.module.css'
import { useTheme } from '@/lib/store/theme-context'

// R1: tienda fija en tema claro; el control de cambio de tema queda oculto.
// Se mantiene el componente (sin borrar, con su render original intacto)
// para poder revertir esto fácilmente cambiando SHOW_TOGGLE a true.
const SHOW_TOGGLE = false

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()

  if (!SHOW_TOGGLE) return null

  return (
    <button className={styles.iconBtn} onClick={toggle} aria-label="Cambiar tema">
      <i className={`fa-solid ${theme === 'light' ? 'fa-sun' : 'fa-moon'}`} />
    </button>
  )
}
