'use client'
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import type { PagoAplicacion, PagoMetodo, PagoProveedor } from '@/types'
import { eliminarPago } from '../actions'
import styles from '../cxp.module.css'

type PagoConDatos = PagoProveedor & { proveedor_nombre: string; aplicaciones: PagoAplicacion[] }

interface Props {
  pagos: PagoConDatos[]
  // compra_id -> numero (ver pagos/page.tsx: viene de compra_saldos, sin
  // filtrar por saldo > 0 porque un pago puede aplicar a una compra ya
  // saldada por completo).
  comprasMap: Record<string, string>
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

export default function PagosClient({ pagos, comprasMap }: Props) {
  const router = useRouter()
  const [expandido, setExpandido] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onEliminar(pagoId: string, numero: string) {
    if (!window.confirm(`¿Eliminar el pago ${numero}? Esta acción no se puede deshacer.`)) return
    setError(null)
    setEliminando(pagoId)
    const res = await eliminarPago(pagoId)
    setEliminando(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Historial de pagos</h1>
          <p className={styles.subtitle}>
            {pagos.length} pago{pagos.length === 1 ? '' : 's'} registrado{pagos.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/cuentas-por-pagar" className={`${styles.btnAccion} btnMerlinSecondary`}>
            ← Cuentas por pagar
          </Link>
        </div>
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Proveedor</th>
              <th>Fecha</th>
              <th className={styles.num}>Monto</th>
              <th>Método</th>
              <th>Referencia</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pagos.map(p => {
              const abierto = expandido === p.id
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td className={styles.numero}>{p.numero}</td>
                    <td>
                      <Link href={`/admin/cuentas-por-pagar/proveedor/${p.proveedor_id}`}>
                        {p.proveedor_nombre || 'Sin proveedor'}
                      </Link>
                    </td>
                    <td className={styles.fechaCol}>{formatFecha(p.fecha)}</td>
                    <td className={styles.num}>{formatPrice(p.monto)}</td>
                    <td>{METODO_LABEL[p.metodo]}</td>
                    <td>{p.referencia || '—'}</td>
                    <td className={styles.accionCol}>
                      <button
                        type="button"
                        className={`${styles.btnAbonar} btnMerlinSecondary`}
                        onClick={() => setExpandido(abierto ? null : p.id)}
                      >
                        {abierto ? 'Ocultar' : 'Detalle'}
                      </button>
                    </td>
                    <td className={styles.accionCol}>
                      <button
                        type="button"
                        className={`${styles.btnAbonar} btnMerlinTertiary`}
                        onClick={() => onEliminar(p.id, p.numero)}
                        disabled={eliminando === p.id}
                      >
                        {eliminando === p.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={8}>
                        <div className={styles.detalleManual}>
                          {p.aplicaciones.map(a => (
                            <div key={a.id} className={styles.detalleRow}>
                              <div className={styles.detalleInfo}>
                                <span className={styles.compraNumero}>
                                  {comprasMap[a.compra_id] ?? a.compra_id}
                                </span>
                              </div>
                              <span className={styles.compraSaldo}>{formatPrice(a.monto)}</span>
                            </div>
                          ))}
                          {p.aplicaciones.length === 0 && (
                            <p className={styles.hint}>Este pago no tiene aplicaciones registradas.</p>
                          )}
                          {p.notas && <p className={styles.hint}>Notas: {p.notas}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {pagos.length === 0 && <div className={styles.empty}>No hay pagos registrados.</div>}
      </div>
    </div>
  )
}
