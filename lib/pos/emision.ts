import type { PagoPos, MetodoPagoTipo } from '@/types'
import { precioParaCliente } from '@/lib/store/costeo'
import { traducirErrorPedido } from '@/lib/store/variantes'
import { formatPrice } from '@/lib/store/format'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Precio de línea POS según tipo de cliente, con herencia padre/variante:
 * - precioBase = variante?.precio ?? producto.precio
 * - precioRev  = variante?.precio_revendedor ?? producto.precio_revendedor
 */
export function precioLineaPos(
  tipoCliente: 'final' | 'revendedor',
  producto: { precio: number; precio_revendedor: number | null },
  variante?: { precio: number | null; precio_revendedor: number | null } | null,
): number {
  const precioBase = variante?.precio ?? producto.precio
  const precioRev = variante?.precio_revendedor ?? producto.precio_revendedor
  return precioParaCliente(tipoCliente, precioBase, precioRev)
}

/**
 * Validaciones de emisión previas a enviar a la RPC.
 * El límite de identificación de consumidor final solo aplica a facturas.
 */
export function validarEmision(args: {
  tipo: 'factura' | 'comprobante'
  clienteNombre: string
  clienteRtn: string | null
  clienteIdentidad: string | null
  total: number
  limite: number
}): string | null {
  const { tipo, clienteNombre, clienteRtn, clienteIdentidad, total, limite } = args
  if (tipo === 'factura' && total > limite) {
    const esConsumidorFinal = clienteNombre.trim().toUpperCase() === 'CONSUMIDOR FINAL'
    if (esConsumidorFinal && !clienteRtn && !clienteIdentidad) {
      return `El total supera ${formatPrice(limite)}: se requiere RTN o identificación del cliente.`
    }
  }
  return null
}

/**
 * Valida que los pagos cubran el total. El exceso solo se permite si hay
 * algún pago en efectivo (se interpreta como cambio).
 */
export function validarPagos(pagos: PagoPos[], total: number): string | null {
  if (pagos.length === 0) return 'Agrega al menos un pago.'
  const suma = round2(pagos.reduce((s, p) => s + p.monto, 0))
  if (suma < total - 0.01) return 'Los pagos no cubren el total.'
  if (suma > total + 0.01) {
    const hayEfectivo = pagos.some(p => p.tipo === 'efectivo_lps' || p.tipo === 'efectivo_usd')
    if (!hayEfectivo) return 'El exceso solo se permite en pagos de efectivo (cambio).'
  }
  return null
}

/** Cambio (vuelto) a entregar: exceso de los pagos sobre el total, nunca negativo. */
export function cambioPago(pagos: PagoPos[], total: number): number {
  const suma = pagos.reduce((s, p) => s + p.monto, 0)
  return Math.max(0, round2(suma - total))
}

/**
 * Tasa de cambio a imprimir en el documento (Art. 11): la del primer pago en
 * USD que traiga tasa, o null si no hubo pago en USD.
 */
export function tasaUsdDePagos(pagos: PagoPos[]): number | null {
  return pagos.find(p => p.tipo === 'efectivo_usd' && p.tasa != null)?.tasa ?? null
}

/**
 * Efectivo y por-método esperados en caja a partir de los documentos emitidos.
 * El cambio entregado sale del efectivo (se resta), pero no de porMetodo.
 */
export function esperadoCaja(
  montoInicial: number,
  docs: Array<{ estado: string; total: number; pagos: Array<{ tipo: MetodoPagoTipo; monto: number }> }>,
): { efectivoEsperado: number; porMetodo: Record<MetodoPagoTipo, number> } {
  const porMetodo: Record<MetodoPagoTipo, number> = {
    efectivo_lps: 0,
    efectivo_usd: 0,
    tarjeta: 0,
    transferencia: 0,
    otro: 0,
  }

  let efectivoEsperado = montoInicial

  for (const doc of docs) {
    if (doc.estado !== 'emitido') continue
    const cambio = cambioPago(doc.pagos as PagoPos[], doc.total)
    for (const pago of doc.pagos) {
      porMetodo[pago.tipo] += pago.monto
      if (pago.tipo === 'efectivo_lps' || pago.tipo === 'efectivo_usd') {
        efectivoEsperado += pago.monto
      }
    }
    efectivoEsperado = round2(efectivoEsperado - cambio)
  }

  return { efectivoEsperado, porMetodo }
}

/**
 * Traduce los códigos de error nuevos del POS (HS_CAJA, HS_CAI, HS_TOTAL,
 * HS_PEDIDO_DOC, HS_DOC) a mensajes legibles; delega los demás en
 * traducirErrorPedido (HS_STOCK, HS_REQUIERE_VARIANTE, etc.).
 */
export function traducirErrorPos(message: string | null | undefined): string | null {
  if (!message) return null
  const [codigo, a, b] = message.split('|')
  switch (codigo) {
    case 'HS_CAJA':
      if (a === 'caja no encontrada') return 'La caja no existe o está desactivada.'
      return `La caja "${a}" no tiene una sesión abierta.`
    case 'HS_CAI':
      if (a === 'vencido') return `El CAI de esta caja venció el ${b}.`
      if (a === 'agotado') return `El CAI de esta caja agotó su rango (hasta ${b}).`
      if (a === 'sin_cai') return `No hay un CAI activo configurado para el punto de emisión "${b}".`
      return 'Problema con el CAI de esta caja.'
    case 'HS_TOTAL':
      return 'Los totales no cuadran; revisa las líneas y los pagos.'
    case 'HS_PEDIDO_DOC':
      return `Este pedido ya tiene un documento emitido (#${a}).`
    case 'HS_DOC':
      return a
    default:
      return traducirErrorPedido(message)
  }
}
