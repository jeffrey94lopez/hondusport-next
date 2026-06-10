import { createClient } from '@/lib/supabase-server'
import CuponesClient from './CuponesClient'

export default async function CuponesPage() {
  const supabase = await createClient()
  const [{ data: cupones }, { data: config }] = await Promise.all([
    supabase.from('cupones').select('*').order('created_at', { ascending: false }),
    supabase.from('configuracion').select('key, value').in('key', ['cupones_popup_activo']),
  ])
  const popupActivo = config?.find(c => c.key === 'cupones_popup_activo')?.value === 'true'
  return <CuponesClient cupones={cupones ?? []} popupActivo={popupActivo} />
}
