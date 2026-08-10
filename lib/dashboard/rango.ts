import type { PresetRango, RangoFechas } from '@/types'

// Honduras usa UTC-6 todo el año (sin horario de verano).
const OFFSET_HONDURAS_MS = 6 * 60 * 60 * 1000

// Componentes calendario (año/mes/día) del día local de Honduras para un instante.
function partesHonduras(instante: Date): { y: number; m: number; d: number } {
  const local = new Date(instante.getTime() - OFFSET_HONDURAS_MS)
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() }
}

// Medianoche Honduras (00:00 UTC-6) de un día calendario local, como Date (UTC).
// 00:00 en Honduras = 06:00 UTC del mismo día.
function medianocheHonduras(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) + OFFSET_HONDURAS_MS)
}

// Día de la semana (0=lunes … 6=domingo) del día local.
function diaSemanaLunes0(y: number, m: number, d: number): number {
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay() // 0=domingo
  return (dow + 6) % 7 // 0=lunes
}

// Valida que `s` sea una fecha calendario real en formato 'YYYY-MM-DD'
// (vacío, undefined, basura o fechas inexistentes como '2026-02-30' → false).
function esFechaValida(s?: string): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) return false
  // new Date normaliza días fuera de rango (p.ej. 2026-02-30 → 2026-03-02);
  // comparamos contra el ISO para descartar esos casos.
  return t.toISOString().slice(0, 10) === s
}

export function rangoDesdePreset(
  preset: PresetRango,
  instante: Date,
  desde?: string,
  hasta?: string,
): RangoFechas {
  const { y, m, d } = partesHonduras(instante)
  const manana = medianocheHonduras(y, m, d + 1) // 00:00 del día siguiente (exclusivo)

  if (preset === 'hoy') {
    return { desde: medianocheHonduras(y, m, d).toISOString(), hasta: manana.toISOString() }
  }
  const offLun = diaSemanaLunes0(y, m, d)
  const rangoSemana: RangoFechas = {
    desde: medianocheHonduras(y, m, d - offLun).toISOString(),
    hasta: manana.toISOString(),
  }
  if (preset === 'semana') {
    return rangoSemana
  }
  if (preset === 'mes') {
    return { desde: medianocheHonduras(y, m, 1).toISOString(), hasta: manana.toISOString() }
  }
  if (preset === 'anio') {
    return { desde: medianocheHonduras(y, 0, 1).toISOString(), hasta: manana.toISOString() }
  }
  // personalizado: 'YYYY-MM-DD' → 00:00 Honduras; hasta +1 día (inclusivo del día).
  // Si alguna de las dos fechas no es válida (vacía, malformada, o no parsea a
  // fecha real), cae de forma segura a la semana en curso en vez de crashear.
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return rangoSemana
  }
  const [dy, dm, dd] = desde!.split('-').map(Number)
  const [hy, hm, hd] = hasta!.split('-').map(Number)
  return {
    desde: medianocheHonduras(dy, dm - 1, dd).toISOString(),
    hasta: medianocheHonduras(hy, hm - 1, hd + 1).toISOString(),
  }
}

export function etiquetaRango(preset: PresetRango, rango: RangoFechas): string {
  if (preset === 'hoy') return 'Hoy'
  if (preset === 'semana') return 'Semana en curso'
  if (preset === 'mes') return 'Mes en curso'
  if (preset === 'anio') return 'Año en curso'
  const fmt = (iso: string, restarDia = false) => {
    const t = new Date(iso).getTime() - OFFSET_HONDURAS_MS - (restarDia ? 24 * 60 * 60 * 1000 : 0)
    const dloc = new Date(t)
    return dloc.toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return `${fmt(rango.desde)} – ${fmt(rango.hasta, true)}`
}
