import { createClient } from '@/lib/supabase-server'
import EnviosClient from './EnviosClient'

export default async function EnviosPage() {
  const supabase = await createClient()
  const { data: envios } = await supabase.from('envios').select('*').order('nombre')
  return <EnviosClient envios={envios ?? []} />
}
