import type { CotizacionEtapa } from '@/types'

export function numeroCotizacion(seq: number): string {
  return `COT-${String(seq).padStart(8, '0')}`
}

export function validoHasta(creada: Date, dias: number): Date {
  const d = new Date(creada)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
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
