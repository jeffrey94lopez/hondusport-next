'use server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase-server'
import { calculateOrderTotals, cartItemsToPedidoItems, resolveTrustedCustom } from '@/lib/store/orderTotals'
import { isConfigActivo, resolveFreeShippingThreshold } from '@/lib/store/freeShipping'
import { toConfigMap } from '@/lib/store/adapters'
import { validarCompra, precioEfectivo, traducirErrorPedido } from '@/lib/store/variantes'
import type { EnvioPricing } from '@/lib/store/orderTotals'
import type { CartItem } from '@/types/store'
import type { ProductoVariante } from '@/types'

const cartItemSchema = z.object({
  id: z.string().uuid(),
  size: z.string(),                       // '' en items con variante
  custom: z.string(),
  qty: z.number().int().positive().max(99),
  varianteId: z.string().uuid().optional(),
})

const crearPedidoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  telefono: z.string().min(1, 'El teléfono es requerido'),
  email: z.string().email('Correo inválido'),
  ciudad: z.string().optional().default(''),
  direccion: z.string().optional().default(''),
  envioId: z.string().uuid().nullable(),
  cuponCodigo: z.string().nullable(),
  cart: z.array(cartItemSchema).min(1, 'El carrito está vacío'),
})

export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>

export interface CrearPedidoResult {
  pedidoId?: string
  numero?: number
  error?: string
}

const GENERIC_ERROR = 'No se pudo crear el pedido. Intenta de nuevo.'

export async function crearPedido(payload: CrearPedidoInput): Promise<CrearPedidoResult> {
  const parsed = crearPedidoSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const { nombre, telefono, ciudad, direccion, envioId, cuponCodigo, cart } = parsed.data

  const supabase = await createClient()

  const productIds = [...new Set(cart.map(item => item.id))]
  const [{ data: productos, error: productosError }, { data: variantesRows, error: variantesError }] =
    await Promise.all([
      supabase
        .from('productos')
        .select('id, nombre, precio, imagenes, activo, personalizable, canal')
        .in('id', productIds),
      supabase
        .from('producto_variantes')
        .select('*')
        .in('producto_id', productIds)
        .eq('activo', true),
    ])

  if (productosError || !productos || variantesError) {
    return { error: GENERIC_ERROR }
  }

  const productosById = new Map(productos.map(p => [p.id, p]))
  const variantesPorProducto = new Map<string, ProductoVariante[]>()
  for (const v of (variantesRows ?? []) as ProductoVariante[]) {
    const lista = variantesPorProducto.get(v.producto_id) ?? []
    lista.push(v)
    variantesPorProducto.set(v.producto_id, lista)
  }

  const trustedCart: CartItem[] = []
  for (const item of cart) {
    const producto = productosById.get(item.id)
    if (!producto) {
      return { error: 'Uno o más productos del carrito ya no están disponibles' }
    }
    const resultado = validarCompra(producto, variantesPorProducto.get(item.id) ?? [], item.varianteId)
    if (!resultado.ok) return { error: resultado.motivo }
    const variante = resultado.variante
    trustedCart.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: variante
        ? precioEfectivo(Number(producto.precio), variante.precio != null ? Number(variante.precio) : null)
        : Number(producto.precio),
      imagen: producto.imagenes?.[0] ?? '',
      size: variante ? '' : item.size,
      custom: resolveTrustedCustom(producto.personalizable, item.custom),
      qty: item.qty,
      personalizable: producto.personalizable,
      varianteId: variante?.id,
      variante: variante?.nombre,
    })
  }

  let envio: EnvioPricing | null = null
  if (envioId) {
    const { data: envioRow, error: envioError } = await supabase
      .from('envios')
      .select('id, nombre, descripcion, tipo, costo, descuento, activo')
      .eq('id', envioId)
      .single()

    if (envioError || !envioRow || !envioRow.activo) {
      return { error: 'El método de envío seleccionado ya no está disponible' }
    }

    envio = {
      id: envioRow.id,
      nombre: envioRow.nombre,
      tipo: envioRow.tipo,
      costo: Number(envioRow.costo),
      descuento: Number(envioRow.descuento),
      descripcion: envioRow.descripcion,
    }
  }

  if (envio?.tipo === 'delivery' && (!ciudad.trim() || !direccion.trim())) {
    return { error: 'Completa ciudad y dirección' }
  }

  let activeDiscount = 0
  let cuponCodigoFinal: string | null = null
  if (cuponCodigo) {
    const { data: cuponRow } = await supabase
      .from('cupones')
      .select('codigo, descuento, activo')
      .eq('codigo', cuponCodigo)
      .single()

    if (cuponRow?.activo) {
      activeDiscount = Number(cuponRow.descuento)
      cuponCodigoFinal = cuponRow.codigo
    }
  }

  const { data: configRows } = await supabase.from('configuracion').select('key, value')
  const configMap = toConfigMap(configRows ?? [])
  const freeShippingActivo = isConfigActivo(configMap.free_shipping_activo, true)
  const freeShippingThreshold = resolveFreeShippingThreshold(configMap.free_shipping_minimo)

  const totals = calculateOrderTotals({
    cart: trustedCart,
    activeDiscount,
    envio,
    freeShippingActivo,
    freeShippingThreshold,
  })

  const items = cartItemsToPedidoItems(trustedCart)

  const { data, error } = await supabase
    .rpc('crear_pedido', {
      p_nombre_cliente: nombre,
      p_telefono: telefono,
      p_ciudad: envio?.tipo === 'delivery' ? ciudad : '',
      p_envio_id: envio?.id ?? null,
      p_envio_nombre: envio?.nombre ?? null,
      p_cupon_codigo: cuponCodigoFinal,
      p_subtotal: totals.subtotal,
      p_descuento_cupon: totals.totalDiscount,
      p_costo_envio: totals.shippingFee,
      p_total: totals.total,
      p_notas: envio?.tipo === 'delivery' ? direccion : (envio?.descripcion ?? null),
      p_items: items,
    })
    .single<{ id: string; numero: number }>()

  if (error || !data) {
    console.error('crear_pedido RPC error:', error)
    return { error: traducirErrorPedido(error?.message) ?? GENERIC_ERROR }
  }

  return { pedidoId: data.id, numero: data.numero }
}
