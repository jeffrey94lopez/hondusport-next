'use client'
import { formatPrice } from '@/lib/store/format'
import { nombreComercial, razonSocial, rtn, telefonoEmpresa, domicilioFiscal, logoEmpresa } from '@/lib/empresa/perfil'
import type { CompraConDatos, CompraMoneda, ConfigMap } from '@/types'
import styles from './orden.module.css'

interface Props {
  compra: CompraConDatos
  config: ConfigMap
}

// Costos/importes de línea en la moneda de la compra: L. usa formatPrice,
// USD se muestra con su propio símbolo (el total en Lempiras SIEMPRE es
// `compra.total`, ya recalculado por guardarCompra — frontera de confianza).
function formatMoneda(n: number, moneda: CompraMoneda): string {
  return moneda === 'USD' ? `US$ ${n.toFixed(2)}` : formatPrice(n)
}

function fechaCorta(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('es-HN')
}

// La hoja imprimible pura de la orden de compra: mismo patrón que
// DocumentoHoja (app/admin/pos/documento/[id]/DocumentoHoja.tsx) — fondo
// blanco/tinta fija a propósito (no sigue el tema oscuro, simula papel
// impreso real). Solo hoja Carta (las compras no tienen formato térmico).
export default function HojaOrdenCompra({ compra, config }: Props) {
  const proveedor = compra.proveedor
  const esUsd = compra.moneda === 'USD'
  const subtotalMoneda = compra.items.reduce((s, it) => s + it.cantidad_ordenada * it.costo_unitario, 0)

  const emisorNombre = nombreComercial(config) || 'Hondusport'
  const emisorRazon = razonSocial(config)
  const emisorRtn = rtn(config)
  const emisorDomicilio = domicilioFiscal(config)
  const emisorTelefono = telefonoEmpresa(config)
  const emisorLogo = logoEmpresa(config)

  return (
    <>
      <style>{'@page { size: letter; }'}</style>

      <div className={styles.pageBg}>
        <div className={styles.hojaCarta}>
          <header className={styles.header}>
            {emisorLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emisorLogo} alt="Logo" className={styles.logo} />
            )}
            <div className={styles.emisor}>
              <div className={styles.emisorNombre}>
                {emisorNombre}
              </div>
              {emisorRazon && emisorRazon !== emisorNombre && <div>{emisorRazon}</div>}
              <div>RTN: {emisorRtn || '—'}</div>
              {emisorDomicilio && <div>{emisorDomicilio}</div>}
              {emisorTelefono && <div>Tel: {emisorTelefono}</div>}
            </div>
          </header>

          <div className={styles.docTitulo}>
            <h1 className={styles.docTituloH1}>ORDEN DE COMPRA</h1>
            <div className={styles.numero}>{compra.numero}</div>
          </div>

          <div className={styles.metaRow}>Fecha: {fechaCorta(compra.fecha)}</div>

          <div className={styles.proveedorBlock}>
            <div><strong>Proveedor:</strong> {proveedor?.nombre ?? '—'}</div>
            {proveedor?.rtn && <div>RTN: {proveedor.rtn}</div>}
            {proveedor?.contacto && <div>Contacto: {proveedor.contacto}</div>}
            {proveedor?.telefono && <div>Tel: {proveedor.telefono}</div>}
          </div>

          <div className={styles.metaRow}>
            {compra.factura_proveedor && <div>Factura del proveedor: {compra.factura_proveedor}</div>}
            <div>
              Condición de pago:{' '}
              {compra.condicion_pago === 'credito' ? `Crédito (${compra.dias_credito} días)` : 'Contado'}
              {compra.condicion_pago === 'credito' && compra.fecha_vencimiento && (
                <> — Vence: {fechaCorta(compra.fecha_vencimiento)}</>
              )}
            </div>
            {compra.notas && <div>Notas: {compra.notas}</div>}
          </div>

          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th>Cant.</th>
                <th>Descripción</th>
                <th>Costo unit.{esUsd ? ' (USD)' : ''}</th>
                <th>Importe{esUsd ? ' (USD)' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {compra.items.map(it => (
                <tr key={it.id}>
                  <td>{it.cantidad_ordenada}</td>
                  <td>{it.descripcion}</td>
                  <td>{formatMoneda(it.costo_unitario, compra.moneda)}</td>
                  <td>{formatMoneda(it.cantidad_ordenada * it.costo_unitario, compra.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.desglose}>
            {esUsd && (
              <>
                <div className={styles.desgloseRow}>
                  <span>Subtotal (USD)</span>
                  <span>{formatMoneda(subtotalMoneda, 'USD')}</span>
                </div>
                <div className={styles.desgloseRow}>
                  <span>Tasa de cambio</span>
                  <span>{formatPrice(Number(compra.tasa_cambio ?? 0))} por US$1.00</span>
                </div>
              </>
            )}
            <div className={`${styles.desgloseRow} ${styles.desgloseTotal}`}>
              <span>Total{esUsd ? ' (L.)' : ''}</span>
              <span>{formatPrice(Number(compra.total))}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
