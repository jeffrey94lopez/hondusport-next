import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { saldoCxcDeCliente } from '@/app/admin/cuentas-por-cobrar/actions'
import type { Cliente, Cobro, Compra, Documento, SaldoFavorCliente } from '@/types'
import ClienteFichaView from './ClienteFichaView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Ficha de cliente (P.detalle D1): resumen de identidad + condiciones +
// saldos/documentos/cobros (solo si es_cliente) + compras (solo si
// es_proveedor). `clientes` es una sola tabla para clientes y proveedores
// (es_cliente/es_proveedor son atributos), así que un contacto puede ser
// solo proveedor — de ahí que los bloques de dinero de cliente se OMITAN
// (no se muestren en cero) cuando es_cliente es false; ver ClienteFichaView.
export default async function ClienteFichaPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
  if (!cliente) notFound()

  const esCliente = (cliente as Cliente).es_cliente
  const esProveedor = (cliente as Cliente).es_proveedor

  type DocumentoFila = Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante' | 'estado' | 'total' | 'created_at'>
  type CobroFila = Pick<Cobro, 'id' | 'numero' | 'fecha' | 'metodo' | 'monto' | 'referencia'>
  type CompraFila = Pick<Compra, 'id' | 'numero' | 'fecha' | 'estado' | 'total'>

  // Cada rama condicional se normaliza a `Promise<T[]>` con `.then()` (en vez
  // de dejar la ternaria mezclar el builder de Supabase con un
  // `Promise.resolve({data:[]})`) para que Promise.all infiera un solo tipo
  // por posición y no un union raro entre el resultado real y el stub.
  //
  // `.limit(51)` (no 50): se pide uno de más para poder distinguir "hay
  // exactamente 50" de "hay más de 50" sin una segunda consulta de conteo.
  // Con `.limit(50)` a secas, un cliente con EXACTAMENTE 50 documentos vería
  // el enlace de "ver todo" sin que se haya truncado nada (falso positivo).
  const [saldoCxc, saldoFavorRows, documentosRaw, cobrosRaw, comprasRaw] = await Promise.all([
    esCliente ? saldoCxcDeCliente(id) : Promise.resolve(0),
    supabase
      .from('saldo_favor_clientes')
      .select('cliente_id, saldo')
      .eq('cliente_id', id)
      .limit(1)
      .then(r => (r.data ?? []) as SaldoFavorCliente[]),
    esCliente
      ? supabase
          .from('documentos')
          .select('id, tipo, correlativo, numero_comprobante, estado, total, created_at')
          .eq('cliente_id', id)
          .order('created_at', { ascending: false })
          .limit(51)
          .then(r => (r.data ?? []) as DocumentoFila[])
      : Promise.resolve([] as DocumentoFila[]),
    esCliente
      ? supabase
          .from('cobros')
          .select('id, numero, fecha, metodo, monto, referencia')
          .eq('cliente_id', id)
          .order('fecha', { ascending: false })
          .limit(51)
          .then(r => (r.data ?? []) as CobroFila[])
      : Promise.resolve([] as CobroFila[]),
    esProveedor
      ? supabase
          .from('compras')
          .select('id, numero, fecha, estado, total')
          .eq('proveedor_id', id)
          .order('fecha', { ascending: false })
          .limit(51)
          .then(r => (r.data ?? []) as CompraFila[])
      : Promise.resolve([] as CompraFila[]),
  ])

  const saldoFavor = Number(saldoFavorRows[0]?.saldo ?? 0)

  return (
    <ClienteFichaView
      cliente={cliente as Cliente}
      saldoCxc={saldoCxc}
      saldoFavor={saldoFavor}
      documentos={documentosRaw.slice(0, 50)}
      documentosHayMas={documentosRaw.length > 50}
      cobros={cobrosRaw.slice(0, 50)}
      cobrosHayMas={cobrosRaw.length > 50}
      compras={comprasRaw.slice(0, 50)}
      comprasHayMas={comprasRaw.length > 50}
    />
  )
}
