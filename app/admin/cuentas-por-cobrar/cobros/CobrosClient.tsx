'use client'
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import type { Cobro, CobroAplicacion, CobroMetodo } from '@/types'
import { eliminarCobro } from '../actions'
import styles from '../cxc.module.css'

type CobroConDatos = Cobro & { cliente_nombre: string; aplicaciones: CobroAplicacion[] }

interface Props {
  cobros: CobroConDatos[]
  // documento_id -> numero (ver page.tsx: viene de documento_saldos, sin
  // filtrar por saldo > 0 porque un cobro puede aplicar a un documento ya
  // saldado por completo).
  documentosMap: Record<string, string>
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

export default function CobrosClient({ cobros, documentosMap }: Props) {
  const router = useRouter()
  const [expandido, setExpandido] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onEliminar(cobroId: string, numero: string) {
    if (!window.confirm(`¿Eliminar el cobro ${numero}? Esta acción no se puede deshacer.`)) return
    setError(null)
    setEliminando(cobroId)
    const res = await eliminarCobro(cobroId)
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
          <h1 className={styles.title}>Historial de cobros</h1>
          <p className={styles.subtitle}>
            {cobros.length} cobro{cobros.length === 1 ? '' : 's'} registrado{cobros.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/cuentas-por-cobrar" className={`${styles.btnAccion} btnMerlinSecondary`}>
            ← Cuentas por cobrar
          </Link>
        </div>
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th className={styles.num}>Monto</th>
              <th>Método</th>
              <th>Referencia</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cobros.map(c => {
              const abierto = expandido === c.id
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className={styles.numero}>{c.numero}</td>
                    <td>
                      <Link href={`/admin/cuentas-por-cobrar/cliente/${c.cliente_id}`}>
                        {c.cliente_nombre || 'Sin cliente'}
                      </Link>
                    </td>
                    <td className={styles.fechaCol}>{formatFecha(c.fecha)}</td>
                    <td className={styles.num}>{formatPrice(c.monto)}</td>
                    <td>{METODO_LABEL[c.metodo]}</td>
                    <td>{c.referencia || '—'}</td>
                    <td className={styles.accionCol}>
                      <button
                        type="button"
                        className={`${styles.btnAbonar} btnMerlinSecondary`}
                        onClick={() => setExpandido(abierto ? null : c.id)}
                      >
                        {abierto ? 'Ocultar' : 'Detalle'}
                      </button>
                    </td>
                    <td className={styles.accionCol}>
                      <button
                        type="button"
                        className={`${styles.btnAbonar} btnMerlinTertiary`}
                        onClick={() => onEliminar(c.id, c.numero)}
                        disabled={eliminando === c.id}
                      >
                        {eliminando === c.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={8}>
                        <div className={styles.detalleManual}>
                          {c.aplicaciones.map(a => (
                            <div key={a.id} className={styles.detalleRow}>
                              <div className={styles.detalleInfo}>
                                <span className={styles.compraNumero}>
                                  {documentosMap[a.documento_id] ?? a.documento_id}
                                </span>
                              </div>
                              <span className={styles.compraSaldo}>{formatPrice(a.monto)}</span>
                            </div>
                          ))}
                          {c.aplicaciones.length === 0 && (
                            <p className={styles.hint}>Este cobro no tiene aplicaciones registradas.</p>
                          )}
                          {c.notas && <p className={styles.hint}>Notas: {c.notas}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {cobros.length === 0 && <div className={styles.empty}>No hay cobros registrados.</div>}
      </div>
    </div>
  )
}
