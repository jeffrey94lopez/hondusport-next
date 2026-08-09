'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import type { Cliente, CompraEstado } from '@/types'
import type { CompraListItem } from './page'
import styles from './compras.module.css'

interface Props {
  compras: CompraListItem[]
  proveedores: Cliente[]
}

const ESTADO_LABEL: Record<CompraEstado, string> = {
  borrador: 'Borrador',
  ordenada: 'Ordenada',
  parcial: 'Parcial',
  recibida: 'Recibida',
  anulada: 'Anulada',
}

// borrador/ordenada gris, parcial ámbar, recibida verde, anulada rojo.
const ESTADO_BADGE: Record<CompraEstado, string> = {
  borrador: styles.badgeGris,
  ordenada: styles.badgeGris,
  parcial: styles.badgeAmbar,
  recibida: styles.badgeVerde,
  anulada: styles.badgeRojo,
}

const ESTADOS: CompraEstado[] = ['borrador', 'ordenada', 'parcial', 'recibida', 'anulada']

function formatFecha(iso: string): string {
  // La fecha es 'YYYY-MM-DD'; se muestra tal cual (día de la compra, sin huso).
  return iso.slice(0, 10)
}

export default function ComprasClient({ compras, proveedores }: Props) {
  const router = useRouter()
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | CompraEstado>('todos')
  const [proveedorFiltro, setProveedorFiltro] = useState<'todos' | string>('todos')

  const filtered = useMemo(() => {
    return compras.filter(c => {
      if (estadoFiltro !== 'todos' && c.estado !== estadoFiltro) return false
      if (proveedorFiltro !== 'todos' && c.proveedor_id !== proveedorFiltro) return false
      return true
    })
  }, [compras, estadoFiltro, proveedorFiltro])

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Compras</h1>
          <p className={styles.subtitle}>{filtered.length} de {compras.length} compras</p>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.btnPrimary} btnMerlinPrimary`}
            onClick={() => router.push('/admin/compras/nueva')}
          >
            + Nueva compra
          </button>
        </div>
      </div>

      <div className={styles.filtros}>
        <select
          className={styles.filtroSelect}
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value as 'todos' | CompraEstado)}
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
          ))}
        </select>
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
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Proveedor</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr
                key={c.id}
                className={styles.rowClickable}
                onClick={() => router.push('/admin/compras/' + c.id)}
              >
                <td className={styles.numero}>{c.numero}</td>
                <td>{c.proveedor_nombre}</td>
                <td>
                  <span className={`${styles.badge} ${ESTADO_BADGE[c.estado]}`}>
                    {ESTADO_LABEL[c.estado]}
                  </span>
                </td>
                <td className={styles.totalCol}>{formatPrice(c.total)}</td>
                <td className={styles.fechaCol}>{formatFecha(c.fecha)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {compras.length === 0 ? 'No hay compras aún.' : 'No hay compras que coincidan con el filtro.'}
          </div>
        )}
      </div>
    </div>
  )
}
