import { createClient } from '@/lib/supabase-server'
import type { Caja, SesionCaja } from '@/types'
import TurnosClient from './TurnosClient'

export const dynamic = 'force-dynamic'

export default async function TurnosPage() {
  const supabase = await createClient()

  const [{ data: cajas }, { data: sesionesAbiertas }, { data: historial }] = await Promise.all([
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    // `.limit()` explícito: sin él PostgREST aplica su tope por defecto y el
    // historial se truncaría en silencio (ya nos pasó en un reporte de esta serie).
    supabase
      .from('sesiones_caja')
      .select('*')
      .order('abierta_at', { ascending: false })
      .limit(2000),
  ])

  return (
    <TurnosClient
      cajas={(cajas ?? []) as Caja[]}
      sesionesAbiertas={(sesionesAbiertas ?? []) as SesionCaja[]}
      historial={(historial ?? []) as SesionCaja[]}
    />
  )
}
