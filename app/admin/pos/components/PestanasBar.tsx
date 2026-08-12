'use client'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { PestanaVenta } from '@/lib/pos/carrito'
import styles from '../pos.module.css'

interface PestanasBarProps {
  pestanas: PestanaVenta[]
  activaId: string | null
  // Conteo de la pestaña ACTIVA en vivo: PosClient lo deriva de `lineas.length`
  // (el estado de edición real), no de `pestanas` — la entrada de la activa
  // dentro de `pestanas` solo se sincroniza al cambiar de pestaña, así que
  // usar `p.lineas.length` para ella mostraría un número desfasado mientras
  // se edita (ver datosPestana en PosClient).
  conteoActiva: number
  onSeleccionar: (id: string) => void
  onNueva: () => void
  onCerrar: (id: string) => void
  onRenombrar: (id: string, nombre: string) => void
}

// Pestañas de ventas en curso, al estilo de un navegador: un clic cambia de
// venta sin perder lo que se estaba editando (PosClient persiste la saliente
// antes de cargar la entrante). Se usan botones simples con `aria-current`
// en vez del patrón ARIA completo `tablist`/`tab` (que exigiría navegación
// con flechas) — el brief explícitamente permite esta alternativa siempre
// que sea navegable con teclado y anuncie cuál está activa, y el orden nativo
// de tabulación ya cubre ambos.
export default function PestanasBar({ pestanas, activaId, conteoActiva, onSeleccionar, onNueva, onCerrar, onRenombrar }: PestanasBarProps) {
  const [renombrando, setRenombrando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')

  function iniciarRenombrar(p: PestanaVenta) {
    setRenombrando(p.id)
    setBorrador(p.nombre)
  }

  function confirmarRenombrar() {
    if (renombrando) onRenombrar(renombrando, borrador)
    setRenombrando(null)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmarRenombrar()
    } else if (e.key === 'Escape') {
      setRenombrando(null)
    }
  }

  return (
    <div className={styles.pestanasBar} aria-label="Ventas en curso">
      {pestanas.map(p => {
        const activa = p.id === activaId
        const conteo = activa ? conteoActiva : p.lineas.length
        return (
          <div key={p.id} className={styles.pestanaItem}>
            {renombrando === p.id ? (
              <input
                type="text"
                className={styles.pestanaNombreInput}
                value={borrador}
                onChange={e => setBorrador(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={confirmarRenombrar}
                aria-label={`Nombre de ${p.nombre}`}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className={styles.pestanaTab}
                aria-pressed={activa}
                aria-current={activa ? 'true' : undefined}
                // Nombre accesible explícito: sin esto, el lector de pantalla
                // concatena el texto visible del nombre y el contador sin
                // separación ("Venta 1" + "0" → "Venta 10", que se lee como
                // el número diez en vez de "pestaña Venta 1 con 0 ítems").
                aria-label={`${p.nombre}, ${conteo} ítem${conteo === 1 ? '' : 's'}${activa ? ', activa' : ''}`}
                onDoubleClick={() => iniciarRenombrar(p)}
                onClick={() => onSeleccionar(p.id)}
              >
                <span className={styles.pestanaNombre}>{p.nombre}</span>
                <span className={styles.pestanaContador}>{conteo}</span>
              </button>
            )}
            <button
              type="button"
              className={styles.pestanaAccion}
              onClick={() => iniciarRenombrar(p)}
              aria-label={`Renombrar ${p.nombre}`}
              title="Renombrar"
            >
              ✎
            </button>
            <button
              type="button"
              className={`${styles.pestanaAccion} ${styles.pestanaAccionDanger}`}
              onClick={() => onCerrar(p.id)}
              aria-label={`Cerrar ${p.nombre}`}
              title="Cerrar"
            >
              ×
            </button>
          </div>
        )
      })}
      <button type="button" className={styles.pestanaAccion} onClick={onNueva} aria-label="Nueva venta" title="Nueva venta">
        +
      </button>
    </div>
  )
}
