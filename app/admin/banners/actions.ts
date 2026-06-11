'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

interface BannerForm {
  titulo: string
  subtitulo: string
  btn_texto: string
  btn_link: string
  imagen: string
  orden: number
  activo: boolean
}

export async function createBanner(form: BannerForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('banners').insert(form)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}

export async function updateBanner(id: string, form: BannerForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('banners').update(form).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}

export async function deleteBanner(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('banners').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}
