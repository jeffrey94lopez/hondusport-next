import { createClient } from '@/lib/supabase-server'
import ConfigClient from './ConfigClient'
import type { ConfigMap } from '@/types'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('configuracion').select('key, value')
  const config: ConfigMap = {}
  data?.forEach(({ key, value }) => { config[key] = value ?? '' })
  return <ConfigClient config={config} />
}
