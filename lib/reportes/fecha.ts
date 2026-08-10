// Día local de Honduras (UTC-6, sin DST) de un instante ISO → 'DD/MM/YYYY'.
const OFFSET_HONDURAS_MS = 6 * 60 * 60 * 1000
export function fechaHN(iso: string): string {
  const local = new Date(new Date(iso).getTime() - OFFSET_HONDURAS_MS)
  const d = String(local.getUTCDate()).padStart(2, '0')
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const y = local.getUTCFullYear()
  return `${d}/${m}/${y}`
}
