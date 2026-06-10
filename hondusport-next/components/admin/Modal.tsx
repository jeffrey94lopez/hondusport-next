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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ maxWidth }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} type="button">×</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
