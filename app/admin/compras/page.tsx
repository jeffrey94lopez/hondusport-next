import { createClient } from '@/lib/supabase-server'
import type { Compra, Cliente } from '@/types'
import ComprasClient from './ComprasClient'

export const dynamic = 'force-dynamic'

// Embed real del proveedor: FK simple (to-one) desde compras.proveedor_id ->
// clientes, PostgREST devuelve un OBJETO por fila (mismo patrón documentado en
// app/admin/cotizaciones/page.tsx para cliente/vendedor).
interface CompraRow extends Compra {
  proveedor: { nombre: string } | null
}

export interface CompraListItem extends Compra {
  proveedor_nombre: string
}

export default async function ComprasPage() {
  const supabase = await createClient()

  const [{ data: comprasData }, { data: proveedores }] = await Promise.all([
    supabase
      .from('compras')
      .select('*, proveedor:clientes(nombre)')
      .order('created_at', { ascending: false }),
    supabase
      .from('clientes')
      .select('*')
      .eq('es_proveedor', true)
      .eq('activo', true)
      .order('nombre'),
  ])

  const compras: CompraListItem[] = ((comprasData ?? []) as unknown as CompraRow[]).map(
    ({ proveedor, ...c }) => ({
      ...c,
      total: Number(c.total),
      proveedor_nombre: proveedor?.nombre ?? 'Sin proveedor',
    }),
  )

  return (
    <ComprasClient compras={compras} proveedores={(proveedores ?? []) as unknown as Cliente[]} />
  )
}
