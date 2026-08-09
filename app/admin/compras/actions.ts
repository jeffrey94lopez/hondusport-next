'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { numeroCompra, totalCompra, cantidadSugeridaReorden } from '@/lib/compras/compras'
import type { Compra, CompraItem, CompraConDatos, CompraMoneda, CondicionPago, ReordenLinea, Cliente } from '@/types'

export type ComprasResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'
const ERROR_NO_EDITABLE = 'La compra ya no se puede editar.'

export interface LineaCompraInput {
  producto_id: string
  variante_id: string | null
  descripcion: string
  cantidad_ordenada: number
  costo_unitario: number
}

export interface GuardarCompraInput {
  id: string | null
  proveedorId: string
  moneda: CompraMoneda
  tasaCambio: number | null
  facturaProveedor: string | null
  condicionPago: CondicionPago
  diasCredito: number
  fecha: string // 'YYYY-MM-DD'
  notas: string | null
  lineas: LineaCompraInput[]
}

// Fila de `compras` con las relaciones embebidas resueltas por PostgREST
// (compra_items como arreglo, proveedor como objeto vía FK simple proveedor_id
// -> clientes). Mismo patrón documentado en app/admin/cotizaciones/actions.ts.
interface CompraRow extends Compra {
  compra_items: CompraItem[]
  proveedor: Cliente | null
}

// Suma `dias` días a una fecha 'YYYY-MM-DD' en aritmética UTC pura (evita
// que el huso horario local del proceso adelante o atrase el día). Se opera
// en JS y no con SQL porque el vencimiento se guarda junto al resto del
// registro en el mismo insert/update (frontera de confianza: el servidor
// decide, no confía en un `fecha_vencimiento` que mande el cliente).
function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function guardarCompra(input: GuardarCompraInput): Promise<ComprasResult<{ id: string }>> {
  if (input.moneda === 'USD' && !(input.tasaCambio && input.tasaCambio > 0)) {
    return { ok: false, error: 'La tasa de cambio debe ser mayor a cero para compras en USD.' }
  }

  const supabase = await createClient()

  // Frontera de confianza: el proveedorId debe referenciar un contacto marcado
  // como proveedor. Se relee la fila (el cliente no decide el rol) para que un
  // id equivocado o stale no pase en silencio.
  const { data: prov } = await supabase
    .from('clientes')
    .select('es_proveedor')
    .eq('id', input.proveedorId)
    .maybeSingle()
  if (!prov || !prov.es_proveedor) {
    return { ok: false, error: 'El proveedor seleccionado no es un proveedor válido.' }
  }

  // Frontera de confianza: el total nunca viene del cliente, se recalcula aquí.
  const total = totalCompra(input.lineas, input.moneda, input.tasaCambio)
  const fechaVencimiento = input.condicionPago === 'credito' ? sumarDias(input.fecha, input.diasCredito) : null
  const estado = input.lineas.length > 0 ? 'ordenada' : 'borrador'

  try {
    let compraId = input.id

    if (compraId) {
      // Solo se puede editar si está en borrador/ordenada (relectura de estado
      // en servidor: el cliente no decide si la compra sigue editable).
      const { data: actual, error: actualErr } = await supabase
        .from('compras')
        .select('estado')
        .eq('id', compraId)
        .maybeSingle()
      if (actualErr || !actual) return { ok: false, error: 'No se encontró la compra.' }
      if (actual.estado !== 'borrador' && actual.estado !== 'ordenada') {
        return { ok: false, error: ERROR_NO_EDITABLE }
      }

      const { error: updErr } = await supabase
        .from('compras')
        .update({
          proveedor_id: input.proveedorId, estado, moneda: input.moneda, tasa_cambio: input.tasaCambio,
          factura_proveedor: input.facturaProveedor, condicion_pago: input.condicionPago,
          dias_credito: input.diasCredito, fecha: input.fecha, fecha_vencimiento: fechaVencimiento,
          notas: input.notas, total,
        })
        .eq('id', compraId)
      if (updErr) return { ok: false, error: ERROR_GENERICO }

      await supabase.from('compra_items').delete().eq('compra_id', compraId)
    } else {
      const { data: seqRow, error: seqErr } = await supabase.rpc('nextval_compra')
      if (seqErr || seqRow == null) return { ok: false, error: ERROR_GENERICO }
      const numero = numeroCompra(Number(seqRow))

      const { data: nueva, error: insErr } = await supabase
        .from('compras')
        .insert({
          numero, proveedor_id: input.proveedorId, estado, moneda: input.moneda, tasa_cambio: input.tasaCambio,
          factura_proveedor: input.facturaProveedor, condicion_pago: input.condicionPago,
          dias_credito: input.diasCredito, fecha: input.fecha, fecha_vencimiento: fechaVencimiento,
          notas: input.notas, total,
        })
        .select('id')
        .single()
      if (insErr || !nueva) return { ok: false, error: ERROR_GENERICO }
      compraId = nueva.id
    }

    const id = compraId!

    if (input.lineas.length > 0) {
      const { error: itemsErr } = await supabase.from('compra_items').insert(
        input.lineas.map((l, i) => ({
          compra_id: id, producto_id: l.producto_id, variante_id: l.variante_id,
          descripcion: l.descripcion, cantidad_ordenada: l.cantidad_ordenada,
          costo_unitario: l.costo_unitario, orden: i,
        })),
      )
      if (itemsErr) return { ok: false, error: ERROR_GENERICO }
    }

    revalidatePath('/admin/compras')
    return { ok: true, data: { id } }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
  }
}

export async function obtenerCompra(id: string): Promise<ComprasResult<CompraConDatos>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compras')
    .select('*, compra_items(*), proveedor:clientes(*)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'No se encontró la compra.' }

  const row = data as unknown as CompraRow
  const items = row.compra_items.slice().sort((a, b) => a.orden - b.orden)
  // La aserción evita el chequeo de propiedades excedentes de TS por
  // `compra_items` que sigue presente en el spread (inocuo en runtime).
  return { ok: true, data: { ...row, items } as CompraConDatos }
}

// Traduce el mensaje de error de Postgres a algo legible para el usuario.
// Las RPC `recibir_compra`/`anular_compra` lanzan excepciones con texto en
// español ya pensado para mostrarse; si el mensaje trae alguno de esos
// fragmentos, se devuelve tal cual; si no se reconoce, un genérico.
function traducirError(mensaje: string | undefined | null): string {
  const m = mensaje ?? ''
  if (
    m.includes('excede lo pendiente') ||
    m.includes('no admite recepciones') ||
    m.includes('ya esta anulada') ||
    m.includes('Cantidad de recepción invalida') ||
    m.includes('Compra no encontrada') ||
    m.includes('Linea de compra no encontrada')
  ) {
    return m
  }
  return ERROR_GENERICO
}

export async function recibirCompra(
  compraId: string,
  recepciones: { compraItemId: string; cantidad: number }[],
): Promise<ComprasResult> {
  if (recepciones.length === 0) return { ok: false, error: 'No hay líneas para recibir.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.rpc('recibir_compra', {
    p: {
      compra_id: compraId,
      usuario: user?.email ?? null,
      recepciones: recepciones.map(r => ({ compra_item_id: r.compraItemId, cantidad: r.cantidad })),
    },
  })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/compras')
  return { ok: true }
}

export async function anularCompra(compraId: string, motivo: string): Promise<ComprasResult> {
  const supabase = await createClient()

  // Frontera de confianza: si la compra ya tiene pagos de proveedor aplicados
  // (POS P4b), no se puede anular sin antes eliminarlos — anularla dejaría
  // aplicaciones de pago colgando de una compra sin saldo válido.
  const { count } = await supabase
    .from('pago_aplicaciones')
    .select('id', { count: 'exact', head: true })
    .eq('compra_id', compraId)
  if ((count ?? 0) > 0) {
    return { ok: false, error: 'La compra tiene pagos registrados. Elimínalos antes de anular.' }
  }

  const { error } = await supabase.rpc('anular_compra', { p_compra_id: compraId, p_motivo: motivo })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/compras')
  return { ok: true }
}

// Forma releída de `productos` para armar la sugerencia de reorden: el stock
// (y por lo tanto la comparación contra el mínimo) vive por variante cuando
// el producto tiene hijas activas; `producto_variantes` no tiene su propio
// `stock_minimo`, así que se reusa el del producto padre para cada variante.
interface ProductoConVariantesReorden {
  id: string
  nombre: string
  stock: number | null
  costo: number | null
  stock_minimo: number
  producto_variantes: { id: string; nombre: string; stock: number | null; costo: number | null; activo: boolean }[]
}

export async function obtenerReorden(): Promise<ComprasResult<ReordenLinea[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, stock, costo, stock_minimo, producto_variantes(id, nombre, stock, costo, activo)')
    .eq('activo', true)
    .not('stock_minimo', 'is', null)
  if (error) return { ok: false, error: ERROR_GENERICO }

  const lineas: ReordenLinea[] = []
  for (const p of (data ?? []) as unknown as ProductoConVariantesReorden[]) {
    const stockMinimo = p.stock_minimo
    const variantesActivas = p.producto_variantes.filter(v => v.activo)

    if (variantesActivas.length > 0) {
      for (const v of variantesActivas) {
        if (v.stock == null) continue
        if (v.stock > stockMinimo) continue
        const cantidadSugerida = cantidadSugeridaReorden(v.stock, stockMinimo)
        if (cantidadSugerida <= 0) continue
        lineas.push({
          producto_id: p.id, variante_id: v.id, descripcion: `${p.nombre} - ${v.nombre}`,
          stock: v.stock, stock_minimo: stockMinimo, cantidad_sugerida: cantidadSugerida,
          costo: v.costo ?? p.costo,
        })
      }
    } else {
      if (p.stock == null) continue
      if (p.stock > stockMinimo) continue
      const cantidadSugerida = cantidadSugeridaReorden(p.stock, stockMinimo)
      if (cantidadSugerida <= 0) continue
      lineas.push({
        producto_id: p.id, variante_id: null, descripcion: p.nombre,
        stock: p.stock, stock_minimo: stockMinimo, cantidad_sugerida: cantidadSugerida,
        costo: p.costo,
      })
    }
  }

  return { ok: true, data: lineas }
}

export async function crearOrdenDesdeReorden(
  lineas: LineaCompraInput[],
  proveedorId: string,
): Promise<ComprasResult<{ id: string }>> {
  const hoy = new Date().toISOString().slice(0, 10)
  return guardarCompra({
    id: null,
    proveedorId,
    moneda: 'L',
    tasaCambio: null,
    facturaProveedor: null,
    condicionPago: 'contado',
    diasCredito: 0,
    fecha: hoy,
    notas: null,
    lineas,
  })
}
