import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { nombreComercial } from '@/lib/empresa/perfil'
import type { Caja, SesionCaja } from '@/types'
import TurnosClient from './TurnosClient'

export const dynamic = 'force-dynamic'

export default async function TurnosPage() {
  const supabase = await createClient()

  const [{ data: cajas }, { data: sesionesAbiertas }, { data: historial }, { data: config }] = await Promise.all([
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    // `.limit()` explícito: sin él PostgREST aplica su tope por defecto y el
    // historial se truncaría en silencio (ya nos pasó en un reporte de esta serie).
    supabase
      .from('sesiones_caja')
      .select('*')
      .order('abierta_at', { ascending: false })
      .limit(2000),
    supabase.from('configuracion').select('key, value'),
  ])

  // R7: interruptor `pos_cierre_ciegas` (mismo criterio "ausente = activo"
  // que en app/admin/pos/page.tsx) y nombre comercial para el encabezado del
  // comprobante de cierre de turno.
  const configMap = toConfigMap(config ?? [])
  const cierreCiegas = configMap.pos_cierre_ciegas !== 'false'
  const empresaNombre = nombreComercial(configMap) || 'Hondusport'

  return (
    <TurnosClient
      cajas={(cajas ?? []) as Caja[]}
      sesionesAbiertas={(sesionesAbiertas ?? []) as SesionCaja[]}
      historial={(historial ?? []) as SesionCaja[]}
      cierreCiegas={cierreCiegas}
      empresaNombre={empresaNombre}
    />
  )
}
