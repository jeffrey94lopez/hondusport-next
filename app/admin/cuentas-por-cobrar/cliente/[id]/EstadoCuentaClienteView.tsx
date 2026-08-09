'use client'
import { useState } from 'react'
import Link from 'next/link'
import { formatPrice } from '@/lib/store/format'
import type { Cliente, Cobro, CobroAplicacion, CobroMetodo, ConfigMap, CxcFila, EstadoPago } from '@/types'
import { numeroDocumento } from '../../CuentasPorCobrarClient'
import HojaEstadoCuentaCliente from './HojaEstadoCuentaCliente'
import styles from './estado.module.css'

type CobroConAplicaciones = Cobro & { aplicaciones: CobroAplicacion[] }

interface Props {
  cliente: Cliente
  documentos: CxcFila[]
  cobros: CobroConAplicaciones[]
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

const METODO_LABEL: Record<CobroMetodo, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
}

function formatFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—'
}

// Vista en pantalla del estado de cuenta (sigue el tema oscuro, como el resto
// del admin) + conmutador a la hoja imprimible (fondo blanco/tinta fija, no
// sigue el tema — ver HojaEstadoCuentaCliente). El botón "Imprimir" no llama
// window.print() directamente: monta la hoja, que trae su propia barra con el
// botón real de impresión (mismo criterio que EstadoCuentaView, CxP —
// espejo).
export default function EstadoCuentaClienteView({ cliente, documentos, cobros, totalAdeudado, config }: Props) {
  const [modoImpresion, setModoImpresion] = useState(false)

  if (modoImpresion) {
    return (
      <HojaEstadoCuentaCliente
        cliente={cliente}
        documentos={documentos}
        cobros={cobros}
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
          <h1 className={styles.title}>{cliente.nombre}</h1>
          <p className={styles.subtitle}>Estado de cuenta · saldo total {formatPrice(totalAdeudado)}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/cuentas-por-cobrar" className={`${styles.btnAccion} btnMerlinSecondary`}>
            ← Cuentas por cobrar
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

      <div className={styles.clienteCard}>
        {cliente.rtn && <span className={styles.clienteDato}>RTN: {cliente.rtn}</span>}
        {cliente.contacto && <span className={styles.clienteDato}>Contacto: {cliente.contacto}</span>}
        {cliente.telefono && <span className={styles.clienteDato}>Tel: {cliente.telefono}</span>}
        {cliente.correo && <span className={styles.clienteDato}>Correo: {cliente.correo}</span>}
        {cliente.direccion && <span className={styles.clienteDato}>Dirección: {cliente.direccion}</span>}
        <span className={styles.clienteDato}>Días de crédito: {cliente.dias_credito}</span>
        {cliente.limite_credito != null && (
          <span className={styles.clienteDato}>Límite de crédito: {formatPrice(cliente.limite_credito)}</span>
        )}
      </div>

      <div className={styles.totalCard}>
        <span className={styles.totalLabel}>Total adeudado</span>
        <span className={styles.totalMonto}>{formatPrice(totalAdeudado)}</span>
      </div>

      <h2 className={styles.sectionTitle}>Documentos con saldo</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th className={styles.num}>Total</th>
              <th className={styles.num}>Cobrado</th>
              <th className={styles.num}>Saldo</th>
              <th>Vencimiento</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map(d => (
              <tr key={d.documento_id}>
                <td className={styles.numero}>{numeroDocumento(d)}</td>
                <td className={styles.num}>{formatPrice(d.credito_total)}</td>
                <td className={styles.num}>{formatPrice(d.cobrado)}</td>
                <td className={`${styles.num} ${styles.saldoCol}`}>{formatPrice(d.saldo)}</td>
                <td className={styles.fechaCol}>{formatFecha(d.fecha_vencimiento)}</td>
                <td>
                  <span className={`${styles.badge} ${ESTADO_BADGE[d.estado]}`}>{ESTADO_LABEL[d.estado]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {documentos.length === 0 && (
          <div className={styles.empty}>Este cliente no tiene documentos con saldo pendiente.</div>
        )}
      </div>

      <h2 className={styles.sectionTitle}>Cobros</h2>
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
            {cobros.map(c => (
              <tr key={c.id}>
                <td className={styles.numero}>{c.numero}</td>
                <td className={styles.fechaCol}>{formatFecha(c.fecha)}</td>
                <td className={styles.num}>{formatPrice(c.monto)}</td>
                <td>{METODO_LABEL[c.metodo]}</td>
                <td>{c.referencia || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cobros.length === 0 && (
          <div className={styles.empty}>Este cliente no tiene cobros registrados.</div>
        )}
      </div>
    </div>
  )
}
