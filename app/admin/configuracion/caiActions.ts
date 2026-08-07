'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, CaiForm } from '@/types'

// El índice único cai_activo_unico solo permite un CAI activo por combinación
// de establecimiento/punto/tipo. Si el 23505 salta, traducimos a un mensaje
// accionable en vez de mostrar el detalle del índice de Postgres.
function esCaiSolapado(error: { code?: string; message: string }): boolean {
  return error.code === '23505' && error.message.includes('cai_activo_unico')
}

// Un check constraint (nombre variable, pero referencia correlativo_actual)
// impide que el rango editado deje fuera al correlativo ya avanzado por
// facturas emitidas. Postgres reporta esto como 23514; se traduce a un
// mensaje accionable en vez del detalle crudo del constraint.
function esRangoFueraDeCorrelativo(error: { code?: string; message: string }): boolean {
  return error.code === '23514' && error.message.includes('correlativo_actual')
}

function mensajeError(error: { code?: string; message: string }): string {
  if (esCaiSolapado(error)) return 'Ya existe un CAI activo para ese establecimiento/punto/tipo'
  if (esRangoFueraDeCorrelativo(error)) {
    return 'El rango no puede dejar el correlativo actual fuera (ya se emitieron facturas de este CAI).'
  }
  return error.message
}

function validarForm(form: CaiForm): string | null {
  if (!form.cai.trim()) return 'El CAI es requerido'
  if (!/^[0-9]{3}$/.test(form.establecimiento)) return 'El establecimiento debe tener 3 dígitos'
  if (!/^[0-9]{3}$/.test(form.punto_emision)) return 'El punto de emisión debe tener 3 dígitos'
  if (!/^[0-9]{2}$/.test(form.tipo_documento)) return 'El tipo de documento debe tener 2 dígitos'
  if (!Number.isFinite(form.rango_desde) || form.rango_desde < 1) return 'El rango desde debe ser mayor o igual a 1'
  if (!Number.isFinite(form.rango_hasta) || form.rango_hasta < form.rango_desde) {
    return 'El rango hasta debe ser mayor o igual al rango desde'
  }
  if (!form.fecha_limite) return 'La fecha límite es requerida'
  return null
}

function toPayload(form: CaiForm) {
  return {
    cai: form.cai.trim(),
    establecimiento: form.establecimiento,
    punto_emision: form.punto_emision,
    tipo_documento: form.tipo_documento,
    rango_desde: form.rango_desde,
    rango_hasta: form.rango_hasta,
    fecha_limite: form.fecha_limite,
    activo: form.activo,
  }
}

// correlativo_actual se fija SOLO al crear (rango_desde - 1); nunca es
// editable desde el formulario ni desde updateCai.
export async function createCai(form: CaiForm): Promise<ActionResult> {
  const formError = validarForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('cai_autorizaciones').insert({
    ...toPayload(form),
    correlativo_actual: form.rango_desde - 1,
  })
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function updateCai(id: string, form: CaiForm): Promise<ActionResult> {
  const formError = validarForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('cai_autorizaciones').update(toPayload(form)).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function toggleCaiActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cai_autorizaciones').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}
