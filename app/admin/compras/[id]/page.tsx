import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Cliente, CompraSaldo, Producto } from '@/types'
import { obtenerCompra } from '../actions'
import CompraEditor from './CompraEditor'

export const dynamic = 'force-dynamic'

type CxpEditor = { saldo: CompraSaldo; pagos: { numero: string; fecha: string; monto: number }[] } | null

// Fila de `pago_aplicaciones` con `pagos_proveedor` embebido por la FK
// pago_id -> pagos_proveedor(id) (relación a-uno: PostgREST la devuelve como
// objeto, no arreglo).
interface AplicacionRow {
  monto: number
  pagos_proveedor: { numero: string; fecha: string } | null
}

// Saldo y pagos de una compra al crédito guardada, para el bloque de solo
// lectura del editor (CompraCxpBlock). La vista `compra_saldos` solo trae
// compras al crédito no anuladas: si no hay fila, no hay bloque que mostrar
// (compra anulada o aún no guardada).
async function obtenerCxpDeCompra(
  supabase: Awaited<ReturnType<typeof createClient>>,
  compraId: string,
): Promise<CxpEditor> {
  const [{ data: saldoRow }, { data: aplicaciones }] = await Promise.all([
    supabase.from('compra_saldos').select('*').eq('compra_id', compraId).maybeSingle(),
    supabase
      .from('pago_aplicaciones')
      .select('monto, pagos_proveedor(numero, fecha)')
      .eq('compra_id', compraId)
      .order('fecha', { foreignTable: 'pagos_proveedor', ascending: false }),
  ])
  if (!saldoRow) return null

  const pagos = ((aplicaciones ?? []) as unknown as AplicacionRow[])
    .filter(a => a.pagos_proveedor !== null)
    .map(a => ({ numero: a.pagos_proveedor!.numero, fecha: a.pagos_proveedor!.fecha, monto: a.monto }))

  return { saldo: saldoRow as CompraSaldo, pagos }
}

// Editor de compra. Carga los productos activos (con variantes para la
// herencia de costo padre/hijo), los proveedores (contactos con
// es_proveedor=true activos) y la config global. Si el segmento no es 'nueva',
// relee la compra con obtenerCompra — 404 si no existe. La frontera de
// confianza vive en las server actions (guardarCompra recalcula total); aquí
// solo se hidrata el editor. Si la compra es al crédito, también se lee el
// saldo/pagos (POS P4b) para el bloque de solo lectura del editor.
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

  const compraData = compra && compra.ok && compra.data ? compra.data : null
  const cxp: CxpEditor =
    compraData && compraData.condicion_pago === 'credito'
      ? await obtenerCxpDeCompra(supabase, compraData.id)
      : null

  return (
    <CompraEditor
      compra={compraData}
      productos={(productos ?? []) as unknown as Producto[]}
      proveedores={(proveedores ?? []) as unknown as Cliente[]}
      config={toConfigMap(config ?? [])}
      cxp={cxp}
    />
  )
}
