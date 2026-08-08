'use client'
import { formatPrice } from '@/lib/store/format'
import { fechaLarga, type HojaProps } from './CotizacionPdfView'
import styles from './pdf.module.css'

// Hoja MINIMALISTA: una página, blanco y negro, logo + tabla limpia + totales.
// Compacta, sin acentos de color (el logo se desatura en escala de grises).
export default function HojaMinimalista({ cotizacion, totales, empresa, config, vencida }: HojaProps) {
  const subtotal = cotizacion.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
  const condiciones = cotizacion.condiciones ?? config.cotizacion_condiciones_default ?? ''

  return (
    <>
      <style>{'@page { size: letter; }'}</style>
      <div className={styles.pageBg}>
        <div className={`${styles.sheet} ${styles.minSheet}`}>
          {vencida && <div className={styles.watermark}>VENCIDA</div>}

          <header className={styles.minHeader}>
            <div>
              {empresa.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={empresa.logoUrl} alt="Logo" className={styles.minLogo} />
              )}
              <div className={styles.minEmpresaNombre}>{empresa.nombre}</div>
              <div className={styles.minEmpresaSub}>RTN: {empresa.rtn || '—'}</div>
              {empresa.telefono && <div className={styles.minEmpresaSub}>Tel: {empresa.telefono}</div>}
            </div>
            <div className={styles.minMeta}>
              <div className={styles.minTitulo}>Cotización</div>
              <div className={styles.minNumero}>{cotizacion.numero}</div>
              <div className={styles.minFecha}>{fechaLarga(cotizacion.created_at.slice(0, 10))}</div>
              {vencida && <div className={styles.badgeSelloVencida}>VENCIDA</div>}
            </div>
          </header>

          <div className={styles.minDatos}>
            <div>
              <div className={styles.minCliente}>{cotizacion.cliente_nombre || 'Cliente de mostrador'}</div>
              {cotizacion.cliente_rtn && <div>RTN: {cotizacion.cliente_rtn}</div>}
            </div>
            <div>
              {vencida ? 'Vencida el ' : 'Válida hasta '}
              {fechaLarga(cotizacion.valido_hasta)}
            </div>
          </div>

          <table className={styles.minTabla}>
            <thead>
              <tr>
                <th className={styles.colNum}>Cant.</th>
                <th>Descripción</th>
                <th className={styles.colMoney}>P. Unit.</th>
                <th className={styles.colMoney}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {cotizacion.items.map(it => (
                <tr key={it.id}>
                  <td className={styles.colNum}>{it.cantidad}</td>
                  <td>{it.descripcion}</td>
                  <td className={styles.colMoney}>{formatPrice(it.precio_unitario)}</td>
                  <td className={styles.colMoney}>{formatPrice(it.cantidad * it.precio_unitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.minTotales}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {totales.descuento_total > 0 && (
              <div className={`${styles.totalRow} ${styles.totalRowMuted}`}>
                <span>Descuento</span>
                <span>- {formatPrice(totales.descuento_total)}</span>
              </div>
            )}
            <div className={styles.minTotalGran}>
              <span>Total</span>
              <span>{formatPrice(totales.total)}</span>
            </div>
          </div>

          {condiciones && (
            <div className={styles.minPie}>
              {condiciones}
              {cotizacion.notas && <div className={styles.minValidez}>{cotizacion.notas}</div>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
