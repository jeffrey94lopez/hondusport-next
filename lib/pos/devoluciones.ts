import { desglosarLinea } from './desglose'
import type { LineaOriginalDoc, ReembolsoDevolucion } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export function cantidadDevolvible(cantidadOriginal: number, yaDevuelto: number): number {
  return Math.max(0, cantidadOriginal - yaDevuelto)
}

export function numeroDevolucion(n: number): string {
  return `DEV-${String(n).padStart(8, '0')}`
}

type OriginalLinea = Pick<LineaOriginalDoc, 'producto_id' | 'variante_id' | 'descripcion' | 'cantidad' | 'precio_unitario' | 'descuento' | 'isv' | 'importe' | 'base' | 'isv_monto'>

// Reconstruye la línea devuelta con la misma matemática de la emisión, en reversa:
// prorratea el descuento por unidad y deriva base/ISV vía desglosarLinea.
export function recalcularLineaDevuelta(original: OriginalLinea, cantidad: number) {
  const exonerado = original.isv !== 'exento' && original.isv_monto === 0 && original.importe === original.base
  const descuentoUnit = round2((original.descuento / original.cantidad) * cantidad)
  const linea = {
    producto_id: original.producto_id,
    variante_id: original.variante_id,
    descripcion: original.descripcion,
    cantidad,
    precio_unitario: original.precio_unitario,
    descuento: descuentoUnit,
    isv: original.isv,
  }
  return desglosarLinea(linea as Parameters<typeof desglosarLinea>[0], exonerado)
}

export function totalNotaCredito(lineas: Array<{ importe: number }>): number {
  return round2(lineas.reduce((s, l) => s + l.importe, 0))
}

export function validarReembolsos(
  reembolsos: ReembolsoDevolucion[],
  total: number,
  opts: { saldoCxc: number; sinEfectivo: boolean; clienteRegistrado: boolean },
): string | null {
  const suma = round2(reembolsos.reduce((s, r) => s + r.monto, 0))
  if (Math.abs(suma - total) > 0.01) return 'El reembolso no coincide con el total a acreditar.'
  for (const r of reembolsos) {
    if (r.monto <= 0) return 'Los montos de reembolso no pueden ser negativos.'
    if (r.tipo === 'efectivo' && opts.sinEfectivo) return 'Las devoluciones en efectivo están deshabilitadas.'
    if (r.tipo === 'saldo_favor' && !opts.clienteRegistrado) return 'El saldo a favor requiere un cliente registrado.'
  }
  const cxc = round2(reembolsos.filter(r => r.tipo === 'cxc').reduce((s, r) => s + r.monto, 0))
  if (cxc > opts.saldoCxc + 0.01) return 'El abono a la cuenta por cobrar excede el saldo pendiente.'
  return null
}
