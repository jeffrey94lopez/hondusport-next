'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export interface EnvioForm {
  nombre: string
  descripcion: string
  tipo: 'delivery' | 'pickup'
  costo: number
  descuento: number
  activo: boolean
}

export async function createEnvio(form: EnvioForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('envios').insert({
    nombre: form.nombre,
    descripcion: form.descripcion || null,
    tipo: form.tipo,
    costo: form.costo,
    descuento: form.descuento,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function updateEnvio(id: string, form: EnvioForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('envios')
    .update({
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      tipo: form.tipo,
      costo: form.costo,
      descuento: form.descuento,
      activo: form.activo,
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function deleteEnvio(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('envios').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function toggleEnvioActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('envios').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function updateFreeShipping(
  activo: boolean,
  minimo: number
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('configuracion').upsert(
    [
      { key: 'free_shipping_activo', value: String(activo) },
      { key: 'free_shipping_minimo', value: String(minimo) },
    ],
    { onConflict: 'key' }
  )
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}
