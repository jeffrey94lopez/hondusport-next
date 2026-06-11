const BADGE_COLORS: Record<string, string> = {
  Oferta: '#E74C3C',
  'Más Vendido': '#E74C3C',
  Nuevo: '#27AE60',
  Sustentable: '#2980B9',
  'Últimas unidades': '#E67E22',
}

const DEFAULT_BADGE_COLOR = '#E74C3C'

export function formatPrice(amount: number): string {
  return 'L. ' + amount.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function getBadgeColor(badge: string): string {
  return BADGE_COLORS[badge] ?? DEFAULT_BADGE_COLOR
}

export function getDiscountPercent(precio: number, precioOriginal: number | null): number | null {
  if (precioOriginal == null || precioOriginal <= precio) return null
  return Math.round(((precioOriginal - precio) / precioOriginal) * 100)
}
