'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'
import { slugify, uniqueSlug } from '@/lib/store/slug'

interface CategoriaForm {
  tipo: 'cat' | 'subcat' | 'talla' | 'genero'
  valor: string
  slug: string
  imagen: string
  categorias_padre: string[]
  orden: number
  activo: boolean
}

export async function createCategoria(form: CategoriaForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('categorias').select('slug')
  const existentes = (rows ?? []).map(r => r.slug as string)
  const base = slugify(form.slug || form.valor)
  const slug = uniqueSlug(base || 'cat', existentes)

  const { error } = await supabase.from('categorias').insert({
    tipo: form.tipo,
    valor: form.valor.trim(),
    slug,
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre.length > 0 ? form.categorias_padre : null,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}

export async function updateCategoria(id: string, form: CategoriaForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('categorias').select('id, slug')
  const existentes = (rows ?? []).filter(r => r.id !== id).map(r => r.slug as string)
  const base = slugify(form.slug || form.valor)
  const slug = uniqueSlug(base || 'cat', existentes)

  const { error } = await supabase.from('categorias').update({
    tipo: form.tipo,
    valor: form.valor.trim(),
    slug,
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre.length > 0 ? form.categorias_padre : null,
    orden: form.orden,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}

export async function deleteCategoria(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}
