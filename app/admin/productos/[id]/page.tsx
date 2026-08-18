import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { Categoria, Documento, MovimientoInventario, Producto, ProductoVariante } from '@/types'
import ProductoFichaView from './ProductoFichaView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export type VentaFila = {
  documentoId: string
  cantidad: number
  importe: number
  documento: Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante' | 'estado' | 'created_at'>
}

// Fila cruda tal como la infiere el cliente de Supabase (sin tipos Database
// generados): `documentos` es un embed TO-ONE (documento_items.documento_id
// -> documentos.id, FK simple), pero sin esos tipos el cliente lo infiere
// como arreglo. PostgREST en runtime devuelve un OBJETO. Mismo criterio que
// `DocumentoConPagos` en `cerrarSesion` (app/admin/pos/actions.ts:245): se
// declara aquí la forma REAL (objeto | null) y se castea con `as unknown as`
// para no arrastrar la forma inferida (arreglo) que nunca ocurre en runtime.
type VentaItemRow = {
  documento_id: string
  cantidad: number
  importe: number
  documentos: VentaFila['documento'] | null
}

// Ficha de producto (P.detalle D1): identidad + precios + stock + variantes
// (solo si tiene) + movimientos recientes (kardex) + ventas recientes.
// `producto_variantes` se relee aparte (no embebido en la fila del producto)
// porque solo se necesita el listado ordenado por `orden`, no repetir el
// resto de columnas del producto en cada fila anidada.
export default async function ProductoFichaPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: producto } = await supabase
    .from('productos')
    .select('*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor)')
    .eq('id', id)
    .maybeSingle()
  if (!producto) notFound()

  // `.limit()` explícito en cada consulta: sin él, PostgREST trunca en
  // silencio. La ficha es un resumen, así que se acota a lo reciente y se
  // enlaza a la pantalla completa (kardex) en vez de mostrar todo.
  const [variantes, movimientos, ventasRaw, categorias, subcategorias] = await Promise.all([
    supabase
      .from('producto_variantes')
      .select('*')
      .eq('producto_id', id)
      .order('orden')
      .limit(500)
      .then(r => (r.data ?? []) as ProductoVariante[]),
    supabase
      .from('movimientos_inventario')
      .select('*')
      .eq('producto_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(r => (r.data ?? []) as MovimientoInventario[]),
    supabase
      .from('documento_items')
      .select('documento_id, cantidad, importe, documentos(id, tipo, correlativo, numero_comprobante, estado, created_at)')
      // `producto_id` ya excluye los ítems libres del POS (producto_id nulo):
      // correcto y deseado, no son ventas de ESTE producto.
      .eq('producto_id', id)
      // Ordena por la fecha del documento embebido (mismo patrón ya usado en
      // app/admin/compras/[id]/page.tsx con `pago_aplicaciones -> pagos_proveedor`)
      // para que "recientes" sea realmente lo último vendido, no un corte
      // arbitrario de la tabla.
      .order('created_at', { foreignTable: 'documentos', ascending: false })
      .limit(50)
      .then(r => (r.data ?? []) as unknown as VentaItemRow[]),
    supabase
      .from('categorias')
      .select('id, valor')
      .eq('tipo', 'cat')
      .eq('activo', true)
      .order('valor')
      .limit(300)
      .then(r => (r.data ?? []) as { id: string; valor: string }[]),
    supabase
      .from('categorias')
      .select('id, valor, categorias_padre')
      .eq('tipo', 'subcat')
      .eq('activo', true)
      .order('valor')
      .limit(300)
      .then(r => (r.data ?? []) as Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]),
  ])

  // Filtra filas cuyo documento embebido no llegó (no debería pasar: todo
  // documento_items apunta a un documento existente e inmutable) antes de
  // aplanar a la forma que consume la vista.
  const ventas: VentaFila[] = ventasRaw
    .filter((v): v is VentaItemRow & { documentos: VentaFila['documento'] } => v.documentos != null)
    .map(v => ({
      documentoId: v.documento_id,
      cantidad: v.cantidad,
      importe: v.importe,
      documento: v.documentos,
    }))

  return (
    <ProductoFichaView
      producto={producto as Producto}
      variantes={variantes}
      movimientos={movimientos}
      ventas={ventas}
      categorias={categorias}
      subcategorias={subcategorias}
    />
  )
}
