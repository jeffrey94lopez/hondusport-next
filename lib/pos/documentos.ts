// Formato de número de un documento fiscal (factura/comprobante) para CxC.
// Factura usa el correlativo fiscal; comprobante usa numero_comprobante con
// prefijo C-. Función pura sin 'use client' para que se pueda invocar tanto
// desde Server Components (app/admin/cuentas-por-cobrar/cobros/page.tsx,
// cliente/[id]/page.tsx) como desde componentes cliente — mismo criterio que
// numeroCompra en lib/compras/compras.ts y numeroCotizacion en
// lib/cotizaciones/. Antes vivía en CuentasPorCobrarClient.tsx ('use client'),
// lo que hacía crashear en runtime cualquier Server Component que la
// importara (Next 16: los exports de un módulo cliente son client references
// y no se pueden invocar desde el servidor).
export function numeroDocumento(f: {
  tipo: 'factura' | 'comprobante'
  correlativo: string | null
  numero_comprobante: number | null
}): string {
  if (f.tipo === 'factura') return f.correlativo ?? '—'
  return `C-${String(f.numero_comprobante ?? 0).padStart(8, '0')}`
}
