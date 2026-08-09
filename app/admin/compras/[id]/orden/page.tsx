import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { obtenerCompra } from '../../actions'
import CompraOrdenView from './CompraOrdenView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Orden de compra imprimible (patrón "HTML + CSS de impresión", igual que el
// papel fiscal del POS — ver app/admin/pos/documento/[id]/page.tsx). Relee la
// compra completa (proveedor + líneas ya con precios recalculados por
// guardarCompra) y la config de empresa/logo; esta página solo imprime, no
// decide datos.
export default async function CompraOrdenPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [compra, { data: config }] = await Promise.all([
    obtenerCompra(id),
    supabase.from('configuracion').select('key, value'),
  ])

  if (!compra.ok || !compra.data) notFound()

  return <CompraOrdenView compra={compra.data} config={toConfigMap(config ?? [])} />
}
