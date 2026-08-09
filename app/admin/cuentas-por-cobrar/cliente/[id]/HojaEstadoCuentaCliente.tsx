'use client'
import { formatPrice } from '@/lib/store/format'
import type { Cliente, Cobro, CobroAplicacion, CobroMetodo, ConfigMap, CxcFila, EstadoPago } from '@/types'
import { numeroDocumento } from '../../CuentasPorCobrarClient'
import styles from './estado.module.css'

type CobroConAplicaciones = Cobro & { aplicaciones: CobroAplicacion[] }

interface Props {
  cliente: Cliente
  documentos: CxcFila[]
  cobros: CobroConAplicaciones[]
  totalAdeudado: number
  config: ConfigMap
  onVolver: () => void
}

const ESTADO_LABEL: Record<EstadoPago, string> = {
  pagada: 'Pagada',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}

const METODO_LABEL: Record<CobroMetodo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
}

function fechaCorta(isoDate: string | null): string {
  return isoDate ? new Date(isoDate + 'T00:00:00').toLocaleDateString('es-HN') : '—'
}

function hoyCorta(): string {
  return new Date().toLocaleDateString('es-HN')
}

// Hoja imprimible del estado de cuenta: mismo patrón "HTML + CSS de
// impresión" que HojaEstadoCuenta (CxP, espejo) — fondo blanco/tinta fija a
// propósito (no sigue el tema oscuro, simula papel impreso real). La barra
// vive en este mismo componente porque EstadoCuentaClienteView solo decide
// CUÁNDO montarla (botón "Imprimir" en la vista de pantalla); una vez
// montada, "Volver" regresa a esa vista y el botón real de impresión
// (window.print()) vive aquí.
export default function HojaEstadoCuentaCliente({
  cliente, documentos, cobros, totalAdeudado, config, onVolver,
}: Props) {
  return (
    <>
      <style>{'@page { size: letter; }'}</style>

      <div className={styles.page}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <div className={styles.toolbarLeft}>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onVolver}>
              ← Volver
            </button>
            <span className={styles.toolbarTitulo}>Estado de cuenta · {cliente.nombre}</span>
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
            <header className={styles.header}>
              {config.logo_url && (
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
              <h1 className={styles.docTituloH1}>ESTADO DE CUENTA</h1>
            </div>

            <div className={styles.metaRow}>Fecha de emisión: {hoyCorta()}</div>

            <div className={styles.clienteBlock}>
              <div><strong>Cliente:</strong> {cliente.nombre}</div>
              {cliente.rtn && <div>RTN: {cliente.rtn}</div>}
              {cliente.contacto && <div>Contacto: {cliente.contacto}</div>}
              {cliente.telefono && <div>Tel: {cliente.telefono}</div>}
              {cliente.direccion && <div>Dirección: {cliente.direccion}</div>}
              <div>Días de crédito: {cliente.dias_credito}</div>
              {cliente.limite_credito != null && <div>Límite de crédito: {formatPrice(cliente.limite_credito)}</div>}
            </div>

            <div className={styles.hojaSectionTitle}>Documentos con saldo</div>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Total</th>
                  <th>Cobrado</th>
                  <th>Saldo</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map(d => (
                  <tr key={d.documento_id}>
                    <td>{numeroDocumento(d)}</td>
                    <td>{formatPrice(d.credito_total)}</td>
                    <td>{formatPrice(d.cobrado)}</td>
                    <td>{formatPrice(d.saldo)}</td>
                    <td>{fechaCorta(d.fecha_vencimiento)}</td>
                    <td>{ESTADO_LABEL[d.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {documentos.length === 0 && (
              <div className={styles.hojaEmpty}>Sin documentos con saldo pendiente.</div>
            )}

            <div className={styles.hojaSectionTitle}>Cobros</div>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Método</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map(c => (
                  <tr key={c.id}>
                    <td>{c.numero}</td>
                    <td>{fechaCorta(c.fecha)}</td>
                    <td>{formatPrice(c.monto)}</td>
                    <td>{METODO_LABEL[c.metodo]}</td>
                    <td>{c.referencia || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cobros.length === 0 && <div className={styles.hojaEmpty}>Sin cobros registrados.</div>}

            <div className={styles.desglose}>
              <div className={`${styles.desgloseRow} ${styles.desgloseTotal}`}>
                <span>TOTAL ADEUDADO</span>
                <span>{formatPrice(totalAdeudado)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
