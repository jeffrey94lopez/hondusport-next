import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Cliente, Producto } from '@/types'
import { obtenerCompra } from '../actions'
import CompraEditor from './CompraEditor'

export const dynamic = 'force-dynamic'

// Editor de compra. Carga los productos activos (con variantes para la
// herencia de costo padre/hijo), los proveedores (contactos con
// es_proveedor=true activos) y la config global. Si el segmento no es 'nueva',
// relee la compra con obtenerCompra — 404 si no existe. La frontera de
// confianza vive en las server actions (guardarCompra recalcula total); aquí
// solo se hidrata el editor.
export default async function EditorCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: productos }, { data: proveedores }, { data: config }] = await Promise.all([
    supabase.from('productos').select('*, producto_variantes(*)').eq('activo', true).order('nombre'),
    supabase.from('clientes').select('*').eq('es_proveedor', true).eq('activo', true).order('nombre'),
    supabase.from('configuracion').select('key, value'),
  ])

  const compra = id === 'nueva' ? null : await obtenerCompra(id)
  if (id !== 'nueva' && (!compra || !compra.ok)) notFound()

  return (
    <CompraEditor
      compra={compra && compra.ok && compra.data ? compra.data : null}
      productos={(productos ?? []) as unknown as Producto[]}
      proveedores={(proveedores ?? []) as unknown as Cliente[]}
      config={toConfigMap(config ?? [])}
    />
  )
}
