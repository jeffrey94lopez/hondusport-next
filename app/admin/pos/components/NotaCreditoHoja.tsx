'use client'
import { formatearCorrelativo } from '@/lib/pos/fiscal'
import { formatPrice } from '@/lib/store/format'
import { numeroDocumentoDevolucion, LABEL_REEMBOLSO } from '@/lib/pos/devoluciones'
import type { Documento, DocumentoItem, NotaCreditoReembolso, CaiAutorizacion, ConfigMap } from '@/types'
import styles from '../documento/documento.module.css'

type Formato = '80mm' | 'carta'

interface Props {
  documento: Documento
  items: DocumentoItem[]
  reembolsos: NotaCreditoReembolso[]
  origen: Pick<Documento, 'tipo' | 'correlativo' | 'numero_comprobante'> | null
  cai: CaiAutorizacion | null
  config: ConfigMap
  formato: Formato
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fechaCorta(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('es-HN')
}

// Referencia a la factura/comprobante de origen: mismo criterio que
// numeroDocumento de DocumentoHoja, duplicado a propósito — `origen` aquí
// solo trae 3 campos (Pick<Documento,...>, ver obtenerNotaCredito/page.tsx),
// no vale acoplarse a la función que espera un Documento completo.
function numeroOrigen(origen: { tipo: string; correlativo: string | null; numero_comprobante: number | null }): string {
  if (origen.tipo === 'factura') return origen.correlativo ?? '—'
  return `C-${String(origen.numero_comprobante ?? 0).padStart(8, '0')}`
}

// Hoja imprimible de una nota de crédito (tipo='nota_credito', origen
// factura) o devolución (tipo='devolucion', origen comprobante) — POS P5a
// Task 5. Componente PURO (mismo contrato que DocumentoHoja: recibe todo por
// props, sin fetch propio ni barra de Imprimir): quien la monta decide el
// wrapper — la página de detalle reusa el toolbar de DocumentoView; el modal
// post-emisión (DevolucionModal) reusa el wrapper de DocumentoModal — así
// ningún consumidor duplica la carga de datos ni el layout de impresión.
export default function NotaCreditoHoja({ documento, items, reembolsos, origen, cai, config, formato }: Props) {
  const esNotaCredito = documento.tipo === 'nota_credito'
  const paperClass = formato === '80mm' ? styles.hoja80 : styles.hojaCarta

  return (
    <>
      {/* Ver la nota equivalente en DocumentoHoja: @page es global, se
          reescribe según el formato elegido. */}
      <style>{
        formato === '80mm'
          ? '@page { margin: 0; }'
          : '@page { size: letter; }'
      }</style>

      <div className={styles.pageBg}>
        <div className={paperClass}>
          <header className={styles.header}>
            {formato === 'carta' && config.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logo_url} alt="Logo" className={styles.logo} />
            )}
            <div className={styles.emisor}>
              <div className={styles.emisorNombre}>
                {config.fiscal_nombre_comercial || config.fiscal_razon_social || 'Hondusport'}
              </div>
              {config.fiscal_razon_social && <div>{config.fiscal_razon_social}</div>}
              <div>RTN: {config.fiscal_rtn || '—'}</div>
              {config.fiscal_domicilio && <div>{config.fiscal_domicilio}</div>}
              {config.fiscal_telefono && <div>Tel: {config.fiscal_telefono}</div>}
            </div>
          </header>

          <div className={styles.docTitulo}>
            <h1 className={styles.docTituloH1}>{esNotaCredito ? 'NOTA DE CRÉDITO' : 'DEVOLUCIÓN'}</h1>
            {!esNotaCredito && <div className={styles.subtitulo}>Documento no fiscal</div>}
            <div className={styles.numero}>{numeroDocumentoDevolucion(documento)}</div>
          </div>

          {esNotaCredito && cai && (
            <div className={styles.caiBlock}>
              <div>CAI: {cai.cai}</div>
              <div>Fecha límite de emisión: {fechaCorta(cai.fecha_limite)}</div>
              <div>
                Rango autorizado: {formatearCorrelativo(cai, cai.rango_desde)} – {formatearCorrelativo(cai, cai.rango_hasta)}
              </div>
            </div>
          )}

          <div className={styles.copia}>Original: Cliente / Copia: Obligado tributario emisor</div>

          <div className={styles.metaRow}>Fecha de emisión: {fechaHora(documento.created_at)}</div>

          {origen && (
            <div className={styles.metaRow}>
              Documento de origen: {origen.tipo === 'factura' ? 'Factura' : 'Comprobante'} {numeroOrigen(origen)}
            </div>
          )}

          <div className={styles.clienteBlock}>
            <div><strong>Cliente:</strong> {documento.cliente_nombre}</div>
            {documento.cliente_rtn && <div>RTN: {documento.cliente_rtn}</div>}
            {!documento.cliente_rtn && documento.cliente_identidad && (
              <div>Identidad: {documento.cliente_identidad}</div>
            )}
          </div>

          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th>Cant.</th>
                <th>Descripción</th>
                <th>P. Unit.</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td>{it.cantidad}</td>
                  <td>{it.descripcion}</td>
                  <td>{formatPrice(Number(it.precio_unitario))}</td>
                  <td>{formatPrice(Number(it.importe))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.desglose}>
            <div className={styles.desgloseRow}><span>Descuento</span><span>{formatPrice(Number(documento.descuento_total))}</span></div>
            <div className={styles.desgloseRow}><span>Importe exento</span><span>{formatPrice(Number(documento.total_exento))}</span></div>
            <div className={styles.desgloseRow}><span>Importe exonerado</span><span>{formatPrice(Number(documento.total_exonerado))}</span></div>
            <div className={styles.desgloseRow}><span>Importe gravado 15%</span><span>{formatPrice(Number(documento.total_gravado15))}</span></div>
            <div className={styles.desgloseRow}><span>Importe gravado 18%</span><span>{formatPrice(Number(documento.total_gravado18))}</span></div>
            <div className={styles.desgloseRow}><span>ISV 15%</span><span>{formatPrice(Number(documento.isv15))}</span></div>
            <div className={styles.desgloseRow}><span>ISV 18%</span><span>{formatPrice(Number(documento.isv18))}</span></div>
            <div className={`${styles.desgloseRow} ${styles.desgloseTotal}`}><span>TOTAL ACREDITADO</span><span>{formatPrice(Number(documento.total))}</span></div>
          </div>

          <div className={styles.totalLetras}>{documento.total_letras}</div>

          {documento.tasa_usd != null && (
            <div className={styles.tasaUsd}>Tasa de cambio: {formatPrice(Number(documento.tasa_usd))} por US$1.00</div>
          )}

          <div className={styles.pagos}>
            <div className={styles.pagosTitle}>Reembolso</div>
            {reembolsos.map(r => (
              <div key={r.id} className={styles.pagoRow}>
                <span>{LABEL_REEMBOLSO[r.tipo]}</span>
                <span>{formatPrice(Number(r.monto))}</span>
              </div>
            ))}
          </div>

          {documento.notas && <div className={styles.metaRow}>Motivo: {documento.notas}</div>}

          {config.fiscal_leyenda && <div className={styles.leyenda}>{config.fiscal_leyenda}</div>}
        </div>
      </div>
    </>
  )
}
