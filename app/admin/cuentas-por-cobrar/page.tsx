import { createClient } from '@/lib/supabase-server'
import type { Caja, Cliente, CxcFila, SaldoFavorCliente, SesionCaja } from '@/types'
import { obtenerCxc } from './actions'
import CuentasPorCobrarClient from './CuentasPorCobrarClient'

export const dynamic = 'force-dynamic'

export default async function CuentasPorCobrarPage() {
  const supabase = await createClient()

  const [cxc, { data: clientes }, { data: sesiones }, { data: cajas }, { data: saldosFavorRows }] = await Promise.all([
    obtenerCxc(),
    supabase
      .from('clientes')
      .select('*')
      .eq('es_cliente', true)
      .eq('activo', true)
      .order('nombre'),
    // Sesiones de caja abiertas: para ligar un cobro en efectivo a la caja
    // que lo recibe (mismo criterio que el arqueo, ver lib/pos/emision.ts).
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    // `sesiones_caja` solo trae `caja_id`; se traen las cajas aparte (mismo
    // patrón que app/admin/pos/page.tsx) para poder mostrar el NOMBRE de la
    // caja de cada sesión abierta en el selector del CobroModal.
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    // Saldo a favor por cliente (vista saldo_favor_clientes, P5a/P5b): habilita
    // el botón "Aplicar saldo a favor" por fila (mismo patrón de lectura que
    // /admin/clientes).
    supabase.from('saldo_favor_clientes').select('cliente_id, saldo'),
  ])

  const filas: CxcFila[] = cxc.ok ? cxc.data ?? [] : []
  const saldosFavor = Object.fromEntries(
    ((saldosFavorRows ?? []) as SaldoFavorCliente[]).map(s => [s.cliente_id, Number(s.saldo)]),
  )

  return (
    <CuentasPorCobrarClient
      filas={filas}
      clientes={(clientes ?? []) as unknown as Cliente[]}
      sesiones={(sesiones ?? []) as unknown as SesionCaja[]}
      cajas={(cajas ?? []) as unknown as Caja[]}
      saldosFavor={saldosFavor}
    />
  )
}
