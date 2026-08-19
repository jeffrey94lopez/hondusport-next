import type { CotizacionEtapa } from '@/types'

export function numeroCotizacion(seq: number): string {
  return `COT-${String(seq).padStart(8, '0')}`
}

export function validoHasta(creada: Date, dias: number): Date {
  const d = new Date(creada)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

// Honduras usa UTC-6 todo el año (sin horario de verano).
const OFFSET_HONDURAS_MS = 6 * 60 * 60 * 1000

// "Hoy" en Honduras (UTC-6) como Date a medianoche UTC de ESE día calendario
// local. Se usa como la fecha base de vigencia y como el "hoy" de estaVencida.
// Sin esto, tomar el día UTC directo produce un off-by-one: en Honduras una
// operación de la tarde/noche ya cae en el día UTC siguiente, lo que
// adelantaría un día tanto la fecha "válida hasta" como el vencimiento. Recibe
// el instante (new Date()) para mantenerse pura y testeable.
export function hoyHonduras(instante: Date): Date {
  const local = new Date(instante.getTime() - OFFSET_HONDURAS_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
}

// Vencida si la fecha de hoy (día) es estrictamente posterior a valido_hasta (día).
export function estaVencida(validoHasta: Date, hoy: Date): boolean {
  const vh = Date.UTC(validoHasta.getUTCFullYear(), validoHasta.getUTCMonth(), validoHasta.getUTCDate())
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return h > vh
}

// Agrupa items por etapa para el kanban: solo etapas activas, en su orden,
// incluyendo columnas vacías (para que el tablero muestre todas las etapas).
export function agruparPorEtapa<T extends { etapa_id: string }>(
  items: T[],
  etapas: CotizacionEtapa[],
): { etapa: CotizacionEtapa; items: T[] }[] {
  return etapas
    .filter(e => e.activo)
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map(etapa => ({ etapa, items: items.filter(i => i.etapa_id === etapa.id) }))
}

// Primera etapa activa de tipo 'ganada' por orden (destino al facturar).
export function etapaGanadaDestino(etapas: CotizacionEtapa[]): CotizacionEtapa | null {
  return (
    etapas
      .filter(e => e.activo && e.tipo === 'ganada')
      .sort((a, b) => a.orden - b.orden)[0] ?? null
  )
}

/**
 * ¿Se puede editar (o eliminar) esta cotización?
 *
 * Una cotización con `documento_id` ya produjo un documento fiscal y es su
 * respaldo comercial: si cambiara después, dejaría de coincidir con la
 * factura. Antes de D3 nada lo impedía — `guardarCotizacion` borraba y
 * reinsertaba todas las líneas releyendo los precios del día.
 *
 * El bloqueo es permanente, también si el documento se anula después: la
 * factura existió. La vía para seguir trabajando es `duplicarCotizacion`,
 * que crea la copia sin `documento_id`.
 *
 * La consumen las dos Server Actions y la UI: una sola regla para que
 * pantalla y servidor no puedan divergir.
 */
export function puedeEditarCotizacion(documentoId: string | null): boolean {
  return !documentoId
}
