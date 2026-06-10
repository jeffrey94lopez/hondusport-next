import { createClient } from '@/lib/supabase-server'
import CuponesClient from './CuponesClient'

export default async function CuponesPage() {
  const supabase = await createClient()
  const { data: cupones } = await supabase.from('cupones').select('*').order('created_at', { ascending: false })
  return <CuponesClient cupones={cupones ?? []} />
}
