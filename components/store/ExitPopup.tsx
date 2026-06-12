'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './ExitPopup.module.css'
import { useCart } from '@/lib/store/cart-context'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { Cupon } from '@/types'

const EXIT_INTENT_MIN_WIDTH = 768

interface ExitPopupProps {
  cupones?: Cupon[]
  activo?: boolean
  onCouponApplied?: () => void
}

export default function ExitPopup({ cupones = [], activo = true, onCouponApplied }: ExitPopupProps) {
  const { applyCoupon } = useCart()
  const [isOpen, setIsOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const hasShown = useRef(false)

  useEffect(() => {
    if (!activo) return

    function handleMouseLeave(e: MouseEvent) {
      if (!hasShown.current && e.clientY < 0 && window.innerWidth > EXIT_INTENT_MIN_WIDTH) {
        hasShown.current = true
        setIsOpen(true)
      }
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    return () => document.removeEventListener('mouseleave', handleMouseLeave)
  }, [activo])

  function handleClose() {
    setIsOpen(false)
  }

  useEscapeKey(isOpen, handleClose)

  function handleValidate() {
    const applied = applyCoupon(cupones, code)
    if (applied) {
      setError(false)
      setCode('')
      setIsOpen(false)
      onCouponApplied?.()
    } else {
      setError(true)
    }
  }

  if (!activo) return null

  return (
    <>
      <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} onClick={handleClose} />

      <div className={`${styles.popup} ${isOpen ? styles.popupActive : ''}`} role="dialog" aria-label="Oferta especial">
        <button className={styles.closeBtn} onClick={handleClose} aria-label="Cerrar">
          ✕
        </button>
        <h2>¡ESPERA! ✋</h2>
        <p className={styles.text}>Obtén un beneficio exclusivo antes de irte.</p>
        <input
          type="text"
          className={styles.input}
          placeholder="CÓDIGO"
          value={code}
          onChange={e => setCode(e.target.value)}
        />
        {error && <p className={styles.error}>INVÁLIDO</p>}
        <button className={styles.redeemBtn} onClick={handleValidate}>
          CANJEAR
        </button>
      </div>
    </>
  )
}
