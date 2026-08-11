'use client'
import { useState } from 'react'
import styles from './CheckoutModal.module.css'
import { formatPrice } from '@/lib/store/format'
import { useCart } from '@/lib/store/cart-context'
import { calculateOrderTotals, getOrderText } from '@/lib/store/orderTotals'
import { crearPedido } from '@/app/(store)/checkout/actions'
import { useEscapeKey } from '@/hooks/useEscapeKey'
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

// Asistente de pasos del checkout. `direccion` solo aplica cuando el envío
// seleccionado es delivery; en pickup se omite (no se pide dirección).
type Paso = 'contacto' | 'envio' | 'direccion' | 'confirmar'

function pasosActivos(tipo: 'delivery' | 'pickup' | undefined): Paso[] {
  const base: Paso[] = ['contacto', 'envio']
  if (tipo === 'delivery') base.push('direccion')
  base.push('confirmar')
  return base
}

const PASO_LABEL: Record<Paso, string> = {
  contacto: 'Contacto',
  envio: 'Envío',
  direccion: 'Dirección',
  confirmar: 'Confirmar',
}

const PASO_ICON: Record<Paso, string> = {
  contacto: 'fa-envelope',
  envio: 'fa-truck-fast',
  direccion: 'fa-location-dot',
  confirmar: 'fa-clipboard-check',
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
  const [step, setStep] = useState(0)
  const [resumenAbierto, setResumenAbierto] = useState(false)
  const [status, setStatus] = useState<'idle' | 'processing'>('idle')
  const [error, setError] = useState('')
  const [wasOpen, setWasOpen] = useState(false)

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setDelivery(readDeliveryInfo())
      setSelectedEnvioId(prev => prev ?? envios[0]?.id ?? null)
      setError('')
      setStep(0)
      setResumenAbierto(false)
    }
  }

  useEscapeKey(isOpen, onClose)

  const selectedEnvio = envios.find(e => e.id === selectedEnvioId) ?? null

  const totals = calculateOrderTotals({
    cart,
    activeDiscount,
    envio: selectedEnvio,
    freeShippingActivo,
    freeShippingThreshold,
  })

  const pasos = pasosActivos(selectedEnvio?.tipo)
  const stepIndex = Math.min(step, pasos.length - 1)
  const pasoActual = pasos[stepIndex]

  function updateDelivery(field: keyof DeliveryInfo, value: string) {
    const next = { ...delivery, [field]: value }
    setDelivery(next)
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(next))
  }

  function validarPaso(paso: Paso): string | null {
    if (paso === 'contacto') {
      if (!delivery.name.trim() || !delivery.phone.trim() || !delivery.email.trim()) {
        return 'Completa nombre, teléfono y correo'
      }
    }
    if (paso === 'envio' && !selectedEnvio) {
      return 'Selecciona un método de envío'
    }
    if (paso === 'direccion' && (!delivery.city.trim() || !delivery.address.trim())) {
      return 'Completa ciudad y dirección'
    }
    return null
  }

  function siguiente() {
    const mensaje = validarPaso(pasoActual)
    if (mensaje) {
      setError(mensaje)
      return
    }
    setError('')
    setStep(s => Math.min(s + 1, pasos.length - 1))
  }

  function atras() {
    setError('')
    setStep(s => Math.max(s - 1, 0))
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    // Enter avanza de paso en lugar de enviar el formulario, salvo en el
    // último paso (confirmar), donde sí debe disparar el submit real.
    if (e.key === 'Enter' && pasoActual !== 'confirmar') {
      e.preventDefault()
      siguiente()
    }
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
      cart: cart.map(item => ({
        id: item.id,
        size: item.size,
        custom: item.custom,
        qty: item.qty,
        ...(item.varianteId ? { varianteId: item.varianteId } : {}),
      })),
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

          <div className={styles.progressBar}>
            {pasos.map((paso, i) => (
              <div key={paso} className={styles.progressItem}>
                <span
                  className={`${styles.progressDot} ${i < stepIndex ? styles.progressDotDone : ''} ${i === stepIndex ? styles.progressDotActive : ''}`}
                >
                  {i < stepIndex ? <i className="fa-solid fa-check" /> : i + 1}
                </span>
                <span className={styles.progressLabel}>{PASO_LABEL[paso]}</span>
                {i < pasos.length - 1 && (
                  <span className={`${styles.progressLine} ${i < stepIndex ? styles.progressLineDone : ''}`} />
                )}
              </div>
            ))}
          </div>

          <form className={styles.form} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
            <div className={styles.stepsAndSummary}>
              <div className={styles.stepContent}>
                <div className={styles.stepPane}>
                  {pasoActual === 'contacto' && (
                    <>
                      <h4 className={styles.stepTitle}>
                        <i className={`fa-solid ${PASO_ICON.contacto}`} /> Datos de contacto
                      </h4>
                      <label className={styles.fieldLabel} htmlFor="checkout-nombre">
                        Nombre completo
                      </label>
                      <input
                        id="checkout-nombre"
                        type="text"
                        placeholder="Nombre completo"
                        value={delivery.name}
                        onChange={e => updateDelivery('name', e.target.value)}
                      />
                      <label className={styles.fieldLabel} htmlFor="checkout-telefono">
                        Teléfono
                      </label>
                      <input
                        id="checkout-telefono"
                        type="tel"
                        placeholder="+504 9999-9999"
                        value={delivery.phone}
                        onChange={e => updateDelivery('phone', e.target.value)}
                      />
                      <label className={styles.fieldLabel} htmlFor="checkout-email">
                        Correo electrónico
                      </label>
                      <input
                        id="checkout-email"
                        type="email"
                        placeholder="tucorreo@ejemplo.com"
                        value={delivery.email}
                        onChange={e => updateDelivery('email', e.target.value)}
                      />
                    </>
                  )}

                  {pasoActual === 'envio' && (
                    <>
                      <h4 className={styles.stepTitle}>
                        <i className={`fa-solid ${PASO_ICON.envio}`} /> Método de envío
                      </h4>
                      <div className={styles.envioGrid}>
                        {envios.map(envio => (
                          <button
                            key={envio.id}
                            type="button"
                            className={`${styles.envioCard} ${selectedEnvioId === envio.id ? styles.envioCardActive : ''}`}
                            onClick={() => setSelectedEnvioId(envio.id)}
                          >
                            <div className={styles.envioCardHeader}>
                              <span className={styles.envioCardName}>{envio.nombre}</span>
                              {selectedEnvioId === envio.id && <i className="fa-solid fa-circle-check" />}
                            </div>
                            <span className={styles.envioCardPrice}>
                              {envio.tipo === 'pickup' ? 'Retiro en tienda' : envio.costo > 0 ? formatPrice(envio.costo) : 'GRATIS'}
                            </span>
                            {envio.descuento > 0 && (
                              <span className={styles.envioCardBadge}>🎁 Descuento extra {envio.descuento}%</span>
                            )}
                          </button>
                        ))}
                      </div>

                      {selectedEnvio?.tipo === 'pickup' && selectedEnvio.descripcion && (
                        <div className={styles.pickupInfo}>
                          <p className={styles.pickupInfoTitle}>
                            <i className="fa-solid fa-location-dot" /> PUNTO DE RETIRO:
                          </p>
                          <p className={styles.pickupInfoDesc}>{selectedEnvio.descripcion}</p>
                        </div>
                      )}
                    </>
                  )}

                  {pasoActual === 'direccion' && (
                    <>
                      <h4 className={styles.stepTitle}>
                        <i className={`fa-solid ${PASO_ICON.direccion}`} /> Dirección de envío
                      </h4>
                      <label className={styles.fieldLabel} htmlFor="checkout-ciudad">
                        Ciudad / Departamento
                      </label>
                      <input
                        id="checkout-ciudad"
                        type="text"
                        placeholder="San Pedro Sula, Cortés"
                        value={delivery.city}
                        onChange={e => updateDelivery('city', e.target.value)}
                      />
                      <label className={styles.fieldLabel} htmlFor="checkout-direccion">
                        Dirección exacta
                      </label>
                      <textarea
                        id="checkout-direccion"
                        placeholder="Colonia, calle, número de casa"
                        rows={3}
                        value={delivery.address}
                        onChange={e => updateDelivery('address', e.target.value)}
                      />
                    </>
                  )}

                  {pasoActual === 'confirmar' && (
                    <>
                      <h4 className={styles.stepTitle}>
                        <i className={`fa-solid ${PASO_ICON.confirmar}`} /> Confirmar pedido
                      </h4>
                      <div className={styles.confirmSummary}>
                        <p>
                          <strong>Contacto:</strong> {delivery.name} · {delivery.phone} · {delivery.email}
                        </p>
                        <p>
                          <strong>Envío:</strong> {selectedEnvio?.nombre}
                        </p>
                        {selectedEnvio?.tipo === 'delivery' && (
                          <p>
                            <strong>Dirección:</strong> {delivery.city} — {delivery.address}
                          </p>
                        )}
                        {selectedEnvio?.tipo === 'pickup' && selectedEnvio.descripcion && (
                          <p>
                            <strong>Punto de retiro:</strong> {selectedEnvio.descripcion}
                          </p>
                        )}
                      </div>
                      <div className={styles.whatsappNotice}>
                        <i className="fa-brands fa-whatsapp" />
                        <p>Tu pedido será confirmado vía WhatsApp para coordinar la entrega.</p>
                      </div>
                    </>
                  )}
                </div>

                {error && <p className={styles.errorMsg}>{error}</p>}

                <div className={styles.navRow}>
                  {stepIndex > 0 && (
                    <button type="button" className={styles.backBtn} onClick={atras}>
                      Atrás
                    </button>
                  )}
                  {pasoActual !== 'confirmar' ? (
                    <button type="button" className={styles.nextBtn} onClick={siguiente}>
                      Siguiente
                    </button>
                  ) : (
                    <button type="submit" className={styles.submitBtn} disabled={status === 'processing' || cart.length === 0}>
                      {status === 'processing' ? 'PROCESANDO...' : 'Finalizar pedido'}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.summaryCol}>
                <button
                  type="button"
                  className={styles.summaryToggle}
                  onClick={() => setResumenAbierto(v => !v)}
                  aria-expanded={resumenAbierto}
                >
                  <span>Resumen del pedido</span>
                  <span className={styles.summaryToggleTotal}>
                    {formatPrice(totals.total)}
                    <i className={`fa-solid fa-chevron-${resumenAbierto ? 'up' : 'down'}`} />
                  </span>
                </button>
                <div className={`${styles.preview} ${resumenAbierto ? styles.previewOpen : ''}`}>
                  <p className={styles.previewTitle}>Resumen del pedido</p>
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
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
