import { createClient } from '@/lib/supabase-server'
import type { Categoria } from '@/types'
import { obtenerTomas } from './actions'
import InventarioClient from './InventarioClient'

export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  const supabase = await createClient()

  const [tomas, { data: categorias }, { data: subcategorias }] = await Promise.all([
    obtenerTomas(),
    // Mismo patrón que app/admin/productos/page.tsx: categorias es polimórfica
    // por `tipo`, solo se traen las activas para el selector de alcance.
    supabase
      .from('categorias')
      .select('id, valor')
      .eq('tipo', 'cat')
      .eq('activo', true)
      .order('valor'),
    supabase
      .from('categorias')
      .select('id, valor, categorias_padre')
      .eq('tipo', 'subcat')
      .eq('activo', true)
      .order('valor'),
  ])

  return (
    <InventarioClient
      tomas={tomas.ok ? tomas.data ?? [] : []}
      categorias={(categorias ?? []) as Pick<Categoria, 'id' | 'valor'>[]}
      subcategorias={(subcategorias ?? []) as Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]}
    />
  )
}
