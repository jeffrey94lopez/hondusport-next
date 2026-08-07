import { createClient } from '@/lib/supabase-server'
import ConfigClient from './ConfigClient'
import type { ConfigMap } from '@/types'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const [{ data }, { data: cais }] = await Promise.all([
    supabase.from('configuracion').select('key, value'),
    supabase.from('cai_autorizaciones').select('*').order('created_at', { ascending: false }),
  ])
  const config: ConfigMap = {}
  data?.forEach(({ key, value }) => { config[key] = value ?? '' })
  return <ConfigClient config={config} cais={cais ?? []} />
}
