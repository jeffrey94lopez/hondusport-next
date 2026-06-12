'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from './CartDrawer.module.css'
import { formatPrice } from '@/lib/store/format'
import { useCart } from '@/lib/store/cart-context'
import { getShippingProgress } from '@/lib/store/cart'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { Cupon } from '@/types'

const FREE_SHIPPING_TOAST_MS = 2500
const DEFAULT_FREE_SHIPPING_THRESHOLD = 999
const DEFAULT_FREE_SHIPPING_MSG = '✨ ¡TIENES ENVÍO GRATIS!'

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
  onCheckout?: () => void
  onOpenProduct?: (id: string) => void
  freeShippingActivo?: boolean
  freeShippingThreshold?: number
  cupones?: Cupon[]
}

export default function CartDrawer({
  isOpen,
  onClose,
  onCheckout,
  onOpenProduct,
  freeShippingActivo = true,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
  cupones = [],
}: CartDrawerProps) {
  const { cart, activeDiscount, subtotal, finalTotal, removeFromCart, changeQty, updateCustom, applyCoupon } = useCart()

  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState('')
  const [showFreeShippingToast, setShowFreeShippingToast] = useState(false)
  const wasFreeShippingReached = useRef(false)

  useEscapeKey(isOpen, onClose)

  const shippingProgress = getShippingProgress(finalTotal, freeShippingThreshold)
  const freeShippingReached = freeShippingActivo && finalTotal >= freeShippingThreshold

  useEffect(() => {
    if (freeShippingReached && !wasFreeShippingReached.current) {
      setShowFreeShippingToast(true)
      const timeout = setTimeout(() => setShowFreeShippingToast(false), FREE_SHIPPING_TOAST_MS)
      wasFreeShippingReached.current = true
      return () => clearTimeout(timeout)
    }

    if (!freeShippingReached) {
      wasFreeShippingReached.current = false
    }
  }, [freeShippingReached])

  function handleApplyCoupon() {
    if (couponCode.trim() === '') return

    const applied = applyCoupon(cupones, couponCode)
    if (applied) {
      setCouponCode('')
      setCouponError('')
    } else {
      setCouponError('CUPÓN INVÁLIDO')
    }
  }

  return (
    <>
      <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} onClick={onClose} />

      <aside className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`} role="dialog" aria-label="Carrito de compras">
        <div className={styles.header}>
          <h2>MI CARRITO</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar carrito">
            ✕
          </button>
        </div>

        {freeShippingActivo && (
          <>
            <div className={styles.shippingMeter}>
              <div className={styles.shippingBar} style={{ width: `${shippingProgress}%` }} />
            </div>
            <p className={styles.shippingMsg}>
              {freeShippingReached
                ? DEFAULT_FREE_SHIPPING_MSG
                : `TE FALTAN ${formatPrice(freeShippingThreshold - finalTotal)} PARA ENVÍO GRATIS`}
            </p>
          </>
        )}

        <div className={styles.items}>
          {cart.length === 0 ? (
            <div className={styles.emptyMsg}>
              <p className={styles.emptyText}>
                {activeDiscount > 0 ? `🎉 TU DESCUENTO DEL ${activeDiscount}% SIGUE ACTIVO` : 'TU CARRITO ESTÁ VACÍO'}
              </p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div className={styles.item} key={`${item.id}-${item.size}-${item.custom}-${idx}`}>
                <Image src={item.imagen} alt={item.nombre} className={styles.itemImg} width={50} height={50} />
                <div className={styles.itemInfo}>
                  <div className={styles.itemTitleRow}>
                    <h4 className={styles.itemTitle} onClick={() => onOpenProduct?.(item.id)} style={{ cursor: 'pointer' }}>
                      {item.nombre}
                    </h4>
                    <button className={styles.itemDelete} onClick={() => removeFromCart(idx)} aria-label="Eliminar del carrito">
                      🗑️
                    </button>
                  </div>
                  <p className={styles.itemSize}>TALLA: {item.size}</p>
                  <div className={styles.customEditContainer}>
                    <span className={styles.inputIconLabel}>✏️</span>
                    <input
                      type="text"
                      className={styles.customEditInput}
                      defaultValue={item.custom === 'Sin personalización' ? '' : item.custom}
                      placeholder="Personalización"
                      onBlur={e => updateCustom(idx, e.target.value.trim() || 'Sin personalización')}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                    />
                  </div>
                  <div className={styles.itemControls}>
                    <div className={styles.qtyControls}>
                      <button className={styles.qtyBtn} onClick={() => changeQty(idx, -1)} aria-label="Restar cantidad">
                        -
                      </button>
                      <span>{item.qty}</span>
                      <button className={styles.qtyBtn} onClick={() => changeQty(idx, 1)} aria-label="Sumar cantidad">
                        +
                      </button>
                    </div>
                    <span className={styles.itemPrice}>{formatPrice(item.precio * item.qty)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className={styles.couponArea}>
            <input
              type="text"
              className={styles.couponInput}
              placeholder="CÓDIGO DE DESCUENTO"
              value={couponCode}
              onChange={e => setCouponCode(e.target.value)}
            />
            {couponError && <p className={styles.couponError}>{couponError}</p>}
            <button className={styles.couponBtn} onClick={handleApplyCoupon}>
              APLICAR
            </button>
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.totalRow}>
            <span>TOTAL:</span>
            <div className={styles.totalRight}>
              {activeDiscount > 0 && <span className={styles.subtotalVal}>{formatPrice(subtotal)}</span>}
              <span>{formatPrice(finalTotal)}</span>
              {activeDiscount > 0 && <span className={styles.discountBadge}>-{activeDiscount}%</span>}
            </div>
          </div>
          <button className={styles.checkoutBtn} onClick={() => onCheckout?.()}>
            FINALIZAR PEDIDO
          </button>
        </div>
      </aside>

      <div className={`${styles.freeShippingToast} ${showFreeShippingToast ? styles.freeShippingToastActive : ''}`}>
        <div style={{ fontSize: '3rem' }}>🎉</div>
        <h3 style={{ margin: '.5rem 0' }}>ENVÍO GRATIS</h3>
        <p style={{ fontSize: '.9rem', opacity: 0.9 }}>¡Llegaste a la meta!</p>
      </div>
    </>
  )
}
