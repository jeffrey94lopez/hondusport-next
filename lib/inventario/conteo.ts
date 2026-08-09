export type ClaseLinea = 'pendiente' | 'cuadra' | 'sobrante' | 'faltante'

export function numeroConteo(n: number): string {
  return `CONTEO-${String(n).padStart(8, '0')}`
}

export function diferenciaLinea(snapshot: number, contado: number | null): number | null {
  return contado == null ? null : contado - snapshot
}

export function clasificarLinea(snapshot: number, contado: number | null): ClaseLinea {
  if (contado == null) return 'pendiente'
  const d = contado - snapshot
  if (d === 0) return 'cuadra'
  return d > 0 ? 'sobrante' : 'faltante'
}

export function valorDiferencia(diferencia: number, costo: number | null): number {
  return costo == null ? 0 : Math.round(diferencia * costo * 100) / 100
}

export function resumenConteo(
  lineas: { stock_snapshot: number; contado: number | null; costo: number | null }[],
): { contadas: number; pendientes: number; sobrantes: number; faltantes: number; valorNeto: number } {
  let contadas = 0, pendientes = 0, sobrantes = 0, faltantes = 0, valorNeto = 0
  for (const l of lineas) {
    if (l.contado == null) { pendientes++; continue }
    contadas++
    const d = l.contado - l.stock_snapshot
    if (d > 0) sobrantes++
    else if (d < 0) faltantes++
    valorNeto += valorDiferencia(d, l.costo)
  }
  return { contadas, pendientes, sobrantes, faltantes, valorNeto: Math.round(valorNeto * 100) / 100 }
}
