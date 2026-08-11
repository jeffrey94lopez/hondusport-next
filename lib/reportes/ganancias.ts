import type { FilaGananciaItem, TotalesGanancias } from '@/types'
import { utilidadNeta, margen } from '@/lib/dashboard/metricas'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function filaGanancia(base: Omit<FilaGananciaItem, 'ganancia' | 'margen'>): FilaGananciaItem {
  const ganancia = utilidadNeta(base.ventas, base.costo)
  return { ...base, ganancia, margen: margen(base.ventas, ganancia) }
}

export function totalesGanancias(filas: FilaGananciaItem[]): TotalesGanancias {
  const ventas = round2(filas.reduce((s, f) => s + f.ventas, 0))
  const costo = round2(filas.reduce((s, f) => s + f.costo, 0))
  const ganancia = round2(ventas - costo)
  return { ventas, costo, ganancia, margen: margen(ventas, ganancia) }
}

export function gananciasAoA(filas: FilaGananciaItem[], t: TotalesGanancias): (string | number)[][] {
  const head = ['Código', 'Nombre', 'Variante', 'Categoría', 'Cantidad', 'Ventas', 'Costos', 'Ganancia', 'Ganancia %']
  const body = filas.map(f => [f.codigo, f.nombre, f.variante, f.categoria, f.cantidad, f.ventas, f.costo, f.ganancia, f.margen])
  const foot = ['TOTALES', '', '', '', '', t.ventas, t.costo, t.ganancia, t.margen]
  return [head, ...body, foot]
}
