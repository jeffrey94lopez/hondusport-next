'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { CotizacionEtapaTipo, EtapaForm } from '@/types'

export type CotizacionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'
const TIPOS_ETAPA: CotizacionEtapaTipo[] = ['abierta', 'ganada', 'perdida']

function validarEtapaForm(form: EtapaForm): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido'
  if (!TIPOS_ETAPA.includes(form.tipo)) return 'El tipo de etapa no es válido'
  if (!form.color.trim()) return 'El color es requerido'
  return null
}

function revalidar() {
  revalidatePath('/admin/configuracion')
  revalidatePath('/admin/cotizaciones')
}

export async function crearEtapa(form: EtapaForm): Promise<CotizacionResult> {
  const formError = validarEtapaForm(form)
  if (formError) return { ok: false, error: formError }

  const supabase = await createClient()
  const { data: max } = await supabase
    .from('cotizacion_etapas')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  const orden = (max?.orden ?? -1) + 1

  const { error } = await supabase.from('cotizacion_etapas').insert({
    nombre: form.nombre.trim(),
    tipo: form.tipo,
    color: form.color.trim(),
    orden,
  })
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidar()
  return { ok: true }
}

export async function actualizarEtapa(id: string, form: EtapaForm): Promise<CotizacionResult> {
  const formError = validarEtapaForm(form)
  if (formError) return { ok: false, error: formError }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cotizacion_etapas')
    .update({ nombre: form.nombre.trim(), tipo: form.tipo, color: form.color.trim() })
    .eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidar()
  return { ok: true }
}

// Fija `orden` por posición según el arreglo `ids` (orden deseado tras
// mover una etapa arriba/abajo en la lista de EtapasSection).
export async function reordenarEtapas(ids: string[]): Promise<CotizacionResult> {
  const supabase = await createClient()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from('cotizacion_etapas').update({ orden: i }).eq('id', ids[i])
    if (error) return { ok: false, error: ERROR_GENERICO }
  }

  revalidar()
  return { ok: true }
}

// Bloquea el borrado si la etapa tiene cotizaciones (además del FK
// `restrict` en la BD, que devolvería un error genérico de Postgres): se
// cuenta antes de intentar el delete para dar un mensaje claro al usuario.
export async function eliminarEtapa(id: string): Promise<CotizacionResult> {
  const supabase = await createClient()

  const { count } = await supabase
    .from('cotizaciones')
    .select('id', { count: 'exact', head: true })
    .eq('etapa_id', id)
  if ((count ?? 0) > 0) {
    return { ok: false, error: 'La etapa tiene cotizaciones. Muévelas a otra etapa antes de eliminarla.' }
  }

  const { error } = await supabase.from('cotizacion_etapas').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidar()
  return { ok: true }
}

// Desactivar una etapa la saca del tablero (agruparPorEtapa filtra por activo):
// si tuviera cotizaciones, esas tarjetas desaparecerían del kanban (orfanadas).
// Por eso solo se puede DESACTIVAR una etapa vacía; muévelas primero.
export async function toggleEtapaActivo(id: string, activo: boolean): Promise<CotizacionResult> {
  const supabase = await createClient()

  if (!activo) {
    const { count } = await supabase
      .from('cotizaciones')
      .select('id', { count: 'exact', head: true })
      .eq('etapa_id', id)
    if ((count ?? 0) > 0) {
      return { ok: false, error: 'La etapa tiene cotizaciones. Muévelas a otra etapa antes de ocultarla.' }
    }
  }

  const { error } = await supabase.from('cotizacion_etapas').update({ activo }).eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidar()
  return { ok: true }
}
