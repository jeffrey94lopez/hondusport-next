'use client'
import { useEffect, useState } from 'react'
import styles from './CheckoutModal.module.css'
import { formatPrice } from '@/lib/store/format'
import { useCart } from '@/lib/store/cart-context'
import { calculateOrderTotals, getOrderText } from '@/lib/store/orderTotals'
import { crearPedido } from '@/app/(store)/checkout/actions'
import type { Envio, Cupon } from '@/types'

const DELIVERY_KEY = 'hs_checkout_delivery'
const DEFAULT_FREE_SHIPPING_THRESHOLD = 999

interface DeliveryInfo {
  name: string
  phone: string
  email: string
  city: string
  address: string
}

const EMPTY_DELIVERY: DeliveryInfo = { name: '', phone: '', email: '', city: '', address: '' }

function readDeliveryInfo(): DeliveryInfo {
  if (typeof window === 'undefined') return EMPTY_DELIVERY
  try {
    const raw = localStorage.getItem(DELIVERY_KEY)
    return raw ? { ...EMPTY_DELIVERY, ...(JSON.parse(raw) as Partial<DeliveryInfo>) } : EMPTY_DELIVERY
  } catch {
    return EMPTY_DELIVERY
  }
}

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  envios: Envio[]
  cupones: Cupon[]
  whatsappNumber: string
  freeShippingActivo?: boolean
  freeShippingThreshold?: number
}

export default function CheckoutModal({
  isOpen,
  onClose,
  envios,
  cupones,
  whatsappNumber,
  freeShippingActivo = true,
  freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
}: CheckoutModalProps) {
  const { cart, activeDiscount, clear } = useCart()
  const [delivery, setDelivery] = useState<DeliveryInfo>(EMPTY_DELIVERY)
  const [selectedEnvioId, setSelectedEnvioId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'processing'>('idle')
  const [error, setError] = useState('')
  const [wasOpen, setWasOpen] = useState(false)

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setDelivery(readDeliveryInfo())
      setSelectedEnvioId(prev => prev ?? envios[0]?.id ?? null)
      setError('')
    }
  }

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const selectedEnvio = envios.find(e => e.id === selectedEnvioId) ?? null

  const totals = calculateOrderTotals({
    cart,
    activeDiscount,
    envio: selectedEnvio,
    freeShippingActivo,
    freeShippingThreshold,
  })

  function updateDelivery(field: keyof DeliveryInfo, value: string) {
    const next = { ...delivery, [field]: value }
    setDelivery(next)
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(next))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!selectedEnvio) {
      setError('Selecciona un método de envío')
      return
    }

    if (selectedEnvio.tipo === 'delivery' && (!delivery.city.trim() || !delivery.address.trim())) {
      setError('Completa ciudad y dirección')
      return
    }

    setStatus('processing')
    setError('')

    const cuponCodigo = cupones.find(c => c.descuento === activeDiscount)?.codigo ?? null

    const result = await crearPedido({
      nombre: delivery.name,
      telefono: delivery.phone,
      email: delivery.email,
      ciudad: delivery.city,
      direccion: delivery.address,
      envioId: selectedEnvio.id,
      cuponCodigo,
      cart: cart.map(item => ({ id: item.id, size: item.size, custom: item.custom, qty: item.qty })),
    })

    if (result.error) {
      setError(result.error)
      setStatus('idle')
      return
    }

    if (whatsappNumber) {
      const text = getOrderText({
        cart,
        envio: selectedEnvio,
        totals,
        cliente: {
          nombre: delivery.name,
          telefono: delivery.phone,
          email: delivery.email,
          ciudad: delivery.city,
          direccion: delivery.address,
        },
      })
      window.open(`https://wa.me/${whatsappNumber}?text=${text}`, '_blank')
    }

    clear()
    setStatus('idle')
    onClose()
  }

  return (
    <>
      <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} onClick={onClose} />
      <div className={`${styles.modal} ${isOpen ? styles.modalActive : ''}`}>
        <div className={styles.content} role="dialog" aria-label="Finalizar pedido" aria-modal="true">
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
          <h3>FINALIZAR PEDIDO</h3>

          <div className={styles.deliveryOptions}>
            {envios.map(envio => (
              <button
                key={envio.id}
                type="button"
                className={`${styles.deliveryOptionBtn} ${selectedEnvioId === envio.id ? styles.deliveryOptionBtnActive : ''}`}
                onClick={() => setSelectedEnvioId(envio.id)}
              >
                {envio.nombre}
              </button>
            ))}
          </div>

          {selectedEnvio?.tipo === 'pickup' && selectedEnvio.descripcion && (
            <div className={styles.pickupInfo}>
              <p className={styles.pickupInfoTitle}>
                <i className="fa-solid fa-location-dot" /> PUNTO DE RETIRO:
              </p>
              <p className={styles.pickupInfoDesc}>{selectedEnvio.descripcion}</p>
              {selectedEnvio.descuento > 0 && (
                <span className={styles.pickupDiscountBadge}>🎁 DESCUENTO EXTRA: {selectedEnvio.descuento}%</span>
              )}
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="NOMBRE COMPLETO"
              required
              value={delivery.name}
              onChange={e => updateDelivery('name', e.target.value)}
            />
            <input
              type="tel"
              placeholder="TELÉFONO"
              required
              value={delivery.phone}
              onChange={e => updateDelivery('phone', e.target.value)}
            />
            <input
              type="email"
              placeholder="CORREO ELECTRÓNICO"
              required
              value={delivery.email}
              onChange={e => updateDelivery('email', e.target.value)}
            />

            {selectedEnvio?.tipo === 'delivery' && (
              <>
                <input
                  type="text"
                  placeholder="CIUDAD / DEPARTAMENTO"
                  required
                  value={delivery.city}
                  onChange={e => updateDelivery('city', e.target.value)}
                />
                <textarea
                  placeholder="DIRECCIÓN EXACTA"
                  rows={3}
                  required
                  value={delivery.address}
                  onChange={e => updateDelivery('address', e.target.value)}
                />
              </>
            )}

            <div className={styles.preview}>
              <div className={styles.previewRow}>
                <span>Subtotal</span>
                <span>{formatPrice(totals.subtotal)}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className={styles.previewRow}>
                  <span>Descuento</span>
                  <span>-{formatPrice(totals.totalDiscount)}</span>
                </div>
              )}
              {selectedEnvio?.tipo === 'delivery' && (
                <div className={styles.previewRow}>
                  <span>Envío</span>
                  <span>{totals.shippingFee > 0 ? formatPrice(totals.shippingFee) : 'GRATIS'}</span>
                </div>
              )}
              <div className={styles.previewTotalRow}>
                <span>TOTAL</span>
                <span>{formatPrice(totals.total)}</span>
              </div>
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={status === 'processing' || cart.length === 0}>
              {status === 'processing' ? 'PROCESANDO...' : 'COMPRAR'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
