import { createClient } from '@/lib/supabase-server'
import ConfigClient from './ConfigClient'
import type { ConfigMap, CotizacionEtapa } from '@/types'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const [{ data }, { data: cais }, { data: cajas }, { data: vendedores }, { data: metodos }, { data: etapas }] = await Promise.all([
    supabase.from('configuracion').select('key, value'),
    supabase.from('cai_autorizaciones').select('*').order('created_at', { ascending: false }),
    supabase.from('cajas').select('*').order('created_at', { ascending: false }),
    supabase.from('vendedores').select('*').order('created_at', { ascending: false }),
    supabase.from('metodos_pago').select('*').order('orden', { ascending: true }),
    supabase.from('cotizacion_etapas').select('*').order('orden', { ascending: true }),
  ])
  const config: ConfigMap = {}
  data?.forEach(({ key, value }) => { config[key] = value ?? '' })
  return (
    <ConfigClient
      config={config}
      cais={cais ?? []}
      cajas={cajas ?? []}
      vendedores={vendedores ?? []}
      metodos={metodos ?? []}
      etapas={(etapas ?? []) as CotizacionEtapa[]}
    />
  )
}
