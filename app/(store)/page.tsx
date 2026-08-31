import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap, toStoreProducto } from '@/lib/store/adapters'
import { nombreComercial } from '@/lib/empresa/perfil'
import type { VentasRank } from '@/lib/store/vitrina'
import StoreClient from './StoreClient'

const PRODUCTO_SELECT =
  '*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor), producto_variantes(*)'

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { data } = await supabase.from('configuracion').select('key,value')
  const c = toConfigMap(data ?? [])
  const title = (nombreComercial(c) || 'Hondusport') + (c.eslogan ? ` | ${c.eslogan}` : '')

  return {
    title,
    description: c.meta_descripcion || undefined,
    openGraph: { title, images: c.og_image_url ? [c.og_image_url] : [] },
  }
}

export default async function StorePage() {
  const supabase = await createClient()
  const [{ data: config }, { data: categorias }, { data: banners }, { data: envios }, { data: cupones }, { data: productos }, { data: ventasRankRows, error: ventasRankError }] =
    await Promise.all([
      supabase.from('configuracion').select('key,value'),
      supabase.from('categorias').select('id, tipo, valor, slug, imagen, categorias_padre, orden, activo').eq('activo', true).order('orden'),
      supabase.from('banners').select('id, titulo, subtitulo, btn_texto, btn_link, imagen, orden, activo').eq('activo', true).order('orden'),
      supabase.from('envios').select('id, nombre, descripcion, tipo, costo, descuento, activo').eq('activo', true),
      supabase.from('cupones').select('id, codigo, descuento, tipo, activo, created_at').eq('activo', true),
      // El .order() no fija el orden final -lo hace ordenarVitrina- pero sin el
      // la entrada de la pura es no determinista y los empates dentro de una
      // banda bailarian entre cargas.
      supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true).in('canal', ['tienda', 'ambas']).order('created_at', { ascending: false }),
      // PostgREST no puede embeber una vista sin FK, asi que va como consulta
      // aparte en el mismo Promise.all: una ida y vuelta mas, con dos columnas.
      supabase.from('producto_ventas_rank').select('producto_id, posicion'),
    ])

  if (ventasRankError) {
    // Degradacion silenciosa para el visitante (la banda 2 simplemente
    // desaparece) pero visible en los logs: sin esto, un GRANT perdido o la
    // vista caida no dejan ninguna senal.
    console.error('No se pudo leer producto_ventas_rank; el orden comercial de la portada queda degradado (sin banda 2):', ventasRankError)
  }

  const configMap = toConfigMap(config ?? [])
  const storeProductos = (productos ?? []).map(toStoreProducto)
  const ventasRank: VentasRank = Object.fromEntries(
    (ventasRankRows ?? []).map(v => [String(v.producto_id), Number(v.posicion)]),
  )
  // Instante unico para que ordenarVitrina sea funcion de los datos, no del
  // reloj del observador: string ISO (no Date) para no depender de que el
  // payload RSC serialice Date.
  const ahoraISO = new Date().toISOString()

  return (
    <Suspense fallback={null}>
      <StoreClient
        productos={storeProductos}
        categorias={categorias ?? []}
        banners={banners ?? []}
        envios={envios ?? []}
        cupones={cupones ?? []}
        config={configMap}
        ventasRank={ventasRank}
        ahoraISO={ahoraISO}
      />
    </Suspense>
  )
}
