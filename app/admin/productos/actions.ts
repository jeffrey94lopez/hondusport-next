'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, ProductoForm, VarianteForm } from '@/types'
import { slugify, uniqueSlug } from '@/lib/store/slug'
import { calcularCambioStock } from '@/lib/store/costeo'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Valida que las variantes tengan nombre no vacío y único dentro del form.
function validarVariantes(variantes: VarianteForm[]): string | null {
  const nombres = variantes.map(v => v.nombre.trim().toLowerCase())
  if (nombres.some(n => !n)) return 'Cada variante necesita un nombre único'
  if (new Set(nombres).size !== nombres.length) return 'Cada variante necesita un nombre único'
  return null
}

// El costo del producto (fila plana, sin variante) solo se puede editar a mano
// mientras no tenga movimientos propios; después lo gobierna registrar_entrada.
// variante_id is null filtra los movimientos de las variantes del producto,
// que no deben bloquear la edición del costo del padre.
async function tieneHistorialCostoProducto(supabase: SupabaseServerClient, productoId: string): Promise<boolean> {
  const { count } = await supabase
    .from('movimientos_inventario')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', productoId)
    .is('variante_id', null)
  return (count ?? 0) > 0
}

// Server action de solo lectura para que el form sepa, ANTES de guardar, si
// debe mostrar el costo del producto como solo-lectura (con margen) o editable.
export async function obtenerHistorialCostoProducto(productoId: string): Promise<boolean> {
  const supabase = await createClient()
  return tieneHistorialCostoProducto(supabase, productoId)
}

// Aplica un cambio de `stock` de producto o variante contra el valor guardado
// en BD: si es cambio de modalidad (null <-> número) escribe directo sin
// kardex; si es un delta real, pasa por registrar_entrada (que hace su propio
// SELECT...FOR UPDATE atómico, así que es seguro aunque el `stockActual` que
// usamos para calcular el delta se haya leído unos milisegundos antes).
async function aplicarCambioStock(
  supabase: SupabaseServerClient,
  opts: {
    productoId: string
    varianteId: string | null
    stockActual: number | null
    stockForm: number | null
    costoEntrada: number | null
    usuario: string | null
  }
): Promise<string | null> {
  const cambio = calcularCambioStock(opts.stockActual, opts.stockForm)
  if (cambio.tipo === 'sin_cambio') return null

  if (cambio.tipo === 'modalidad') {
    const table = opts.varianteId ? 'producto_variantes' : 'productos'
    const matchId = opts.varianteId ?? opts.productoId
    const { error } = await supabase.from(table).update({ stock: cambio.valor }).eq('id', matchId)
    return error ? error.message : null
  }

  // delta: una salida/ajuste negativo nunca lleva costo (la RPC lo rechaza).
  const costo = cambio.delta > 0 ? (opts.costoEntrada ?? null) : null
  const { error } = await supabase.rpc('registrar_entrada', {
    p_producto_id: opts.productoId,
    p_variante_id: opts.varianteId,
    p_cantidad: cambio.delta,
    p_costo: costo,
    p_referencia: 'manual',
    p_usuario: opts.usuario,
    p_notas: null,
  })
  return error ? error.message : null
}

// Sincroniza las hijas de un producto con lo enviado por el form, de forma
// atómica vía RPC (delete de ausentes + upsert de presentes en una transacción).
// El stock de variantes EXISTENTES no se manda directo en el upsert cuando hay
// delta: se manda el valor actual (sin cambio para el RPC) y el delta real se
// aplica DESPUÉS vía aplicarCambioStock/registrar_entrada (kardexable). Las
// variantes nuevas sí llevan su stock inicial directo (no hay historial que
// proteger). El costo de variantes existentes lo ignora sync_producto_variantes
// a nivel de RPC (solo se asigna en el INSERT de una variante nueva).
async function syncVariantes(
  supabase: SupabaseServerClient,
  productoId: string,
  variantes: VarianteForm[],
  variantesActuales: { id: string; stock: number | null }[],
  usuario: string | null,
): Promise<string | null> {
  const stockActualPorId = new Map(variantesActuales.map(v => [v.id, v.stock]))

  const payload = variantes.map((v, i) => {
    const stockActual = v.id ? stockActualPorId.get(v.id) ?? null : null
    const cambio = v.id ? calcularCambioStock(stockActual, v.stock) : { tipo: 'sin_cambio' as const }
    const stockParaUpsert = cambio.tipo === 'delta' ? stockActual : v.stock
    return {
      ...(v.id ? { id: v.id } : {}),
      nombre: v.nombre.trim(),
      sku: v.sku.trim() || null,
      precio: v.precio ?? null,
      stock: stockParaUpsert ?? null,
      costo: v.costo ?? null,
      precio_revendedor: v.precio_revendedor ?? null,
      activo: v.activo,
      orden: i,
    }
  })
  const { error } = await supabase.rpc('sync_producto_variantes', {
    p_producto_id: productoId,
    p_variantes: payload,
  })
  if (error) return error.message

  // Deltas de variantes existentes: DESPUÉS del sync (que ya dejó su stock
  // intacto arriba), uno por uno vía registrar_entrada.
  for (const v of variantes) {
    if (!v.id) continue
    const stockActual = stockActualPorId.get(v.id) ?? null
    const cambio = calcularCambioStock(stockActual, v.stock)
    if (cambio.tipo !== 'delta') continue
    const err = await aplicarCambioStock(supabase, {
      productoId,
      varianteId: v.id,
      stockActual,
      stockForm: v.stock,
      costoEntrada: v.costoEntrada,
      usuario,
    })
    if (err) return err
  }
  return null
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
    canal: form.canal,
    isv: form.isv,
    costo: form.costo ?? null,
    precio_revendedor: form.precio_revendedor ?? null,
    stock_minimo: form.stock_minimo ?? null,
    activo: form.activo,
  }).select('id').single()
  if (error) return { error: error.message }

  // Producto nuevo: no hay stock/historial previo que proteger, se sincroniza
  // directo (sin deltas ni registrar_entrada).
  const syncError = await syncVariantes(supabase, data.id, form.variantes, [], null)
  if (syncError) return { error: syncError }

  revalidatePath('/admin/productos')
  return {}
}

export async function updateProducto(id: string, form: ProductoForm): Promise<ActionResult> {
  const varianteError = validarVariantes(form.variantes)
  if (varianteError) return { error: varianteError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const usuario = user?.email ?? null

  // Estado actual desde la BD (no del form, que puede llegar desactualizado):
  // es la base para el delta de kardex y para decidir si el costo es editable.
  const { data: actual, error: fetchError } = await supabase
    .from('productos')
    .select('stock, costo, producto_variantes(id, stock)')
    .eq('id', id)
    .single()
  if (fetchError || !actual) return { error: fetchError?.message ?? 'Producto no encontrado' }

  const tieneHistorial = await tieneHistorialCostoProducto(supabase, id)
  const costoCambiado = form.costo !== actual.costo
  const costo = tieneHistorial ? actual.costo : (form.costo ?? null)

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
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    imagenes: form.imagenes.length > 0 ? form.imagenes : null,
    personalizable: form.personalizable,
    canal: form.canal,
    isv: form.isv,
    costo,
    precio_revendedor: form.precio_revendedor ?? null,
    stock_minimo: form.stock_minimo ?? null,
    activo: form.activo,
    // stock: NO se escribe aquí. Ver aplicarCambioStock abajo: pasa por
    // registrar_entrada (delta kardexable) o se escribe directo solo si es
    // un cambio de modalidad ilimitado<->número (no es un movimiento real).
  }).eq('id', id)
  if (error) return { error: error.message }

  const stockError = await aplicarCambioStock(supabase, {
    productoId: id,
    varianteId: null,
    stockActual: actual.stock,
    stockForm: form.stock,
    costoEntrada: form.costoEntrada,
    usuario,
  })
  if (stockError) return { error: stockError }

  const syncError = await syncVariantes(supabase, id, form.variantes, actual.producto_variantes ?? [], usuario)
  if (syncError) return { error: syncError }

  revalidatePath('/admin/productos')
  return tieneHistorial && costoCambiado
    ? { aviso: 'El producto ya tiene movimientos de inventario: el costo no se modificó directamente. Usa "Registrar entrada" para ajustarlo.' }
    : {}
}

export async function deleteProducto(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  // Guarda de integridad: un producto con historial de ventas o de kardex no
  // se borra (perdería trazabilidad); se desactiva en su lugar. La FK de
  // movimientos_inventario ya es "on delete restrict", pero pedido_items es
  // "on delete set null" y no bloquearía el delete por sí sola.
  const [{ count: pedidos }, { count: movimientos }] = await Promise.all([
    supabase.from('pedido_items').select('id', { count: 'exact', head: true }).eq('producto_id', id),
    supabase.from('movimientos_inventario').select('id', { count: 'exact', head: true }).eq('producto_id', id),
  ])
  if ((pedidos ?? 0) > 0 || (movimientos ?? 0) > 0) {
    return { error: 'Este producto tiene historial; desactívalo en su lugar.' }
  }

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
