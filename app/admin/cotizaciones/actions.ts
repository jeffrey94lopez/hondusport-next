'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { precioLineaPos } from '@/lib/pos/emision'
import { numeroCotizacion, validoHasta, etapaGanadaDestino } from '@/lib/cotizaciones/cotizaciones'
import type { LineaPos, IsvTipo, CotizacionConDatos, CotizacionItem, CotizacionEtapa } from '@/types'

export type CotizacionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

export interface LineaCotizacionInput {
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number   // usado tal cual solo si producto_id es null (ítem libre) o precioManual
  precioManual: boolean
  descuento: number
  isv: IsvTipo
}

export interface GuardarCotizacionInput {
  id: string | null            // null = crear
  etapaId: string
  clienteId: string | null
  vendedorId: string | null
  descuentoGlobal: number
  validezDias: number
  condiciones: string | null
  notas: string | null
  lineas: LineaCotizacionInput[]
}

// El POS necesita saber qué líneas venían con precio manual (override) para
// no volver a releerlo de BD al facturar desde una cotización.
export interface PrefillLineaPos extends LineaPos {
  precioManual: boolean
}

export interface CotizacionPrefillPos {
  cotizacionId: string
  clienteId: string | null
  descuentoGlobal: number
  lineas: PrefillLineaPos[]
  yaFacturada: boolean
}

// Forma real de la fila de `productos` releída para el recálculo de precio
// (frontera de confianza): precio y precio_revendedor propios, más las
// variantes activas embebidas para la herencia padre/hijo de precioLineaPos.
interface ProductoConVariantes {
  precio: number
  precio_revendedor: number | null
  isv: IsvTipo
  producto_variantes: VarianteProducto[]
}

interface VarianteProducto {
  id: string
  precio: number | null
  precio_revendedor: number | null
}

// Fila de `cotizaciones` con las relaciones embebidas resueltas: PostgREST
// devuelve `etapa` como OBJETO (FK simple etapa_id → cotizacion_etapas, no hay
// muchas etapas por cotización), mismo caso documentado en app/admin/pos/actions.ts
// para documento_pagos → metodos_pago.
interface CotizacionRow extends Omit<CotizacionConDatos, 'items' | 'etapa'> {
  cotizacion_items: CotizacionItem[]
  etapa: CotizacionEtapa | null
}

export async function guardarCotizacion(input: GuardarCotizacionInput): Promise<CotizacionResult<{ id: string }>> {
  const supabase = await createClient()

  // Cliente (para tipo/exonerado) — releído de BD
  let tipoCliente: 'final' | 'revendedor' = 'final'
  let exonerado = false
  let clienteNombre: string | null = null
  let clienteRtn: string | null = null
  if (input.clienteId) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('nombre, rtn, tipo_cliente, exonerado')
      .eq('id', input.clienteId)
      .maybeSingle()
    if (cli) {
      tipoCliente = cli.tipo_cliente
      exonerado = cli.exonerado
      clienteNombre = cli.nombre
      clienteRtn = cli.rtn
    }
  }

  // Releer productos de las líneas de catálogo para recalcular precio (frontera de confianza)
  const productoIds = [...new Set(input.lineas.filter(l => l.producto_id).map(l => l.producto_id!))]
  const productosPorId = new Map<string, ProductoConVariantes>()
  if (productoIds.length > 0) {
    const { data: prods } = await supabase
      .from('productos')
      .select('id, precio, precio_revendedor, isv, producto_variantes(*)')
      .in('id', productoIds)
    for (const p of (prods ?? []) as unknown as (ProductoConVariantes & { id: string })[]) {
      productosPorId.set(p.id, p)
    }
  }

  // Construir LineaPos definitivas: precio releído salvo ítem libre / precio manual
  const lineasPos: LineaPos[] = input.lineas.map(l => {
    let precio = l.precio_unitario
    if (l.producto_id && !l.precioManual) {
      const prod = productosPorId.get(l.producto_id)
      const variante = prod && l.variante_id
        ? prod.producto_variantes.find(v => v.id === l.variante_id) ?? null
        : null
      if (prod) precio = precioLineaPos(tipoCliente, prod, variante)
    }
    return {
      producto_id: l.producto_id,
      variante_id: l.variante_id,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: precio,
      descuento: l.descuento,
      isv: l.isv,
    }
  })

  // Total con las puras del POS
  const prorrateadas = prorratearDescuentoGlobal(lineasPos, input.descuentoGlobal)
  const desglosadas = prorrateadas.map(l => desglosarLinea(l, exonerado))
  const totales = totalesDocumento(desglosadas, input.descuentoGlobal, '')

  // valido_hasta = hoy + validezDias (se calcula en JS; la BD guarda date)
  const vh = validoHasta(new Date(), input.validezDias).toISOString().slice(0, 10)

  try {
    let cotizacionId = input.id
    if (!cotizacionId) {
      // numero de la secuencia
      const { data: seqRow, error: seqErr } = await supabase.rpc('nextval_cotizacion')
      if (seqErr || seqRow == null) return { ok: false, error: ERROR_GENERICO }
      const numero = numeroCotizacion(Number(seqRow))
      const { data: nueva, error: insErr } = await supabase
        .from('cotizaciones')
        .insert({
          numero, etapa_id: input.etapaId, cliente_id: input.clienteId,
          cliente_nombre: clienteNombre, cliente_rtn: clienteRtn, vendedor_id: input.vendedorId,
          descuento_global: input.descuentoGlobal, validez_dias: input.validezDias, valido_hasta: vh,
          condiciones: input.condiciones, notas: input.notas, total: totales.total,
        })
        .select('id')
        .single()
      if (insErr || !nueva) return { ok: false, error: ERROR_GENERICO }
      cotizacionId = nueva.id
    } else {
      const { error: updErr } = await supabase
        .from('cotizaciones')
        .update({
          etapa_id: input.etapaId, cliente_id: input.clienteId,
          cliente_nombre: clienteNombre, cliente_rtn: clienteRtn, vendedor_id: input.vendedorId,
          descuento_global: input.descuentoGlobal, validez_dias: input.validezDias, valido_hasta: vh,
          condiciones: input.condiciones, notas: input.notas, total: totales.total,
        })
        .eq('id', cotizacionId)
      if (updErr) return { ok: false, error: ERROR_GENERICO }
      await supabase.from('cotizacion_items').delete().eq('cotizacion_id', cotizacionId)
    }

    // A esta altura cotizacionId ya no puede ser null (se asignó en ambas
    // ramas). El `!` es necesario porque TS descarta el narrowing de un `let`
    // que se referencia luego dentro del closure de `.map()` más abajo.
    const id = cotizacionId!

    if (lineasPos.length > 0) {
      const { error: itemsErr } = await supabase.from('cotizacion_items').insert(
        // lineasPos conserva el orden e índice de input.lineas 1:1: se toma de
        // ahí el flag precioManual, que no viaja en LineaPos (frontera de
        // confianza pura), para persistirlo tal cual lo mandó el editor.
        lineasPos.map((l, i) => ({
          cotizacion_id: id, producto_id: l.producto_id, variante_id: l.variante_id,
          descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario,
          descuento: l.descuento, isv: l.isv, precio_manual: input.lineas[i].precioManual, orden: i,
        })),
      )
      if (itemsErr) return { ok: false, error: ERROR_GENERICO }
    }

    revalidatePath('/admin/cotizaciones')
    return { ok: true, data: { id } }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
  }
}

export async function moverEtapaCotizacion(cotizacionId: string, etapaId: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotizaciones').update({ etapa_id: etapaId }).eq('id', cotizacionId)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function eliminarCotizacion(id: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotizaciones').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function obtenerCotizacion(id: string): Promise<CotizacionResult<CotizacionConDatos>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, cotizacion_items(*), etapa:cotizacion_etapas(*)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'No se encontró la cotización.' }

  const row = data as unknown as CotizacionRow
  const items = row.cotizacion_items.slice().sort((a, b) => a.orden - b.orden)
  // La aserción evita el chequeo de propiedades excedentes de TS por el
  // `cotizacion_items` que sigue presente en el spread (es inocuo en runtime).
  return { ok: true, data: { ...row, items } as CotizacionConDatos }
}

export async function duplicarCotizacion(id: string): Promise<CotizacionResult<{ id: string }>> {
  const original = await obtenerCotizacion(id)
  if (!original.ok || !original.data) return { ok: false, error: 'No se pudo duplicar.' }
  const c = original.data
  return guardarCotizacion({
    id: null, etapaId: c.etapa_id, clienteId: c.cliente_id, vendedorId: c.vendedor_id,
    descuentoGlobal: c.descuento_global, validezDias: c.validez_dias,
    condiciones: c.condiciones, notas: c.notas,
    lineas: c.items.map(i => ({
      producto_id: i.producto_id, variante_id: i.variante_id, descripcion: i.descripcion,
      cantidad: i.cantidad, precio_unitario: i.precio_unitario, precioManual: i.precio_manual,
      descuento: i.descuento, isv: i.isv,
    })),
  })
}

export async function obtenerCotizacionParaPos(id: string): Promise<CotizacionResult<CotizacionPrefillPos>> {
  const r = await obtenerCotizacion(id)
  if (!r.ok || !r.data) return { ok: false, error: 'No se encontró la cotización.' }
  const c = r.data
  return {
    ok: true,
    data: {
      cotizacionId: c.id,
      clienteId: c.cliente_id,
      descuentoGlobal: c.descuento_global,
      yaFacturada: c.documento_id !== null,
      lineas: c.items.map(i => ({
        producto_id: i.producto_id, variante_id: i.variante_id, descripcion: i.descripcion,
        cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento: i.descuento, isv: i.isv,
        precioManual: i.precio_manual,
      })),
    },
  }
}

export async function marcarCotizacionFacturada(cotizacionId: string, documentoId: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  // Idempotente: no re-emitir si ya tiene documento
  const { data: actual } = await supabase.from('cotizaciones').select('documento_id').eq('id', cotizacionId).maybeSingle()
  if (actual?.documento_id) return { ok: true }
  const { data: etapas } = await supabase.from('cotizacion_etapas').select('*')
  const ganada = etapaGanadaDestino((etapas ?? []) as CotizacionEtapa[])
  const patch: { documento_id: string; etapa_id?: string } = { documento_id: documentoId }
  if (ganada) patch.etapa_id = ganada.id
  const { error } = await supabase.from('cotizaciones').update(patch).eq('id', cotizacionId)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}
