'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export interface BannerForm {
  titulo: string
  subtitulo: string
  btn_texto: string
  btn_link: string
  imagen: string | null
  orden: number
  activo: boolean
}

export async function createBanner(form: BannerForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('banners').insert({
    titulo: form.titulo || null,
    subtitulo: form.subtitulo || null,
    btn_texto: form.btn_texto,
    btn_link: form.btn_link,
    imagen: form.imagen,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}

export async function updateBanner(id: string, form: BannerForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('banners')
    .update({
      titulo: form.titulo || null,
      subtitulo: form.subtitulo || null,
      btn_texto: form.btn_texto,
      btn_link: form.btn_link,
      imagen: form.imagen,
      orden: form.orden,
      activo: form.activo,
    })
    .eq('id', id)
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

export async function toggleBannerActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('banners').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}
