import { createClient } from '@/lib/supabase-server'
import type { Caja, Cliente, CxcFila, SesionCaja } from '@/types'
import { obtenerCxc } from './actions'
import CuentasPorCobrarClient from './CuentasPorCobrarClient'

export const dynamic = 'force-dynamic'

export default async function CuentasPorCobrarPage() {
  const supabase = await createClient()

  const [cxc, { data: clientes }, { data: sesiones }, { data: cajas }] = await Promise.all([
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
  ])

  const filas: CxcFila[] = cxc.ok ? cxc.data ?? [] : []

  return (
    <CuentasPorCobrarClient
      filas={filas}
      clientes={(clientes ?? []) as unknown as Cliente[]}
      sesiones={(sesiones ?? []) as unknown as SesionCaja[]}
      cajas={(cajas ?? []) as unknown as Caja[]}
    />
  )
}
