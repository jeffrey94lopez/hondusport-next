import type { LineaPos } from '@/types'

export type DescuentoModo = 'monto' | 'porcentaje'

// Línea de venta de la UI: extiende LineaPos con campos que NUNCA viajan al
// server. `precioManual` marca que el precio de esta línea fue editado a
// mano (o es un ítem libre): al cambiar de cliente (final/revendedor) esas
// líneas NO se recalculan, solo las de inventario sin override. `key` es el
// id estable de React (no existe en LineaPos). `descuentoModo` solo decide
// cómo se muestra/edita el descuento (monto L. o %); el valor persistido
// (`descuento`) siempre es un monto en Lempiras, igual que en LineaPos.
export interface LineaVenta extends LineaPos {
  key: string
  precioManual: boolean
  descuentoModo: DescuentoModo
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function brutoLinea(l: Pick<LineaVenta, 'cantidad' | 'precio_unitario'>): number {
  return round2(l.cantidad * l.precio_unitario)
}

// Nunca deja que el descuento de una línea supere su propio bruto (cantidad
// × precio_unitario) — evita que emitirVenta (que NO relee precio/descuento,
// el override es intencional) reciba un total negativo en un documento
// fiscal cuando cantidad o precio bajan después de haber puesto un descuento.
export function clampDescuentoLinea(l: LineaVenta): LineaVenta {
  const bruto = brutoLinea(l)
  return { ...l, descuento: Math.min(Math.max(l.descuento, 0), bruto) }
}

// Bruto disponible para el descuento global: suma de cada línea ya neta de
// su propio descuento (mismo criterio que usa `prorratearDescuentoGlobal`
// para repartirlo). El descuento global nunca puede superar esto.
export function brutoTotalLineas(ls: LineaVenta[]): number {
  return round2(ls.reduce((s, l) => s + (brutoLinea(l) - l.descuento), 0))
}

export function clampDescuentoGlobal(next: LineaVenta[], descuentoGlobal: number): number {
  return Math.min(Math.max(descuentoGlobal, 0), brutoTotalLineas(next))
}

export function descuentoDesdePorcentaje(l: LineaVenta, pct: number): number {
  const p = Math.min(Math.max(pct, 0), 100)
  return round2(brutoLinea(l) * (p / 100))
}

// Tope de cantidad de una línea: el stock disponible, salvo que la línea ya
// tenga más (carrito viejo o stock que bajó) — nunca se le baja al cajero una
// cantidad ya capturada; el servidor revalida al emitir.
export function topeCantidad(stockDisponible: number | null, cantidadActual: number): number {
  if (stockDisponible == null) return Infinity
  return Math.max(stockDisponible, cantidadActual)
}

// Denominaciones de billete/moneda en circulación que ofrece el chip de
// sugerencia de efectivo (L.) del modal de cobro — "el cliente paga con un
// billete de 500 y el cambio sale solo". Se muestran las 3 primeras
// MAYORES al monto pendiente (nunca una igual o menor, que no ahorraría el
// vuelto ni cubriría el pago).
const DENOMINACIONES_LPS = [20, 50, 100, 200, 500, 1000]

export function sugerenciasEfectivo(pendiente: number): number[] {
  return DENOMINACIONES_LPS.filter(d => d > pendiente).slice(0, 3)
}
