import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import PosClient from './PosClient'

const PRODUCTO_SELECT =
  '*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor), producto_variantes(*)'

export default async function PosPage() {
  const supabase = await createClient()

  const [
    { data: cajas },
    { data: sesionesAbiertas },
    { data: vendedores },
    { data: metodos },
    { data: productos },
    { data: clientes },
    { data: cais },
    { data: config },
  ] = await Promise.all([
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    supabase.from('vendedores').select('*').eq('activo', true).order('nombre'),
    supabase.from('metodos_pago').select('*').eq('activo', true).order('orden'),
    supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true).in('canal', ['mostrador', 'ambas']),
    supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
    supabase.from('cai_autorizaciones').select('*').eq('activo', true).eq('tipo_documento', '01'),
    supabase.from('configuracion').select('key, value'),
  ])

  return (
    <PosClient
      cajas={cajas ?? []}
      sesionesAbiertas={sesionesAbiertas ?? []}
      vendedores={vendedores ?? []}
      metodos={metodos ?? []}
      productos={productos ?? []}
      clientes={clientes ?? []}
      cais={cais ?? []}
      config={toConfigMap(config ?? [])}
    />
  )
}
