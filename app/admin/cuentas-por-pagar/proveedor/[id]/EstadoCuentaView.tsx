'use client'
import { useState } from 'react'
import Link from 'next/link'
import { formatPrice } from '@/lib/store/format'
import type { Cliente, ConfigMap, CxpFila, EstadoPago, PagoAplicacion, PagoMetodo, PagoProveedor } from '@/types'
import HojaEstadoCuenta from './HojaEstadoCuenta'
import styles from './estado.module.css'

type PagoConAplicaciones = PagoProveedor & { aplicaciones: PagoAplicacion[] }

interface Props {
  proveedor: Cliente
  compras: CxpFila[]
  pagos: PagoConAplicaciones[]
  totalAdeudado: number
  config: ConfigMap
}

const ESTADO_LABEL: Record<EstadoPago, string> = {
  pagada: 'Pagada',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}

const ESTADO_BADGE: Record<EstadoPago, string> = {
  pagada: styles.badgeVerde,
  parcial: styles.badgeAmbar,
  pendiente: styles.badgeGris,
  vencida: styles.badgeRojo,
}

const METODO_LABEL: Record<PagoMetodo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
}

function formatFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—'
}

// Vista en pantalla del estado de cuenta (sigue el tema oscuro, como el resto
// del admin) + conmutador a la hoja imprimible (fondo blanco/tinta fija, no
// sigue el tema — ver HojaEstadoCuenta). El botón "Imprimir" no llama
// window.print() directamente: monta la hoja, que trae su propia barra con el
// botón real de impresión (mismo criterio que CompraOrdenView/HojaOrdenCompra
// en app/admin/compras/[id]/orden).
export default function EstadoCuentaView({ proveedor, compras, pagos, totalAdeudado, config }: Props) {
  const [modoImpresion, setModoImpresion] = useState(false)

  if (modoImpresion) {
    return (
      <HojaEstadoCuenta
        proveedor={proveedor}
        compras={compras}
        pagos={pagos}
        totalAdeudado={totalAdeudado}
        config={config}
        onVolver={() => setModoImpresion(false)}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>{proveedor.nombre}</h1>
          <p className={styles.subtitle}>Estado de cuenta · saldo total {formatPrice(totalAdeudado)}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/cuentas-por-pagar" className={`${styles.btnAccion} btnMerlinSecondary`}>
            ← Cuentas por pagar
          </Link>
          <button
            type="button"
            className={`${styles.btnAccion} btnMerlinPrimary`}
            onClick={() => setModoImpresion(true)}
          >
            Imprimir
          </button>
        </div>
      </div>

      <div className={styles.proveedorCard}>
        {proveedor.rtn && <span className={styles.proveedorDato}>RTN: {proveedor.rtn}</span>}
        {proveedor.contacto && <span className={styles.proveedorDato}>Contacto: {proveedor.contacto}</span>}
        {proveedor.telefono && <span className={styles.proveedorDato}>Tel: {proveedor.telefono}</span>}
        {proveedor.correo && <span className={styles.proveedorDato}>Correo: {proveedor.correo}</span>}
        {proveedor.direccion && <span className={styles.proveedorDato}>Dirección: {proveedor.direccion}</span>}
        <span className={styles.proveedorDato}>Días de crédito: {proveedor.dias_credito}</span>
      </div>

      <div className={styles.totalCard}>
        <span className={styles.totalLabel}>Total adeudado</span>
        <span className={styles.totalMonto}>{formatPrice(totalAdeudado)}</span>
      </div>

      <h2 className={styles.sectionTitle}>Compras al crédito con saldo</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th className={styles.num}>Total</th>
              <th className={styles.num}>Pagado</th>
              <th className={styles.num}>Saldo</th>
              <th>Vencimiento</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {compras.map(c => (
              <tr key={c.compra_id}>
                <td className={styles.numero}>{c.numero}</td>
                <td className={styles.num}>{formatPrice(c.total)}</td>
                <td className={styles.num}>{formatPrice(c.pagado)}</td>
                <td className={`${styles.num} ${styles.saldoCol}`}>{formatPrice(c.saldo)}</td>
                <td className={styles.fechaCol}>{formatFecha(c.fecha_vencimiento)}</td>
                <td>
                  <span className={`${styles.badge} ${ESTADO_BADGE[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {compras.length === 0 && (
          <div className={styles.empty}>Este proveedor no tiene compras al crédito con saldo pendiente.</div>
        )}
      </div>

      <h2 className={styles.sectionTitle}>Pagos</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th className={styles.num}>Monto</th>
              <th>Método</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map(p => (
              <tr key={p.id}>
                <td className={styles.numero}>{p.numero}</td>
                <td className={styles.fechaCol}>{formatFecha(p.fecha)}</td>
                <td className={styles.num}>{formatPrice(p.monto)}</td>
                <td>{METODO_LABEL[p.metodo]}</td>
                <td>{p.referencia || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagos.length === 0 && (
          <div className={styles.empty}>Este proveedor no tiene pagos registrados.</div>
        )}
      </div>
    </div>
  )
}
