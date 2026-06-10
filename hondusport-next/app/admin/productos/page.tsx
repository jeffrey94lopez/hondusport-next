import { createClient } from '@/lib/supabase-server'

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
    <div style={{ padding: '1.5rem', color: '#e0e0e0' }}>
      <h1>Productos ({productos?.length ?? 0})</h1>
      <p style={{ color: 'rgba(255,255,255,0.45)' }}>UI se crea en Task 11</p>
    </div>
  )
}
