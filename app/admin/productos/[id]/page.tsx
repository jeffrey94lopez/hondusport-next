import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import type { Categoria, Documento, MovimientoInventario, Producto, ProductoVariante } from '@/types'
import ProductoFichaView from './ProductoFichaView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export type VentaFila = {
  itemId: string
  documentoId: string
  varianteId: string | null
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
  id: string
  documento_id: string
  variante_id: string | null
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
      // `documentos!inner(...)`, no `documentos(...)`: el JSDoc del propio
      // cliente (PostgrestTransformBuilder.order) es explícito — "ordering
      // with referencedTable doesn't affect the ordering of the parent
      // table" salvo que el embed sea `!inner`. Con el embed normal (LEFT
      // JOIN), el `.order(foreignTable: 'documentos')` de abajo solo
      // reordenaba dentro de cada fila (un embed to-one es una sola fila, o
      // sea que era un no-op) y el `.limit(50)` se quedaba con lo que
      // Postgres devolviera en su orden físico — típicamente lo más
      // ANTIGUO, no lo más reciente. `!inner` es seguro aquí: todo
      // documento_items.documento_id referencia un documento existente e
      // inmutable, así que convertir el LEFT JOIN en INNER JOIN no descarta
      // ninguna fila real.
      .select('id, documento_id, variante_id, cantidad, importe, documentos!inner(id, tipo, correlativo, numero_comprobante, estado, created_at)')
      // `producto_id` ya excluye los ítems libres del POS (producto_id nulo):
      // correcto y deseado, no son ventas de ESTE producto.
      .eq('producto_id', id)
      .order('created_at', { foreignTable: 'documentos', ascending: false })
      // 51, no 50: uno de más para poder distinguir "hay exactamente 50" de
      // "hay más de 50" sin una segunda consulta de conteo (mismo patrón que
      // ClienteFichaPage con documentos/cobros/compras).
      .limit(51)
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
  // documento_items apunta a un documento existente e inmutable, y ahora el
  // embed es `!inner`) antes de aplanar a la forma que consume la vista.
  const ventasCompletas: VentaFila[] = ventasRaw
    .filter((v): v is VentaItemRow & { documentos: VentaFila['documento'] } => v.documentos != null)
    .map(v => ({
      itemId: v.id,
      documentoId: v.documento_id,
      varianteId: v.variante_id,
      cantidad: v.cantidad,
      importe: v.importe,
      documento: v.documentos,
    }))
  // `.slice(0, 50)` + `length > 50` (no `=== 51`, que también sería válido
  // aquí, pero se sigue el mismo idioma que ClienteFichaPage): con
  // `.limit(50)` a secas, un producto con EXACTAMENTE 50 ventas mostraría el
  // aviso de "hay más" sin que se haya truncado nada.
  const ventas = ventasCompletas.slice(0, 50)
  const ventasHayMas = ventasCompletas.length > 50

  return (
    <ProductoFichaView
      producto={producto as Producto}
      variantes={variantes}
      movimientos={movimientos}
      ventas={ventas}
      ventasHayMas={ventasHayMas}
      categorias={categorias}
      subcategorias={subcategorias}
    />
  )
}
