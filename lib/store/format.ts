const BADGE_COLORS: Record<string, string> = {
  Oferta: '#c31a2f', // --error-strong
  'Más Vendido': '#c31a2f',
  Nuevo: '#1b8959', // --success
  Sustentable: '#0a53a5', // --info
  'Últimas unidades': '#a16b00', // --warning
}

const DEFAULT_BADGE_COLOR = '#c31a2f'

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
