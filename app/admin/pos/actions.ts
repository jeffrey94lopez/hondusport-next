'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import type { LineaConColumna } from '@/lib/pos/desglose'
import { numeroALetras } from '@/lib/pos/letras'
import { validarEmision, validarPagos, esperadoCaja, traducirErrorPos, tasaUsdDePagos } from '@/lib/pos/emision'
import { validarRtn } from '@/lib/pos/fiscal'
import type {
  LineaPos,
  PagoPos,
  TotalesDocumento,
  MetodoPagoTipo,
  Cliente,
  ClienteForm,
  Documento,
  DocumentoItem,
  DocumentoPago,
  Caja,
  CaiAutorizacion,
  ConfigMap,
  DocumentoPagoConMetodo,
} from '@/types'

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
    if (error) console.error('abrirSesion insert error:', error)
    return { ok: false, error: 'No se pudo abrir la sesión. Intenta de nuevo.' }
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

  // Sin tipos de Database generados, el cliente de Supabase infiere las
  // relaciones embebidas como arreglo por defecto (no puede conocer la
  // cardinalidad del FK). En runtime, PostgREST devuelve OBJETO para un
  // embed to-one como documento_pagos → metodos_pago (metodo_id es FK simple,
  // no hay muchos métodos por pago): se corrige el tipo aquí para reflejar
  // la forma real, no la inferida.
  interface DocumentoConPagos {
    estado: string
    total: number
    documento_pagos: Array<{ monto: number; metodos_pago: { tipo: MetodoPagoTipo } | null }>
  }
  const documentos = (documentosRows ?? []) as unknown as DocumentoConPagos[]

  const docs = documentos.map(d => ({
    estado: d.estado,
    total: Number(d.total),
    pagos: d.documento_pagos.map(dp => ({
      tipo: dp.metodos_pago?.tipo as MetodoPagoTipo,
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
      productoIds.length
        ? supabase.from('productos').select('id, nombre, isv, canal, activo').in('id', productoIds)
        : Promise.resolve({ data: [], error: null }),
      varianteIds.length
        ? supabase.from('producto_variantes').select('id, producto_id, nombre').in('id', varianteIds).eq('activo', true)
        : Promise.resolve({ data: [], error: null }),
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
      'id, nombre_cliente, total, costo_envio, descuento_cupon, envio_nombre, pedido_items(producto_id, variante_id, nombre_producto, variante_nombre, talla, precio, cantidad)',
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
  const { data: productosRows, error: productosError } = productoIds.length
    ? await supabase.from('productos').select('id, isv').in('id', productoIds)
    : { data: [], error: null }

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

  // El envío es un servicio con costo propio que el pedido cobró aparte del
  // subtotal de productos: si no se factura como línea, el documento queda
  // corto por el monto del envío. Es gravado (15%) igual que cualquier servicio.
  const costoEnvio = Number(pedido.costo_envio) || 0
  if (costoEnvio > 0) {
    lineas.push({
      producto_id: null,
      variante_id: null,
      descripcion: pedido.envio_nombre ? `Envío — ${pedido.envio_nombre}` : 'Envío',
      cantidad: 1,
      precio_unitario: costoEnvio,
      descuento: 0,
      isv: '15',
    })
  }

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

  const descuentoGlobal = Number(pedido.descuento_cupon) || 0
  const { lineas: lineasDesglosadas, totales } = construirTotales(lineas, descuentoGlobal, cliente.exonerado)

  // El documento debe facturar exactamente lo que el pedido cobró (envío y
  // cupón incluidos). Si no cuadra, es mejor no emitir que emitir un
  // documento fiscal divergente del pedido de origen.
  if (Math.abs(totales.total - Number(pedido.total)) > 0.01) {
    return { ok: false, error: 'El total del documento no coincide con el total del pedido; revisa envío y cupón antes de emitir.' }
  }

  const limite = await limiteConsumidorFinal(supabase)
  const errorEmision = validarEmision({
    tipo: input.tipo,
    clienteNombre: cliente.nombre,
    clienteRtn: cliente.rtn,
    clienteIdentidad: cliente.identidad,
    total: totales.total,
    limite,
  })
  if (errorEmision) return { ok: false, error: errorEmision }

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

  const { count } = await supabase
    .from('cobro_aplicaciones')
    .select('id', { count: 'exact', head: true })
    .eq('documento_id', documentoId)
  if ((count ?? 0) > 0) {
    return { ok: false, error: 'El documento tiene cobros registrados. Elimínalos antes de anular.' }
  }

  const { error } = await supabase.rpc('anular_comprobante', {
    p_documento_id: documentoId,
    p_motivo: motivo,
  })
  if (error) return { ok: false, error: traducirErrorPos(error.message) ?? ERROR_GENERICO }

  revalidatePath('/admin/pos/documentos')
  return { ok: true }
}

// Devuelve el `id` insertado: las pestañas de venta (PosClient) lo necesitan
// para poder actualizar esta misma fila en el siguiente cambio de pestaña en
// vez de duplicarla (ver actualizarEspera más abajo).
export async function guardarEspera(cajaId: string, nombre: string, payload: unknown): Promise<PosResult<{ id: string }>> {
  if (!nombre.trim()) return { ok: false, error: 'El nombre es requerido.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_espera')
    .insert({ caja_id: cajaId, nombre: nombre.trim(), payload })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: ERROR_GENERICO }

  revalidatePath('/admin/pos')
  return { ok: true, data: { id: data.id } }
}

// Actualiza en el lugar una fila de `ventas_espera` ya existente (misma
// pestaña que se guardó antes con guardarEspera) — se eligió una action
// separada en vez de convertir guardarEspera en upsert porque el llamador
// (PosClient) siempre sabe de antemano si la pestaña ya tiene `esperaId`
// (crear vs. actualizar es una decisión pura, ver accionPersistencia en
// lib/pos/carrito.ts) y así cada action mapea 1:1 con una sola operación SQL.
export async function actualizarEspera(id: string, nombre: string, payload: unknown): Promise<PosResult> {
  if (!nombre.trim()) return { ok: false, error: 'El nombre es requerido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ventas_espera')
    .update({ nombre: nombre.trim(), payload })
    .eq('id', id)

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

export async function toggleFavoritoPos(productoId: string, favorito: boolean): Promise<PosResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('productos')
    .update({ favorito_pos: favorito }).eq('id', productoId)
  if (error) {
    console.error('toggleFavoritoPos:', error)
    return { ok: false, error: 'No se pudo cambiar el anclaje del producto.' }
  }
  revalidatePath('/admin/pos')
  return { ok: true }
}

// Igual que toPayload en app/admin/clientes/actions.ts: los campos de
// exonerado NUNCA se persisten si el checkbox viene desmarcado (bug de P1).
function clienteFormPayload(form: ClienteForm) {
  return {
    nombre: form.nombre.trim(),
    rtn: form.rtn.trim() || null,
    identidad: form.identidad.trim() || null,
    tipo_cliente: form.tipo_cliente,
    exonerado: form.exonerado,
    constancia_exonerado: form.exonerado ? form.constancia_exonerado.trim() || null : null,
    registro_sag: form.exonerado ? form.registro_sag.trim() || null : null,
    direccion: form.direccion.trim() || null,
    telefono: form.telefono.trim() || null,
    correo: form.correo.trim() || null,
    notas: form.notas.trim() || null,
    es_cliente: form.es_cliente ?? true,
    es_proveedor: form.es_proveedor ?? false,
    contacto: (form.contacto ?? '').trim() || null,
    dias_credito: form.dias_credito ?? 0,
  }
}

// createCliente (app/admin/clientes/actions.ts) devuelve solo ActionResult
// (ok/error), sin el registro insertado. El POS necesita el `id` del cliente
// recién creado para seleccionarlo de inmediato en la venta, así que esta
// action inserta con `.select().single()` y lo devuelve — misma validación
// (nombre requerido, validarRtn) y mismo manejo de RTN duplicado (23505 sobre
// clientes_rtn_unico) que el módulo de clientes.
export async function crearClienteDesdePos(form: ClienteForm): Promise<PosResult<{ cliente: Cliente }>> {
  if (!form.nombre.trim()) return { ok: false, error: 'El nombre es requerido.' }
  const rtn = form.rtn.trim()
  if (rtn) {
    const rtnError = validarRtn(rtn)
    if (rtnError) return { ok: false, error: rtnError }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert(clienteFormPayload(form))
    .select()
    .single()

  if (error || !data) {
    if (error?.code === '23505' && error.message.includes('clientes_rtn_unico')) {
      const { data: existente } = await supabase.from('clientes').select('nombre').eq('rtn', rtn).maybeSingle()
      return { ok: false, error: `El RTN ya pertenece a "${existente?.nombre ?? 'otro cliente'}"` }
    }
    if (error) console.error('crearClienteDesdePos insert error:', error)
    return { ok: false, error: ERROR_GENERICO }
  }

  revalidatePath('/admin/pos')
  return { ok: true, data: { cliente: data as Cliente } }
}

// Embed real de documento_pagos → metodos_pago: FK simple (to-one), PostgREST
// devuelve un OBJETO por fila, no un arreglo (mismo caso documentado en
// documento/[id]/page.tsx y en cerrarSesion más arriba en este archivo).
interface DocumentoPagoEmbed extends DocumentoPago {
  metodos_pago: { nombre: string; tipo: MetodoPagoTipo } | null
}

// Mismas queries que documento/[id]/page.tsx, extraídas para que
// DocumentoModal (Task 11: documento en modal tras cobrar) pueda cargar el
// documento recién emitido sin navegar. A propósito NO comparte estado de
// servidor con la página: cada uno hace su propio fetch e independiente
// mapeo de pagos, así que un cambio en uno no puede romper al otro en
// silencio.
export async function obtenerDocumento(documentoId: string): Promise<PosResult<{
  documento: Documento
  items: DocumentoItem[]
  pagos: DocumentoPagoConMetodo[]
  cai: CaiAutorizacion | null
  caja: Caja
  config: ConfigMap
}>> {
  const supabase = await createClient()

  const [
    { data: documento },
    { data: items },
    { data: pagos },
    { data: config },
  ] = await Promise.all([
    supabase.from('documentos').select('*').eq('id', documentoId).maybeSingle(),
    supabase.from('documento_items').select('*').eq('documento_id', documentoId),
    supabase.from('documento_pagos').select('*, metodos_pago(nombre, tipo)').eq('documento_id', documentoId),
    supabase.from('configuracion').select('key, value'),
  ])

  if (!documento) return { ok: false, error: 'El documento ya no existe.' }

  const [{ data: caja }, { data: cai }] = await Promise.all([
    supabase.from('cajas').select('*').eq('id', documento.caja_id).maybeSingle(),
    documento.cai_id
      ? supabase.from('cai_autorizaciones').select('*').eq('id', documento.cai_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!caja) return { ok: false, error: ERROR_GENERICO }
  // Misma garantía que en la página: una factura nunca se emite sin CAI
  // vigente (RPC emitir_documento la exige) — si falta aquí es un problema
  // de datos, no un caso normal.
  if (documento.tipo === 'factura' && !cai) return { ok: false, error: ERROR_GENERICO }

  const pagosConMetodo: DocumentoPagoConMetodo[] = ((pagos ?? []) as unknown as DocumentoPagoEmbed[]).map(
    ({ metodos_pago, ...p }) => ({
      ...p,
      metodo_nombre: metodos_pago?.nombre ?? 'Otro',
      metodo_tipo: metodos_pago?.tipo ?? 'otro',
    }),
  )

  return {
    ok: true,
    data: {
      documento: documento as Documento,
      items: (items ?? []) as DocumentoItem[],
      pagos: pagosConMetodo,
      cai: (cai ?? null) as CaiAutorizacion | null,
      caja: caja as Caja,
      config: toConfigMap(config ?? []),
    },
  }
}
