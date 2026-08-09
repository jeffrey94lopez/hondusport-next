'use client'
import { useEffect, useRef, useState } from 'react'
import { clasificarLinea } from '@/lib/inventario/conteo'
import type { LineaConCosto } from './TomaEditor'
import styles from '../inventario.module.css'

interface Props {
  lineas: LineaConCosto[]
  ciego: boolean
  editable: boolean
  focoLineaId: string | null
  onFocoConsumido: () => void
  onGuardar: (lineaId: string, contado: number | null) => Promise<boolean>
  onQuitar: (lineaId: string) => void
}

// Estado mostrado por fila. A ciegas solo se distingue Pendiente/Contado
// (nunca la clase real cuadra/sobrante/faltante, que revelaría la
// diferencia contra el sistema) — la diferencia real se revela recién en
// RevisarAplicarModal.
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  contado: 'Contado',
  cuadra: 'Cuadra',
  sobrante: 'Sobrante',
  faltante: 'Faltante',
}
const ESTADO_BADGE: Record<string, string> = {
  pendiente: styles.badgeGris,
  contado: styles.badgeInfo,
  cuadra: styles.badgeVerde,
  sobrante: styles.badgeAmbar,
  faltante: styles.badgeRojo,
}

export default function ModoTabla({
  lineas,
  ciego,
  editable,
  focoLineaId,
  onFocoConsumido,
  onGuardar,
  onQuitar,
}: Props) {
  // Un ref por fila (por id de línea) para que el escaneo por SKU pueda
  // enfocar el campo Contado correspondiente sin depender del índice (las
  // filas llegan ordenadas por nombre desde el servidor y pueden crecer al
  // escanear un ítem fuera del alcance original).
  const refs = useRef<Map<string, HTMLInputElement>>(new Map())

  useEffect(() => {
    if (!focoLineaId) return
    const el = refs.current.get(focoLineaId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
    }
    onFocoConsumido()
  }, [focoLineaId, onFocoConsumido])

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto / variante</th>
            <th className={styles.num}>Contado</th>
            <th>Estado</th>
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {lineas.map(linea => (
            <FilaConteo
              key={linea.id}
              linea={linea}
              ciego={ciego}
              editable={editable}
              registrarRef={el => {
                if (el) refs.current.set(linea.id, el)
                else refs.current.delete(linea.id)
              }}
              onGuardar={onGuardar}
              onQuitar={onQuitar}
            />
          ))}
        </tbody>
      </table>
      {lineas.length === 0 && (
        <div className={styles.empty}>Esta toma no tiene líneas todavía. Escaneá un SKU para agregar una.</div>
      )}
    </div>
  )
}

interface FilaProps {
  linea: LineaConCosto
  ciego: boolean
  editable: boolean
  registrarRef: (el: HTMLInputElement | null) => void
  onGuardar: (lineaId: string, contado: number | null) => Promise<boolean>
  onQuitar: (lineaId: string) => void
}

function FilaConteo({ linea, ciego, editable, registrarRef, onGuardar, onQuitar }: FilaProps) {
  const [valor, setValor] = useState(linea.contado != null ? String(linea.contado) : '')
  const [guardando, setGuardando] = useState(false)

  const claseReal = clasificarLinea(linea.stock_snapshot, linea.contado)
  const estadoMostrado = ciego ? (claseReal === 'pendiente' ? 'pendiente' : 'contado') : claseReal

  function valorTexto(): string {
    return linea.contado != null ? String(linea.contado) : ''
  }

  async function handleBlur() {
    const texto = valor.trim()
    const contado = texto === '' ? null : Number(texto)
    if (contado != null && (Number.isNaN(contado) || contado < 0)) {
      setValor(valorTexto())
      return
    }
    if (contado === linea.contado) return
    setGuardando(true)
    const ok = await onGuardar(linea.id, contado)
    setGuardando(false)
    if (!ok) setValor(valorTexto())
  }

  return (
    <tr>
      <td className={styles.skuCol}>{linea.sku ?? '—'}</td>
      <td>{linea.nombre}</td>
      <td className={styles.num}>
        <input
          ref={registrarRef}
          type="text"
          inputMode="decimal"
          className={styles.inputContado}
          value={valor}
          onChange={e => setValor(e.target.value)}
          onBlur={handleBlur}
          disabled={!editable || guardando}
        />
      </td>
      <td>
        <span className={`${styles.badge} ${ESTADO_BADGE[estadoMostrado]}`}>{ESTADO_LABEL[estadoMostrado]}</span>
      </td>
      {editable && (
        <td className={styles.accionesCol}>
          <button type="button" className={styles.btnQuitar} onClick={() => onQuitar(linea.id)}>
            Quitar
          </button>
        </td>
      )}
    </tr>
  )
}
