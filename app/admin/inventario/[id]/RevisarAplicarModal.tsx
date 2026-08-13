'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import { diferenciaLinea, resumenConteo, valorDiferencia } from '@/lib/inventario/conteo'
import { formatPrice } from '@/lib/store/format'
import { aplicarToma } from '../actions'
import type { LineaConCosto } from './TomaEditor'
import styles from '../inventario.module.css'

interface Props {
  tomaId: string
  numero: string
  lineas: LineaConCosto[]
  editable: boolean
  onClose: () => void
  onAplicado: () => void
}

function signo(d: number): string {
  return d > 0 ? `+${d}` : String(d)
}

// Revela snapshot/contado/diferencia/valor por línea (lo que ModoTabla oculta
// a ciegas) + totales de resumenConteo. `editable` decide si se puede aplicar
// (toma en_conteo) o si el modal es solo de lectura (p.ej. reabierto sobre
// una toma ya aplicada/anulada, útil para revisar el detalle sin ofrecer un
// botón Aplicar que el servidor rechazaría de todas formas).
export default function RevisarAplicarModal({ tomaId, numero, lineas, editable, onClose, onAplicado }: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const resumen = resumenConteo(lineas)

  function handleAplicar() {
    startTransition(async () => {
      const res = await aplicarToma(tomaId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onAplicado()
    })
  }

  return (
    <Modal title={`Revisar y aplicar — ${numero}`} onClose={onClose} maxWidth="760px">
      <div className={styles.revisarBody}>
        {editable && (
          <p className={styles.avisoIrreversible}>
            Al aplicar, el stock se ajusta según lo contado y la toma queda inmutable: no se puede reabrir ni
            recontar. Esta acción no se puede deshacer.
          </p>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto / variante</th>
                <th className={styles.num}>Snapshot</th>
                <th className={styles.num}>Contado</th>
                <th className={styles.num}>Diferencia</th>
                <th className={styles.num}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(l => {
                const diferencia = diferenciaLinea(l.stock_snapshot, l.contado)
                const valor = diferencia == null ? 0 : valorDiferencia(diferencia, l.costo)
                return (
                  <tr key={l.id}>
                    <td className={styles.skuCol}>{l.sku ?? '—'}</td>
                    <td>{l.nombre}</td>
                    <td className={styles.num}>{l.stock_snapshot}</td>
                    <td className={styles.num}>{l.contado ?? '—'}</td>
                    <td className={styles.num}>{diferencia == null ? '—' : signo(diferencia)}</td>
                    <td className={styles.num}>{diferencia == null ? '—' : formatPrice(valor)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {lineas.length === 0 && (
            <div className={styles.empty}>Esta toma no tiene líneas para revisar.</div>
          )}
        </div>

        <div className={styles.resumenGrid}>
          <div className={styles.resumenItem}>
            <span>Contadas</span>
            <strong>{resumen.contadas} / {lineas.length}</strong>
          </div>
          <div className={styles.resumenItem}>
            <span>Pendientes</span>
            <strong>{resumen.pendientes}</strong>
          </div>
          <div className={styles.resumenItem}>
            <span>Sobrantes</span>
            <strong>{resumen.sobrantes}</strong>
          </div>
          <div className={styles.resumenItem}>
            <span>Faltantes</span>
            <strong>{resumen.faltantes}</strong>
          </div>
          <div className={`${styles.resumenItem} ${styles.resumenItemDestacado}`}>
            <span>Valor neto</span>
            <strong>{formatPrice(resumen.valorNeto)}</strong>
          </div>
        </div>

        {editable && resumen.pendientes > 0 && (
          <p className={styles.helpText}>
            {resumen.pendientes} línea{resumen.pendientes === 1 ? '' : 's'} sin contar no se ajustará
            {resumen.pendientes === 1 ? '' : 'n'}.
          </p>
        )}

        {error && <p className={styles.formError}>{error}</p>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={isPending}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </button>
          {editable && (
            <button
              type="button"
              className={`${styles.btnAplicar} btnMerlinPrimary`}
              onClick={handleAplicar}
              disabled={isPending || lineas.length === 0}
            >
              {isPending ? 'Aplicando…' : 'Aplicar'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
