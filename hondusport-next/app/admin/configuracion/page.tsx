import { createClient } from '@/lib/supabase-server'
import type { ConfigMap } from '@/types'
import ConfigClient from './ConfigClient'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('configuracion').select('*')
  const config: ConfigMap = Object.fromEntries((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  return <ConfigClient config={config} />
}
