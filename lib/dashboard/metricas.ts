function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function ticketPromedio(ventasNetas: number, numDocumentos: number): number {
  return numDocumentos > 0 ? round2(ventasNetas / numDocumentos) : 0
}

export function ordenarPorMetrica<T extends { monto: number; cantidad: number }>(
  filas: T[],
  metrica: 'monto' | 'cantidad',
): T[] {
  return [...filas].sort((a, b) => b[metrica] - a[metrica])
}

export function maxValor<T>(filas: T[], selector: (f: T) => number): number {
  const m = filas.reduce((acc, f) => Math.max(acc, selector(f)), 0)
  return m > 0 ? m : 1
}

export function utilidadNeta(ventasSinIsv: number, costoVentas: number): number {
  return round2(ventasSinIsv - costoVentas)
}

export function margen(ventasSinIsv: number, utilidad: number): number {
  return ventasSinIsv > 0 ? round2((utilidad / ventasSinIsv) * 100) : 0
}
