'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import type { LineaConColumna } from '@/lib/pos/desglose'
import { numeroALetras } from '@/lib/pos/letras'
import { validarEmision, validarPagos, esperadoCaja, traducirErrorPos } from '@/lib/pos/emision'
import type { LineaPos, PagoPos, TotalesDocumento, MetodoPagoTipo } from '@/types'

export type PosResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const round2 = (n: number) => Math.round(n * 100) / 100

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

async function usuarioActual(supabase: SupabaseServerClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

async function limiteConsumidorFinal(supabase: SupabaseServerClient): Promise<number> {
  const { data } = await supabase.from('configuracion').select('key, value')
  const limite = Number(toConfigMap(data ?? []).pos_limite_consumidor_final)
  return Number.isFinite(limite) ? limite : 10000
}

// Recalcula prorrateo + desglose + totales (incluye numeroALetras del total ya
// desglosado, por eso no puede pasarse como argumento de una sola pasada).
function construirTotales(
  lineas: LineaPos[],
  descuentoGlobal: number,
  exonerado: boolean,
): { lineas: LineaConColumna[]; totales: TotalesDocumento } {
  const prorrateadas = prorratearDescuentoGlobal(lineas, descuentoGlobal)
  const desglosadas = prorrateadas.map(l => desglosarLinea(l, exonerado))
  const parcial = totalesDocumento(desglosadas, descuentoGlobal, '')
  const totales: TotalesDocumento = { ...parcial, total_letras: numeroALetras(parcial.total) }
  return { lineas: desglosadas, totales }
}

function itemPayload(l: LineaConColumna) {
  return {
    producto_id: l.producto_id,
    variante_id: l.variante_id,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    descuento: l.descuento,
    isv: l.isv,
    importe: l.importe,
    base: l.base,
    isv_monto: l.isv_monto,
  }
}

function pagoPayload(p: PagoPos) {
  return {
    metodo_id: p.metodo_id,
    monto: p.monto,
    monto_usd: p.monto_usd ?? null,
    tasa: p.tasa ?? null,
    referencia: p.referencia ?? null,
  }
}

// Tasa a imprimir en el documento (Art. 11): la del primer pago en USD, si hubo.
function tasaUsdDePagos(pagos: PagoPos[]): number | null {
  return pagos.find(p => p.tipo === 'efectivo_usd' && p.tasa != null)?.tasa ?? null
}

export async function abrirSesion(
  cajaId: string,
  montoInicial: number,
): Promise<PosResult<{ sesionId: string }>> {
  if (montoInicial < 0) return { ok: false, error: 'El monto inicial no puede ser negativo.' }

  const supabase = await createClient()
  const usuario = await usuarioActual(supabase)

  const { data, error } = await supabase
    .from('sesiones_caja')
    .insert({ caja_id: cajaId, monto_inicial: montoInicial, usuario })
    .select('id')
    .single()

  if (error || !data) {
    if (error?.code === '23505' && error.message.includes('sesiones_caja_abierta_unica')) {
      return { ok: false, error: 'Esta caja ya tiene una sesión abierta.' }
    }
    return { ok: false, error: error?.message ?? ERROR_GENERICO }
  }

  revalidatePath('/admin/pos')
  return { ok: true, data: { sesionId: data.id } }
}

export async function cerrarSesion(
  sesionId: string,
  montoContado: number,
  notas: string,
): Promise<PosResult<{ esperado: number; diferencia: number }>> {
  if (montoContado < 0) return { ok: false, error: 'El monto contado no puede ser negativo.' }

  const supabase = await createClient()

  const { data: sesion, error: sesionError } = await supabase
    .from('sesiones_caja')
    .select('id, monto_inicial, estado')
    .eq('id', sesionId)
    .maybeSingle()

  if (sesionError || !sesion) return { ok: false, error: 'La sesión no existe.' }
  if (sesion.estado !== 'abierta') return { ok: false, error: 'Esta sesión ya está cerrada.' }

  const { data: documentosRows, error: documentosError } = await supabase
    .from('documentos')
    .select('estado, total, documento_pagos(monto, metodos_pago(tipo))')
    .eq('sesion_id', sesionId)

  if (documentosError) return { ok: false, error: ERROR_GENERICO }

  const docs = (documentosRows ?? []).map(d => ({
    estado: d.estado,
    total: Number(d.total),
    pagos: (d.documento_pagos ?? []).map((dp: { monto: number; metodos_pago: { tipo: MetodoPagoTipo }[] }) => ({
      tipo: dp.metodos_pago[0]?.tipo as MetodoPagoTipo,
      monto: Number(dp.monto),
    })),
  }))

  const { efectivoEsperado } = esperadoCaja(Number(sesion.monto_inicial), docs)
  const diferencia = round2(montoContado - efectivoEsperado)

  const { error: updateError } = await supabase
    .from('sesiones_caja')
    .update({
      estado: 'cerrada',
      monto_esperado: efectivoEsperado,
      monto_contado: montoContado,
      diferencia,
      notas,
      cerrada_at: new Date().toISOString(),
    })
    .eq('id', sesionId)

  if (updateError) return { ok: false, error: ERROR_GENERICO }

  revalidatePath('/admin/pos')
  return { ok: true, data: { esperado: efectivoEsperado, diferencia } }
}

export async function emitirVenta(input: {
  tipo: 'factura' | 'comprobante'
  cajaId: string
  vendedorId: string | null
  cliente: {
    id: string | null
    nombre: string
    rtn: string | null
    identidad: string | null
    exonerado: boolean
    ordenCompraExenta: string | null
    constanciaExonerado: string | null
    registroSag: string | null
  }
  lineas: LineaPos[]
  descuentoGlobal: number
  pagos: PagoPos[]
  notas: string | null
}): Promise<PosResult<{ documentoId: string }>> {
  if (input.lineas.length === 0) return { ok: false, error: 'Agrega al menos una línea a la venta.' }

  const supabase = await createClient()

  // Frontera de confianza parcial: precio y descuento NO se releen (el POS
  // permite override), pero sí isv/canal/activo/descripcion de lo que tenga
  // producto_id. Las líneas libres pasan tal cual.
  const productoIds = [...new Set(
    input.lineas.map(l => l.producto_id).filter((id): id is string => id !== null),
  )]
  const varianteIds = [...new Set(
    input.lineas.map(l => l.variante_id).filter((id): id is string => id !== null),
  )]

  const [{ data: productosRows, error: productosError }, { data: variantesRows, error: variantesError }] =
    await Promise.all([
      supabase.from('productos').select('id, nombre, isv, canal, activo').in('id', productoIds),
      supabase.from('producto_variantes').select('id, producto_id, nombre').in('id', varianteIds).eq('activo', true),
    ])

  if (productosError || variantesError) return { ok: false, error: ERROR_GENERICO }

  const productos = new Map((productosRows ?? []).map(p => [p.id, p]))
  const variantes = new Map((variantesRows ?? []).map(v => [v.id, v]))

  const lineasReleidas: LineaPos[] = []
  for (const linea of input.lineas) {
    if (!linea.producto_id) {
      lineasReleidas.push(linea)
      continue
    }

    const producto = productos.get(linea.producto_id)
    if (!producto) return { ok: false, error: 'Uno o más productos ya no están disponibles.' }
    if (!producto.activo || producto.canal === 'tienda') {
      return { ok: false, error: `"${producto.nombre}" ya no está disponible.` }
    }

    let descripcion = producto.nombre
    if (linea.variante_id) {
      const variante = variantes.get(linea.variante_id)
      if (!variante || variante.producto_id !== linea.producto_id) {
        return { ok: false, error: `La variante seleccionada de "${producto.nombre}" ya no está disponible.` }
      }
      descripcion = `${producto.nombre} (${variante.nombre})`
    }

    lineasReleidas.push({
      producto_id: linea.producto_id,
      variante_id: linea.variante_id,
      descripcion,
      cantidad: linea.cantidad,
      precio_unitario: linea.precio_unitario,
      descuento: linea.descuento,
      isv: producto.isv,
    })
  }

  const { lineas, totales } = construirTotales(lineasReleidas, input.descuentoGlobal, input.cliente.exonerado)

  const limite = await limiteConsumidorFinal(supabase)
  const errorEmision = validarEmision({
    tipo: input.tipo,
    clienteNombre: input.cliente.nombre,
    clienteRtn: input.cliente.rtn,
    clienteIdentidad: input.cliente.identidad,
    total: totales.total,
    limite,
  })
  if (errorEmision) return { ok: false, error: errorEmision }

  const errorPagos = validarPagos(input.pagos, totales.total)
  if (errorPagos) return { ok: false, error: errorPagos }

  const usuario = await usuarioActual(supabase)

  const payload = {
    tipo: input.tipo,
    caja_id: input.cajaId,
    vendedor_id: input.vendedorId,
    cliente_id: input.cliente.id,
    cliente_nombre: input.cliente.nombre,
    cliente_rtn: input.cliente.rtn,
    cliente_identidad: input.cliente.identidad,
    exonerado: input.cliente.exonerado,
    orden_compra_exenta: input.cliente.ordenCompraExenta,
    constancia_exonerado: input.cliente.constanciaExonerado,
    registro_sag: input.cliente.registroSag,
    notas: input.notas,
    usuario,
    tasa_usd: tasaUsdDePagos(input.pagos),
    totales,
    items: lineas.map(itemPayload),
    pagos: input.pagos.map(pagoPayload),
  }

  const { data, error } = await supabase.rpc('emitir_documento', { p: payload })
  if (error || !data) {
    return { ok: false, error: traducirErrorPos(error?.message) ?? ERROR_GENERICO }
  }

  revalidatePath('/admin/pos')
  return { ok: true, data: { documentoId: data as string } }
}

export async function emitirDesdePedido(input: {
  pedidoId: string
  tipo: 'factura' | 'comprobante'
  cajaId: string
  clienteId: string | null
}): Promise<PosResult<{ documentoId: string }>> {
  const supabase = await createClient()

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select(
      'id, nombre_cliente, pedido_items(producto_id, variante_id, nombre_producto, variante_nombre, talla, precio, cantidad)',
    )
    .eq('id', input.pedidoId)
    .maybeSingle()

  if (pedidoError || !pedido) return { ok: false, error: 'El pedido ya no existe.' }

  const items = pedido.pedido_items ?? []
  if (items.length === 0) return { ok: false, error: 'El pedido no tiene productos.' }

  // Precios del pedido: históricos, se usan tal cual. Solo el isv se relee del
  // producto vigente; si el producto ya no existe, la línea pasa a libre.
  const productoIds = [...new Set(
    items.map((it: { producto_id: string | null }) => it.producto_id).filter((id): id is string => id !== null),
  )]
  const { data: productosRows, error: productosError } = await supabase
    .from('productos')
    .select('id, isv')
    .in('id', productoIds)

  if (productosError) return { ok: false, error: ERROR_GENERICO }

  const productos = new Map((productosRows ?? []).map(p => [p.id, p]))

  const lineas: LineaPos[] = items.map(
    (it: {
      producto_id: string | null
      variante_id: string | null
      nombre_producto: string
      variante_nombre: string | null
      talla: string | null
      precio: number
      cantidad: number
    }) => {
      const variante = it.variante_nombre ?? it.talla
      const descripcion = variante ? `${it.nombre_producto} (${variante})` : it.nombre_producto
      const producto = it.producto_id ? productos.get(it.producto_id) : undefined

      if (!producto) {
        return {
          producto_id: null,
          variante_id: null,
          descripcion,
          cantidad: it.cantidad,
          precio_unitario: it.precio,
          descuento: 0,
          isv: '15',
        }
      }

      return {
        producto_id: it.producto_id,
        variante_id: it.variante_id,
        descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio,
        descuento: 0,
        isv: producto.isv,
      }
    },
  )

  let cliente: {
    id: string | null
    nombre: string
    rtn: string | null
    identidad: string | null
    exonerado: boolean
    constanciaExonerado: string | null
    registroSag: string | null
  }

  if (input.clienteId) {
    const { data: clienteRow, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nombre, rtn, identidad, exonerado, constancia_exonerado, registro_sag')
      .eq('id', input.clienteId)
      .maybeSingle()
    if (clienteError || !clienteRow) return { ok: false, error: 'El cliente ya no existe.' }
    cliente = {
      id: clienteRow.id,
      nombre: clienteRow.nombre,
      rtn: clienteRow.rtn,
      identidad: clienteRow.identidad,
      exonerado: clienteRow.exonerado,
      constanciaExonerado: clienteRow.constancia_exonerado,
      registroSag: clienteRow.registro_sag,
    }
  } else {
    cliente = {
      id: null,
      nombre: pedido.nombre_cliente,
      rtn: null,
      identidad: null,
      exonerado: false,
      constanciaExonerado: null,
      registroSag: null,
    }
  }

  const { lineas: lineasDesglosadas, totales } = construirTotales(lineas, 0, cliente.exonerado)
  const usuario = await usuarioActual(supabase)

  const payload = {
    tipo: input.tipo,
    caja_id: input.cajaId,
    vendedor_id: null,
    cliente_id: cliente.id,
    cliente_nombre: cliente.nombre,
    cliente_rtn: cliente.rtn,
    cliente_identidad: cliente.identidad,
    exonerado: cliente.exonerado,
    orden_compra_exenta: null,
    constancia_exonerado: cliente.constanciaExonerado,
    registro_sag: cliente.registroSag,
    pedido_id: input.pedidoId,
    notas: null,
    usuario,
    tasa_usd: null,
    totales,
    items: lineasDesglosadas.map(itemPayload),
    pagos: [],
  }

  const { data, error } = await supabase.rpc('emitir_documento', { p: payload })
  if (error || !data) {
    return { ok: false, error: traducirErrorPos(error?.message) ?? ERROR_GENERICO }
  }

  revalidatePath('/admin/pos')
  revalidatePath('/admin/pedidos')
  return { ok: true, data: { documentoId: data as string } }
}

export async function anularDocumento(documentoId: string, motivo: string): Promise<PosResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('anular_comprobante', {
    p_documento_id: documentoId,
    p_motivo: motivo,
  })
  if (error) return { ok: false, error: traducirErrorPos(error.message) ?? ERROR_GENERICO }

  revalidatePath('/admin/pos/documentos')
  return { ok: true }
}

export async function guardarEspera(cajaId: string, nombre: string, payload: unknown): Promise<PosResult> {
  if (!nombre.trim()) return { ok: false, error: 'El nombre es requerido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ventas_espera')
    .insert({ caja_id: cajaId, nombre: nombre.trim(), payload })

  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidatePath('/admin/pos')
  return { ok: true }
}

export async function eliminarEspera(id: string): Promise<PosResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('ventas_espera').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidatePath('/admin/pos')
  return { ok: true }
}
