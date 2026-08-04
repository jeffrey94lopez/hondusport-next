'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, ProductoForm, VarianteForm } from '@/types'
import { slugify, uniqueSlug } from '@/lib/store/slug'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Valida que las variantes tengan nombre no vacío y único dentro del form.
function validarVariantes(variantes: VarianteForm[]): string | null {
  const nombres = variantes.map(v => v.nombre.trim().toLowerCase())
  if (nombres.some(n => !n)) return 'Cada variante necesita un nombre único'
  if (new Set(nombres).size !== nombres.length) return 'Cada variante necesita un nombre único'
  return null
}

// Sincroniza las hijas de un producto con lo enviado por el form, de forma
// atómica vía RPC (delete de ausentes + upsert de presentes en una transacción).
async function syncVariantes(
  supabase: SupabaseServerClient,
  productoId: string,
  variantes: VarianteForm[],
): Promise<string | null> {
  const payload = variantes.map((v, i) => ({
    ...(v.id ? { id: v.id } : {}),
    nombre: v.nombre.trim(),
    sku: v.sku.trim() || null,
    precio: v.precio ?? null,
    stock: v.stock ?? null,
    activo: v.activo,
    orden: i,
  }))
  const { error } = await supabase.rpc('sync_producto_variantes', {
    p_producto_id: productoId,
    p_variantes: payload,
  })
  return error ? error.message : null
}

export async function createProducto(form: ProductoForm): Promise<ActionResult> {
  const varianteError = validarVariantes(form.variantes)
  if (varianteError) return { error: varianteError }

  const supabase = await createClient()
  const { data: rows } = await supabase.from('productos').select('slug')
  const existentes = (rows ?? []).map(r => r.slug as string)
  const slug = uniqueSlug(slugify(form.slug || form.nombre) || 'producto', existentes)
  const { data, error } = await supabase.from('productos').insert({
    nombre: form.nombre,
    slug,
    descripcion: form.descripcion || null,
    precio: form.precio,
    precio_original: form.precio_original || null,
    categoria_id: form.categoria_id || null,
    subcategoria_id: form.subcategoria_id || null,
    stock: form.stock ?? null,
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    imagenes: form.imagenes.length > 0 ? form.imagenes : null,
    personalizable: form.personalizable,
    activo: form.activo,
  }).select('id').single()
  if (error) return { error: error.message }

  const syncError = await syncVariantes(supabase, data.id, form.variantes)
  if (syncError) return { error: syncError }

  revalidatePath('/admin/productos')
  return {}
}

export async function updateProducto(id: string, form: ProductoForm): Promise<ActionResult> {
  const varianteError = validarVariantes(form.variantes)
  if (varianteError) return { error: varianteError }

  const supabase = await createClient()
  const { data: rows } = await supabase.from('productos').select('id, slug')
  const existentes = (rows ?? []).filter(r => r.id !== id).map(r => r.slug as string)
  const slug = uniqueSlug(slugify(form.slug || form.nombre) || 'producto', existentes)
  const { error } = await supabase.from('productos').update({
    nombre: form.nombre,
    slug,
    descripcion: form.descripcion || null,
    precio: form.precio,
    precio_original: form.precio_original || null,
    categoria_id: form.categoria_id || null,
    subcategoria_id: form.subcategoria_id || null,
    stock: form.stock ?? null,
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    imagenes: form.imagenes.length > 0 ? form.imagenes : null,
    personalizable: form.personalizable,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: error.message }

  const syncError = await syncVariantes(supabase, id, form.variantes)
  if (syncError) return { error: syncError }

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
