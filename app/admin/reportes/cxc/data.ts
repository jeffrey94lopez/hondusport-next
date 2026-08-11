import { createClient } from '@/lib/supabase-server'
import { agruparCxc } from '@/lib/reportes/cxc-cascada'
import { hoyHonduras } from '@/lib/cotizaciones/cotizaciones'
import type { GrupoCxc } from '@/types'

export async function obtenerCxc(): Promise<GrupoCxc[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documento_saldos')
    .select('documento_id, cliente_id, cliente_nombre, tipo, correlativo, numero_comprobante, fecha, fecha_vencimiento, saldo')
    .gt('saldo', 0)
    .order('cliente_nombre', { ascending: true })
    .limit(5000)
  if (error) console.error('[cxc] error:', error.message)
  const rows = (data ?? []).map(r => ({
    documento_id: r.documento_id as string,
    cliente_id: r.cliente_id as string,
    cliente_nombre: r.cliente_nombre as string,
    numero: (r.tipo === 'factura' ? (r.correlativo as string | null) ?? '—' : `C-${String((r.numero_comprobante as number | null) ?? 0).padStart(8, '0')}`),
    fecha: r.fecha as string,
    fecha_vencimiento: r.fecha_vencimiento as string,
    saldo: Number(r.saldo),
  }))
  return agruparCxc(rows, hoyHonduras(new Date()))
}
