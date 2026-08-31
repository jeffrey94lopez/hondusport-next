'use client'
import { useEffect, useRef, useState } from 'react'

export const PULSE_MS = 600

/**
 * Devuelve `true` durante `ms` cada vez que `value` SUBE.
 *
 * Se usa para que el contador del carrito lata al agregar: el badge es de 10px
 * y queda a más de mil píxeles del botón que se pulsa, así que cambiar el
 * número sin moverlo pasa desapercibido.
 *
 * Solo reacciona a las subidas: quitar una línea del carrito baja el contador y
 * no merece la misma celebración. Tampoco pulsa en el montaje, o un carrito
 * restaurado de localStorage haría latir el badge al cargar la página.
 */
export function usePulseOnIncrease(value: number, ms: number = PULSE_MS): boolean {
  const [pulsing, setPulsing] = useState(false)
  const previous = useRef(value)

  useEffect(() => {
    const subio = value > previous.current
    previous.current = value
    if (!subio) return

    setPulsing(true)
    // Si llega otra subida mientras late, este cleanup cancela el temporizador
    // anterior y el pulso se reinicia completo en vez de cortarse a medias.
    const id = setTimeout(() => setPulsing(false), ms)
    return () => clearTimeout(id)
  }, [value, ms])

  return pulsing
}
