'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

interface CategoriaForm {
  tipo: 'cat' | 'subcat' | 'talla' | 'genero'
  valor: string
  imagen: string
  categorias_padre: string
  orden: number
  activo: boolean
}

export async function createCategoria(form: CategoriaForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('categorias').insert({
    tipo: form.tipo,
    valor: form.valor.trim(),
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre
      ? form.categorias_padre.split(',').map(s => s.trim()).filter(Boolean)
      : null,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}

export async function updateCategoria(id: string, form: CategoriaForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('categorias').update({
    tipo: form.tipo,
    valor: form.valor.trim(),
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre
      ? form.categorias_padre.split(',').map(s => s.trim()).filter(Boolean)
      : null,
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
