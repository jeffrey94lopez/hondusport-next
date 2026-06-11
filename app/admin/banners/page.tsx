import { createClient } from '@/lib/supabase-server'
import BannersClient from './BannersClient'

export default async function BannersPage() {
  const supabase = await createClient()
  const { data: banners } = await supabase.from('banners').select('*').order('orden')
  return <BannersClient banners={banners ?? []} />
}
