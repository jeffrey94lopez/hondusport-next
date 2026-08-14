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

export function excedeLimite(
  saldoActual: number,
  creditoNuevo: number,
  limite: number | null,
): { excede: boolean; excedente: number } {
  if (limite == null) return { excede: false, excedente: 0 }
  const total = round2(saldoActual + creditoNuevo)
  const excedente = round2(Math.max(0, total - limite))
  return { excede: excedente > 0, excedente }
}

// Total de un pago manual: la suma de lo aplicado a cada compra. Se redondea a
// 2 decimales para que el total mostrado no arrastre error de coma flotante
// frente al que deriva el servidor a partir de las mismas aplicaciones.
export function sumaAplicaciones(montos: number[]): number {
  return round2(montos.reduce((s, m) => s + m, 0))
}

// Reglas de validez del reparto manual de un pago a proveedor. Devuelve el
// motivo del rechazo (texto ya listo para mostrar) o null si es válido.
export function validarAplicaciones(
  aplicaciones: { numero: string; monto: number; saldo: number }[],
): string | null {
  for (const a of aplicaciones) {
    // Un monto negativo invalida todo el formulario, no solo su línea: quien
    // envía filtra las líneas <= 0, así que una fila en -50 junto a otra en 150
    // registraría 150 mientras el total mostrado diría 100.
    if (a.monto < 0) return 'Los montos no pueden ser negativos.'
    if (a.monto > a.saldo + 0.005) return `El abono a ${a.numero} excede su saldo.`
  }
  if (!aplicaciones.some(a => a.monto > 0)) return 'Aplica un monto a por lo menos una compra.'
  return null
}
