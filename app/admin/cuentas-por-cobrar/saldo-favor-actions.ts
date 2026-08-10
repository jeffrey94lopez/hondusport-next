'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { SaldoFavorMovimiento } from '@/types'
import type { CxcResult } from './actions'

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

export interface AplicarSaldoFavorCxcInput {
  clienteId: string
  aplicaciones: { documentoId: string; monto: number }[]
  notas?: string
}

// Traduce el mensaje de error de Postgres de `aplicar_saldo_favor_cxc` a algo
// legible. Reusa los mismos fragmentos que `registrar_cobro` (la RPC valida
// documento/cliente/estado igual que un cobro normal) más el guard propio de
// saldo insuficiente (`HS_SALDO|insuficiente`).
function traducirError(mensaje: string | undefined | null): string {
  const m = mensaje ?? ''
  if (m.includes('HS_SALDO|insuficiente')) return 'El cliente no tiene saldo a favor suficiente.'
  if (
    m.includes('Falta el cliente') ||
    m.includes('No hay aplicaciones') ||
    m.includes('Monto de aplicacion invalido') ||
    m.includes('Documento no encontrado') ||
    m.includes('no pertenece al cliente') ||
    m.includes('esta anulado') ||
    m.includes('no tiene credito por cobrar') ||
    m.includes('excede el saldo')
  ) {
    return m
  }
  return ERROR_GENERICO
}

// Balance vigente del saldo a favor del cliente (vista `saldo_favor_clientes`,
// agregado de `saldo_favor_movimientos`). 0 si el cliente no tiene fila (nunca
// generó saldo a favor).
export async function obtenerSaldoFavorCliente(clienteId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saldo_favor_clientes')
    .select('saldo')
    .eq('cliente_id', clienteId)
    .maybeSingle()
  return data?.saldo != null ? Number(data.saldo) : 0
}

// Aplica saldo a favor del cliente a una o más deudas (documentos) por
// cobrar, vía la RPC atómica `aplicar_saldo_favor_cxc` (bloquea al cliente y
// valida el balance bajo lock; esta acción NO valida el balance en JS).
export async function aplicarSaldoFavorCxc(
  input: AplicarSaldoFavorCxcInput,
): Promise<CxcResult<{ id: string }>> {
  if (input.aplicaciones.length === 0) return { ok: false, error: 'No hay aplicaciones para aplicar.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc('aplicar_saldo_favor_cxc', {
    p: {
      cliente_id: input.clienteId,
      aplicaciones: input.aplicaciones.map(a => ({ documento_id: a.documentoId, monto: a.monto })),
      usuario: user?.email ?? null,
      notas: input.notas ?? null,
    },
  })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/cuentas-por-cobrar')
  return { ok: true, data: { id: data as string } }
}

// Historial completo del ledger de saldo a favor del cliente (devoluciones,
// gasto en ventas, gasto en cobros de CxC), más reciente primero.
export async function obtenerHistorialSaldoFavor(
  clienteId: string,
): Promise<CxcResult<SaldoFavorMovimiento[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('saldo_favor_movimientos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: ERROR_GENERICO }
  return { ok: true, data: (data ?? []) as SaldoFavorMovimiento[] }
}
