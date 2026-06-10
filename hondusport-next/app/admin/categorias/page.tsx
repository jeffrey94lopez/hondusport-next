import { createClient } from '@/lib/supabase-server'
import CategoriasClient from './CategoriasClient'

export default async function CategoriasPage() {
  const supabase = await createClient()
  const { data: categorias } = await supabase
    .from('categorias')
    .select('*')
    .order('orden', { ascending: true })

  return <CategoriasClient categorias={categorias ?? []} />
}
