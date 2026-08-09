'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { estadoPago, bucketAntiguedad, distribuirPago } from '@/lib/cxp/cxp'
import { hoyHonduras } from '@/lib/cotizaciones/cotizaciones'
import type { CompraSaldo, CxpFila, PagoProveedor, PagoAplicacion, PagoMetodo } from '@/types'

export type CxpResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

export interface RegistrarPagoInput {
  proveedorId: string
  fecha: string // 'YYYY-MM-DD'
  metodo: PagoMetodo
  referencia: string | null
  notas: string | null
  // Modo abono/manual: aplicaciones explícitas. Modo global auto: dejar
  // `aplicaciones` vacío y pasar `montoGlobal` (se distribuye en el servidor).
  aplicaciones: { compraId: string; monto: number }[]
  montoGlobal?: number
}

// Días entre dos fechas por calendario UTC (mismo cálculo que lib/cxp/cxp.ts,
// que no lo exporta). Se usa aquí solo para derivar `dias_vencido` de cada fila.
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate())
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate())
  return Math.round((b - a) / 86400000)
}

// Traduce el mensaje de error de Postgres a algo legible para el usuario. La
// RPC `registrar_pago_proveedor` lanza excepciones con texto en español ya
// pensado para mostrarse; si el mensaje trae alguno de esos fragmentos, se
// devuelve tal cual; si no se reconoce, un genérico.
function traducirError(mensaje: string | undefined | null): string {
  const m = mensaje ?? ''
  if (
    m.includes('excede el saldo') ||
    m.includes('no es al credito') ||
    m.includes('esta anulada') ||
    m.includes('no pertenece al proveedor') ||
    m.includes('no tiene aplicaciones') ||
    m.includes('sin aplicaciones') ||
    m.includes('Falta el proveedor') ||
    m.includes('Monto de aplicacion invalido') ||
    m.includes('Compra no encontrada')
  ) {
    return m
  }
  return ERROR_GENERICO
}

// PostgREST no embebe relaciones sobre una vista (`compra_saldos`): se traen
// los proveedores aparte (`clientes` con es_proveedor=true) y se mapea por
// `proveedor_id` en JS, en vez de intentar un `select('*, proveedor:clientes(...)')`
// sobre la vista.
async function mapaProveedores(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from('clientes').select('id, nombre').eq('es_proveedor', true)
  return new Map((data ?? []).map(c => [c.id as string, c.nombre as string]))
}

function aCxpFila(saldo: CompraSaldo, hoy: Date, nombreProveedor: string): CxpFila {
  const fechaVenc = saldo.fecha_vencimiento ? new Date(`${saldo.fecha_vencimiento}T00:00:00Z`) : null
  const diasVencido = fechaVenc ? diasEntre(fechaVenc, hoy) : 0
  // Sin fecha de vencimiento no se puede determinar 'vencida' (no hay fecha
  // contra la cual comparar): el estado se deriva solo de saldo/pagado.
  const estado = fechaVenc
    ? estadoPago(saldo.total, saldo.pagado, fechaVenc, hoy)
    : saldo.saldo <= 0 ? 'pagada' : saldo.pagado > 0 ? 'parcial' : 'pendiente'
  const bucket = fechaVenc ? bucketAntiguedad(fechaVenc, hoy) : 'por_vencer'
  return {
    ...saldo,
    proveedor_nombre: nombreProveedor,
    estado,
    bucket,
    dias_vencido: diasVencido,
  }
}

export async function obtenerCxp(): Promise<CxpResult<CxpFila[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('compra_saldos').select('*').gt('saldo', 0)
  if (error) return { ok: false, error: ERROR_GENERICO }

  const hoy = hoyHonduras(new Date())
  const proveedores = await mapaProveedores(supabase)
  const filas = (data ?? []).map(s => aCxpFila(s as CompraSaldo, hoy, proveedores.get((s as CompraSaldo).proveedor_id) ?? ''))
  return { ok: true, data: filas }
}

export async function registrarPago(input: RegistrarPagoInput): Promise<CxpResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let aplicaciones = input.aplicaciones
  // Modo global auto: distribuir montoGlobal entre las compras con saldo del proveedor.
  if (input.montoGlobal != null && aplicaciones.length === 0) {
    const { data: saldos } = await supabase
      .from('compra_saldos')
      .select('compra_id, saldo, fecha_vencimiento')
      .eq('proveedor_id', input.proveedorId)
      .gt('saldo', 0)
    const ordenadas = (saldos ?? [])
      .slice()
      .sort((a, b) => String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? '')))
      .map(s => ({ compra_id: s.compra_id as string, saldo: Number(s.saldo) }))
    const { aplicaciones: apps, remanente } = distribuirPago(input.montoGlobal, ordenadas)
    if (remanente > 0) return { ok: false, error: 'El monto supera el total adeudado del proveedor.' }
    aplicaciones = apps.map(a => ({ compraId: a.compra_id, monto: a.monto }))
  }
  if (aplicaciones.length === 0) return { ok: false, error: 'No hay aplicaciones para el pago.' }

  const { data, error } = await supabase.rpc('registrar_pago_proveedor', {
    p: {
      proveedor_id: input.proveedorId, fecha: input.fecha, metodo: input.metodo,
      referencia: input.referencia, notas: input.notas, usuario: user?.email ?? null,
      aplicaciones: aplicaciones.map(a => ({ compra_id: a.compraId, monto: a.monto })),
    },
  })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/cuentas-por-pagar')
  return { ok: true, data: { id: data as string } }
}

export async function eliminarPago(pagoId: string): Promise<CxpResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('eliminar_pago_proveedor', { p_pago_id: pagoId })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/cuentas-por-pagar')
  return { ok: true }
}

export async function obtenerEstadoCuenta(
  proveedorId: string,
): Promise<CxpResult<{ compras: CxpFila[]; pagos: (PagoProveedor & { aplicaciones: PagoAplicacion[] })[]; totalAdeudado: number }>> {
  const supabase = await createClient()

  const { data: saldosData, error: saldosErr } = await supabase
    .from('compra_saldos')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .gt('saldo', 0)
  if (saldosErr) return { ok: false, error: ERROR_GENERICO }

  const { data: pagosData, error: pagosErr } = await supabase
    .from('pagos_proveedor')
    .select('*, pago_aplicaciones(*)')
    .eq('proveedor_id', proveedorId)
    .order('fecha', { ascending: false })
  if (pagosErr) return { ok: false, error: ERROR_GENERICO }

  const hoy = hoyHonduras(new Date())
  const proveedores = await mapaProveedores(supabase)
  const nombreProveedor = proveedores.get(proveedorId) ?? ''
  const compras = (saldosData ?? []).map(s => aCxpFila(s as CompraSaldo, hoy, nombreProveedor))

  const pagos = (pagosData ?? []).map(p => {
    const { pago_aplicaciones, ...row } = p as PagoProveedor & { pago_aplicaciones: PagoAplicacion[] }
    return { ...row, aplicaciones: pago_aplicaciones }
  })

  const totalAdeudado = compras.reduce((acc, c) => acc + c.saldo, 0)

  return { ok: true, data: { compras, pagos, totalAdeudado } }
}

export async function obtenerPagos(): Promise<
  CxpResult<(PagoProveedor & { proveedor_nombre: string; aplicaciones: PagoAplicacion[] })[]>
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pagos_proveedor')
    .select('*, pago_aplicaciones(*)')
    .order('fecha', { ascending: false })
  if (error) return { ok: false, error: ERROR_GENERICO }

  const proveedores = await mapaProveedores(supabase)
  const pagos = (data ?? []).map(p => {
    const { pago_aplicaciones, ...row } = p as PagoProveedor & { pago_aplicaciones: PagoAplicacion[] }
    return {
      ...row,
      proveedor_nombre: proveedores.get(row.proveedor_id) ?? '',
      aplicaciones: pago_aplicaciones,
    }
  })
  return { ok: true, data: pagos }
}
