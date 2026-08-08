'use client'
import { formatPrice } from '@/lib/store/format'
import { fechaLarga, type HojaProps } from './CotizacionPdfView'
import styles from './pdf.module.css'

// Hoja CATÁLOGO: cada línea con miniatura del producto (o placeholder) +
// descripción + precio. La imagen sale de `imagenesPorProducto[producto_id]`
// (productos.imagenes[0], resuelto en el server); ítems libres o sin imagen
// muestran un placeholder con la inicial de la descripción.
export default function HojaCatalogo({ cotizacion, totales, empresa, config, vencida, imagenesPorProducto }: HojaProps) {
  const subtotal = cotizacion.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
  const imagenes = imagenesPorProducto ?? {}
  const condiciones = cotizacion.condiciones ?? config.cotizacion_condiciones_default ?? ''

  return (
    <>
      <style>{'@page { size: letter; }'}</style>
      <div className={styles.pageBg}>
        <div className={`${styles.sheet} ${styles.catSheet}`}>
          {vencida && <div className={styles.watermark}>VENCIDA</div>}

          <header className={styles.catHeader}>
            <div>
              {empresa.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={empresa.logoUrl} alt="Logo" className={styles.catLogo} />
              )}
              <div className={styles.catEmpresaNombre}>{empresa.nombre}</div>
              <div className={styles.catEmpresaSub}>RTN: {empresa.rtn || '—'}</div>
            </div>
            <div className={styles.catMeta}>
              <div className={styles.ejeMetaLabel}>Cotización</div>
              <div className={styles.ejeMetaNumero}>{cotizacion.numero}</div>
              <div className={styles.ejeMetaFecha}>{fechaLarga(cotizacion.created_at.slice(0, 10))}</div>
              {vencida && <div className={styles.badgeSelloVencida}>VENCIDA</div>}
            </div>
          </header>

          <div className={styles.catBanner}>
            <span>Propuesta de productos</span>
            <span>{cotizacion.cliente_nombre || 'Cliente de mostrador'}</span>
          </div>

          <div>
            {cotizacion.items.map(it => {
              const img = it.producto_id ? imagenes[it.producto_id] : undefined
              return (
                <div key={it.id} className={styles.catItem}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={it.descripcion} className={styles.catThumb} />
                  ) : (
                    <div className={styles.catThumbPlaceholder}>
                      {(it.descripcion.trim()[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <div className={styles.catItemBody}>
                    <div className={styles.catItemDesc}>{it.descripcion}</div>
                    <div className={styles.catItemMeta}>
                      {it.cantidad} × {formatPrice(it.precio_unitario)}
                    </div>
                  </div>
                  <div className={styles.catItemPrecio}>
                    <div className={styles.catItemImporte}>{formatPrice(it.cantidad * it.precio_unitario)}</div>
                    <div className={styles.catItemUnit}>{formatPrice(it.precio_unitario)} c/u</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className={styles.catTotales}>
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
            <div className={styles.catTotalGran}>
              <span>Total</span>
              <span>{formatPrice(totales.total)}</span>
            </div>
          </div>

          {condiciones && (
            <div className={styles.notas}>
              {condiciones}
              <div className={styles.validez}>
                {vencida ? 'Cotización vencida el ' : 'Válida hasta el '}
                {fechaLarga(cotizacion.valido_hasta)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
