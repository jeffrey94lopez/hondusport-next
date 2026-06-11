'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export async function createCupon(codigo: string, descuento: number): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cupones').insert({
    codigo: codigo.toUpperCase().trim(),
    descuento,
    tipo: 'porcentaje',
    activo: true,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function toggleCupon(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cupones').update({ activo }).eq('id', id)
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
