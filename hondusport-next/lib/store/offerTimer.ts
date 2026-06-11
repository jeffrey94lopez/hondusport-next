export function getOfferSecondsRemaining(ofertaFin: string | null, now: Date = new Date()): number {
  if (!ofertaFin) return 0
  const target = new Date(ofertaFin).getTime()
  const diff = target - now.getTime()
  return diff > 0 ? Math.floor(diff / 1000) : 0
}
