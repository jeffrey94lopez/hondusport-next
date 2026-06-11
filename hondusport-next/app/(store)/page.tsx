import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import StoreHeader from '@/components/store/StoreHeader'

export default async function StorePage() {
  const supabase = await createClient()
  const [{ data: config }, { data: categorias }] = await Promise.all([
    supabase.from('configuracion').select('key,value'),
    supabase
      .from('categorias')
      .select('id, tipo, valor, imagen, categorias_padre, orden, activo')
      .eq('tipo', 'cat')
      .eq('activo', true)
      .order('orden'),
  ])

  const configMap = toConfigMap(config ?? [])

  return (
    <>
      <StoreHeader logoUrl={configMap.logo_url} categorias={categorias ?? []} />
      <main style={{ padding: '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
        <h1>Hondusport</h1>
        <p>Tienda en construcción.</p>
      </main>
    </>
  )
}
