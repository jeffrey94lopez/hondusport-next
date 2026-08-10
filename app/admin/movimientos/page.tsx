import { redirect } from 'next/navigation'
import { obtenerMovimientosGlobal } from './actions'
import MovimientosGlobalClient from './MovimientosGlobalClient'
import type { FiltrosMovimientos, MovimientoTipo } from '@/types'

export const dynamic = 'force-dynamic'

// Mismo tamaño de página que `MovimientosGlobalClient.tsx` (su PAGE_SIZE, usado
// para el rótulo "página X de N") y que el `range()` de
// `obtenerMovimientosGlobal` en ./actions.ts. No se importa el de
// MovimientosGlobalClient: es un módulo 'use client', y Next.js reescribe TODOS
// sus exports (no solo componentes) como stubs que lanzan si se invocan del
// server — aquí no se invocarían, pero el valor dejaría de ser el número 50 y
// `Math.ceil(total / PAGE_SIZE)` degradaría a NaN en silencio. Si cambia el
// tamaño de página, hay que actualizar los tres lugares.
const PAGE_SIZE = 50

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

  // `pagina` fuera de rango (p. ej. editada a mano en la URL, o filtros que
  // redujeron el total tras haber avanzado varias páginas) dejaría la tabla
  // vacía con un rótulo "página X de N" que no coincide (fix round 1, Task 5):
  // se redirige a la última página válida para ese `total`.
  const ultimaPaginaValida = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  if (pagina > ultimaPaginaValida) {
    const params = new URLSearchParams()
    if (sp.tipo) params.set('tipo', sp.tipo)
    if (sp.desde) params.set('desde', sp.desde)
    if (sp.hasta) params.set('hasta', sp.hasta)
    if (sp.producto) params.set('producto', sp.producto)
    if (sp.usuario) params.set('usuario', sp.usuario)
    if (ultimaPaginaValida > 0) params.set('pagina', String(ultimaPaginaValida))
    const qs = params.toString()
    redirect(qs ? `/admin/movimientos?${qs}` : '/admin/movimientos')
  }

  return (
    <MovimientosGlobalClient
      movimientos={movimientos}
      total={total}
      filtros={filtros}
      pagina={pagina}
    />
  )
}
