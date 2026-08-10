'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import { etiquetaTipoMovimiento } from '@/lib/inventario/kardex'
import type { MovimientoResuelto } from '@/types'
import HojaKardex from './HojaKardex'
import styles from './kardex.module.css'

export interface ProductoKardexInfo {
  id: string
  nombre: string
  sku: string | null
  stock: number | null
  costo: number | null
}

export interface VarianteKardexInfo {
  id: string
  nombre: string
  stock: number | null
  costo: number | null
}

interface Props {
  productoId: string
  varianteIdActual: string | null
  producto: ProductoKardexInfo
  variante: VarianteKardexInfo | null
  variantes: { id: string; nombre: string }[]
  movimientos: MovimientoResuelto[]
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}

// Color por el signo real de `cantidad` de la fila (no por la `direccion` de
// etiquetaTipoMovimiento): un mismo tipo puede entrar o salir según el caso
// (p. ej. un ajuste), así que el color en pantalla sigue lo que el usuario
// realmente ve en esa fila — pedido explícito del brief.
function claseTipo(cantidad: number): string {
  if (cantidad > 0) return styles.tipoEntrada
  if (cantidad < 0) return styles.tipoSalida
  return styles.tipoNeutro
}
function claseCantidad(cantidad: number): string {
  if (cantidad > 0) return styles.cantidadPositiva
  if (cantidad < 0) return styles.cantidadNegativa
  return styles.cantidadNeutra
}

// Vista en pantalla del kardex de un ítem (sigue el tema oscuro, tokens de
// app/merlin.css) + conmutador a la hoja imprimible (fondo blanco/tinta fija,
// no sigue el tema — ver HojaKardex). El botón "Imprimir" no llama
// window.print() directamente: monta la hoja, que trae su propia barra con el
// botón real de impresión (mismo criterio que EstadoCuentaClienteView, CxC).
//
// `movimientos` llega en orden ascendente con el saldo corrido ya calculado
// (obtenerMovimientosItem); el toggle de orden solo invierte el array para
// mostrar — el saldo de cada fila no se recalcula.
export default function MovimientosItemView({
  productoId,
  varianteIdActual,
  producto,
  variante,
  variantes,
  movimientos,
}: Props) {
  const router = useRouter()
  const [orden, setOrden] = useState<'desc' | 'asc'>('desc')
  const [modoImpresion, setModoImpresion] = useState(false)

  if (modoImpresion) {
    return (
      <HojaKardex
        producto={producto}
        variante={variante}
        movimientos={movimientos}
        onVolver={() => setModoImpresion(false)}
      />
    )
  }

  const stockActual = variante ? variante.stock : producto.stock
  const costoActual = variante ? variante.costo : producto.costo
  const sku = movimientos[0]?.sku ?? producto.sku
  const titulo = variante ? `${producto.nombre} — ${variante.nombre}` : producto.nombre

  const movimientosMostrados = orden === 'asc' ? movimientos : [...movimientos].reverse()

  function handleVarianteChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const url = val
      ? `/admin/productos/${productoId}/movimientos?variante=${val}`
      : `/admin/productos/${productoId}/movimientos`
    router.push(url)
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Kardex · {titulo}</h1>
          <p className={styles.subtitle}>
            {movimientos.length} movimiento{movimientos.length === 1 ? '' : 's'} registrado
            {movimientos.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/productos" className={`${styles.btnAccion} btnMerlinSecondary`}>
            ← Productos
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

      <div className={styles.itemCard}>
        {sku && <span className={styles.itemDato}><strong>SKU:</strong> {sku}</span>}
        <span className={styles.itemDato}><strong>Stock actual:</strong> {stockActual ?? '∞'}</span>
        <span className={styles.itemDato}>
          <strong>Costo actual:</strong> {costoActual != null ? formatPrice(costoActual) : '—'}
        </span>
      </div>

      {variantes.length > 0 && (
        <div className={styles.selectorRow}>
          <label className={styles.selectorLabel} htmlFor="selector-variante">Variante:</label>
          <select
            id="selector-variante"
            className={styles.selector}
            value={varianteIdActual ?? ''}
            onChange={handleVarianteChange}
          >
            <option value="">Producto (sin variante)</option>
            {variantes.map(v => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.tableToolbar}>
        <h2 className={styles.sectionTitle}>Movimientos</h2>
        <button
          type="button"
          className={`${styles.btnAccion} btnMerlinTertiary`}
          onClick={() => setOrden(o => (o === 'desc' ? 'asc' : 'desc'))}
        >
          {orden === 'desc' ? 'Más antiguo primero ↑' : 'Más reciente primero ↓'}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha/hora</th>
              <th>Tipo</th>
              <th className={styles.num}>Cantidad</th>
              <th className={styles.num}>Saldo</th>
              <th className={styles.num}>Costo unit.</th>
              <th className={styles.num}>Costo result.</th>
              <th>Referencia</th>
              <th>Usuario</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {movimientosMostrados.map(m => {
              const tipoInfo = etiquetaTipoMovimiento(m.tipo)
              return (
                <tr key={m.id}>
                  <td className={styles.fechaCol}>{formatFechaHora(m.created_at)}</td>
                  <td>
                    <span className={`${styles.tipo} ${claseTipo(m.cantidad)}`}>{tipoInfo.nombre}</span>
                  </td>
                  <td className={`${styles.num} ${claseCantidad(m.cantidad)}`}>
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </td>
                  <td className={styles.num}>{m.saldo ?? '—'}</td>
                  <td className={styles.num}>{m.costo_unitario != null ? formatPrice(m.costo_unitario) : '—'}</td>
                  <td className={styles.num}>{m.costo_resultante != null ? formatPrice(m.costo_resultante) : '—'}</td>
                  <td>
                    {m.ref_href ? (
                      <Link href={m.ref_href} className={styles.referenciaLink}>{m.ref_etiqueta}</Link>
                    ) : (
                      m.ref_etiqueta
                    )}
                  </td>
                  <td>{m.usuario ?? '—'}</td>
                  <td className={styles.notasCol}>{m.notas ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {movimientos.length === 0 && (
          <div className={styles.empty}>Este ítem no tiene movimientos registrados.</div>
        )}
      </div>

      <p className={styles.nota}>
        El saldo corrido reconcilia con el stock desde la puesta en marcha del kardex; ítems con
        stock previo pueden diferir.
      </p>
    </div>
  )
}
