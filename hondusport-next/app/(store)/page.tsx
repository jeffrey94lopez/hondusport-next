import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import StoreHeader from '@/components/store/StoreHeader'
import HeroCarousel from '@/components/store/HeroCarousel'
import CategoryBar from '@/components/store/CategoryBar'
import CategoryGallery from '@/components/store/CategoryGallery'
import Footer from '@/components/store/Footer'

export default async function StorePage() {
  const supabase = await createClient()
  const [{ data: config }, { data: categorias }, { data: subcategorias }, { data: banners }] = await Promise.all([
    supabase.from('configuracion').select('key,value'),
    supabase
      .from('categorias')
      .select('id, tipo, valor, imagen, categorias_padre, orden, activo')
      .eq('tipo', 'cat')
      .eq('activo', true)
      .order('orden'),
    supabase
      .from('categorias')
      .select('id, tipo, valor, imagen, categorias_padre, orden, activo')
      .eq('tipo', 'subcat')
      .eq('activo', true)
      .order('orden'),
    supabase
      .from('banners')
      .select('id, titulo, subtitulo, btn_texto, btn_link, imagen, orden, activo')
      .eq('activo', true)
      .order('orden'),
  ])

  const configMap = toConfigMap(config ?? [])

  return (
    <>
      <StoreHeader logoUrl={configMap.logo_url} categorias={categorias ?? []} />
      <HeroCarousel banners={banners ?? []} />
      <CategoryBar cats={categorias ?? []} subcats={subcategorias ?? []} />
      <CategoryGallery cats={categorias ?? []} />
      <main style={{ padding: '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
        <h1>Hondusport</h1>
        <p>Tienda en construcción.</p>
      </main>
      <Footer config={configMap} categorias={categorias ?? []} />
    </>
  )
}
