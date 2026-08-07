export type MetodoCosteo = 'promedio' | 'ultimo'

// Espejo exacto de la función SQL aplicar_costeo (misma matemática y casos borde).
// Nota: SQL tiene rama `if p_costo_entrada is null then return p_costo_actual` antes de todo.
// En TS es intencionalmente inalcanzable: firma non-nullable (callers validan antes).
// Si algún día se acepta null, replicar esa rama: return costoActual ?? costoEntrada
export function aplicarEntradaCosto(
  metodo: MetodoCosteo,
  stockActual: number | null,
  costoActual: number | null,
  cantidad: number,
  costoEntrada: number,
): number {
  if (metodo === 'ultimo') return round4(costoEntrada)
  if (stockActual == null || stockActual <= 0 || costoActual == null) return round4(costoEntrada)
  return round4(((stockActual * costoActual) + (cantidad * costoEntrada)) / (stockActual + cantidad))
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

export function precioParaCliente(
  tipoCliente: 'final' | 'revendedor',
  precio: number,
  precioRevendedor: number | null,
): number {
  return tipoCliente === 'revendedor' && precioRevendedor != null ? precioRevendedor : precio
}

export function margen(precio: number, costo: number | null): { ganancia: number; porcentaje: number } | null {
  if (costo == null) return null
  const ganancia = round4(precio - costo)
  const porcentaje = costo === 0 ? 100 : round4((ganancia / costo) * 100)
  return { ganancia, porcentaje }
}
