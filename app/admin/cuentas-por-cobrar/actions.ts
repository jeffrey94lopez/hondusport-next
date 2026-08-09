'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { estadoPago, bucketAntiguedad, distribuirPago } from '@/lib/cxp/cxp'
import { hoyHonduras } from '@/lib/cotizaciones/cotizaciones'
import type { DocumentoSaldo, CxcFila, Cobro, CobroAplicacion, CobroMetodo } from '@/types'

export type CxcResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface RegistrarCobroInput {
  clienteId: string
  fecha: string // 'YYYY-MM-DD'
  metodo: CobroMetodo
  referencia: string | null
  notas: string | null
  sesionId: string | null
  // Modo abono/manual: aplicaciones explícitas. Modo global auto: dejar
  // `aplicaciones` vacío y pasar `montoGlobal` (se distribuye en el servidor).
  aplicaciones: { documentoId: string; monto: number }[]
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
// RPC `registrar_cobro` lanza excepciones con texto en español ya pensado
// para mostrarse; si el mensaje trae alguno de esos fragmentos, se devuelve
// tal cual; si no se reconoce, un genérico.
function traducirError(mensaje: string | undefined | null): string {
  const m = mensaje ?? ''
  if (
    m.includes('Falta el cliente') ||
    m.includes('no tiene aplicaciones') ||
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

// La vista `documento_saldos` ya trae `cliente_nombre` (join en la propia
// vista), así que a diferencia de CxP (compra_saldos, sin nombre de
// proveedor) no hace falta traer los clientes aparte para armar CxcFila.
function aCxcFila(saldo: DocumentoSaldo, hoy: Date): CxcFila {
  const fechaVenc = new Date(`${saldo.fecha_vencimiento}T00:00:00Z`)
  const diasVencido = diasEntre(fechaVenc, hoy)
  const estado = estadoPago(saldo.credito_total, saldo.cobrado, fechaVenc, hoy)
  const bucket = bucketAntiguedad(fechaVenc, hoy)
  return {
    ...saldo,
    estado,
    bucket,
    dias_vencido: diasVencido,
  }
}

// `cobros` sí es una tabla (no una vista) y no guarda el nombre del cliente:
// se trae el mapa aparte, igual que `mapaProveedores` en CxP.
async function mapaClientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from('clientes').select('id, nombre')
  return new Map((data ?? []).map(c => [c.id as string, c.nombre as string]))
}

export async function obtenerCxc(): Promise<CxcResult<CxcFila[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('documento_saldos').select('*').gt('saldo', 0)
  if (error) return { ok: false, error: ERROR_GENERICO }

  const hoy = hoyHonduras(new Date())
  const filas = (data ?? []).map(s => aCxcFila(s as DocumentoSaldo, hoy))
  return { ok: true, data: filas }
}

export async function registrarCobro(input: RegistrarCobroInput): Promise<CxcResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let aplicaciones = input.aplicaciones
  // Modo global auto: distribuir montoGlobal entre los documentos con saldo del cliente.
  if (input.montoGlobal != null && aplicaciones.length === 0) {
    const { data: saldos } = await supabase
      .from('documento_saldos')
      .select('documento_id, saldo, fecha_vencimiento')
      .eq('cliente_id', input.clienteId)
      .gt('saldo', 0)
    const ordenados = (saldos ?? [])
      .slice()
      .sort((a, b) => String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? '')))
      .map(s => ({ compra_id: s.documento_id as string, saldo: Number(s.saldo) }))
    const { aplicaciones: apps, remanente } = distribuirPago(input.montoGlobal, ordenados)
    if (remanente > 0) return { ok: false, error: 'El monto supera el total adeudado del cliente.' }
    aplicaciones = apps.map(a => ({ documentoId: a.compra_id, monto: a.monto }))
  }
  if (aplicaciones.length === 0) return { ok: false, error: 'No hay aplicaciones para el cobro.' }

  const { data, error } = await supabase.rpc('registrar_cobro', {
    p: {
      cliente_id: input.clienteId, fecha: input.fecha, metodo: input.metodo,
      referencia: input.referencia, notas: input.notas, sesion_id: input.sesionId,
      usuario: user?.email ?? null,
      aplicaciones: aplicaciones.map(a => ({ documento_id: a.documentoId, monto: a.monto })),
    },
  })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/cuentas-por-cobrar')
  return { ok: true, data: { id: data as string } }
}

export async function eliminarCobro(cobroId: string): Promise<CxcResult> {
  const supabase = await createClient()

  // Guard: si el cobro está asociado a una sesión de caja ya cerrada, no se
  // puede eliminar (rompería el arqueo ya conciliado).
  const { data: cobro, error: cobroErr } = await supabase
    .from('cobros')
    .select('sesion_id')
    .eq('id', cobroId)
    .single()
  if (cobroErr || !cobro) return { ok: false, error: ERROR_GENERICO }

  if (cobro.sesion_id) {
    const { data: sesion } = await supabase
      .from('sesiones_caja')
      .select('estado')
      .eq('id', cobro.sesion_id)
      .single()
    if (sesion?.estado === 'cerrada') {
      return { ok: false, error: 'El cobro pertenece a una caja ya cerrada; no se puede eliminar.' }
    }
  }

  const { error } = await supabase.rpc('eliminar_cobro', { p_cobro_id: cobroId })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/cuentas-por-cobrar')
  return { ok: true }
}

export async function obtenerEstadoCuentaCliente(
  clienteId: string,
): Promise<CxcResult<{ documentos: CxcFila[]; cobros: (Cobro & { aplicaciones: CobroAplicacion[] })[]; totalAdeudado: number }>> {
  const supabase = await createClient()

  const { data: saldosData, error: saldosErr } = await supabase
    .from('documento_saldos')
    .select('*')
    .eq('cliente_id', clienteId)
    .gt('saldo', 0)
  if (saldosErr) return { ok: false, error: ERROR_GENERICO }

  const { data: cobrosData, error: cobrosErr } = await supabase
    .from('cobros')
    .select('*, cobro_aplicaciones(*)')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
  if (cobrosErr) return { ok: false, error: ERROR_GENERICO }

  const hoy = hoyHonduras(new Date())
  const documentos = (saldosData ?? []).map(s => aCxcFila(s as DocumentoSaldo, hoy))

  const cobros = (cobrosData ?? []).map(c => {
    const { cobro_aplicaciones, ...row } = c as Cobro & { cobro_aplicaciones: CobroAplicacion[] }
    return { ...row, aplicaciones: cobro_aplicaciones }
  })

  const totalAdeudado = round2(documentos.reduce((acc, d) => acc + d.saldo, 0))

  return { ok: true, data: { documentos, cobros, totalAdeudado } }
}

export async function obtenerCobros(): Promise<
  CxcResult<(Cobro & { cliente_nombre: string; aplicaciones: CobroAplicacion[] })[]>
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cobros')
    .select('*, cobro_aplicaciones(*)')
    .order('fecha', { ascending: false })
  if (error) return { ok: false, error: ERROR_GENERICO }

  const clientes = await mapaClientes(supabase)
  const cobros = (data ?? []).map(c => {
    const { cobro_aplicaciones, ...row } = c as Cobro & { cobro_aplicaciones: CobroAplicacion[] }
    return {
      ...row,
      cliente_nombre: clientes.get(row.cliente_id) ?? '',
      aplicaciones: cobro_aplicaciones,
    }
  })
  return { ok: true, data: cobros }
}

// Helper para el check de límite de crédito (Task 4): suma el saldo pendiente
// (documento_saldos.saldo) del cliente. No es un CxcResult porque se usa como
// dato auxiliar dentro de otras acciones, no como respuesta de un formulario.
export async function saldoCxcDeCliente(clienteId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documento_saldos')
    .select('saldo')
    .eq('cliente_id', clienteId)
    .gt('saldo', 0)
  return round2((data ?? []).reduce((acc, r) => acc + Number(r.saldo), 0))
}
