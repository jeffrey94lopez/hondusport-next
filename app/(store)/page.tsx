import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap, toStoreProducto } from '@/lib/store/adapters'
import StoreClient from './StoreClient'

const PRODUCTO_SELECT =
  '*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor)'

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { data } = await supabase.from('configuracion').select('key,value')
  const c = toConfigMap(data ?? [])
  const title = c.site_name + (c.eslogan ? ` | ${c.eslogan}` : '')

  return {
    title,
    description: c.meta_descripcion || undefined,
    openGraph: { title, images: c.og_image_url ? [c.og_image_url] : [] },
  }
}

export default async function StorePage() {
  const supabase = await createClient()
  const [{ data: config }, { data: categorias }, { data: banners }, { data: envios }, { data: cupones }, { data: productos }] =
    await Promise.all([
      supabase.from('configuracion').select('key,value'),
      supabase.from('categorias').select('id, tipo, valor, imagen, categorias_padre, orden, activo').eq('activo', true).order('orden'),
      supabase.from('banners').select('id, titulo, subtitulo, btn_texto, btn_link, imagen, orden, activo').eq('activo', true).order('orden'),
      supabase.from('envios').select('id, nombre, descripcion, tipo, costo, descuento, activo').eq('activo', true),
      supabase.from('cupones').select('id, codigo, descuento, tipo, activo, created_at').eq('activo', true),
      supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true),
    ])

  const configMap = toConfigMap(config ?? [])
  const storeProductos = (productos ?? []).map(toStoreProducto)

  return (
    <StoreClient
      productos={storeProductos}
      categorias={categorias ?? []}
      banners={banners ?? []}
      envios={envios ?? []}
      cupones={cupones ?? []}
      config={configMap}
    />
  )
}
