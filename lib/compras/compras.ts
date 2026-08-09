import type { CompraEstado, CompraMoneda } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export function numeroCompra(seq: number): string {
  return `COMP-${String(seq).padStart(8, '0')}`
}

export function costoEnLempiras(costo: number, moneda: CompraMoneda, tasa: number | null): number {
  return round2(moneda === 'USD' ? costo * (tasa ?? 0) : costo)
}

export function totalCompra(
  items: { cantidad_ordenada: number; costo_unitario: number }[],
  moneda: CompraMoneda,
  tasa: number | null,
): number {
  const factor = moneda === 'USD' ? (tasa ?? 0) : 1
  return round2(items.reduce((s, i) => s + i.cantidad_ordenada * i.costo_unitario * factor, 0))
}

// Deriva el estado a partir de las cantidades. Sin líneas = borrador. Todo
// recibido = recibida. Algo recibido pero no todo = parcial. Nada recibido y
// con líneas = ordenada. (borrador/ordenada no se distinguen por cantidades,
// pero sin líneas siempre es borrador.)
export function estadoCompra(
  items: { cantidad_ordenada: number; cantidad_recibida: number }[],
): CompraEstado {
  if (items.length === 0) return 'borrador'
  const algo = items.some(i => i.cantidad_recibida > 0)
  const todo = items.every(i => i.cantidad_recibida >= i.cantidad_ordenada)
  if (todo) return 'recibida'
  if (algo) return 'parcial'
  return 'ordenada'
}

export function cantidadSugeridaReorden(stock: number, stockMinimo: number): number {
  return Math.max(0, stockMinimo - stock)
}
