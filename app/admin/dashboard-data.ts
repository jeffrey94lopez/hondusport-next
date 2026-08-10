import { createClient } from '@/lib/supabase-server'
import { stockEfectivo } from '@/lib/store/variantes'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import type {
  PresetRango, DashboardData, DashboardResumen, VentaPorDia,
  TopItem, TopCliente, DashboardUltimoDocumento,
} from '@/types'
import { numeroDocumento } from '@/lib/pos/documentos'

const RESUMEN_VACIO: DashboardResumen = {
  ventas_netas: 0, num_documentos: 0, pedidos_web: 0, pedidos_sin_procesar: 0,
  cxc_pendiente: 0, cxp_pendiente: 0, cotizaciones_abiertas: 0, cotizaciones_monto: 0,
  // P6.1
  ventas_sin_isv: 0, costo_ventas: 0, facturas: 0, comprobantes: 0,
  cotizaciones_ganadas: 0, cotizaciones_perdidas: 0,
  cxc_nuevo: 0, cxc_cobrado: 0, cxp_nuevo: 0, cxp_pagado: 0, productos_nuevos: 0,
}

export async function obtenerDashboardData(
  preset: PresetRango, desde?: string, hasta?: string,
): Promise<DashboardData> {
  const rango = rangoDesdePreset(preset, new Date(), desde, hasta)
  const supabase = await createClient()
  const args = { p_desde: rango.desde, p_hasta: rango.hasta }

  const [
    { data: resumenRows, error: eResumen },
    { data: ventasDia, error: eVentas },
    { data: topItems, error: eItems },
    { data: topClientes, error: eClientes },
    { data: productosStock, error: eProd },
    { data: ultimosRows, error: eUlt },
  ] = await Promise.all([
    supabase.rpc('dashboard_resumen', args),
    supabase.rpc('dashboard_ventas_por_dia', args),
    supabase.rpc('dashboard_top_items', { ...args, p_limite: 10 }),
    supabase.rpc('dashboard_top_clientes', { ...args, p_limite: 10 }),
    supabase.from('productos')
      .select('id, stock, activo, producto_variantes(stock, activo)')
      .eq('activo', true).limit(5000),
    supabase.from('documentos')
      .select('id, tipo, correlativo, numero_comprobante, cliente_nombre, total, created_at')
      .in('tipo', ['factura', 'comprobante']).neq('estado', 'anulado')
      .order('created_at', { ascending: false }).limit(8),
  ])

  // Loguear errores de cualquier consulta sin silenciarlos
  for (const [fuente, err] of [
    ['dashboard_resumen', eResumen],
    ['dashboard_ventas_por_dia', eVentas],
    ['dashboard_top_items', eItems],
    ['dashboard_top_clientes', eClientes],
    ['productos(stockBajo)', eProd],
    ['documentos(ultimos)', eUlt],
  ] as const) {
    if (err) console.error(`[dashboard-data] error en ${fuente}:`, err.message)
  }

  // Stock bajo: mismo criterio que el dashboard previo (stockEfectivo por
  // producto/variante). Se calcula en el server, no en SQL (evita replicar la
  // lógica padre/variante en Postgres). Umbral: < 5 (como el dashboard actual).
  const stockBajo = (productosStock ?? []).filter(p => {
    const s = stockEfectivo(p.stock, (p.producto_variantes ?? []).filter(v => v.activo))
    return s != null && s < 5
  }).length

  const ultimosDocumentos: DashboardUltimoDocumento[] = (ultimosRows ?? []).map(d => ({
    id: d.id,
    tipo: d.tipo as 'factura' | 'comprobante',
    numero: numeroDocumento({
      tipo: d.tipo as 'factura' | 'comprobante',
      correlativo: d.correlativo,
      numero_comprobante: d.numero_comprobante,
    }),
    cliente_nombre: d.cliente_nombre,
    total: Number(d.total),
    created_at: d.created_at,
  }))

  const resumenCrudo = (resumenRows?.[0] as DashboardResumen | undefined) ?? RESUMEN_VACIO
  // Los campos numeric de PostgREST no siempre llegan como number; casteamos
  // explícitamente para que formatPrice/ticketPromedio nunca reciban un string
  // ni produzcan NaN.
  const resumen: DashboardResumen = {
    ...resumenCrudo,
    ventas_netas: Number(resumenCrudo.ventas_netas),
    cxc_pendiente: Number(resumenCrudo.cxc_pendiente),
    cxp_pendiente: Number(resumenCrudo.cxp_pendiente),
    cotizaciones_monto: Number(resumenCrudo.cotizaciones_monto),
    ventas_sin_isv: Number(resumenCrudo.ventas_sin_isv),
    costo_ventas: Number(resumenCrudo.costo_ventas),
    cxc_cobrado: Number(resumenCrudo.cxc_cobrado),
    cxp_pagado: Number(resumenCrudo.cxp_pagado),
  }

  return {
    preset, rango, resumen, stockBajo,
    ventasPorDia: ((ventasDia ?? []) as VentaPorDia[]).map(v => ({ ...v, ventas: Number(v.ventas) })),
    topItems: ((topItems ?? []) as TopItem[]).map(i => ({
      ...i, monto: Number(i.monto), cantidad: Number(i.cantidad),
    })),
    topClientes: ((topClientes ?? []) as TopCliente[]).map(c => ({ ...c, monto: Number(c.monto) })),
    ultimosDocumentos,
  }
}
