import type { PagoPos, MetodoPagoTipo, CobroMetodo } from '@/types'
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
 * Art. 11 del Acuerdo: toda factura que supere el límite exige RTN o
 * identificación del cliente, sin importar el nombre que traiga (no solo
 * cuando es "CONSUMIDOR FINAL" — cualquier cliente sin RTN ni identidad
 * registrada cae en la misma exigencia).
 */
export function validarEmision(args: {
  tipo: 'factura' | 'comprobante'
  clienteNombre: string
  clienteRtn: string | null
  clienteIdentidad: string | null
  total: number
  limite: number
}): string | null {
  const { tipo, clienteRtn, clienteIdentidad, total, limite } = args
  if (tipo === 'factura' && total > limite && !clienteRtn && !clienteIdentidad) {
    return `El total supera ${formatPrice(limite)}: se requiere RTN o identificación del cliente.`
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

// Forma de retorno de `esperadoCaja` (R7), exportada para que los llamadores
// que necesitan el tipo (p. ej. `obtenerResumenSesion` en
// app/admin/pos/actions.ts, y quien consuma su resultado en el cliente) no
// tengan que re-declararla a mano: si mañana se agrega un campo aquí, tsc
// avisa en todos los sitios que usan `ResumenCaja`, no solo en esta función.
export interface ResumenCaja {
  efectivoEsperado: number
  cambioEntregado: number
  porMetodo: Record<MetodoPagoTipo, number>
  cobrosPorMetodo: Record<CobroMetodo, number>
  devolucionesPorMetodo: Record<CobroMetodo, number>
}

/**
 * Efectivo y por-método esperados en caja a partir de los documentos emitidos,
 * más (opcional) los cobros de CxC registrados en la sesión. El cambio
 * entregado sale del efectivo (se resta), pero no de porMetodo. Solo los
 * cobros en efectivo suman al efectivo esperado — el resto (transferencia,
 * tarjeta, cheque, otro) queda solo en `cobrosPorMetodo`, informativo. El
 * crédito otorgado en ventas (porMetodo.credito) tampoco es efectivo: es
 * saldo por cobrar, no dinero en caja. Lo mismo aplica a saldo_favor: es
 * saldo del cliente, no efectivo en caja. Acumula y devuelve también el cambio
 * entregado (vuelto), sin el cual el desglose por método no reconcilia con el
 * efectivo esperado.
 */
export function esperadoCaja(
  montoInicial: number,
  docs: Array<{ estado: string; total: number; pagos: Array<{ tipo: MetodoPagoTipo; monto: number }> }>,
  cobros: Array<{ metodo: CobroMetodo; monto: number }> = [],
  devoluciones: Array<{ metodo: CobroMetodo; monto: number }> = [],
): ResumenCaja {
  const porMetodo: Record<MetodoPagoTipo, number> = {
    efectivo_lps: 0,
    efectivo_usd: 0,
    tarjeta: 0,
    transferencia: 0,
    otro: 0,
    credito: 0,
    saldo_favor: 0,
  }
  const cobrosPorMetodo: Record<CobroMetodo, number> = {
    efectivo: 0,
    transferencia: 0,
    tarjeta: 0,
    cheque: 0,
    otro: 0,
  }

  let efectivoEsperado = montoInicial
  let cambioEntregado = 0

  for (const doc of docs) {
    if (doc.estado !== 'emitido') continue
    const cambio = cambioPago(doc.pagos as PagoPos[], doc.total)
    cambioEntregado = round2(cambioEntregado + cambio)
    for (const pago of doc.pagos) {
      porMetodo[pago.tipo] += pago.monto
      if (pago.tipo === 'efectivo_lps' || pago.tipo === 'efectivo_usd') {
        efectivoEsperado += pago.monto
      }
    }
    efectivoEsperado = round2(efectivoEsperado - cambio)
  }

  for (const cobro of cobros) {
    cobrosPorMetodo[cobro.metodo] += cobro.monto
    if (cobro.metodo === 'efectivo') {
      efectivoEsperado = round2(efectivoEsperado + cobro.monto)
    }
  }

  const devolucionesPorMetodo: Record<CobroMetodo, number> = { efectivo: 0, transferencia: 0, tarjeta: 0, cheque: 0, otro: 0 }
  for (const dev of devoluciones) {
    devolucionesPorMetodo[dev.metodo] += dev.monto
    if (dev.metodo === 'efectivo') efectivoEsperado = round2(efectivoEsperado - dev.monto)
  }

  return { efectivoEsperado, cambioEntregado, porMetodo, cobrosPorMetodo, devolucionesPorMetodo }
}

/**
 * Traduce los códigos de error nuevos del POS (HS_CAJA, HS_CAI, HS_TOTAL,
 * HS_PEDIDO_DOC, HS_DOC, HS_DEVOLVIBLE, HS_REEMB, HS_SALDO) a mensajes
 * legibles; delega los demás en traducirErrorPedido (HS_STOCK,
 * HS_REQUIERE_VARIANTE, etc.).
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
    case 'HS_DEVOLVIBLE':
      return `La cantidad supera lo devolvible de "${a}".`
    case 'HS_REEMB':
      return `Problema con el reembolso: ${a}.`
    case 'HS_SALDO':
      if (a === 'insuficiente') return 'El cliente no tiene saldo a favor suficiente.'
      if (a === 'requiere cliente') return 'Un pago con saldo a favor requiere un cliente registrado.'
      return 'Problema con el saldo a favor.'
    default:
      return traducirErrorPedido(message)
  }
}

// Regla de los chips de pago del POS: al seleccionar un método nuevo, ese
// pago (el último de la lista) se llena con lo que falta para cubrir el
// total; los ya capturados no se tocan. Con un solo método, toma el total.
export function montosPagoAlAgregar(pagos: PagoPos[], total: number): PagoPos[] {
  if (pagos.length === 0) return []
  const previos = pagos.slice(0, -1)
  const cubierto = round2(previos.reduce((s, p) => s + p.monto, 0))
  const restante = Math.max(0, round2(total - cubierto))
  return [...previos, { ...pagos[pagos.length - 1], monto: restante }]
}
