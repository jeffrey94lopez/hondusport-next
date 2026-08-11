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
          <h2>Tu Carrito</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar carrito">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className={styles.content}>
          {freeShippingActivo && (
            <div className={styles.shippingProgress}>
              <p className={styles.shippingMsg}>
                {freeShippingReached ? (
                  DEFAULT_FREE_SHIPPING_MSG
                ) : (
                  <>
                    ¡Estás a <span className={styles.shippingAmount}>{formatPrice(freeShippingThreshold - finalTotal)}</span> del envío gratis!
                  </>
                )}
              </p>
              <div className={styles.shippingMeter}>
                <div className={styles.shippingBar} style={{ width: `${shippingProgress}%` }} />
              </div>
            </div>
          )}

          <div className={styles.items}>
            {cart.length === 0 ? (
              <div className={styles.emptyMsg}>
                <p className={styles.emptyText}>
                  {activeDiscount > 0 ? `Tu descuento del ${activeDiscount}% sigue activo` : 'Tu carrito está vacío'}
                </p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div className={styles.item} key={`${item.id}-${item.varianteId ?? ''}-${item.size}-${item.custom}-${idx}`}>
                  <div className={styles.itemImgWrap}>
                    <Image src={item.imagen} alt={item.nombre} className={styles.itemImg} width={80} height={80} />
                  </div>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemTitleRow}>
                      <div className={styles.itemTitleCol}>
                        <h4 className={styles.itemTitle} onClick={() => onOpenProduct?.(item.id)}>
                          {item.nombre}
                        </h4>
                        <p className={styles.itemSize}>
                          {item.variante
                            ? <>Opción: {item.variante}</>
                            : <>Talla: {item.size}</>}
                        </p>
                        {item.personalizable && (
                          <div className={styles.customEditContainer}>
                            <i className={`fa-solid fa-pen ${styles.inputIconLabel}`} />
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
                        )}
                      </div>
                      <button className={styles.itemDelete} onClick={() => removeFromCart(idx)} aria-label="Eliminar del carrito">
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </div>
                    <div className={styles.itemControls}>
                      <div className={styles.qtyControls}>
                        <button className={styles.qtyBtn} onClick={() => changeQty(idx, -1)} aria-label="Restar cantidad">
                          <i className="fa-solid fa-minus" />
                        </button>
                        <span>{item.qty}</span>
                        <button
                          className={styles.qtyBtn}
                          onClick={() => changeQty(idx, 1)}
                          disabled={item.stockDisponible != null && item.qty >= item.stockDisponible}
                          aria-label="Sumar cantidad"
                        >
                          <i className="fa-solid fa-plus" />
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
              <label htmlFor="cart-coupon" className={styles.couponLabel}>Código de Descuento</label>
              <div className={styles.couponRow}>
                <input
                  id="cart-coupon"
                  type="text"
                  className={styles.couponInput}
                  placeholder="Ingresa tu código"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value)}
                />
                <button className={styles.couponBtn} onClick={handleApplyCoupon}>
                  Aplicar
                </button>
              </div>
              {couponError && <p className={styles.couponError}>Cupón inválido</p>}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Subtotal</span>
            <div className={styles.totalRight}>
              {activeDiscount > 0 && <span className={styles.subtotalVal}>{formatPrice(subtotal)}</span>}
              <span className={styles.totalVal}>{formatPrice(finalTotal)}</span>
              {activeDiscount > 0 && <span className={styles.discountBadge}>-{activeDiscount}%</span>}
            </div>
          </div>
          <button className={styles.checkoutBtn} onClick={() => onCheckout?.()}>
            Ir a pagar <i className="fa-solid fa-arrow-right" />
          </button>
          <p className={styles.checkoutNote}>Los impuestos y gastos de envío se calculan en el checkout.</p>
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
