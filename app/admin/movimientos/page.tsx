import { obtenerMovimientosGlobal } from './actions'
import MovimientosGlobalClient from './MovimientosGlobalClient'
import type { FiltrosMovimientos, MovimientoTipo } from '@/types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    tipo?: string
    desde?: string
    hasta?: string
    producto?: string
    usuario?: string
    pagina?: string
  }>
}

// Pantalla global de movimientos (POS P5b, Task 5): lee los filtros y la
// página de la query string, relee vía `obtenerMovimientosGlobal` (Task 3, ya
// resuelve producto/variante/referencia) y le pasa el resultado al client. La
// query string es la única fuente de verdad del estado — MovimientosGlobalClient
// navega con router.push, no guarda los filtros en useState.
export default async function MovimientosGlobalPage({ searchParams }: Props) {
  const sp = await searchParams
  const pagina = Math.max(0, Number(sp.pagina ?? '0') || 0)

  const filtros: FiltrosMovimientos = {
    tipo: (sp.tipo as MovimientoTipo) || null,
    desde: sp.desde || null,
    hasta: sp.hasta || null,
    producto: sp.producto || null,
    usuario: sp.usuario || null,
  }

  const result = await obtenerMovimientosGlobal(filtros, pagina)
  const movimientos = result.ok && result.data ? result.data.movimientos : []
  const total = result.ok && result.data ? result.data.total : 0

  return (
    <MovimientosGlobalClient
      movimientos={movimientos}
      total={total}
      filtros={filtros}
      pagina={pagina}
    />
  )
}
