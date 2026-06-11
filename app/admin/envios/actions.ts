'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

interface EnvioForm {
  nombre: string
  descripcion: string
  tipo: 'delivery' | 'pickup'
  costo: number
  descuento: number
  activo: boolean
}

export async function createEnvio(form: EnvioForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('envios').insert(form)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function updateEnvio(id: string, form: EnvioForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('envios').update(form).eq('id', id)
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
