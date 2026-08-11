import { createClient } from '@/lib/supabase-server'
import { filaGanancia } from '@/lib/reportes/ganancias'
import type { FilaGananciaItem } from '@/types'

interface RowGanancia { producto_id: string | null; variante_id: string | null; cantidad: number; ventas: number; costo: number }
interface ProductoRow { id: string; sku: string | null; nombre: string; categorias: { valor: string } | null }

export async function obtenerGanancias(desde: string, hasta: string): Promise<FilaGananciaItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reporte_ganancias_items', { p_desde: desde, p_hasta: hasta })
  if (error) console.error('[ganancias] error:', error.message)
  const rows = (data ?? []) as RowGanancia[]

  const prodIds = [...new Set(rows.map(r => r.producto_id).filter(Boolean) as string[])]
  const varIds = [...new Set(rows.map(r => r.variante_id).filter(Boolean) as string[])]

  const [{ data: productos }, { data: variantes }] = await Promise.all([
    prodIds.length
      ? supabase.from('productos').select('id, sku, nombre, categorias:categorias!productos_categoria_id_fkey(valor)').in('id', prodIds)
      : Promise.resolve({ data: [] as ProductoRow[] }),
    varIds.length
      ? supabase.from('producto_variantes').select('id, nombre').in('id', varIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  const pMap = new Map(((productos ?? []) as unknown as ProductoRow[]).map(p => [p.id, p]))
  const vMap = new Map((variantes ?? []).map(v => [v.id, v.nombre]))

  return rows.map(r => {
    if (r.producto_id == null) {
      return filaGanancia({ codigo: '', nombre: 'Ítems libres', variante: '', categoria: '', cantidad: Number(r.cantidad), ventas: Number(r.ventas), costo: Number(r.costo) })
    }
    const p = pMap.get(r.producto_id)
    return filaGanancia({
      codigo: p?.sku ?? '', nombre: p?.nombre ?? '—',
      variante: r.variante_id ? (vMap.get(r.variante_id) ?? '') : '',
      categoria: p?.categorias?.valor ?? '',
      cantidad: Number(r.cantidad), ventas: Number(r.ventas), costo: Number(r.costo),
    })
  }).sort((a, b) => b.ganancia - a.ganancia)
}
