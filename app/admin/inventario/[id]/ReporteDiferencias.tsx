'use client'
import { diferenciaLinea, resumenConteo, valorDiferencia } from '@/lib/inventario/conteo'
import { formatPrice } from '@/lib/store/format'
import type { AlcanceTipo, ConteoFisico } from '@/types'
import type { LineaConCosto } from './TomaEditor'
import styles from './impresion.module.css'

interface Props {
  toma: ConteoFisico
  lineas: LineaConCosto[]
  onVolver: () => void
}

const ALCANCE_LABEL: Record<AlcanceTipo, string> = {
  todo: 'Todo el inventario',
  categoria: 'Categoría',
  subcategoria: 'Subcategoría',
  seleccion: 'Selección manual',
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-HN')
}

function signo(d: number): string {
  return d > 0 ? `+${d}` : String(d)
}

function claseSigno(d: number): string {
  if (d > 0) return styles.signoPositivo
  if (d < 0) return styles.signoNegativo
  return ''
}

// Reporte de diferencias: a diferencia de HojaConteo, este SÍ revela
// snapshot/contado/diferencia/valor por línea (es el resultado del conteo,
// no el papel a ciegas) — mismas puras que RevisarAplicarModal
// (diferenciaLinea/valorDiferencia/resumenConteo) para no duplicar la
// aritmética. `aviso_movimiento` marca las líneas donde el stock del sistema
// cambió por una venta/movimiento durante el conteo (Task 6): la diferencia
// contra el snapshot puede no reflejar solo el error de conteo.
export default function ReporteDiferencias({ toma, lineas, onVolver }: Props) {
  const resumen = resumenConteo(lineas)

  return (
    <>
      <style>{'@page { size: letter; }'}</style>

      <div className={styles.page}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <div className={styles.toolbarLeft}>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onVolver}>
              ← Volver
            </button>
            <span className={styles.toolbarTitulo}>Reporte de diferencias · {toma.numero}</span>
          </div>
          <div className={styles.toolbarRight}>
            <button
              type="button"
              className={`btnMerlinPrimary ${styles.btnToolbar}`}
              onClick={() => window.print()}
            >
              Imprimir
            </button>
          </div>
        </div>

        <div className={styles.pageBg}>
          <div className={styles.hojaCarta}>
            <div className={styles.docTitulo}>
              <h1 className={styles.docTituloH1}>REPORTE DE DIFERENCIAS</h1>
            </div>

            <div className={styles.metaGrid}>
              <div><strong>Toma:</strong> {toma.numero}</div>
              <div><strong>Fecha:</strong> {fechaCorta(toma.created_at)}</div>
              <div><strong>Alcance:</strong> {ALCANCE_LABEL[toma.alcance_tipo]}</div>
              {toma.aplicada_at && <div><strong>Aplicada:</strong> {fechaCorta(toma.aplicada_at)}</div>}
            </div>

            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto / variante</th>
                  <th>Snapshot</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map(l => {
                  const diferencia = diferenciaLinea(l.stock_snapshot, l.contado)
                  const valor = diferencia == null ? null : valorDiferencia(diferencia, l.costo)
                  return (
                    <tr key={l.id}>
                      <td>{l.sku ?? '—'}</td>
                      <td>
                        {l.nombre}
                        {l.aviso_movimiento && <span className={styles.avisoMovimiento}>Hubo movimiento</span>}
                      </td>
                      <td>{l.stock_snapshot}</td>
                      <td>{l.contado ?? '—'}</td>
                      <td className={diferencia == null ? '' : claseSigno(diferencia)}>
                        {diferencia == null ? '—' : signo(diferencia)}
                      </td>
                      <td>{valor == null ? '—' : formatPrice(valor)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {lineas.length === 0 && (
              <div className={styles.hojaEmpty}>Esta toma no tiene líneas.</div>
            )}

            <div className={styles.desglose}>
              <div className={styles.desgloseRow}>
                <span>Líneas contadas</span>
                <span>{resumen.contadas} / {lineas.length}</span>
              </div>
              <div className={styles.desgloseRow}>
                <span>Pendientes</span>
                <span>{resumen.pendientes}</span>
              </div>
              <div className={styles.desgloseRow}>
                <span>Sobrantes</span>
                <span>{resumen.sobrantes}</span>
              </div>
              <div className={styles.desgloseRow}>
                <span>Faltantes</span>
                <span>{resumen.faltantes}</span>
              </div>
              <div className={`${styles.desgloseRow} ${styles.desgloseTotal}`}>
                <span>VALOR NETO</span>
                <span>{formatPrice(resumen.valorNeto)}</span>
              </div>
            </div>

            <div className={styles.firmaBlock}>
              <div className={styles.firmaItem}>
                <div className={styles.firmaLinea} />
                <div className={styles.firmaLabel}>Firma del responsable del conteo</div>
              </div>
              <div className={styles.firmaItem}>
                <div className={styles.firmaLinea} />
                <div className={styles.firmaLabel}>Firma del supervisor</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
