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

// ids de variantes (de las dadas) que YA tienen movimientos propios. Igual que
// tieneHistorialCostoProducto pero por variante — se usa tanto para que el
// form sepa qué filas bloquear como para que el server la re-valide.
async function idsConHistorialCosto(
  supabase: SupabaseServerClient, productoId: string, varianteIds: string[]
): Promise<Set<string>> {
  if (varianteIds.length === 0) return new Set()
  const { data } = await supabase
    .from('movimientos_inventario')
    .select('variante_id')
    .eq('producto_id', productoId)
    .in('variante_id', varianteIds)
  return new Set((data ?? []).map(r => r.variante_id as string).filter(Boolean))
}

// Server action de solo lectura para que el form sepa, ANTES de guardar, qué
// costos mostrar solo-lectura (con margen) vs. editables: el del producto (si
// tiene movimientos propios) y el de cada variante (si YA tiene movimientos,
// no simplemente por existir/tener id).
export async function obtenerHistorialCosto(
  productoId: string, varianteIds: string[]
): Promise<{ producto: boolean; variantes: string[] }> {
  const supabase = await createClient()
  const [producto, variantesConHistorial] = await Promise.all([
    tieneHistorialCostoProducto(supabase, productoId),
    idsConHistorialCosto(supabase, productoId, varianteIds),
  ])
  return { producto, variantes: Array.from(variantesConHistorial) }
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

type VarianteActual = { id: string; stock: number | null; costo: number | null; nombre: string }
type SyncResult = { error: string | null; avisos: string[] }

// Sincroniza las hijas de un producto con lo enviado por el form, de forma
// atómica vía RPC (delete de ausentes + upsert de presentes en una transacción).
//
// Stock de variantes EXISTENTES: el upsert de sync_producto_variantes NUNCA
// manda su stock "nuevo" — siempre manda el valor ACTUAL de BD (sin cambio
// para el RPC), sea el cambio un delta o una modalidad (null<->número). El
// cambio real se aplica DESPUÉS, fila por fila, vía aplicarCambioStock. Así
// el resultado no depende de si el on conflict do update de la RPC toca o no
// la columna `stock` (hoy sí la toca, pero no queremos acoplar la corrección
// de este flujo a ese detalle interno de la RPC — de ahí el bug original
// donde el camino de modalidad de variantes nunca se aplicaba).
// Variantes NUEVAS sí llevan su stock inicial directo en el upsert (no hay
// historial que proteger todavía).
//
// Costo de variantes existentes: sync_producto_variantes lo ignora en su
// UPDATE a nivel de RPC (solo lo asigna al insertar una variante nueva; ver
// comentario en la migración). Aquí solo generamos el AVISO cuando la
// variante ya tiene historial real y el form intentó cambiarlo (igual que a
// nivel de producto, pero por variante — variante_id, no producto_id).
async function syncVariantes(
  supabase: SupabaseServerClient,
  productoId: string,
  variantes: VarianteForm[],
  variantesActuales: VarianteActual[],
  usuario: string | null,
): Promise<SyncResult> {
  const actualPorId = new Map(variantesActuales.map(v => [v.id, v]))
  const idsExistentes = variantes.map(v => v.id).filter((id): id is string => !!id)
  const historialCostoSet = await idsConHistorialCosto(supabase, productoId, idsExistentes)

  const payload = variantes.map((v, i) => {
    const actual = v.id ? actualPorId.get(v.id) : undefined
    const stockParaUpsert = v.id ? (actual?.stock ?? null) : v.stock
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
  if (error) return { error: error.message, avisos: [] }

  const avisos: string[] = []

  // Cambios de stock de variantes existentes: delta O modalidad, ambos DESPUÉS
  // del sync (que dejó el stock intacto arriba), uno por uno.
  for (const v of variantes) {
    if (!v.id) continue
    const actual = actualPorId.get(v.id)
    const stockActual = actual?.stock ?? null
    const cambio = calcularCambioStock(stockActual, v.stock)
    if (cambio.tipo === 'sin_cambio') continue
    const err = await aplicarCambioStock(supabase, {
      productoId,
      varianteId: v.id,
      stockActual,
      stockForm: v.stock,
      costoEntrada: v.costoEntrada,
      usuario,
    })
    if (err) return { error: err, avisos }
  }

  // Aviso de costo por variante (no bloquea el guardado, solo informa).
  for (const v of variantes) {
    if (!v.id) continue
    const actual = actualPorId.get(v.id)
    if (!actual) continue
    if (v.costo !== actual.costo && historialCostoSet.has(v.id)) {
      avisos.push(`Variante "${actual.nombre}": ya tiene movimientos de inventario, el costo no se modificó directamente.`)
    }
  }

  return { error: null, avisos }
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
  // directo (sin deltas ni registrar_entrada). Si esto falla, el producto YA
  // quedó creado (sin variantes) — se lo decimos al usuario en vez de dejarlo
  // creer que nada pasó.
  const { error: syncError } = await syncVariantes(supabase, data.id, form.variantes, [], null)
  if (syncError) return { error: `El producto se creó, pero las variantes fallaron: ${syncError}` }

  revalidatePath('/admin/productos')
  return {}
}

// Orden de operaciones (importa para saber qué queda guardado si algo falla
// a mitad de camino — no hay una única transacción que cubra las cuatro):
//   1. SELECT de stock/costo/variantes actuales en BD (no del form).
//   2. UPDATE de `productos` con todo excepto `stock` (y `costo` protegido
//      si el producto ya tiene historial propio).
//   3. Cambio de stock del producto (delta vía registrar_entrada, o directo
//      si es modalidad).
//   4. syncVariantes: upsert atómico de variantes + cambios de stock/avisos
//      de costo por variante.
// Si (2) tuvo éxito y (3) o (4) fallan, los datos generales SÍ quedaron
// guardados — el error se lo indica explícitamente al usuario.
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
    .select('stock, costo, producto_variantes(id, stock, costo, nombre)')
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

  // A partir de aquí los datos generales YA quedaron guardados: cualquier
  // error se lo antepone al usuario para que no crea que no pasó nada.
  const stockError = await aplicarCambioStock(supabase, {
    productoId: id,
    varianteId: null,
    stockActual: actual.stock,
    stockForm: form.stock,
    costoEntrada: form.costoEntrada,
    usuario,
  })
  if (stockError) return { error: `Los datos generales se guardaron, pero falló: ${stockError}` }

  const { error: syncError, avisos: variantAvisos } =
    await syncVariantes(supabase, id, form.variantes, actual.producto_variantes ?? [], usuario)
  if (syncError) return { error: `Los datos generales se guardaron, pero falló: ${syncError}` }

  revalidatePath('/admin/productos')

  const avisos: string[] = []
  if (tieneHistorial && costoCambiado) {
    avisos.push('El producto ya tiene movimientos de inventario: el costo no se modificó directamente. Usa "Registrar entrada" para ajustarlo.')
  }
  avisos.push(...variantAvisos)
  return avisos.length > 0 ? { aviso: avisos.join('\n') } : {}
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
