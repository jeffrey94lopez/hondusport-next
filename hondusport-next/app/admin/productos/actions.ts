'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, ProductoForm } from '@/types'

export async function createProducto(form: ProductoForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('productos').insert({
    nombre: form.nombre,
    descripcion: form.descripcion || null,
    precio: form.precio,
    precio_original: form.precio_original || null,
    categoria_id: form.categoria_id || null,
    stock: form.stock ?? null,
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    personalizable: form.personalizable,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}

export async function updateProducto(id: string, form: ProductoForm): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('productos').update({
    nombre: form.nombre,
    descripcion: form.descripcion || null,
    precio: form.precio,
    precio_original: form.precio_original || null,
    categoria_id: form.categoria_id || null,
    stock: form.stock ?? null,
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    personalizable: form.personalizable,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}

export async function deleteProducto(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}

export async function toggleProductoActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('productos').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}
