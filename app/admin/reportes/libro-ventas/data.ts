import { createClient } from '@/lib/supabase-server'
import type { DocumentoFiscal } from '@/types'

// Embed cai_autorizaciones(cai) por FK simple documento.cai_id (to-one → objeto).
interface DocFiscalEmbed {
  cai_autorizaciones: { cai: string } | null
  [k: string]: unknown
}

export async function obtenerLibroVentas(desde: string, hasta: string): Promise<DocumentoFiscal[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documentos')
    .select('*, cai_autorizaciones(cai)')
    .in('tipo', ['factura', 'nota_credito'])
    .gte('created_at', desde)
    .lt('created_at', hasta)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) console.error('[libro-ventas] error:', error.message)
  return ((data ?? []) as unknown as DocFiscalEmbed[]).map(({ cai_autorizaciones, ...d }) => ({
    ...(d as unknown as DocumentoFiscal),
    cai_codigo: cai_autorizaciones?.cai ?? null,
  }))
}
