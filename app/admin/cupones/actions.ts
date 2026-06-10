'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export interface CuponForm {
  codigo: string
  descuento: number
  tipo: string
  activo: boolean
}

export async function createCupon(form: CuponForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cupones').insert({
    codigo: form.codigo.toUpperCase(),
    descuento: form.descuento,
    tipo: form.tipo,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function updateCupon(id: string, form: CuponForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cupones')
    .update({
      codigo: form.codigo.toUpperCase(),
      descuento: form.descuento,
      tipo: form.tipo,
      activo: form.activo,
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function deleteCupon(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cupones').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function toggleCuponActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cupones').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function togglePopupActivo(activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('configuracion')
    .upsert({ key: 'cupones_popup_activo', value: String(activo) }, { onConflict: 'key' })
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}
