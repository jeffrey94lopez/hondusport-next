'use client'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { LineaConCosto } from './TomaEditor'
import styles from '../inventario.module.css'

interface Props {
  lineas: LineaConCosto[]
  ciego: boolean
  editable: boolean
  onGuardar: (lineaId: string, contado: number | null) => Promise<boolean>
}

export interface ModoCarruselHandle {
  saltarA: (lineaId: string) => void
}

function valorDe(linea: LineaConCosto | undefined): string {
  return linea && linea.contado != null ? String(linea.contado) : ''
}

// Espeja CarruselClient.tsx (productos): recorrido imperativo un-ítem-a-la-
// vez con `cargar(i)` llamado explícitamente en cada navegación (no un
// useEffect que resincronice `valor` desde `lineas[idx]`, para no pelear con
// el timing de los re-renders del padre). A ciegas oculta stock_snapshot.
// El salto por escaneo (`saltarA`) se expone como un método imperativo por
// ref en vez de una prop-señal + useEffect: así el propio event handler del
// escaneo en TomaEditor dispara el cambio de tarjeta directamente, sin
// setState dentro de un efecto (evita cascadas de render y permite el
// `confirm()` de "cambios sin guardar" sin pelear con la pureza del render).
const ModoCarrusel = forwardRef<ModoCarruselHandle, Props>(function ModoCarrusel(
  { lineas, ciego, editable, onGuardar },
  ref,
) {
  const [idx, setIdx] = useState(0)
  const [valor, setValor] = useState(() => valorDe(lineas[0]))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const actual = lineas[idx]

  function cargar(i: number) {
    setValor(valorDe(lineas[i]))
    setDirty(false)
    setError('')
  }

  function irA(nuevo: number) {
    if (nuevo < 0 || nuevo > lineas.length) return
    setIdx(nuevo)
    if (nuevo < lineas.length) cargar(nuevo)
  }

  function anteriorConAviso() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Retroceder sin guardar?')) return
    irA(idx - 1)
  }

  function siguienteConAviso() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Avanzar sin guardar?')) return
    irA(idx + 1)
  }

  async function guardarYSiguiente() {
    if (!actual) return
    const texto = valor.trim()
    const contado = texto === '' ? null : Number(texto)
    if (contado != null && (Number.isNaN(contado) || contado < 0)) {
      setError('El conteo no puede ser negativo.')
      return
    }
    setGuardando(true)
    const ok = await onGuardar(actual.id, contado)
    setGuardando(false)
    if (!ok) {
      setError('No se pudo guardar. Intenta de nuevo.')
      return
    }
    setDirty(false)
    irA(idx + 1)
  }

  useImperativeHandle(
    ref,
    () => ({
      saltarA(lineaId: string) {
        const i = lineas.findIndex(l => l.id === lineaId)
        if (i < 0) return
        if (dirty && !confirm('Tienes cambios sin guardar. ¿Saltar a la tarjeta escaneada sin guardar?')) return
        setIdx(i)
        cargar(i)
        requestAnimationFrame(() => inputRef.current?.focus())
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, dirty],
  )

  if (lineas.length === 0) {
    return <div className={styles.empty}>Esta toma no tiene líneas todavía. Escaneá un SKU para agregar una.</div>
  }

  if (idx >= lineas.length) {
    return (
      <div className={styles.carruselWrap}>
        <div className={styles.carruselCard}>
          <div className={styles.carruselFin}>
            <h2>Recorrido completo</h2>
            <p>Revisaste las {lineas.length} líneas de esta toma.</p>
            <button type="button" className={styles.btnNav} onClick={() => irA(0)}>
              ← Volver al inicio
            </button>
          </div>
        </div>
      </div>
    )
  }

  const progreso = Math.round(((idx + 1) / lineas.length) * 100)

  return (
    <div className={styles.carruselWrap}>
      <div className={styles.carruselCard}>
        <div className={styles.carruselHead}>
          <span className={styles.carruselProgresoTexto}>{idx + 1} / {lineas.length}</span>
        </div>
        <div className={styles.carruselBarra}>
          <div className={styles.carruselBarraFill} style={{ width: `${progreso}%` }} />
        </div>
        <p className={styles.carruselSku}>{actual.sku ?? 'Sin SKU'}</p>
        <h3 className={styles.carruselNombre}>{actual.nombre}</h3>

        {!ciego && <p className={styles.carruselStock}>Stock del sistema: {actual.stock_snapshot}</p>}

        <div className={styles.carruselCampo}>
          <label className={styles.carruselLabel} htmlFor="carrusel-contado">Contado</label>
          <input
            ref={inputRef}
            id="carrusel-contado"
            type="text"
            inputMode="decimal"
            className={styles.carruselInput}
            value={valor}
            onChange={e => {
              setValor(e.target.value)
              setDirty(true)
            }}
            disabled={!editable || guardando}
          />
        </div>

        {error && <p className={styles.carruselError}>{error}</p>}

        <div className={styles.carruselNav}>
          <button type="button" className={styles.btnNav} onClick={anteriorConAviso} disabled={idx === 0 || guardando}>
            ← Anterior
          </button>
          <button type="button" className={styles.btnNav} onClick={siguienteConAviso} disabled={guardando}>
            Saltar →
          </button>
          {editable && (
            <button
              type="button"
              className={`${styles.btnGuardarCarrusel} btnMerlinPrimary`}
              onClick={guardarYSiguiente}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Guardar y siguiente'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export default ModoCarrusel
