import { createClient } from '@/lib/supabase-server'
import ClientesClient from './ClientesClient'
import type { SaldoFavorCliente } from '@/types'

export default async function ClientesPage() {
  const supabase = await createClient()
  const [{ data: clientes }, { data: saldosFavorRows }] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre'),
    supabase.from('saldo_favor_clientes').select('cliente_id, saldo'),
  ])

  // Saldo a favor por cliente (vista saldo_favor_clientes, P5a): solo lectura
  // aquí; el gasto del saldo a favor es P5b.
  const saldosFavor = Object.fromEntries(
    ((saldosFavorRows ?? []) as SaldoFavorCliente[]).map(s => [s.cliente_id, Number(s.saldo)])
  )

  return <ClientesClient clientes={clientes ?? []} saldosFavor={saldosFavor} />
}
