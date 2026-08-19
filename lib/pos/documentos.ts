import { numeroDevolucion } from './devoluciones'

export type TipoDocumento = 'factura' | 'comprobante' | 'nota_credito' | 'devolucion'

/**
 * Etiqueta legible del tipo de documento.
 *
 * Vivía duplicada en cuatro pantallas (las dos fichas, el detalle de turno y la
 * lista de documentos). Aquí una sola vez para que no puedan divergir.
 */
export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  factura: 'Factura',
  comprobante: 'Comprobante',
  nota_credito: 'Nota de crédito',
  devolucion: 'Devolución',
}

/**
 * Número de un documento, con el criterio propio de cada tipo:
 *
 * - `factura` y `nota_credito` llevan **correlativo fiscal** (la NC usa CAI '03').
 * - `devolucion` usa su propia secuencia con prefijo `DEV-`.
 * - `comprobante` usa `numero_comprobante` con prefijo `C-`.
 *
 * Antes esta función solo aceptaba factura/comprobante, y las pantallas que
 * listan los cuatro tipos tenían que ramificar por su cuenta: había tres copias
 * idénticas de ese branching más una cuarta variante propia. La versión estrecha
 * era además una trampa activa — casteando el tipo para llamarla, una nota de
 * crédito salía como `C-00000000` (un número que no existe, igual para todas) y
 * una devolución como `C-0000000X`, que **es el número de un comprobante real y
 * distinto** del mismo cliente. Costó una ronda de arreglo en la ficha de
 * cliente; ampliarla elimina el motivo de castear.
 *
 * Función pura y sin `'use client'`: se invoca tanto desde Server Components
 * como desde componentes cliente. (En Next 16 los exports de un módulo cliente
 * son client references y no se pueden llamar desde el servidor — por eso esta
 * función salió en su día de `CuentasPorCobrarClient.tsx`.)
 */
export function numeroDocumento(f: {
  tipo: TipoDocumento
  correlativo: string | null
  numero_comprobante: number | null
}): string {
  if (f.tipo === 'factura' || f.tipo === 'nota_credito') return f.correlativo ?? '—'
  if (f.tipo === 'devolucion') return numeroDevolucion(f.numero_comprobante ?? 0)
  return `C-${String(f.numero_comprobante ?? 0).padStart(8, '0')}`
}
