import { createClient } from '@/lib/supabase-server'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre')

  return <ClientesClient clientes={clientes ?? []} />
}
