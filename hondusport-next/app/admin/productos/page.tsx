import { createClient } from '@/lib/supabase-server'
import ProductosClient from './ProductosClient'

export default async function ProductosPage() {
  const supabase = await createClient()
  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias(valor)')
      .order('nombre')
      .limit(500),
    supabase
      .from('categorias')
      .select('id, valor')
      .eq('tipo', 'cat')
      .eq('activo', true)
      .order('valor'),
  ])

  return (
    <ProductosClient
      productos={productos ?? []}
      categorias={categorias ?? []}
    />
  )
}
