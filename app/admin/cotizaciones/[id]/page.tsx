import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Cliente, Vendedor, Producto, CotizacionEtapa } from '@/types'
import { obtenerCotizacion } from '../actions'
import CotizacionEditor from './CotizacionEditor'

export const dynamic = 'force-dynamic'

// Editor de cotización. Carga el catálogo de mostrador (con variantes para la
// herencia padre/hijo de precioLineaPos), clientes/vendedores activos, las
// etapas del embudo y la config global. Si el segmento no es 'nueva', relee la
// cotización con obtenerCotizacion (mismo cargador que el PDF) — 404 si no
// existe. La frontera de confianza vive en la server action guardarCotizacion;
// aquí solo se hidrata el editor.
export default async function EditorCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: productos }, { data: clientes }, { data: vendedores }, { data: etapas }, { data: config }] =
    await Promise.all([
      supabase
        .from('productos')
        .select('*, producto_variantes(*)')
        .eq('activo', true)
        .in('canal', ['mostrador', 'ambas']),
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('vendedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('cotizacion_etapas').select('*').eq('activo', true).order('orden'),
      supabase.from('configuracion').select('key, value'),
    ])

  const cot = id === 'nueva' ? null : await obtenerCotizacion(id)
  if (id !== 'nueva' && (!cot || !cot.ok)) notFound()

  return (
    <CotizacionEditor
      cotizacion={cot && cot.ok && cot.data ? cot.data : null}
      productos={(productos ?? []) as unknown as Producto[]}
      clientes={(clientes ?? []) as unknown as Cliente[]}
      vendedores={(vendedores ?? []) as unknown as Vendedor[]}
      etapas={(etapas ?? []) as unknown as CotizacionEtapa[]}
      config={toConfigMap(config ?? [])}
    />
  )
}
