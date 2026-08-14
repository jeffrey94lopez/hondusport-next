import type { SesionCaja } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface FiltroTurnos {
  desde: string   // YYYY-MM-DD, '' = sin límite inferior
  hasta: string   // YYYY-MM-DD, '' = sin límite superior (inclusivo)
  cajaId: string  // '' = todas
  usuario: string // '' = todos
}

// Día UTC (YYYY-MM-DD) de un timestamp ISO. Se compara como cadena porque el
// formato es lexicográficamente ordenable, y así el filtro no depende de la
// zona horaria del navegador (una comparación con Date local movería el corte
// de día y dejaría fuera turnos de la madrugada).
function diaUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

export function filtrarTurnos(turnos: SesionCaja[], filtro: FiltroTurnos): SesionCaja[] {
  return turnos.filter(t => {
    const dia = diaUTC(t.abierta_at)
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
