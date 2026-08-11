import type { GrupoCxc, DocCxc } from '@/types'

interface SaldoRow {
  documento_id: string; cliente_id: string; cliente_nombre: string
  numero: string; fecha: string; fecha_vencimiento: string; saldo: number
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY', sin tocar zona horaria (fechas `date` puras).
function fechaDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// Días vencidos: > 0 si fecha_vencimiento ya pasó respecto a hoy (día local).
function diasVencido(fechaVenc: string, hoy: Date): number {
  const venc = new Date(fechaVenc + 'T00:00:00Z').getTime()
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.floor((h - venc) / (24 * 60 * 60 * 1000))
}

export function agruparCxc(saldos: SaldoRow[], hoy: Date): GrupoCxc[] {
  const mapa = new Map<string, GrupoCxc>()
  for (const s of saldos) {
    let g = mapa.get(s.cliente_id)
    if (!g) { g = { clienteId: s.cliente_id, cliente: s.cliente_nombre, total: 0, docs: [] }; mapa.set(s.cliente_id, g) }
    const doc: DocCxc = {
      documento_id: s.documento_id, numero: s.numero,
      fecha: s.fecha, vencimiento: s.fecha_vencimiento,
      diasVencido: diasVencido(s.fecha_vencimiento, hoy), saldo: Number(s.saldo),
    }
    g.docs.push(doc)
    g.total = Math.round((g.total + doc.saldo) * 100) / 100
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
}

export function cxcAoA(grupos: GrupoCxc[]): (string | number)[][] {
  const head = ['Tipo fila', 'Cliente / Número', 'Fecha', 'Vencimiento', 'Días vencido', 'Saldo']
  const rows: (string | number)[][] = [head]
  for (const g of grupos) {
    rows.push(['Cliente', g.cliente, '', '', '', g.total])
    for (const d of g.docs) {
      rows.push(['  Documento', d.numero, fechaDate(d.fecha), fechaDate(d.vencimiento), d.diasVencido, d.saldo])
    }
  }
  return rows
}
