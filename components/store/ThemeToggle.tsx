'use client'
import styles from './Nav.module.css'
import { useTheme } from '@/lib/store/theme-context'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button className={styles.iconBtn} onClick={toggle} aria-label="Cambiar tema">
      <i className={`fa-solid ${theme === 'light' ? 'fa-sun' : 'fa-moon'}`} />
    </button>
  )
}
