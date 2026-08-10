import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { numeroDocumento } from '@/lib/pos/documentos'
import type { Cliente } from '@/types'
import { obtenerEstadoCuentaCliente } from '../../actions'
import { obtenerSaldoFavorCliente, obtenerHistorialSaldoFavor } from '../../saldo-favor-actions'
import EstadoCuentaClienteView, { type MovimientoSaldoFavorConReferencia } from './EstadoCuentaClienteView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Estado de cuenta de un cliente: relee sus documentos con saldo + sus cobros
// (obtenerEstadoCuentaCliente), sus datos (clientes) y la config de
// empresa/logo (para la hoja imprimible). Si el cliente no existe o no es
// cliente, o la consulta falla, 404 — mismo criterio que
// app/admin/cuentas-por-pagar/proveedor/[id]/page.tsx (CxP, espejo).
//
// POS P5b (Task 5): además trae el saldo a favor y su historial. El
// historial (`obtenerHistorialSaldoFavor`) trae movimientos "en crudo"
// (documento_id/cobro_id); aquí se resuelve una `referencia` legible:
// - tipo 'cobro' -> número del cobro (ya viene en `estado.data.cobros`, que
//   trae TODOS los cobros del cliente, incluidos los de saldo_favor).
// - tipo 'devolucion'/'venta' -> número del documento referenciado; ese
//   documento puede no tener saldo pendiente (por eso no está en
//   `estado.data.documentos`, que solo trae documento_saldos con saldo > 0),
//   así que se consulta `documentos` directo por los ids que aparezcan.
export default async function EstadoCuentaClientePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [estado, { data: cliente }, { data: config }, saldoFavor, historialResult] = await Promise.all([
    obtenerEstadoCuentaCliente(id),
    supabase.from('clientes').select('*').eq('id', id).eq('es_cliente', true).maybeSingle(),
    supabase.from('configuracion').select('key, value'),
    obtenerSaldoFavorCliente(id),
    obtenerHistorialSaldoFavor(id),
  ])

  if (!estado.ok || !estado.data || !cliente) notFound()

  const historialRaw = historialResult.ok ? historialResult.data ?? [] : []
  const cobros = estado.data.cobros

  const documentoIds = Array.from(
    new Set(historialRaw.filter(m => m.documento_id).map(m => m.documento_id as string)),
  )
  const { data: documentosRef } =
    documentoIds.length > 0
      ? await supabase
          .from('documentos')
          .select('id, tipo, correlativo, numero_comprobante')
          .in('id', documentoIds)
      : { data: [] as { id: string; tipo: 'factura' | 'comprobante'; correlativo: string | null; numero_comprobante: number | null }[] }

  const mapaDocumentos = new Map((documentosRef ?? []).map(d => [d.id as string, d]))
  const mapaCobros = new Map(cobros.map(c => [c.id, c.numero]))

  const historialSaldoFavor: MovimientoSaldoFavorConReferencia[] = historialRaw.map(m => {
    let referencia = '—'
    if (m.tipo === 'cobro' && m.cobro_id) {
      referencia = mapaCobros.get(m.cobro_id) ?? '—'
    } else if (m.documento_id) {
      const doc = mapaDocumentos.get(m.documento_id)
      referencia = doc ? numeroDocumento(doc as { tipo: 'factura' | 'comprobante'; correlativo: string | null; numero_comprobante: number | null }) : '—'
    }
    return { ...m, referencia }
  })

  return (
    <EstadoCuentaClienteView
      cliente={cliente as unknown as Cliente}
      documentos={estado.data.documentos}
      cobros={cobros}
      totalAdeudado={estado.data.totalAdeudado}
      config={toConfigMap(config ?? [])}
      saldoFavor={saldoFavor}
      historialSaldoFavor={historialSaldoFavor}
    />
  )
}
