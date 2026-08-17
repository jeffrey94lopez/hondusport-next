import type { SesionCaja, CobroMetodo } from '@/types'
import { numeroDocumento } from './documentos'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface FiltroTurnos {
  desde: string   // YYYY-MM-DD, '' = sin límite inferior
  hasta: string   // YYYY-MM-DD, '' = sin límite superior (inclusivo)
  cajaId: string  // '' = todas
  usuario: string // '' = todos
}

const OFFSET_HONDURAS_MS = 6 * 60 * 60 * 1000

// Día calendario HONDUREÑO (YYYY-MM-DD) de un timestamp ISO. Mismo criterio que
// `hoyHonduras` de lib/cotizaciones/cotizaciones.ts, y por el mismo motivo:
// tomar el día UTC directo produce un off-by-one, porque en Honduras (UTC-6)
// una operación de la tarde/noche ya cae en el día UTC siguiente. Un turno
// abierto a las 6:30 p. m. quedaba fuera al filtrar por su propio día — el que
// la tabla muestra —, y en una tienda con turno de tarde ese es el caso normal.
// Se compara como cadena porque el formato es lexicográficamente ordenable, y
// así el resultado no depende de la zona del navegador que corra el filtro.
function diaHonduras(iso: string): string {
  return new Date(new Date(iso).getTime() - OFFSET_HONDURAS_MS).toISOString().slice(0, 10)
}

export function filtrarTurnos(turnos: SesionCaja[], filtro: FiltroTurnos): SesionCaja[] {
  return turnos.filter(t => {
    const dia = diaHonduras(t.abierta_at)
    if (filtro.desde && dia < filtro.desde) return false
    if (filtro.hasta && dia > filtro.hasta) return false
    if (filtro.cajaId && t.caja_id !== filtro.cajaId) return false
    if (filtro.usuario && t.usuario !== filtro.usuario) return false
    return true
  })
}

export function totalesTurnos(
  turnos: SesionCaja[],
): { inicial: number; esperado: number; contado: number; diferencia: number } {
  let inicial = 0, esperado = 0, contado = 0, diferencia = 0
  for (const t of turnos) {
    inicial += t.monto_inicial
    esperado += t.monto_esperado ?? 0
    contado += t.monto_contado ?? 0
    diferencia += t.diferencia ?? 0
  }
  return {
    inicial: round2(inicial),
    esperado: round2(esperado),
    contado: round2(contado),
    diferencia: round2(diferencia),
  }
}

// Detalle del turno (R7): ventas al crédito otorgadas y cobros de CxC
// recibidos durante la sesión, para el comprobante de cierre en tirilla.
export interface CreditoOtorgado {
  documentoId: string
  numero: string
  cliente: string
  monto: number
}

export interface CobroDelTurno {
  cobroId: string
  numero: string
  cliente: string
  metodo: CobroMetodo
  monto: number
}

export interface DetalleTurno {
  creditos: CreditoOtorgado[]
  cobros: CobroDelTurno[]
}

export function totalCreditos(creditos: CreditoOtorgado[]): number {
  return round2(creditos.reduce((s, c) => s + c.monto, 0))
}

export function totalCobros(cobros: CobroDelTurno[]): number {
  return round2(cobros.reduce((s, c) => s + c.monto, 0))
}

/**
 * Diferencia entre la suma EN VIVO del detalle (recalculada a partir de
 * `porMetodo`/`cobrosPorMetodo`/`cambioEntregado` al reimprimir) y el arqueo
 * CONGELADO al cerrar (`sesion.monto_esperado`). Pueden divergir para un
 * mismo turno porque `esperadoCaja` descarta los documentos que ya no están
 * `emitido`: `anular_comprobante` no exige que la sesión siga abierta, así
 * que anular un comprobante DESPUÉS del cierre hace que una reimpresión
 * recalcule el detalle con un documento menos, mientras el arqueo oficial
 * sigue congelado con el valor original — el papel no puede afirmar que
 * cuadró cuando en realidad el detalle visible ya no suma el total que dice.
 * Devuelve `null` cuando no hay arqueo congelado (turno abierto) o cuando
 * ambos coinciden: en ninguno de los dos casos hay nada que advertir. El
 * valor devuelto es la magnitud (no el signo): el comprobante solo necesita
 * decir "difieren en L. X", no de qué lado.
 */
export function diferenciaDetalleArqueo(detalle: number, congelado: number | null): number | null {
  if (congelado == null) return null
  const diff = round2(Math.abs(detalle - congelado))
  return diff === 0 ? null : diff
}

// Regla con peso (revisión R7): un documento es un crédito otorgado del turno
// si está `emitido` y tiene al menos un pago `tipo === 'credito'`; el monto es
// la SUMA de solo esos pagos, nunca el total del documento — una venta mixta
// (parte efectivo, parte crédito) solo debe aportar lo que de verdad quedó por
// cobrar. Extraída del Server Action (que solo debe quedarse con la consulta y
// el mapeo del embed, no testeables offline) para que esta suma tenga red de
// tests: sin ella, un `Number(d.total)` o un filtro de estado eliminado no
// rompe nada en tsc/build y el comprobante impreso mentiría en silencio.
export function creditosDeDocumentos(
  docs: Array<{
    id: string
    tipo: string
    correlativo: string | null
    numero_comprobante: number | null
    cliente_nombre: string
    estado: string
    pagos: Array<{ tipo: string; monto: number }>
  }>,
): CreditoOtorgado[] {
  const creditos: CreditoOtorgado[] = []
  for (const d of docs) {
    if (d.estado !== 'emitido') continue
    const montoCredito = round2(
      d.pagos.reduce((s, p) => (p.tipo === 'credito' ? s + p.monto : s), 0),
    )
    if (montoCredito <= 0) continue
    creditos.push({
      documentoId: d.id,
      // El caller garantiza (con `.in('tipo', ['factura', 'comprobante'])` en
      // la consulta) que solo llegan documentos facturables aquí; el cast
      // refleja esa garantía, no la reintroduce.
      numero: numeroDocumento({
        tipo: d.tipo as 'factura' | 'comprobante',
        correlativo: d.correlativo,
        numero_comprobante: d.numero_comprobante,
      }),
      cliente: d.cliente_nombre,
      monto: montoCredito,
    })
  }
  return creditos
}
