'use client'
import { formatPrice } from '@/lib/store/format'
import { nombreComercial, razonSocial, rtn, telefonoEmpresa, domicilioFiscal, logoEmpresa } from '@/lib/empresa/perfil'
import type { Cliente, ConfigMap, CxpFila, EstadoPago, PagoAplicacion, PagoMetodo, PagoProveedor } from '@/types'
import styles from './estado.module.css'

type PagoConAplicaciones = PagoProveedor & { aplicaciones: PagoAplicacion[] }

interface Props {
  proveedor: Cliente
  compras: CxpFila[]
  pagos: PagoConAplicaciones[]
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

const METODO_LABEL: Record<PagoMetodo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
}

function fechaCorta(isoDate: string | null): string {
  return isoDate ? new Date(isoDate + 'T00:00:00').toLocaleDateString('es-HN') : '—'
}

function hoyCorta(): string {
  return new Date().toLocaleDateString('es-HN')
}

// Hoja imprimible del estado de cuenta: mismo patrón "HTML + CSS de impresión"
// que DocumentoHoja/HojaOrdenCompra — fondo blanco/tinta fija a propósito (no
// sigue el tema oscuro, simula papel impreso real). A diferencia de esos dos
// (donde la barra vive en un View separado), aquí la barra vive en este mismo
// componente porque EstadoCuentaView solo decide CUÁNDO montarla (botón
// "Imprimir" en la vista de pantalla); una vez montada, "Volver" regresa a esa
// vista y el botón real de impresión (window.print()) vive aquí.
export default function HojaEstadoCuenta({ proveedor, compras, pagos, totalAdeudado, config, onVolver }: Props) {
  const emisorNombre = nombreComercial(config) || 'Hondusport'
  const emisorRazon = razonSocial(config)
  const emisorRtn = rtn(config)
  const emisorDomicilio = domicilioFiscal(config)
  const emisorTelefono = telefonoEmpresa(config)
  const emisorLogo = logoEmpresa(config)

  return (
    <>
      <style>{'@page { size: letter; }'}</style>

      <div className={styles.page}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <div className={styles.toolbarLeft}>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onVolver}>
              ← Volver
            </button>
            <span className={styles.toolbarTitulo}>Estado de cuenta · {proveedor.nombre}</span>
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
              <h1 className={styles.docTituloH1}>ESTADO DE CUENTA</h1>
            </div>

            <div className={styles.metaRow}>Fecha de emisión: {hoyCorta()}</div>

            <div className={styles.proveedorBlock}>
              <div><strong>Proveedor:</strong> {proveedor.nombre}</div>
              {proveedor.rtn && <div>RTN: {proveedor.rtn}</div>}
              {proveedor.contacto && <div>Contacto: {proveedor.contacto}</div>}
              {proveedor.telefono && <div>Tel: {proveedor.telefono}</div>}
              {proveedor.direccion && <div>Dirección: {proveedor.direccion}</div>}
              <div>Días de crédito: {proveedor.dias_credito}</div>
            </div>

            <div className={styles.hojaSectionTitle}>Compras al crédito con saldo</div>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Total</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.compra_id}>
                    <td>{c.numero}</td>
                    <td>{formatPrice(c.total)}</td>
                    <td>{formatPrice(c.pagado)}</td>
                    <td>{formatPrice(c.saldo)}</td>
                    <td>{fechaCorta(c.fecha_vencimiento)}</td>
                    <td>{ESTADO_LABEL[c.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compras.length === 0 && <div className={styles.hojaEmpty}>Sin compras al crédito con saldo pendiente.</div>}

            <div className={styles.hojaSectionTitle}>Pagos</div>
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
                {pagos.map(p => (
                  <tr key={p.id}>
                    <td>{p.numero}</td>
                    <td>{fechaCorta(p.fecha)}</td>
                    <td>{formatPrice(p.monto)}</td>
                    <td>{METODO_LABEL[p.metodo]}</td>
                    <td>{p.referencia || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagos.length === 0 && <div className={styles.hojaEmpty}>Sin pagos registrados.</div>}

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
