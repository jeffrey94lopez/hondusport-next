import type { FilaReporteVenta } from '@/types'
import { fechaHN } from './fecha'

export function tipoDocLabel(tipo: string): string {
  switch (tipo) {
    case 'factura': return 'Factura'
    case 'comprobante': return 'Comprobante'
    case 'nota_credito': return 'Nota de crédito'
    case 'devolucion': return 'Devolución'
    default: return tipo
  }
}

export function ventasAoA(filas: FilaReporteVenta[], incluirItems: boolean): (string | number)[][] {
  if (!incluirItems) {
    const head = ['Número', 'Fecha', 'Cliente', 'Vendedor', 'Caja', 'Tipo doc', 'Total']
    return [head, ...filas.map(f => [f.numero, fechaHN(f.fecha), f.cliente, f.vendedor, f.caja, tipoDocLabel(f.tipo), f.total])]
  }
  const head = ['Tipo fila', 'Número', 'Fecha', 'Cliente', 'Vendedor', 'Caja', 'Tipo doc', 'Descripción', 'Cantidad', 'Precio', 'Importe/Total']
  const rows: (string | number)[][] = [head]
  for (const f of filas) {
    rows.push(['Documento', f.numero, fechaHN(f.fecha), f.cliente, f.vendedor, f.caja, tipoDocLabel(f.tipo), '', '', '', f.total])
    for (const it of f.items) {
      rows.push(['  Ítem', '', '', '', '', '', '', it.descripcion, it.cantidad, it.precio, it.importe])
    }
  }
  return rows
}
