'use client'
import { useEffect, useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { abrirSesion } from './actions'
import type {
  Caja,
  SesionCaja,
  Vendedor,
  MetodoPago,
  Producto,
  Cliente,
  CaiAutorizacion,
  ConfigMap,
} from '@/types'
import styles from './pos.module.css'

const STORAGE_KEY = 'pos_caja_id'

// Contrato de props para las Tasks 10-12 (catálogo/carrito, cobro y emisión,
// espera/cierre): esta tarea solo consume `cajas` y `sesionesAbiertas`; el
// resto viaja ya resuelto desde el server component para que las próximas
// tareas no necesiten tocar page.tsx.
interface Props {
  cajas: Caja[]
  sesionesAbiertas: SesionCaja[]
  vendedores: Vendedor[]
  metodos: MetodoPago[]
  productos: Producto[]
  clientes: Cliente[]
  cais: CaiAutorizacion[]
  config: ConfigMap
}

// Lazy initializer de useState (patrón ya usado en CartProvider/WishlistProvider
// para localStorage): en el servidor `window` no existe y se devuelve `null`;
// en el cliente se lee una sola vez al montar. Evita el nuevo lint
// `react-hooks/set-state-in-effect` de sincronizar estado con un efecto.
function leerCajaGuardada(cajas: Caja[]): string | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && cajas.some(c => c.id === stored) ? stored : null
}

export default function PosClient({ cajas, sesionesAbiertas }: Props) {
  const router = useRouter()
  const [cajaId, setCajaId] = useState<string | null>(() => leerCajaGuardada(cajas))
  const [montoInicial, setMontoInicial] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Guard de montaje: aunque `leerCajaGuardada` usa un lazy initializer (sin
  // setState dentro de un efecto), el componente SÍ se prerenderiza en el
  // servidor. El SSR siempre resuelve a la rama "selección de caja" (no hay
  // localStorage), pero en el cliente, durante la hidratación, el mismo
  // render inicial ya tiene `window` disponible: si hay `pos_caja_id`
  // guardado (el caso normal en visitas repetidas), el initializer decide
  // otra rama completa (apertura de sesión o venta) en ese primer render,
  // lo que produce un mismatch de árbol completo entre servidor y cliente
  // (flash + error de hidratación en consola). Para evitarlo, la rama no se
  // decide hasta después de montar: se renderiza un estado neutro (idéntico
  // en servidor y en el primer render del cliente) y recién en el efecto se
  // habilita mostrar la rama real ya calculada por el lazy initializer.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // Diverge intencionalmente del árbol de SSR (ver comentario arriba): no
    // es un caso de "sincronizar con un sistema externo" que dispare
    // `react-hooks/set-state-in-effect` con un patrón corregible por
    // lazy-init, porque lo que cambia no es un valor sino qué rama de JSX se
    // pinta — se necesita el paso extra de "ya estamos en el cliente".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  function seleccionarCaja(id: string) {
    window.localStorage.setItem(STORAGE_KEY, id)
    setCajaId(id)
    setError('')
  }

  function cambiarCaja() {
    window.localStorage.removeItem(STORAGE_KEY)
    setCajaId(null)
    setError('')
  }

  const caja = cajaId ? (cajas.find(c => c.id === cajaId) ?? null) : null
  const sesion = caja ? (sesionesAbiertas.find(s => s.caja_id === caja.id) ?? null) : null

  function handleAbrirSesion(e: FormEvent) {
    e.preventDefault()
    if (!caja) return

    const monto = Number(montoInicial)
    if (!Number.isFinite(monto) || monto < 0) {
      setError('Ingresa un monto inicial válido.')
      return
    }

    setError('')
    startTransition(async () => {
      const result = await abrirSesion(caja.id, monto)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // abrirSesion ya revalida /admin/pos; refresh trae sesionesAbiertas
      // actualizado a este mismo componente (sin remount).
      router.refresh()
    })
  }

  // Estado neutro: idéntico en SSR y en el primer render del cliente (antes
  // de montar) — evita el mismatch de árbol descrito arriba. Mismo fondo
  // (--bg) que el resto de la pantalla para que no haya parpadeo visible.
  if (!mounted) {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.empty}>Cargando caja…</div>
      </div>
    )
  }

  // Estado 1: selección de caja
  if (!caja) {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Punto de venta</div>
          <div className={styles.panelSubtitle}>Elige la caja con la que vas a trabajar.</div>

          {cajas.length === 0 ? (
            <div className={styles.empty}>No hay cajas configuradas.</div>
          ) : (
            <div className={styles.cajaList}>
              {cajas.map(c => {
                const ocupada = sesionesAbiertas.some(s => s.caja_id === c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.cajaCard}
                    onClick={() => seleccionarCaja(c.id)}
                  >
                    <div>
                      <div className={styles.cajaNombre}>{c.nombre}</div>
                      <div className={styles.cajaMeta}>
                        Punto de emisión {c.punto_emision} · {c.formato_impresion}
                      </div>
                    </div>
                    {ocupada && <span className={styles.cajaBadgeOcupada}>Sesión abierta</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: '1.25rem' }}>
            <Link href="/admin" className={styles.headerBack}>← Volver al admin</Link>
          </div>
        </div>
      </div>
    )
  }

  // Estado 2: apertura de sesión
  if (!sesion) {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Abrir caja: {caja.nombre}</div>
          <div className={styles.panelSubtitle}>
            Ingresa el monto inicial en Lempiras para abrir la sesión.
          </div>

          <form className={styles.form} onSubmit={handleAbrirSesion}>
            <label className={styles.formLabel}>
              Monto inicial (L.)
              <input
                type="number"
                min="0"
                step="0.01"
                value={montoInicial}
                onChange={e => setMontoInicial(e.target.value)}
                autoFocus
                disabled={isPending}
              />
            </label>

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.formFooter}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={cambiarCaja}
                disabled={isPending}
              >
                Cambiar caja
              </button>
              <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`} disabled={isPending}>
                {isPending ? 'Abriendo...' : 'Abrir sesión'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Estado 3: venta (catálogo/carrito llegan en Tasks 10-12)
  const abiertaDesde = new Date(sesion.abierta_at).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div>
      <header className={styles.header}>
        <Link href="/admin" className={styles.headerBack}>← Admin</Link>
        <span className={styles.headerCaja}>{caja.nombre}</span>
        <span className={styles.headerSesion}>Sesión abierta desde {abiertaDesde}</span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnGhost} disabled title="Disponible en una próxima iteración">
            Espera
          </button>
          <button type="button" className={styles.btnGhost} disabled title="Disponible en una próxima iteración">
            Cerrar caja
          </button>
        </div>
      </header>

      <div className={styles.ventaPlaceholder}>Área de venta — Task 10</div>
    </div>
  )
}
