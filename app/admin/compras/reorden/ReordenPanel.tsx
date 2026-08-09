'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import type { Cliente, ReordenLinea } from '@/types'
import { crearOrdenDesdeReorden, type LineaCompraInput } from '../actions'
import styles from '../compras.module.css'

interface Props {
  lineas: ReordenLinea[]
  proveedores: Cliente[]
}

// Clave estable por línea: producto_id no basta porque un producto con
// variantes activas aporta una línea por variante (mismo patrón de `key` que
// usa CompraEditor para sus líneas).
function claveLinea(l: ReordenLinea): string {
  return `${l.producto_id}:${l.variante_id ?? ''}`
}

export default function ReordenPanel({ lineas, proveedores }: Props) {
  const router = useRouter()

  // Todas las filas empiezan marcadas: son sugerencias ya filtradas por estar
  // bajo el mínimo, así que el caso común es ordenarlas todas.
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(lineas.map(l => [claveLinea(l), true])),
  )
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(lineas.map(l => [claveLinea(l), l.cantidad_sugerida])),
  )
  const [proveedorId, setProveedorId] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seleccionadas = useMemo(() => lineas.filter(l => seleccion[claveLinea(l)]), [lineas, seleccion])
  const todasMarcadas = lineas.length > 0 && seleccionadas.length === lineas.length

  function toggleFila(key: string) {
    setSeleccion(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleTodas() {
    const marcar = !todasMarcadas
    setSeleccion(Object.fromEntries(lineas.map(l => [claveLinea(l), marcar])))
  }

  function cambiarCantidad(key: string, valor: string) {
    const n = Math.floor(Number(valor))
    setCantidades(prev => ({ ...prev, [key]: Number.isFinite(n) && n > 0 ? n : 1 }))
  }

  const puedeCrear = proveedorId !== '' && seleccionadas.length > 0 && !creando

  async function handleCrear() {
    if (!puedeCrear) return
    setCreando(true)
    setError(null)

    const items: LineaCompraInput[] = seleccionadas.map(l => ({
      producto_id: l.producto_id,
      variante_id: l.variante_id,
      descripcion: l.descripcion,
      cantidad_ordenada: cantidades[claveLinea(l)] ?? l.cantidad_sugerida,
      costo_unitario: l.costo ?? 0,
    }))

    const res = await crearOrdenDesdeReorden(items, proveedorId)
    if (!res.ok) {
      setError(res.error)
      setCreando(false)
      return
    }
    router.push('/admin/compras/' + res.data!.id)
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Reorden por stock mínimo</h1>
          <p className={styles.subtitle}>
            {lineas.length} producto{lineas.length === 1 ? '' : 's'} bajo el mínimo
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.btnPrimary} btnMerlinSecondary`}
            onClick={() => router.push('/admin/compras')}
          >
            Volver a compras
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.tableWrap}>
        {lineas.length === 0 ? (
          <div className={styles.empty}>No hay productos por debajo del stock mínimo.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={todasMarcadas} onChange={toggleTodas} aria-label="Marcar todas" />
                </th>
                <th>Descripción</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Cantidad a ordenar</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(l => {
                const key = claveLinea(l)
                const marcada = !!seleccion[key]
                return (
                  <tr key={key}>
                    <td>
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={() => toggleFila(key)}
                        aria-label={`Marcar ${l.descripcion}`}
                      />
                    </td>
                    <td>{l.descripcion}</td>
                    <td>{l.stock}</td>
                    <td>{l.stock_minimo}</td>
                    <td>
                      <input
                        type="number"
                        className={styles.qtyInput}
                        min={1}
                        step="1"
                        value={cantidades[key] ?? l.cantidad_sugerida}
                        onChange={e => cambiarCantidad(key, e.target.value)}
                        disabled={!marcada}
                        aria-label={`Cantidad a ordenar para ${l.descripcion}`}
                      />
                    </td>
                    <td>{l.costo != null ? formatPrice(l.costo) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {lineas.length > 0 && (
        <div className={styles.reordenFooter}>
          <select
            className={styles.filtroSelect}
            value={proveedorId}
            onChange={e => setProveedorId(e.target.value)}
          >
            <option value="">Selecciona un proveedor…</option>
            {proveedores.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <button
            className={`${styles.btnPrimary} btnMerlinPrimary`}
            disabled={!puedeCrear}
            onClick={handleCrear}
          >
            {creando ? 'Creando…' : 'Crear orden de compra'}
          </button>
        </div>
      )}
    </div>
  )
}
