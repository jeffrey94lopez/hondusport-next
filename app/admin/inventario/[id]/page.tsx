import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { obtenerToma } from '../actions'
import TomaEditor from './TomaEditor'

export const dynamic = 'force-dynamic'

// Editor de una toma de inventario físico. Relee la toma con obtenerToma
// (Task 5) — 404 si no existe. `inventario_conteo_ciego` gobierna si el
// editor oculta el stock del sistema mientras se cuenta (default 'true' a
// ciegas, mismo criterio que ConfigClient.tsx / PosSection.tsx de Task 6).
// `key={toma.id-toma.estado}` en TomaEditor (ver ese archivo) obliga a
// remontar cuando el estado cambia (p.ej. tras aplicar/anular con
// router.refresh()), así el estado local del editor no queda desincronizado
// de una toma que pasó a ser inmutable.
export default async function TomaEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [toma, { data: config }] = await Promise.all([
    obtenerToma(id),
    supabase.from('configuracion').select('key, value'),
  ])
  if (!toma.ok || !toma.data) notFound()

  const configMap = toConfigMap(config ?? [])
  const ciego = (configMap.inventario_conteo_ciego ?? 'true') === 'true'

  return (
    <TomaEditor
      key={`${toma.data.toma.id}-${toma.data.toma.estado}`}
      toma={toma.data.toma}
      lineasIniciales={toma.data.lineas}
      ciego={ciego}
    />
  )
}
