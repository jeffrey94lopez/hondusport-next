import { createClient } from '@/lib/supabase-server'
import { numeroDocumento } from '@/lib/pos/documentos'
import { numeroDocumentoDevolucion } from '@/lib/pos/devoluciones'
import type { FiltrosReporteVentas, FilaReporteVenta, Documento, DocumentoItem } from '@/types'

interface DocConItems extends Documento {
  documento_items: DocumentoItem[]
  vendedores: { nombre: string } | null
  cajas: { nombre: string } | null
}

function numero(d: Documento): string {
  return d.tipo === 'factura' || d.tipo === 'comprobante'
    ? numeroDocumento({ tipo: d.tipo, correlativo: d.correlativo, numero_comprobante: d.numero_comprobante })
    : numeroDocumentoDevolucion(d)
}

export async function obtenerReporteVentas(f: FiltrosReporteVentas): Promise<FilaReporteVenta[]> {
  const supabase = await createClient()
  let q = supabase
    .from('documentos')
    .select('*, documento_items(descripcion, cantidad, precio_unitario, importe), vendedores(nombre), cajas(nombre)')
    .neq('estado', 'anulado')
    .gte('created_at', f.desde).lt('created_at', f.hasta)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.clienteId) q = q.eq('cliente_id', f.clienteId)
  if (f.vendedorId) q = q.eq('vendedor_id', f.vendedorId)
  if (f.cajaId) q = q.eq('caja_id', f.cajaId)

  const { data, error } = await q
  if (error) console.error('[reporte-ventas] error:', error.message)
  let rows = (data ?? []) as unknown as DocConItems[]

  // Filtro por método de pago: documentos con al menos un pago de ese método,
  // acotado a los documentos ya traídos por la query principal (evita traer
  // el histórico completo de pagos de ese método).
  if (f.metodoId && rows.length) {
    const { data: pagos } = await supabase
      .from('documento_pagos')
      .select('documento_id')
      .eq('metodo_id', f.metodoId)
      .in('documento_id', rows.map(d => d.id))
    const ids = new Set((pagos ?? []).map(p => p.documento_id as string))
    rows = rows.filter(d => ids.has(d.id))
  }

  return rows.map(d => ({
    id: d.id,
    numero: numero(d),
    fecha: d.created_at,
    cliente: d.cliente_nombre,
    vendedor: d.vendedores?.nombre ?? '—',
    caja: d.cajas?.nombre ?? '—',
    tipo: d.tipo,
    total: Number(d.total),
    items: (d.documento_items ?? []).map(it => ({
      descripcion: it.descripcion, cantidad: Number(it.cantidad),
      precio: Number(it.precio_unitario), importe: Number(it.importe),
    })),
  }))
}

export async function obtenerOpcionesFiltro() {
  const supabase = await createClient()
  const [{ data: clientes }, { data: vendedores }, { data: cajas }, { data: metodos }] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cajas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('metodos_pago').select('id, nombre').eq('activo', true).order('orden'),
  ])
  return { clientes: clientes ?? [], vendedores: vendedores ?? [], cajas: cajas ?? [], metodos: metodos ?? [] }
}

// Construye los FiltrosReporteVentas desde searchParams (para página y route).
export function parseFiltros(sp: URLSearchParams, desde: string, hasta: string): FiltrosReporteVentas {
  const tipo = sp.get('tipo')
  const tipos = ['factura', 'comprobante', 'nota_credito', 'devolucion']
  return {
    desde, hasta,
    tipo: tipo && tipos.includes(tipo) ? (tipo as FiltrosReporteVentas['tipo']) : undefined,
    clienteId: sp.get('clienteId') || undefined,
    vendedorId: sp.get('vendedorId') || undefined,
    cajaId: sp.get('cajaId') || undefined,
    metodoId: sp.get('metodoId') || undefined,
  }
}
