import { notFound } from 'next/navigation'
import { obtenerMovimientosItem } from '@/app/admin/movimientos/actions'
import MovimientosItemView from './MovimientosItemView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ variante?: string }>
}

// Vista de kardex por ítem (POS P5b, Task 4): relee producto/variante +
// movimientos vía `obtenerMovimientosItem` (Task 3, ya trae saldo corrido y
// referencias resueltas). `variante` en la query string decide el ítem (null
// = movimientos del producto sin variante); si el producto/variante no
// existe o la consulta falla, 404 — mismo criterio que
// app/admin/cotizaciones/[id]/pdf/page.tsx.
export default async function MovimientosItemPage({ params, searchParams }: Props) {
  const { id } = await params
  const { variante } = await searchParams
  const varianteId = variante ?? null

  const result = await obtenerMovimientosItem(id, varianteId)
  if (!result.ok || !result.data) notFound()

  return (
    <MovimientosItemView
      productoId={id}
      varianteIdActual={varianteId}
      producto={result.data.producto}
      variante={result.data.variante}
      variantes={result.data.variantes}
      movimientos={result.data.movimientos}
    />
  )
}
