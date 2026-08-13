import type { FilaReporteVenta, PagoDocumentoVenta, ResumenMetodoPago, ConteoTipoDoc, ResumenNotasCredito } from '@/types'
import { fechaHN } from './fecha'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const ORDEN_TIPOS: FilaReporteVenta['tipo'][] = ['factura', 'comprobante', 'nota_credito', 'devolucion']

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

// Card "Resumen por método de pago" (pie del reporte, R5a fixB): monto
// cobrado y cantidad de documentos por método, en el rango ya filtrado.
// Las notas de crédito/devolución NO pasan por documento_pagos (usan
// nota_credito_reembolsos, ver migración P5a) así que en la práctica el
// llamador nunca las trae aquí — pero se excluyen también dentro de la
// función por si el caller llega a juntar ambos conjuntos: esta card es
// "cobrado", no "reembolsado" (esas van en resumenNotasCredito).
export function resumenPorMetodo(pagos: PagoDocumentoVenta[]): ResumenMetodoPago[] {
  const cobros = pagos.filter(p => p.tipoDocumento === 'factura' || p.tipoDocumento === 'comprobante')
  const map = new Map<string, { monto: number; docs: Set<string> }>()
  for (const p of cobros) {
    const e = map.get(p.metodo) ?? { monto: 0, docs: new Set<string>() }
    e.monto = round2(e.monto + p.monto)
    e.docs.add(p.documentoId)
    map.set(p.metodo, e)
  }
  return [...map.entries()]
    .map(([metodo, e]) => ({ metodo, monto: e.monto, documentos: e.docs.size }))
    .sort((a, b) => b.monto - a.monto)
}

// Card "Documentos por tipo": cantidad por tipo, en el orden fiscal habitual.
export function conteoPorTipo(filas: Pick<FilaReporteVenta, 'tipo'>[]): ConteoTipoDoc[] {
  const map = new Map<FilaReporteVenta['tipo'], number>()
  for (const f of filas) map.set(f.tipo, (map.get(f.tipo) ?? 0) + 1)
  return ORDEN_TIPOS.filter(t => map.has(t)).map(tipo => ({ tipo, cantidad: map.get(tipo)! }))
}

// Card separada "Devoluciones y notas de crédito": cantidad y monto (en
// rojo en la UI). `total` en documentos de nota_credito/devolución se
// guarda como magnitud positiva (ver lib/reportes/libro-ventas.ts), de
// ahí el Math.abs — esta función no depende del signo de almacenamiento.
export function resumenNotasCredito(filas: Pick<FilaReporteVenta, 'tipo' | 'total'>[]): ResumenNotasCredito {
  const notas = filas.filter(f => f.tipo === 'nota_credito' || f.tipo === 'devolucion')
  return { cantidad: notas.length, monto: round2(notas.reduce((s, f) => s + Math.abs(f.total), 0)) }
}
