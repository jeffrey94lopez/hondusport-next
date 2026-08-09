import { createClient } from '@/lib/supabase-server'
import { obtenerPagos } from '../actions'
import PagosClient from './PagosClient'

export const dynamic = 'force-dynamic'

// Historial de pagos a proveedores. `obtenerPagos` ya trae el nombre del
// proveedor y las aplicaciones (compra_id + monto); para mostrar el número de
// cada compra en el detalle expandible se lee aparte `compra_saldos` (trae
// `numero` de TODAS las compras al crédito no anuladas, sin filtrar por saldo
// > 0 — un pago puede aplicar a una compra ya totalmente pagada) y se mapea
// por compra_id en JS, mismo criterio que `mapaProveedores` en actions.ts.
export default async function PagosPage() {
  const supabase = await createClient()

  const [pagosRes, { data: comprasData }] = await Promise.all([
    obtenerPagos(),
    supabase.from('compra_saldos').select('compra_id, numero'),
  ])

  const pagos = pagosRes.ok ? pagosRes.data ?? [] : []
  const comprasMap = Object.fromEntries(
    (comprasData ?? []).map(c => [c.compra_id as string, c.numero as string]),
  )

  return <PagosClient pagos={pagos} comprasMap={comprasMap} />
}
