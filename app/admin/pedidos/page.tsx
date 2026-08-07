import { createClient } from '@/lib/supabase-server'
import type { Caja, Cliente } from '@/types'
import PedidosClient from './PedidosClient'

// Documento vigente (emitido, no anulado) vinculado a un pedido web — se usa
// para decidir si la fila del pedido muestra "Ver <número>" o el botón
// "Emitir documento". Solo los campos que la UI necesita para el número
// mostrado (mismo formato que DocumentosClient: correlativo o C-NNNNNNNN).
export interface DocumentoVigentePedido {
  id: string
  pedido_id: string
  tipo: 'factura' | 'comprobante'
  correlativo: string | null
  numero_comprobante: number | null
}

export default async function PedidosPage() {
  const supabase = await createClient()

  const [
    { data: pedidos },
    { data: documentosVigentes },
    { data: cajas },
    { data: clientes },
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, pedido_items(*)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('documentos')
      .select('id, pedido_id, tipo, correlativo, numero_comprobante, estado')
      .not('pedido_id', 'is', null)
      .eq('estado', 'emitido'),
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
  ])

  const documentosPorPedido: Record<string, DocumentoVigentePedido> = {}
  for (const d of documentosVigentes ?? []) {
    if (d.pedido_id) documentosPorPedido[d.pedido_id] = d
  }

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      documentosPorPedido={documentosPorPedido}
      cajas={(cajas ?? []) as Caja[]}
      clientes={(clientes ?? []) as Cliente[]}
    />
  )
}
