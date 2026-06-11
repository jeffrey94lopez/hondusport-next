import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap, toStoreProducto } from '@/lib/store/adapters'
import StoreHeader from '@/components/store/StoreHeader'
import Footer from '@/components/store/Footer'
import ProductDetail from '@/components/store/ProductDetail'

const PRODUCTO_SELECT =
  '*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor)'
const RELACIONADOS_LIMIT = 2

interface ProductPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: config }, { data: producto }] = await Promise.all([
    supabase.from('configuracion').select('key,value'),
    supabase.from('productos').select('nombre, descripcion, imagenes').eq('id', id).maybeSingle(),
  ])

  if (!producto) return {}

  const configMap = toConfigMap(config ?? [])
  const title = `${producto.nombre} | ${configMap.site_name || 'Hondu Sport'}`
  const ogImage = producto.imagenes?.[0]

  return {
    title,
    description: producto.descripcion ?? undefined,
    openGraph: {
      title,
      description: producto.descripcion ?? undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: config }, { data: categorias }, { data: producto }, { data: productos }] = await Promise.all([
    supabase.from('configuracion').select('key,value'),
    supabase
      .from('categorias')
      .select('id, tipo, valor, imagen, categorias_padre, orden, activo')
      .eq('activo', true)
      .order('orden'),
    supabase.from('productos').select(PRODUCTO_SELECT).eq('id', id).eq('activo', true).maybeSingle(),
    supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true),
  ])

  if (!producto) notFound()

  const configMap = toConfigMap(config ?? [])
  const storeProducto = toStoreProducto(producto)
  const allProductos = (productos ?? []).map(toStoreProducto)
  const relacionados = allProductos
    .filter(p => p.cat === storeProducto.cat && p.id !== storeProducto.id)
    .slice(0, RELACIONADOS_LIMIT)

  const catsNav = (categorias ?? []).filter(c => c.tipo === 'cat')
  const tallaFiltros = (categorias ?? []).filter(c => c.tipo === 'talla')

  return (
    <>
      <StoreHeader logoUrl={configMap.logo_url} categorias={catsNav} />
      <main style={{ padding: '2rem', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
        <ProductDetail
          key={storeProducto.id}
          producto={storeProducto}
          relacionados={relacionados}
          tallaFiltros={tallaFiltros}
          allProductos={allProductos}
          siteName={configMap.site_name}
        />
      </main>
      <Footer config={configMap} categorias={catsNav} />
    </>
  )
}
