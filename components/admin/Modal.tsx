'use client'
import { useEffect, useRef } from 'react'
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

  // Cierra SOLO si tanto la PULSACIÓN como el soltado ocurrieron en el propio
  // fondo (overlay). Comparar `e.target === e.currentTarget` solo en el click
  // no basta: cuando el nodo pulsado (un input o un chip de pago) se
  // desmonta/reemplaza por un re-render en el mismo gesto —p.ej. al editar un
  // pago con métodos mixtos, que recalcula los chips del otro pago— el
  // navegador resuelve el `click` sobre el ancestro común, que es el overlay,
  // y cerraría por error. Registrar dónde EMPEZÓ el mousedown no depende de
  // qué sobreviva al re-render: si la pulsación no nació sobre el fondo, no
  // cerramos, pase lo que pase con el target del click.
  const mousedownEnFondo = useRef(false)
  return (
    <div
      className={styles.overlay}
      onMouseDown={e => { mousedownEnFondo.current = e.target === e.currentTarget }}
      onClick={e => {
        if (e.target === e.currentTarget && mousedownEnFondo.current) onClose()
        mousedownEnFondo.current = false
      }}
    >
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
