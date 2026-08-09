'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import type { BucketAntiguedad, Cliente, CxpFila, EstadoPago } from '@/types'
import PagoModal from './PagoModal'
import styles from './cxp.module.css'

interface Props {
  filas: CxpFila[]
  proveedores: Cliente[]
}

const BUCKETS: { key: BucketAntiguedad; label: string }[] = [
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'd1_30', label: '1-30 días' },
  { key: 'd31_60', label: '31-60 días' },
  { key: 'd61_90', label: '61-90 días' },
  { key: 'd90_mas', label: '+90 días' },
]

const ESTADO_LABEL: Record<EstadoPago, string> = {
  pagada: 'Pagada',
  parcial: 'Parcial',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}

// pendiente gris, parcial ámbar, vencida rojo, pagada verde (no debería
// aparecer en el tablero porque solo llegan filas con saldo > 0, pero se mapea
// por completitud).
const ESTADO_BADGE: Record<EstadoPago, string> = {
  pagada: styles.badgeVerde,
  parcial: styles.badgeAmbar,
  pendiente: styles.badgeGris,
  vencida: styles.badgeRojo,
}

const ESTADOS: EstadoPago[] = ['pendiente', 'parcial', 'vencida']

function formatFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—'
}

export default function CuentasPorPagarClient({ filas, proveedores }: Props) {
  const router = useRouter()
  const [proveedorFiltro, setProveedorFiltro] = useState<'todos' | string>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | EstadoPago>('todos')
  // null = cerrado; { modo: 'abono', fila } | { modo: 'global' }
  const [modal, setModal] = useState<{ modo: 'abono'; fila: CxpFila } | { modo: 'global' } | null>(null)

  const totalesPorBucket = useMemo(() => {
    const acc: Record<BucketAntiguedad, number> = {
      por_vencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_mas: 0,
    }
    for (const f of filas) acc[f.bucket] += f.saldo
    return acc
  }, [filas])

  const filtered = useMemo(() => {
    return filas.filter(f => {
      if (proveedorFiltro !== 'todos' && f.proveedor_id !== proveedorFiltro) return false
      if (estadoFiltro !== 'todos' && f.estado !== estadoFiltro) return false
      return true
    })
  }, [filas, proveedorFiltro, estadoFiltro])

  const saldoTotal = useMemo(() => filas.reduce((s, f) => s + f.saldo, 0), [filas])

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Cuentas por pagar</h1>
          <p className={styles.subtitle}>
            {filtered.length} de {filas.length} compras · saldo total {formatPrice(saldoTotal)}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.btnAccion} btnMerlinSecondary`}
            onClick={() => router.push('/admin/cuentas-por-pagar/pagos')}
          >
            Historial de pagos
          </button>
          <button
            className={`${styles.btnAccion} btnMerlinPrimary`}
            onClick={() => setModal({ modo: 'global' })}
          >
            + Nuevo pago
          </button>
        </div>
      </div>

      {/* Resumen de antigüedad */}
      <div className={styles.resumen}>
        {BUCKETS.map(b => (
          <div key={b.key} className={styles.resumenCard}>
            <span className={styles.resumenLabel}>{b.label}</span>
            <span className={styles.resumenMonto}>{formatPrice(totalesPorBucket[b.key])}</span>
          </div>
        ))}
      </div>

      <div className={styles.filtros}>
        <select
          className={styles.filtroSelect}
          value={proveedorFiltro}
          onChange={e => setProveedorFiltro(e.target.value)}
        >
          <option value="todos">Todos los proveedores</option>
          {proveedores.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          className={styles.filtroSelect}
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value as 'todos' | EstadoPago)}
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
          ))}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Proveedor</th>
              <th className={styles.num}>Total</th>
              <th className={styles.num}>Pagado</th>
              <th className={styles.num}>Saldo</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.compra_id}>
                <td className={styles.numero}>{f.numero}</td>
                <td>{f.proveedor_nombre || 'Sin proveedor'}</td>
                <td className={styles.num}>{formatPrice(f.total)}</td>
                <td className={styles.num}>{formatPrice(f.pagado)}</td>
                <td className={`${styles.num} ${styles.saldoCol}`}>{formatPrice(f.saldo)}</td>
                <td className={styles.fechaCol}>{formatFecha(f.fecha_vencimiento)}</td>
                <td>
                  <span className={`${styles.badge} ${ESTADO_BADGE[f.estado]}`}>
                    {ESTADO_LABEL[f.estado]}
                  </span>
                </td>
                <td className={styles.accionCol}>
                  <button
                    className={`${styles.btnAbonar} btnMerlinSecondary`}
                    onClick={() => setModal({ modo: 'abono', fila: f })}
                  >
                    Abonar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {filas.length === 0
              ? 'No hay cuentas por pagar pendientes.'
              : 'No hay compras que coincidan con el filtro.'}
          </div>
        )}
      </div>

      {modal && (
        <PagoModal
          modo={modal.modo}
          fila={modal.modo === 'abono' ? modal.fila : null}
          proveedores={proveedores}
          filas={filas}
          onClose={() => setModal(null)}
          onOk={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
