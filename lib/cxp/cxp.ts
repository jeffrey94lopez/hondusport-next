import type { EstadoPago, BucketAntiguedad } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

// Días entre dos fechas por calendario UTC (ambas ya normalizadas a día).
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate())
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate())
  return Math.round((b - a) / 86400000)
}

export function saldoCompra(total: number, pagado: number): number {
  return round2(total - pagado)
}

export function estadoPago(total: number, pagado: number, fechaVencimiento: Date, hoy: Date): EstadoPago {
  const saldo = round2(total - pagado)
  if (saldo <= 0) return 'pagada'
  if (diasEntre(fechaVencimiento, hoy) > 0) return 'vencida'  // gana sobre parcial
  if (pagado > 0) return 'parcial'
  return 'pendiente'
}

export function bucketAntiguedad(fechaVencimiento: Date, hoy: Date): BucketAntiguedad {
  const d = diasEntre(fechaVencimiento, hoy)  // días vencidos (negativo/0 = por vencer)
  if (d <= 0) return 'por_vencer'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  if (d <= 90) return 'd61_90'
  return 'd90_mas'
}

// Aplica el monto a las compras en el ORDEN recibido (el llamador ordena por
// vencimiento asc para "más-antigua-primero"), sin exceder el saldo de cada
// una. `remanente` es lo que sobra si el monto supera el total adeudado.
export function distribuirPago(
  monto: number,
  comprasConSaldo: { compra_id: string; saldo: number }[],
): { aplicaciones: { compra_id: string; monto: number }[]; remanente: number } {
  let resto = round2(monto)
  const aplicaciones: { compra_id: string; monto: number }[] = []
  for (const c of comprasConSaldo) {
    if (resto <= 0) break
    const aplicar = round2(Math.min(resto, c.saldo))
    if (aplicar > 0) {
      aplicaciones.push({ compra_id: c.compra_id, monto: aplicar })
      resto = round2(resto - aplicar)
    }
  }
  return { aplicaciones, remanente: resto }
}
