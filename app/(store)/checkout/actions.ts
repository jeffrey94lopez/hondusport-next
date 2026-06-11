'use server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase-server'
import { calculateOrderTotals, cartItemsToPedidoItems } from '@/lib/store/orderTotals'
import { toConfigMap } from '@/lib/store/adapters'
import type { EnvioPricing } from '@/lib/store/orderTotals'
import type { CartItem } from '@/types/store'

const cartItemSchema = z.object({
  id: z.string().uuid(),
  size: z.string().min(1),
  custom: z.string(),
  qty: z.number().int().positive().max(99),
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
const SIN_PERSONALIZACION = 'Sin personalización'

export async function crearPedido(payload: CrearPedidoInput): Promise<CrearPedidoResult> {
  const parsed = crearPedidoSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const { nombre, telefono, ciudad, direccion, envioId, cuponCodigo, cart } = parsed.data

  const supabase = await createClient()

  const productIds = [...new Set(cart.map(item => item.id))]
  const { data: productos, error: productosError } = await supabase
    .from('productos')
    .select('id, nombre, precio, imagenes, activo')
    .in('id', productIds)

  if (productosError || !productos) {
    return { error: GENERIC_ERROR }
  }

  const productosById = new Map(productos.map(p => [p.id, p]))
  const trustedCart: CartItem[] = []
  for (const item of cart) {
    const producto = productosById.get(item.id)
    if (!producto || !producto.activo) {
      return { error: 'Uno o más productos del carrito ya no están disponibles' }
    }
    trustedCart.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: Number(producto.precio),
      imagen: producto.imagenes?.[0] ?? '',
      size: item.size,
      custom: item.custom === SIN_PERSONALIZACION || item.custom === '' ? SIN_PERSONALIZACION : item.custom,
      qty: item.qty,
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
  const freeShippingActivo = configMap.free_shipping_activo !== 'false'
  const freeShippingThreshold = Number(configMap.free_shipping_minimo ?? '999')

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
    return { error: GENERIC_ERROR }
  }

  return { pedidoId: data.id, numero: data.numero }
}
