import { createClient } from '@/lib/supabase-server'
import type { Cliente } from '@/types'
import { obtenerReorden } from '../actions'
import ReordenPanel from './ReordenPanel'

export const dynamic = 'force-dynamic'

// Panel de reorden por stock mínimo. obtenerReorden() ya releyó productos y
// variantes activas en el servidor (frontera de confianza: la sugerencia no
// la decide el cliente); aquí solo se cargan los proveedores (contactos con
// es_proveedor=true activos, mismo patrón que el resto de compras) y se
// hidrata el panel.
export default async function ReordenPage() {
  const supabase = await createClient()

  const [reorden, { data: proveedores }] = await Promise.all([
    obtenerReorden(),
    supabase.from('clientes').select('*').eq('es_proveedor', true).eq('activo', true).order('nombre'),
  ])

  const lineas = reorden.ok && reorden.data ? reorden.data : []

  return (
    <ReordenPanel
      lineas={lineas}
      proveedores={(proveedores ?? []) as unknown as Cliente[]}
    />
  )
}
