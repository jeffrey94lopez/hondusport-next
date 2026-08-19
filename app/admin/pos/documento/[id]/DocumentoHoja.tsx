'use client'
import { formatearCorrelativo } from '@/lib/pos/fiscal'
import { formatPrice } from '@/lib/store/format'
import { nombreComercial, razonSocial, rtn, telefonoEmpresa, domicilioFiscal, logoEmpresa } from '@/lib/empresa/perfil'
import type { Documento, DocumentoItem, CaiAutorizacion, ConfigMap, DocumentoPagoConMetodo } from '@/types'
import styles from '../documento.module.css'
import { numeroDocumento } from '@/lib/pos/documentos'

type Formato = '80mm' | 'carta'

interface Props {
  documento: Documento
  items: DocumentoItem[]
  pagos: DocumentoPagoConMetodo[]
  cai: CaiAutorizacion | null
  config: ConfigMap
  formato: Formato
}

// Exportado: DocumentoView lo reusa para el título de su toolbar (no
// duplicar el formato del número de documento en dos archivos).
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

// La hoja imprimible pura: mismo markup/clases que usaba DocumentoView antes
// de esta tarea (Task 11), extraído para que tanto la página del documento
// como DocumentoModal (documento en modal tras cobrar) rendericen EXACTAMENTE
// el mismo papel fiscal — ningún campo cambia, solo se movió de archivo.
export default function DocumentoHoja({ documento, items, pagos, cai, config, formato }: Props) {
  const esFactura = documento.tipo === 'factura'
  const anulado = documento.estado === 'anulado'
  const paperClass = formato === '80mm' ? styles.hoja80 : styles.hojaCarta

  const emisorNombre = nombreComercial(config) || 'Hondusport'
  const emisorRazon = razonSocial(config)
  const emisorRtn = rtn(config)
  const emisorDomicilio = domicilioFiscal(config)
  const emisorTelefono = telefonoEmpresa(config)
  const emisorLogo = logoEmpresa(config)

  return (
    <>
      {/* @page es global (no puede scopearse a una clase CSS): se reescribe
          según el formato elegido. 80mm fuerza margen 0 (impresora térmica,
          sin zona no imprimible); el ancho de 80mm lo da el contenedor
          `.hoja80` (width: 80mm), no `size` — "size: 80mm auto" no es una
          combinación válida (una longitud no se mezcla con la palabra clave
          `auto`) y el navegador descarta la regla completa. Carta deja el
          margen de la impresora por defecto y solo fija el tamaño de página. */}
      <style>{
        formato === '80mm'
          ? '@page { margin: 0; }'
          : '@page { size: letter; }'
      }</style>

      <div className={styles.pageBg}>
        <div className={paperClass}>
          {anulado && <div className={styles.watermark}>ANULADO</div>}

          <header className={styles.header}>
            {formato === 'carta' && emisorLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emisorLogo} alt="Logo" className={styles.logo} />
            )}
            <div className={styles.emisor}>
              <div className={styles.emisorNombre}>{emisorNombre}</div>
              {emisorRazon && emisorRazon !== emisorNombre && <div>{emisorRazon}</div>}
              <div>RTN: {emisorRtn || '—'}</div>
              {emisorDomicilio && <div>{emisorDomicilio}</div>}
              {emisorTelefono && <div>Tel: {emisorTelefono}</div>}
            </div>
          </header>

          <div className={styles.docTitulo}>
            <h1 className={styles.docTituloH1}>{esFactura ? 'FACTURA' : 'COMPROBANTE'}</h1>
            {!esFactura && <div className={styles.subtitulo}>Documento no fiscal</div>}
            <div className={styles.numero}>{numeroDocumento(documento)}</div>
          </div>

          {esFactura && cai && (
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

          <div className={styles.clienteBlock}>
            <div><strong>Cliente:</strong> {documento.cliente_nombre}</div>
            {documento.cliente_rtn && <div>RTN: {documento.cliente_rtn}</div>}
            {!documento.cliente_rtn && documento.cliente_identidad && (
              <div>Identidad: {documento.cliente_identidad}</div>
            )}
            {documento.exonerado && (
              <div className={styles.exoneradoBlock}>
                <div>Cliente exonerado</div>
                {documento.orden_compra_exenta && <div>Orden de compra exenta: {documento.orden_compra_exenta}</div>}
                {documento.constancia_exonerado && <div>Constancia de exoneración: {documento.constancia_exonerado}</div>}
                {documento.registro_sag && <div>Registro SAG: {documento.registro_sag}</div>}
              </div>
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
            <div className={`${styles.desgloseRow} ${styles.desgloseTotal}`}><span>TOTAL</span><span>{formatPrice(Number(documento.total))}</span></div>
          </div>

          <div className={styles.totalLetras}>{documento.total_letras}</div>

          {documento.tasa_usd != null && (
            <div className={styles.tasaUsd}>Tasa de cambio: {formatPrice(Number(documento.tasa_usd))} por US$1.00</div>
          )}

          <div className={styles.pagos}>
            <div className={styles.pagosTitle}>Pagos</div>
            {pagos.map(p => (
              <div key={p.id} className={styles.pagoRow}>
                <span>{p.metodo_nombre}</span>
                <span>{formatPrice(Number(p.monto))}</span>
                {p.metodo_tipo === 'efectivo_usd' && p.tasa != null && (
                  <span className={styles.pagoRef}>
                    US$ {Number(p.monto_usd ?? 0).toFixed(2)} a {formatPrice(Number(p.tasa))}
                  </span>
                )}
                {p.referencia && <span className={styles.pagoRef}>Ref: {p.referencia}</span>}
              </div>
            ))}
          </div>

          {config.fiscal_leyenda && <div className={styles.leyenda}>{config.fiscal_leyenda}</div>}

          {anulado && (
            <div className={styles.anuladoInfo}>
              Anulado{documento.anulado_at ? ` el ${fechaHora(documento.anulado_at)}` : ''}
              {documento.anulado_motivo ? ` — Motivo: ${documento.anulado_motivo}` : ''}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
