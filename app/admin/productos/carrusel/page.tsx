import { createClient } from '@/lib/supabase-server'
import CarruselClient from '../CarruselClient'

export default async function CarruselPage() {
  const supabase = await createClient()
  const [{ data: productos }, { data: categorias }, { data: subcategorias }, { data: temporadas }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor), producto_variantes(*)')
      .order('nombre')
      .limit(500),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat').eq('activo', true).order('valor'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat').eq('activo', true).order('valor'),
    supabase.from('categorias').select('id, valor, orden').eq('tipo', 'temporada').eq('activo', true).order('orden'),
  ])

  return (
    <CarruselClient
      productos={productos ?? []}
      categorias={categorias ?? []}
      subcategorias={subcategorias ?? []}
      temporadas={temporadas ?? []}
    />
  )
}
