'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/store/format'
import { etiquetaTipoMovimiento } from '@/lib/inventario/kardex'
import type { MovimientoResuelto, FiltrosMovimientos, MovimientoTipo } from '@/types'
import styles from './movimientos.module.css'

const PAGE_SIZE = 50

const TODOS_LOS_TIPOS: MovimientoTipo[] = [
  'entrada', 'inicial', 'compra', 'devolucion', 'reposicion_cancelacion',
  'venta_pos', 'venta_web', 'ajuste', 'conteo',
]

interface Props {
  movimientos: MovimientoResuelto[]
  total: number
  filtros: FiltrosMovimientos
  pagina: number
}

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
function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}

// Pantalla global de movimientos (POS P5b, Task 5): filtros + tabla + paginación.
// Los filtros viven en la query string (page.tsx los lee y relee la BD vía
// obtenerMovimientosGlobal) — este componente solo mantiene un borrador local
// de los inputs de texto/fecha y hace router.push al aplicar; no filtra en
// cliente. `pagina` que llega/sale de aquí es 0-based (coincide con el
// `range()` de la RPC de lectura); en pantalla se muestra 1-based.
export default function MovimientosGlobalClient({ movimientos, total, filtros, pagina }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState(filtros.tipo ?? '')
  const [desde, setDesde] = useState(filtros.desde ?? '')
  const [hasta, setHasta] = useState(filtros.hasta ?? '')
  const [producto, setProducto] = useState(filtros.producto ?? '')
  const [usuario, setUsuario] = useState(filtros.usuario ?? '')

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const paginaActual = Math.min(pagina, totalPaginas - 1)

  function construirUrl(params: { tipo?: string; desde?: string; hasta?: string; producto?: string; usuario?: string; pagina?: number }) {
    const sp = new URLSearchParams()
    if (params.tipo) sp.set('tipo', params.tipo)
    if (params.desde) sp.set('desde', params.desde)
    if (params.hasta) sp.set('hasta', params.hasta)
    if (params.producto) sp.set('producto', params.producto)
    if (params.usuario) sp.set('usuario', params.usuario)
    if (params.pagina) sp.set('pagina', String(params.pagina))
    const qs = sp.toString()
    return qs ? `/admin/movimientos?${qs}` : '/admin/movimientos'
  }

  function aplicarFiltros(e: React.FormEvent) {
    e.preventDefault()
    router.push(construirUrl({ tipo, desde, hasta, producto, usuario }))
  }

  function limpiarFiltros() {
    setTipo(''); setDesde(''); setHasta(''); setProducto(''); setUsuario('')
    router.push('/admin/movimientos')
  }

  // Paginar conserva EXACTAMENTE los filtros ya aplicados en la URL (prop
  // `filtros`), no el borrador local de los inputs: si el usuario editó un
  // campo sin pulsar "Filtrar", ese cambio no debe colarse al navegar de
  // página (fix round 1, Task 5).
  function irAPagina(nueva: number) {
    router.push(construirUrl({
      tipo: filtros.tipo ?? '',
      desde: filtros.desde ?? '',
      hasta: filtros.hasta ?? '',
      producto: filtros.producto ?? '',
      usuario: filtros.usuario ?? '',
      pagina: nueva,
    }))
  }

  const hayFiltros = Boolean(filtros.tipo || filtros.desde || filtros.hasta || filtros.producto || filtros.usuario)

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Movimientos de inventario</h1>
          <p className={styles.subtitle}>{total} movimiento{total === 1 ? '' : 's'} registrado{total === 1 ? '' : 's'}</p>
        </div>
      </div>

      <form onSubmit={aplicarFiltros} className={styles.filtros}>
        <div className={styles.filtroCampo}>
          <label className={styles.filtroLabel} htmlFor="filtro-tipo">Tipo</label>
          <select
            id="filtro-tipo"
            className={styles.filtroSelect}
            value={tipo}
            onChange={e => setTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {TODOS_LOS_TIPOS.map(t => (
              <option key={t} value={t}>{etiquetaTipoMovimiento(t).nombre}</option>
            ))}
          </select>
        </div>

        <div className={styles.filtroCampo}>
          <label className={styles.filtroLabel} htmlFor="filtro-desde">Desde</label>
          <input
            id="filtro-desde"
            type="date"
            className={styles.filtroInput}
            value={desde}
            onChange={e => setDesde(e.target.value)}
          />
        </div>

        <div className={styles.filtroCampo}>
          <label className={styles.filtroLabel} htmlFor="filtro-hasta">Hasta</label>
          <input
            id="filtro-hasta"
            type="date"
            className={styles.filtroInput}
            value={hasta}
            onChange={e => setHasta(e.target.value)}
          />
        </div>

        <div className={styles.filtroCampo}>
          <label className={styles.filtroLabel} htmlFor="filtro-producto">Producto</label>
          <input
            id="filtro-producto"
            type="text"
            placeholder="Nombre o SKU…"
            className={styles.filtroInput}
            value={producto}
            onChange={e => setProducto(e.target.value)}
          />
        </div>

        <div className={styles.filtroCampo}>
          <label className={styles.filtroLabel} htmlFor="filtro-usuario">Usuario</label>
          <input
            id="filtro-usuario"
            type="text"
            placeholder="Correo o nombre…"
            className={styles.filtroInput}
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
          />
        </div>

        <div className={styles.filtroAcciones}>
          <button type="submit" className={`${styles.btnFiltro} btnMerlinPrimary`}>Filtrar</button>
          {hayFiltros && (
            <button type="button" className={`${styles.btnFiltro} btnMerlinTertiary`} onClick={limpiarFiltros}>
              Limpiar
            </button>
          )}
        </div>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha/hora</th>
              <th>Producto / variante</th>
              <th>Tipo</th>
              <th className={styles.num}>Cantidad</th>
              <th className={styles.num}>Costo</th>
              <th>Referencia</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => {
              const tipoInfo = etiquetaTipoMovimiento(m.tipo)
              const hrefItem = m.variante_id
                ? `/admin/productos/${m.producto_id}/movimientos?variante=${m.variante_id}`
                : `/admin/productos/${m.producto_id}/movimientos`
              return (
                <tr key={m.id}>
                  <td className={styles.fechaCol}>{formatFechaHora(m.created_at)}</td>
                  <td>
                    <Link href={hrefItem} className={styles.productoLink}>
                      {m.producto_nombre}{m.variante_nombre ? ` — ${m.variante_nombre}` : ''}
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.tipo} ${claseTipo(m.cantidad)}`}>{tipoInfo.nombre}</span>
                  </td>
                  <td className={`${styles.num} ${claseCantidad(m.cantidad)}`}>
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </td>
                  <td className={styles.num}>
                    {m.costo_unitario != null ? formatPrice(m.costo_unitario) : '—'}
                  </td>
                  <td>
                    {m.ref_href ? (
                      <Link href={m.ref_href} className={styles.referenciaLink}>{m.ref_etiqueta}</Link>
                    ) : (
                      m.ref_etiqueta
                    )}
                  </td>
                  <td>{m.usuario ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {movimientos.length === 0 && (
          <div className={styles.empty}>
            {hayFiltros ? 'No hay movimientos que coincidan con los filtros.' : 'No hay movimientos registrados.'}
          </div>
        )}
      </div>

      {total > 0 && (
        <div className={styles.paginacion}>
          <button
            className={`${styles.pagBtn} btnMerlinTertiary`}
            disabled={paginaActual <= 0}
            onClick={() => irAPagina(paginaActual - 1)}
          >
            ← Anterior
          </button>
          <span className={styles.pagInfo}>Página {paginaActual + 1} de {totalPaginas}</span>
          <button
            className={`${styles.pagBtn} btnMerlinTertiary`}
            disabled={paginaActual >= totalPaginas - 1}
            onClick={() => irAPagina(paginaActual + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
