import { createClient } from '@/lib/supabase-server'
import ProductosClient from './ProductosClient'

export default async function ProductosPage() {
  const supabase = await createClient()
  const [{ data: productos }, { data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor)')
      .order('nombre')
      .limit(500),
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
    <ProductosClient
      productos={productos ?? []}
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
    />
  )
}
