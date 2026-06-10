import { createClient } from '@/lib/supabase-server'
import EnviosClient from './EnviosClient'

export default async function EnviosPage() {
  const supabase = await createClient()
  const [{ data: envios }, { data: config }] = await Promise.all([
    supabase.from('envios').select('*').order('nombre'),
    supabase
      .from('configuracion')
      .select('key, value')
      .in('key', ['free_shipping_activo', 'free_shipping_minimo']),
  ])

  const freeShippingActivo =
    config?.find(c => c.key === 'free_shipping_activo')?.value === 'true'
  const freeShippingMinimo =
    config?.find(c => c.key === 'free_shipping_minimo')?.value ?? '0'

  return (
    <EnviosClient
      envios={envios ?? []}
      freeShippingActivo={freeShippingActivo}
      freeShippingMinimo={freeShippingMinimo}
    />
  )
}
