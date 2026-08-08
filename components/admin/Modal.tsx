'use client'
import { useEffect } from 'react'
import styles from './Modal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}

export default function Modal({ title, onClose, children, maxWidth = '560px' }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Cierra SOLO si el click fue en el propio fondo (overlay), no si llegó
  // ahí por bubbling desde un hijo. Antes dependía de que el hijo hiciera
  // `e.stopPropagation()` (línea eliminada abajo) — eso se rompe si el nodo
  // clickeado se desmonta/reemplaza en el mismo ciclo del click (p.ej. una
  // fila condicional de CobroModal que aparece/desaparece al cambiar un
  // monto), porque entonces el stopPropagation del hijo nunca llega a
  // ejecutarse y el click sigue subiendo hasta este overlay. Comparar
  // `e.target === e.currentTarget` no depende de que ningún descendiente
  // coopere: solo cierra si el clic ATERRIZÓ literalmente sobre el overlay.
  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} style={{ maxWidth }}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} type="button">×</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
