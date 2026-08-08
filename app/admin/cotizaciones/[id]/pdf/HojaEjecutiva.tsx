'use client'
import { formatPrice } from '@/lib/store/format'
import { fechaLarga, type HojaProps } from './CotizacionPdfView'
import styles from './pdf.module.css'

const etiquetaIsv = (isv: string) => (isv === 'exento' ? 'Exento' : `ISV ${isv}%`)

// Hoja EJECUTIVA: adapta la estructura/aire de la plantilla corporativa de Akuo
// (header con marca + fecha de emisión, barras de sección, tabla y bloque de
// totales) a los tokens Merlin — dorado/negro, sin copiar sus colores/fuentes.
export default function HojaEjecutiva({ cotizacion, totales, empresa, config, vencida }: HojaProps) {
  const subtotal = cotizacion.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
  const isvTotal = totales.isv15 + totales.isv18
  const condiciones = cotizacion.condiciones ?? config.cotizacion_condiciones_default ?? ''

  return (
    <>
      <style>{'@page { size: letter; }'}</style>
      <div className={styles.pageBg}>
        <div className={`${styles.sheet} ${styles.ejeSheet}`}>
          {vencida && <div className={styles.watermark}>VENCIDA</div>}

          <header className={styles.ejeHeader}>
            <div className={styles.ejeMarca}>
              {empresa.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={empresa.logoUrl} alt="Logo" className={styles.ejeLogo} />
              )}
              <div>
                <div className={styles.ejeEmpresaNombre}>{empresa.nombre}</div>
                {empresa.razonSocial && empresa.razonSocial !== empresa.nombre && (
                  <div className={styles.ejeEmpresaSub}>{empresa.razonSocial}</div>
                )}
                <div className={styles.ejeEmpresaSub}>RTN: {empresa.rtn || '—'}</div>
              </div>
            </div>
            <div className={styles.ejeMeta}>
              <div className={styles.ejeMetaLabel}>Cotización</div>
              <div className={styles.ejeMetaNumero}>{cotizacion.numero}</div>
              <div className={styles.ejeMetaFecha}>{fechaLarga(cotizacion.created_at.slice(0, 10))}</div>
              {vencida && <div className={styles.badgeSelloVencida}>VENCIDA</div>}
            </div>
          </header>

          <div className={styles.ejeDatosGrid}>
            <div className={styles.ejeDatoBloque}>
              <div className={styles.ejeDatoTitulo}>Cliente</div>
              <div className={styles.ejeDatoNombre}>{cotizacion.cliente_nombre || 'Cliente de mostrador'}</div>
              {cotizacion.cliente_rtn && <div className={styles.ejeDatoLinea}>RTN: {cotizacion.cliente_rtn}</div>}
            </div>
            <div className={styles.ejeDatoBloque}>
              <div className={styles.ejeDatoTitulo}>Emisor</div>
              {empresa.domicilio && <div className={styles.ejeDatoLinea}>{empresa.domicilio}</div>}
              {empresa.telefono && <div className={styles.ejeDatoLinea}>Tel: {empresa.telefono}</div>}
            </div>
          </div>

          <div className={`${styles.ejeBarra} ${styles.ejeBarraDorada}`}>Detalle de la cotización</div>

          <table className={styles.ejeTabla}>
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
                  <td>
                    <div className={styles.itemDesc}>{it.descripcion}</div>
                    <div className={styles.itemIsv}>{etiquetaIsv(it.isv)}</div>
                  </td>
                  <td className={styles.colMoney}>{formatPrice(it.precio_unitario)}</td>
                  <td className={styles.colMoney}>{formatPrice(it.cantidad * it.precio_unitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.ejeFooterGrid}>
            <div>
              {condiciones && (
                <div className={styles.condiciones}>
                  <div className={styles.condTitulo}>Condiciones</div>
                  <div className={styles.condTexto}>{condiciones}</div>
                </div>
              )}
              <div className={`${styles.validez} ${vencida ? styles.validezVencida : ''}`}>
                {vencida ? 'Cotización vencida el ' : 'Válida hasta el '}
                {fechaLarga(cotizacion.valido_hasta)}
              </div>
            </div>

            <div className={styles.totalesBox}>
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
              {isvTotal > 0 && (
                <div className={`${styles.totalRow} ${styles.totalRowMuted}`}>
                  <span>ISV incluido</span>
                  <span>{formatPrice(isvTotal)}</span>
                </div>
              )}
              <div className={styles.totalGran}>
                <span>Total</span>
                <span>{formatPrice(totales.total)}</span>
              </div>
            </div>
          </div>

          {cotizacion.notas && <div className={styles.notas}>{cotizacion.notas}</div>}
        </div>
      </div>
    </>
  )
}
