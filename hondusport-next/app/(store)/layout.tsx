import './store-globals.css'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import ThemeRoot from '@/components/store/ThemeRoot'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.from('configuracion').select('key,value')
  const config = toConfigMap(data ?? [])

  return <ThemeRoot accent={config.color_principal}>{children}</ThemeRoot>
}
