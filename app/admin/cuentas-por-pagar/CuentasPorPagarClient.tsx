'use client'
import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/store/format'
import { importeLineaCompra } from '@/lib/compras/compras'
import type { BucketAntiguedad, Cliente, CxpFila, EstadoPago } from '@/types'
import PagoModal from './PagoModal'
import { obtenerItemsCompra } from './actions'
import type { ItemsCompra } from './actions'
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

  // D3 — desglose de ítems por compra. `abierta` es la fila desplegada (una a
  // la vez: dos desgloses abiertos a la vez alargan la tabla sin ayudar a
  // comparar). `cache` guarda lo ya traído por compra_id, para que plegar y
  // volver a desplegar no repita la consulta.
  const [abierta, setAbierta] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, ItemsCompra>>({})
  const [cargandoItems, setCargandoItems] = useState<string | null>(null)
  const [errorItems, setErrorItems] = useState<Record<string, string>>({})

  async function alternarDetalle(compraId: string) {
    if (abierta === compraId) {
      setAbierta(null)
      return
    }
    setAbierta(compraId)
    if (cache[compraId]) return
    setCargandoItems(compraId)
    const res = await obtenerItemsCompra(compraId)
    setCargandoItems(null)
    if (res.ok && res.data) {
      setCache(c => ({ ...c, [compraId]: res.data! }))
      // Se borra la clave con `delete` sobre una copia, no con un descarte
      // desestructurado (`const { [id]: _x, ...resto }`): esa variable `_x`
      // queda sin usar y la regla no-unused-vars la reporta.
      setErrorItems(e => {
        if (!(compraId in e)) return e
        const resto = { ...e }
        delete resto[compraId]
        return resto
      })
    } else {
      setErrorItems(e => ({ ...e, [compraId]: res.ok ? 'No se pudo cargar el detalle.' : res.error }))
    }
  }

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
              <th className={styles.colDetalle}></th>
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
              <Fragment key={f.compra_id}>
              <tr>
                <td className={styles.colDetalle}>
                  <button
                    type="button"
                    className={styles.btnDetalle}
                    onClick={() => alternarDetalle(f.compra_id)}
                    aria-expanded={abierta === f.compra_id}
                    aria-label={abierta === f.compra_id ? 'Ocultar detalle' : 'Ver detalle'}
                  >
                    {abierta === f.compra_id ? '▾' : '▸'}
                  </button>
                </td>
                {/* D3: CxP no tenía un solo enlace. compra_id ya venía en la
                    fila; el detalle de compra ya existe. */}
                <td className={styles.numero}>
                  <Link href={`/admin/compras/${f.compra_id}`} className={styles.numeroLink}>
                    {f.numero}
                  </Link>
                </td>
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
              {abierta === f.compra_id && (
                <tr className={styles.filaDetalle}>
                  <td colSpan={9}>
                    {cargandoItems === f.compra_id && <div className={styles.detalleEstado}>Cargando detalle…</div>}
                    {errorItems[f.compra_id] && <div className={styles.detalleError}>{errorItems[f.compra_id]}</div>}
                    {cache[f.compra_id] && (
                      cache[f.compra_id].items.length === 0 ? (
                        <div className={styles.detalleEstado}>Esta compra no tiene líneas.</div>
                      ) : (
                        <>
                          {/* Una compra en dólares guarda el costo en USD y el
                              total en Lempiras. Si la tasa falta, costoEnLempiras
                              y totalCompra valen cero los dos: fila y desglose
                              coinciden, pero en cero. Se dice, en vez de dejar
                              una compra real presentada como si no valiera nada. */}
                          {cache[f.compra_id].moneda === 'USD' && (
                            <div className={styles.detalleNota}>
                              {cache[f.compra_id].tasa != null
                                ? `Compra en dólares · tasa L. ${cache[f.compra_id].tasa!.toFixed(2)} por US$1.00`
                                : 'Compra en dólares sin tasa de cambio registrada: los importes no se pueden convertir.'}
                            </div>
                          )}
                          <table className={styles.tablaDetalle}>
                            <thead>
                              <tr>
                                <th>Descripción</th>
                                <th>Ordenada</th>
                                <th>Recibida</th>
                                <th>Costo unitario</th>
                                <th>Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cache[f.compra_id].items.map(it => (
                                <tr key={it.id}>
                                  <td>{it.descripcion}</td>
                                  <td className={styles.num}>{it.cantidad_ordenada}</td>
                                  <td className={styles.num}>{it.cantidad_recibida}</td>
                                  <td className={styles.num}>
                                    {cache[f.compra_id].moneda === 'USD'
                                      ? `US$ ${it.costo_unitario.toFixed(2)}`
                                      : formatPrice(it.costo_unitario)}
                                  </td>
                                  <td className={styles.num}>
                                    {formatPrice(
                                      importeLineaCompra(it, cache[f.compra_id].moneda, cache[f.compra_id].tasa),
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
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
