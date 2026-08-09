import { createClient } from '@/lib/supabase-server'
import { obtenerCobros } from '../actions'
import { numeroDocumento } from '../CuentasPorCobrarClient'
import CobrosClient from './CobrosClient'

export const dynamic = 'force-dynamic'

// Historial de cobros a clientes. `obtenerCobros` ya trae el nombre del
// cliente y las aplicaciones (documento_id + monto); para mostrar el número
// de cada documento en el detalle expandible se lee aparte `documento_saldos`
// (trae tipo/correlativo/numero_comprobante de TODOS los documentos al
// crédito, sin filtrar por saldo > 0 — un cobro puede aplicar a un documento
// ya totalmente pagado) y se mapea por documento_id en JS, mismo criterio que
// `comprasMap` en app/admin/cuentas-por-pagar/pagos/page.tsx.
export default async function CobrosPage() {
  const supabase = await createClient()

  const [cobrosRes, { data: documentosData }] = await Promise.all([
    obtenerCobros(),
    supabase.from('documento_saldos').select('documento_id, tipo, correlativo, numero_comprobante'),
  ])

  const cobros = cobrosRes.ok ? cobrosRes.data ?? [] : []
  const documentosMap = Object.fromEntries(
    (documentosData ?? []).map(d => [
      d.documento_id as string,
      numeroDocumento({
        tipo: d.tipo as 'factura' | 'comprobante',
        correlativo: d.correlativo as string | null,
        numero_comprobante: d.numero_comprobante as number | null,
      }),
    ]),
  )

  return <CobrosClient cobros={cobros} documentosMap={documentosMap} />
}
