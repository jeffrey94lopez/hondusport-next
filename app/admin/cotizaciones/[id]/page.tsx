import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Cliente, Vendedor, Producto, CotizacionEtapa } from '@/types'
import { obtenerCotizacion } from '../actions'
import CotizacionEditor from './CotizacionEditor'
import type { DocumentoEnlace } from './CotizacionEditor'

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

  // D3: si la cotización ya fue facturada, se trae lo mínimo del documento
  // para que el badge "Facturada" pueda enlazar a él con su número real
  // (numeroDocumento cubre los cuatro tipos desde D1). Solo cuatro columnas:
  // el editor no necesita nada más del documento.
  const documentoId = cot && cot.ok && cot.data ? cot.data.documento_id : null
  const { data: documentoRow } = documentoId
    ? await supabase
        .from('documentos')
        .select('id, tipo, correlativo, numero_comprobante')
        .eq('id', documentoId)
        .maybeSingle()
    : { data: null }

  return (
    <CotizacionEditor
      cotizacion={cot && cot.ok && cot.data ? cot.data : null}
      documento={documentoRow as DocumentoEnlace | null}
      productos={(productos ?? []) as unknown as Producto[]}
      clientes={(clientes ?? []) as unknown as Cliente[]}
      vendedores={(vendedores ?? []) as unknown as Vendedor[]}
      etapas={(etapas ?? []) as unknown as CotizacionEtapa[]}
      config={toConfigMap(config ?? [])}
    />
  )
}
