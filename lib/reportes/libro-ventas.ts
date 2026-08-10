import type { DocumentoFiscal, FilaLibroVentas, TotalesLibroVentas } from '@/types'
import { fechaHN } from './fecha'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function filaLibro(d: DocumentoFiscal): FilaLibroVentas {
  const s = d.tipo === 'nota_credito' ? -1 : 1
  return {
    fecha: d.created_at,
    correlativo: d.correlativo ?? '—',
    cai: d.cai_codigo ?? '—',
    cliente: d.cliente_nombre,
    rtn: d.cliente_rtn ?? '',
    exento: round2(s * d.total_exento),
    exonerado: round2(s * d.total_exonerado),
    gravado15: round2(s * d.total_gravado15),
    isv15: round2(s * d.isv15),
    gravado18: round2(s * d.total_gravado18),
    isv18: round2(s * d.isv18),
    total: round2(s * d.total),
    esNota: d.tipo === 'nota_credito',
  }
}

export function totalesLibro(filas: FilaLibroVentas[]): TotalesLibroVentas {
  return filas.reduce<TotalesLibroVentas>((t, f) => ({
    exento: round2(t.exento + f.exento),
    exonerado: round2(t.exonerado + f.exonerado),
    gravado15: round2(t.gravado15 + f.gravado15),
    isv15: round2(t.isv15 + f.isv15),
    gravado18: round2(t.gravado18 + f.gravado18),
    isv18: round2(t.isv18 + f.isv18),
    total: round2(t.total + f.total),
  }), { exento: 0, exonerado: 0, gravado15: 0, isv15: 0, gravado18: 0, isv18: 0, total: 0 })
}

export function libroAoA(filas: FilaLibroVentas[], totales: TotalesLibroVentas): (string | number)[][] {
  const head = ['Fecha', 'Correlativo', 'CAI', 'Cliente', 'RTN', 'Exento', 'Exonerado', 'Gravado 15%', 'ISV 15%', 'Gravado 18%', 'ISV 18%', 'Total']
  const body = filas.map(f => [
    fechaHN(f.fecha), f.correlativo, f.cai, f.cliente, f.rtn,
    f.exento, f.exonerado, f.gravado15, f.isv15, f.gravado18, f.isv18, f.total,
  ])
  const foot = ['TOTALES', '', '', '', '', totales.exento, totales.exonerado, totales.gravado15, totales.isv15, totales.gravado18, totales.isv18, totales.total]
  return [head, ...body, foot]
}
