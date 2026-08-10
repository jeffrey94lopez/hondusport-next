'use client'
import { formatPrice } from '@/lib/store/format'
import { etiquetaTipoMovimiento } from '@/lib/inventario/kardex'
import type { MovimientoResuelto } from '@/types'
import type { ProductoKardexInfo, VarianteKardexInfo } from './MovimientosItemView'
import styles from './kardex.module.css'

interface Props {
  producto: ProductoKardexInfo
  variante: VarianteKardexInfo | null
  movimientos: MovimientoResuelto[]
  onVolver: () => void
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}

function hoyCorta(): string {
  return new Date().toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}

// Hoja imprimible del kardex del ítem: mismo patrón "hoja carta" que
// HojaEstadoCuentaCliente (CxC) / HojaConteo (inventario físico) — fondo
// blanco/tinta fija a propósito (no sigue el tema oscuro, simula papel
// impreso real). La barra vive en este mismo componente porque
// MovimientosItemView solo decide CUÁNDO montarla (botón "Imprimir" en la
// vista de pantalla); una vez montada, "Volver" regresa a esa vista y el
// botón real de impresión (window.print()) vive aquí. Se muestran los
// movimientos en el mismo orden que recibe (asc, tal como llegan de
// obtenerMovimientosItem) — la hoja es para auditoría, no reproduce el
// toggle de orden de la pantalla.
export default function HojaKardex({ producto, variante, movimientos, onVolver }: Props) {
  const stockActual = variante ? variante.stock : producto.stock
  const costoActual = variante ? variante.costo : producto.costo
  const titulo = variante ? `${producto.nombre} — ${variante.nombre}` : producto.nombre
  const sku = movimientos[0]?.sku ?? producto.sku

  return (
    <>
      <style>{'@page { size: letter; }'}</style>

      <div className={styles.page}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <div className={styles.toolbarLeft}>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onVolver}>
              ← Volver
            </button>
            <span className={styles.toolbarTitulo}>Kardex · {titulo}</span>
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
              <h1 className={styles.docTituloH1}>KARDEX DE INVENTARIO</h1>
            </div>

            <div className={styles.metaGrid}>
              <div><strong>Ítem:</strong> {titulo}</div>
              {sku && <div><strong>SKU:</strong> {sku}</div>}
              <div><strong>Stock actual:</strong> {stockActual ?? '∞'}</div>
              <div><strong>Costo actual:</strong> {costoActual != null ? formatPrice(costoActual) : '—'}</div>
              <div><strong>Fecha de impresión:</strong> {hoyCorta()}</div>
            </div>

            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Fecha/hora</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Saldo</th>
                  <th>Costo unit.</th>
                  <th>Costo result.</th>
                  <th>Referencia</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map(m => (
                  <tr key={m.id}>
                    <td>{formatFechaHora(m.created_at)}</td>
                    <td>{etiquetaTipoMovimiento(m.tipo).nombre}</td>
                    <td>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                    <td>{m.saldo ?? '—'}</td>
                    <td>{m.costo_unitario != null ? formatPrice(m.costo_unitario) : '—'}</td>
                    <td>{m.costo_resultante != null ? formatPrice(m.costo_resultante) : '—'}</td>
                    <td>{m.ref_etiqueta}</td>
                    <td>{m.usuario ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movimientos.length === 0 && (
              <div className={styles.hojaEmpty}>Este ítem no tiene movimientos registrados.</div>
            )}

            <p className={styles.hojaNota}>
              El saldo corrido reconcilia con el stock desde la puesta en marcha del kardex; ítems
              con stock previo pueden diferir.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
