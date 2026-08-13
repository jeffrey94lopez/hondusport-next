'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resumenConteo } from '@/lib/inventario/conteo'
import type { ConteoFisico, ConteoLinea, EstadoConteo } from '@/types'
import { agregarLineaPorSku, anularToma, guardarConteoLinea, quitarLinea } from '../actions'
import HojaConteo from './HojaConteo'
import ModoTabla from './ModoTabla'
import ModoCarrusel, { type ModoCarruselHandle } from './ModoCarrusel'
import ReporteDiferencias from './ReporteDiferencias'
import RevisarAplicarModal from './RevisarAplicarModal'
import styles from '../inventario.module.css'

// Línea de conteo con el costo resuelto por obtenerToma (herencia
// padre/hijo, ver actions.ts) — el mismo tipo se reexporta para que
// ModoTabla/ModoCarrusel/RevisarAplicarModal no repitan la unión.
export type LineaConCosto = ConteoLinea & { costo: number | null }

interface Props {
  toma: ConteoFisico
  lineasIniciales: LineaConCosto[]
  ciego: boolean
}

const ESTADO_LABEL: Record<EstadoConteo, string> = {
  en_conteo: 'En conteo',
  aplicada: 'Aplicada',
  anulada: 'Anulada',
}

const ESTADO_BADGE: Record<EstadoConteo, string> = {
  en_conteo: styles.badgeAmbar,
  aplicada: styles.badgeVerde,
  anulada: styles.badgeRojo,
}

// Editor de la toma con dos modos (tabla/carrusel) sobre el mismo estado
// local `lineas`. `lineas` se siembra UNA VEZ desde `lineasIniciales` (como
// CotizacionEditor) y a partir de ahí se gobierna por las respuestas de las
// Server Actions (guardarConteoLinea/agregarLineaPorSku/quitarLinea), no por
// refetch automático: así una escritura en una fila no pisa lo que el
// usuario está tecleando en otra. El único refetch real es tras
// aplicar/anular (`router.refresh()`), que además remonta este componente
// por el `key` que le pone page.tsx cuando cambia `toma.estado`.
export default function TomaEditor({ toma, lineasIniciales, ciego }: Props) {
  const router = useRouter()
  const editable = toma.estado === 'en_conteo'

  const [lineas, setLineas] = useState<LineaConCosto[]>(lineasIniciales)
  // Imprimibles (Task 8): montados en lugar del editor, nunca a la vez que
  // este ni entre sí — mismo criterio que EstadoCuentaClienteView (CxC) al
  // conmutar hacia HojaEstadoCuentaCliente.
  const [vista, setVista] = useState<'editor' | 'hoja' | 'reporte'>('editor')
  const [modo, setModo] = useState<'tabla' | 'carrusel'>('tabla')
  const [sku, setSku] = useState('')
  const [avisoEscaneo, setAvisoEscaneo] = useState('')
  const [focoLineaId, setFocoLineaId] = useState<string | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorGlobal, setErrorGlobal] = useState('')
  const [isPending, startTransition] = useTransition()
  // El salto del carrusel es imperativo (ref), no una prop-señal +
  // useEffect: así el propio handler del escaneo (un event handler, no un
  // efecto) es quien dispara el cambio de tarjeta, sin depender de
  // sincronizar estado local del carrusel desde un efecto.
  const carruselRef = useRef<ModoCarruselHandle>(null)

  const resumen = resumenConteo(lineas)
  const hayConteos = resumen.contadas > 0
  const progreso = lineas.length === 0 ? 0 : Math.round((resumen.contadas / lineas.length) * 100)

  if (vista === 'hoja') {
    return <HojaConteo toma={toma} lineas={lineas} onVolver={() => setVista('editor')} />
  }
  if (vista === 'reporte') {
    return <ReporteDiferencias toma={toma} lineas={lineas} onVolver={() => setVista('editor')} />
  }

  async function handleGuardarLinea(lineaId: string, contado: number | null): Promise<boolean> {
    const res = await guardarConteoLinea(lineaId, contado)
    if (!res.ok) {
      setErrorGlobal(res.error)
      return false
    }
    setErrorGlobal('')
    setLineas(prev => prev.map(l => (l.id === lineaId ? { ...l, contado } : l)))
    return true
  }

  async function handleQuitarLinea(lineaId: string) {
    const res = await quitarLinea(lineaId)
    if (!res.ok) {
      setErrorGlobal(res.error)
      return
    }
    setErrorGlobal('')
    setLineas(prev => prev.filter(l => l.id !== lineaId))
  }

  function handleEscanear(e: React.FormEvent) {
    e.preventDefault()
    const buscado = sku.trim()
    if (!buscado) return
    startTransition(async () => {
      const res = await agregarLineaPorSku(toma.id, buscado)
      if (!res.ok || !res.data) {
        setAvisoEscaneo(res.ok ? 'No se pudo agregar el SKU. Intenta de nuevo.' : res.error)
        return
      }
      if ('noEncontrado' in res.data) {
        setAvisoEscaneo(`SKU "${buscado}" no encontrado.`)
        return
      }
      if ('noRastreado' in res.data) {
        setAvisoEscaneo(
          `"${buscado}" no se rastrea por unidades, o es un producto con variantes: escaneá el SKU de la variante.`,
        )
        return
      }
      const linea = res.data.linea
      setLineas(prev => {
        const existe = prev.find(l => l.id === linea.id)
        // El costo no viaja en la respuesta de agregarLineaPorSku (Task 5):
        // se conserva el que ya tenía la línea local, o null para una línea
        // nueva (RevisarAplicarModal trata costo null como valor 0, igual
        // que valorDiferencia).
        if (existe) return prev.map(l => (l.id === linea.id ? { ...linea, costo: existe.costo } : l))
        return [...prev, { ...linea, costo: null }]
      })
      setAvisoEscaneo('')
      setSku('')
      if (modo === 'tabla') setFocoLineaId(linea.id)
      else carruselRef.current?.saltarA(linea.id)
    })
  }

  function handleAnular() {
    if (!confirm(`¿Anular la toma ${toma.numero}? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const res = await anularToma(toma.id)
      if (!res.ok) {
        setErrorGlobal(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.editorTop}>
        <div>
          <h1 className={styles.title}>{toma.numero}</h1>
          <div className={styles.editorBadges}>
            <span className={`${styles.badge} ${ESTADO_BADGE[toma.estado]}`}>{ESTADO_LABEL[toma.estado]}</span>
            {ciego && <span className={`${styles.badge} ${styles.badgeInfo}`}>A ciegas</span>}
            <span className={styles.avance}>{resumen.contadas}/{lineas.length} contadas</span>
          </div>
        </div>
        <div className={styles.actionsTop}>
          <button type="button" className={styles.btnToolbarInv} onClick={() => setVista('hoja')}>
            Hoja de conteo
          </button>
          <button
            type="button"
            className={styles.btnToolbarInv}
            onClick={() => setVista('reporte')}
            disabled={!hayConteos}
            title={hayConteos ? undefined : 'Contá al menos una línea para ver el reporte de diferencias.'}
          >
            Reporte de diferencias
          </button>
          <button
            type="button"
            className={`${styles.btnRevisar} btnMerlinPrimary`}
            onClick={() => setModalAbierto(true)}
          >
            Revisar y aplicar
          </button>
          {editable && (
            <button type="button" className={styles.btnAnular} onClick={handleAnular} disabled={isPending}>
              Anular
            </button>
          )}
        </div>
      </div>

      {/* Descripción del flujo (feedback R5a): una sola vez acá porque queda
          visible en ambos modos (Tabla/Carrusel comparten este layout). */}
      <p className={styles.helpText}>
        Contá físicamente cada producto y anotá la cantidad encontrada en el campo Contado
        {ciego ? ' (a ciegas: no se muestra el stock del sistema hasta revisar)' : ''}. Al aplicar la toma, el
        sistema ajustará el stock según la diferencia y la registrará en el kardex — la acción es irreversible.
      </p>

      {/* Progreso visible del conteo completo (Task 4, look Stitch): mismo
          resumen que .avance de arriba, pero como barra — útil en modo
          Tabla, que no tiene la barra propia del carrusel. */}
      <div className={styles.progresoBarra}>
        <div className={styles.progresoBarraFill} style={{ width: `${progreso}%` }} />
      </div>

      {editable && (
        <form className={styles.scanBar} onSubmit={handleEscanear}>
          <input
            type="text"
            placeholder="Escanear o escribir SKU y Enter"
            value={sku}
            onChange={e => setSku(e.target.value)}
            className={styles.scanInput}
            disabled={isPending}
          />
          <button type="submit" className={styles.btnToolbarInv} disabled={isPending}>
            Agregar
          </button>
        </form>
      )}
      {avisoEscaneo && <p className={styles.avisoEscaneo}>{avisoEscaneo}</p>}
      {errorGlobal && <p className={styles.formError}>{errorGlobal}</p>}

      <div className={styles.modoSwitch}>
        <button
          type="button"
          className={`${styles.modoBtn} ${modo === 'tabla' ? styles.modoBtnActivo : ''}`}
          onClick={() => setModo('tabla')}
        >
          Tabla
        </button>
        <button
          type="button"
          className={`${styles.modoBtn} ${modo === 'carrusel' ? styles.modoBtnActivo : ''}`}
          onClick={() => setModo('carrusel')}
        >
          Carrusel
        </button>
      </div>

      {modo === 'tabla' ? (
        <ModoTabla
          lineas={lineas}
          ciego={ciego}
          editable={editable}
          focoLineaId={focoLineaId}
          onFocoConsumido={() => setFocoLineaId(null)}
          onGuardar={handleGuardarLinea}
          onQuitar={handleQuitarLinea}
        />
      ) : (
        <ModoCarrusel
          ref={carruselRef}
          lineas={lineas}
          ciego={ciego}
          editable={editable}
          onGuardar={handleGuardarLinea}
        />
      )}

      {modalAbierto && (
        <RevisarAplicarModal
          tomaId={toma.id}
          numero={toma.numero}
          lineas={lineas}
          editable={editable}
          onClose={() => setModalAbierto(false)}
          onAplicado={() => {
            setModalAbierto(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
