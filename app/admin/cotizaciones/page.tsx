import { createClient } from '@/lib/supabase-server'
import type { Cotizacion, CotizacionEtapa, Vendedor } from '@/types'
import KanbanBoard from './KanbanBoard'

export const dynamic = 'force-dynamic'

// Embed real de clientes/vendedores: FK simple (to-one) desde
// cotizaciones.cliente_id/vendedor_id, PostgREST devuelve un OBJETO por fila
// (mismo caso documentado en app/admin/pos/documentos/page.tsx para cajas).
interface CotizacionRow extends Cotizacion {
  cliente: { nombre: string } | null
  vendedor: { nombre: string } | null
}

// cliente_nombre ya viene denormalizado en la fila (snapshot al guardar, ver
// guardarCotizacion en ./actions.ts); se prioriza el nombre vivo del embed
// por si el cliente cambió de nombre después, con el snapshot como respaldo
// para cotizaciones sin cliente_id (nombre libre).
export interface CotizacionKanbanItem extends Cotizacion {
  cliente_display: string
  vendedor_nombre: string | null
}

export default async function CotizacionesPage() {
  const supabase = await createClient()

  const [{ data: etapas }, { data: cotizacionesData }, { data: vendedores }] = await Promise.all([
    supabase.from('cotizacion_etapas').select('*').order('orden'),
    supabase
      .from('cotizaciones')
      .select('*, cliente:clientes(nombre), vendedor:vendedores(nombre)')
      .order('updated_at', { ascending: false }),
    supabase.from('vendedores').select('*').eq('activo', true).order('nombre'),
  ])

  const cotizaciones: CotizacionKanbanItem[] = ((cotizacionesData ?? []) as unknown as CotizacionRow[]).map(
    ({ cliente, vendedor, ...c }) => ({
      ...c,
      total: Number(c.total),
      cliente_display: cliente?.nombre ?? c.cliente_nombre ?? 'Sin cliente',
      vendedor_nombre: vendedor?.nombre ?? null,
    }),
  )

  return (
    <KanbanBoard
      etapas={(etapas ?? []) as CotizacionEtapa[]}
      cotizaciones={cotizaciones}
      vendedores={(vendedores ?? []) as Vendedor[]}
    />
  )
}
