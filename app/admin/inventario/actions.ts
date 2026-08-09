'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { numeroConteo } from '@/lib/inventario/conteo'
import type { ConteoFisico, ConteoLinea, AlcanceTipo, EstadoConteo } from '@/types'

export type InvResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Traduce el mensaje de error de `aplicar_conteo` a algo legible; si no se
// reconoce el fragmento, un genérico (mismo patrón que cuentas-por-cobrar).
function traducirError(mensaje: string | undefined | null): string {
  const m = mensaje ?? ''
  if (m.includes('Toma no encontrada') || m.includes('no esta en conteo')) return m
  return ERROR_GENERICO
}

async function estadoDeToma(supabase: SupabaseServerClient, conteoId: string): Promise<EstadoConteo | null> {
  const { data } = await supabase.from('conteos_fisicos').select('estado').eq('id', conteoId).maybeSingle()
  return (data?.estado as EstadoConteo | undefined) ?? null
}

interface VarianteParaMaterializar {
  id: string
  sku: string | null
  nombre: string
  stock: number | null
  activo: boolean
}

interface ProductoParaMaterializar {
  id: string
  sku: string | null
  nombre: string
  stock: number | null
  producto_variantes: VarianteParaMaterializar[] | null
}

interface LineaNueva {
  producto_id: string
  variante_id: string | null
  sku: string | null
  nombre: string
  stock_snapshot: number
}

// Materializa las líneas de una toma según su alcance. Un producto con
// variantes activas se vende POR variante (ver CLAUDE.md): su stock propio
// no se cuenta como línea, solo las de sus variantes. `stock = null`
// (ilimitado) se excluye siempre. `seleccion` no materializa nada (se
// completa por escaneo con `agregarLineaPorSku`).
async function materializarLineas(
  supabase: SupabaseServerClient,
  alcanceTipo: AlcanceTipo,
  alcanceRef: string | null,
): Promise<LineaNueva[]> {
  if (alcanceTipo === 'seleccion') return []

  let query = supabase
    .from('productos')
    .select('id, sku, nombre, stock, producto_variantes(id, sku, nombre, stock, activo)')

  if (alcanceTipo === 'categoria' && alcanceRef) query = query.eq('categoria_id', alcanceRef)
  else if (alcanceTipo === 'subcategoria' && alcanceRef) query = query.eq('subcategoria_id', alcanceRef)

  const { data, error } = await query
  if (error || !data) return []

  const lineas: LineaNueva[] = []
  for (const p of data as unknown as ProductoParaMaterializar[]) {
    const variantesActivas = (p.producto_variantes ?? []).filter(v => v.activo)
    if (variantesActivas.length === 0) {
      if (p.stock != null) {
        lineas.push({ producto_id: p.id, variante_id: null, sku: p.sku, nombre: p.nombre, stock_snapshot: p.stock })
      }
      continue
    }
    for (const v of variantesActivas) {
      if (v.stock != null) {
        lineas.push({
          producto_id: p.id,
          variante_id: v.id,
          sku: v.sku,
          nombre: `${p.nombre} (${v.nombre})`,
          stock_snapshot: v.stock,
        })
      }
    }
  }
  return lineas
}

export async function crearToma(input: {
  alcanceTipo: AlcanceTipo
  alcanceRef: string | null
  descripcion: string | null
}): Promise<InvResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: n, error: nErr } = await supabase.rpc('nextval_conteo')
  if (nErr || n == null) return { ok: false, error: ERROR_GENERICO }
  const numero = numeroConteo(Number(n))

  const { data: toma, error: insErr } = await supabase
    .from('conteos_fisicos')
    .insert({
      numero,
      alcance_tipo: input.alcanceTipo,
      alcance_ref: input.alcanceRef,
      descripcion: input.descripcion,
      usuario: user?.email ?? null,
    })
    .select('id')
    .single()
  if (insErr || !toma) return { ok: false, error: ERROR_GENERICO }

  const lineas = await materializarLineas(supabase, input.alcanceTipo, input.alcanceRef)
  if (lineas.length > 0) {
    const { error: lineasErr } = await supabase
      .from('conteo_lineas')
      .insert(lineas.map(l => ({ ...l, conteo_id: toma.id })))
    if (lineasErr) return { ok: false, error: ERROR_GENERICO }
  }

  revalidatePath('/admin/inventario')
  return { ok: true, data: { id: toma.id } }
}

export async function obtenerTomas(): Promise<InvResult<ConteoFisico[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conteos_fisicos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: ERROR_GENERICO }
  return { ok: true, data: (data ?? []) as ConteoFisico[] }
}

export async function obtenerToma(
  id: string,
): Promise<InvResult<{ toma: ConteoFisico; lineas: (ConteoLinea & { costo: number | null })[] }>> {
  const supabase = await createClient()

  const { data: toma, error: tomaErr } = await supabase
    .from('conteos_fisicos')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (tomaErr || !toma) return { ok: false, error: 'Toma no encontrada.' }

  const { data: lineasData, error: lineasErr } = await supabase
    .from('conteo_lineas')
    .select('*')
    .eq('conteo_id', id)
    .order('nombre')
  if (lineasErr) return { ok: false, error: ERROR_GENERICO }

  const lineas = (lineasData ?? []) as ConteoLinea[]

  // PostgREST no embebe cómodamente productos/producto_variantes desde
  // conteo_lineas para el costo: se trae aparte y se mapea por id.
  const productoIds = [...new Set(lineas.map(l => l.producto_id))]
  const varianteIds = [...new Set(lineas.filter(l => l.variante_id != null).map(l => l.variante_id as string))]

  const [{ data: productosData }, { data: variantesData }] = await Promise.all([
    productoIds.length > 0
      ? supabase.from('productos').select('id, costo').in('id', productoIds)
      : Promise.resolve({ data: [] as { id: string; costo: number | null }[] }),
    varianteIds.length > 0
      ? supabase.from('producto_variantes').select('id, costo').in('id', varianteIds)
      : Promise.resolve({ data: [] as { id: string; costo: number | null }[] }),
  ])

  const costoProductos = new Map((productosData ?? []).map(p => [p.id as string, p.costo as number | null]))
  const costoVariantes = new Map((variantesData ?? []).map(v => [v.id as string, v.costo as number | null]))

  const lineasConCosto = lineas.map(l => ({
    ...l,
    // costo null en la variante hereda el costo del producto (mismo criterio
    // que precio/precio_revendedor en producto_variantes).
    costo: l.variante_id
      ? (costoVariantes.get(l.variante_id) ?? costoProductos.get(l.producto_id) ?? null)
      : (costoProductos.get(l.producto_id) ?? null),
  }))

  return { ok: true, data: { toma: toma as ConteoFisico, lineas: lineasConCosto } }
}

export async function guardarConteoLinea(lineaId: string, contado: number | null): Promise<InvResult> {
  if (contado != null && contado < 0) return { ok: false, error: 'Los montos no pueden ser negativos.' }

  const supabase = await createClient()

  const { data: linea, error: lineaErr } = await supabase
    .from('conteo_lineas')
    .select('conteo_id')
    .eq('id', lineaId)
    .maybeSingle()
  if (lineaErr || !linea) return { ok: false, error: ERROR_GENERICO }

  const estado = await estadoDeToma(supabase, linea.conteo_id)
  if (estado !== 'en_conteo') return { ok: false, error: 'La toma ya no es editable.' }

  const { error } = await supabase.from('conteo_lineas').update({ contado }).eq('id', lineaId)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidatePath(`/admin/inventario/${linea.conteo_id}`)
  return { ok: true }
}

export async function agregarLineaPorSku(
  conteoId: string,
  sku: string,
): Promise<InvResult<{ linea: ConteoLinea } | { noRastreado: true } | { noEncontrado: true }>> {
  const supabase = await createClient()

  const estado = await estadoDeToma(supabase, conteoId)
  if (estado == null) return { ok: false, error: 'Toma no encontrada.' }
  if (estado !== 'en_conteo') return { ok: false, error: 'La toma ya no es editable.' }

  const skuBuscado = sku.trim()
  if (!skuBuscado) return { ok: true, data: { noEncontrado: true } }

  // Se busca primero en variantes (más específico) y luego en productos
  // planos; `limit(1)` en vez de `.single()`/`.maybeSingle()` porque el sku
  // no tiene constraint de unicidad en BD.
  const { data: variantes } = await supabase
    .from('producto_variantes')
    .select('id, producto_id, sku, nombre, stock')
    .eq('sku', skuBuscado)
    .limit(1)
  const variante = variantes?.[0]

  let productoId: string
  let varianteId: string | null = null
  let nombreLinea: string
  let stockActual: number | null

  if (variante) {
    const { data: producto } = await supabase
      .from('productos')
      .select('nombre')
      .eq('id', variante.producto_id)
      .maybeSingle()
    productoId = variante.producto_id
    varianteId = variante.id
    nombreLinea = `${producto?.nombre ?? ''} (${variante.nombre})`
    stockActual = variante.stock
  } else {
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, stock')
      .eq('sku', skuBuscado)
      .limit(1)
    const producto = productos?.[0]
    if (!producto) return { ok: true, data: { noEncontrado: true } }

    // Simétrico a `materializarLineas`: un producto con variantes activas se
    // vende POR variante, así que `productos.stock` es un campo fantasma que
    // el resto del sistema ignora. No se crea línea del padre; se trata igual
    // que "no rastreado" (la UI debe pedir escanear el sku de la variante).
    const { data: variantesActivas } = await supabase
      .from('producto_variantes')
      .select('id')
      .eq('producto_id', producto.id)
      .eq('activo', true)
      .limit(1)
    if (variantesActivas && variantesActivas.length > 0) return { ok: true, data: { noRastreado: true } }

    productoId = producto.id
    nombreLinea = producto.nombre
    stockActual = producto.stock
  }

  if (stockActual == null) return { ok: true, data: { noRastreado: true } }

  let existenteQuery = supabase
    .from('conteo_lineas')
    .select('*')
    .eq('conteo_id', conteoId)
    .eq('producto_id', productoId)
  existenteQuery = varianteId ? existenteQuery.eq('variante_id', varianteId) : existenteQuery.is('variante_id', null)
  const { data: existentes } = await existenteQuery.limit(1)
  if (existentes && existentes.length > 0) return { ok: true, data: { linea: existentes[0] as ConteoLinea } }

  const { data: nueva, error: insErr } = await supabase
    .from('conteo_lineas')
    .insert({
      conteo_id: conteoId,
      producto_id: productoId,
      variante_id: varianteId,
      sku: skuBuscado,
      nombre: nombreLinea,
      stock_snapshot: stockActual,
    })
    .select('*')
    .single()
  if (insErr || !nueva) return { ok: false, error: ERROR_GENERICO }

  revalidatePath(`/admin/inventario/${conteoId}`)
  return { ok: true, data: { linea: nueva as ConteoLinea } }
}

export async function quitarLinea(lineaId: string): Promise<InvResult> {
  const supabase = await createClient()

  const { data: linea, error: lineaErr } = await supabase
    .from('conteo_lineas')
    .select('conteo_id')
    .eq('id', lineaId)
    .maybeSingle()
  if (lineaErr || !linea) return { ok: false, error: ERROR_GENERICO }

  const estado = await estadoDeToma(supabase, linea.conteo_id)
  if (estado !== 'en_conteo') return { ok: false, error: 'La toma ya no es editable.' }

  const { error } = await supabase.from('conteo_lineas').delete().eq('id', lineaId)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidatePath(`/admin/inventario/${linea.conteo_id}`)
  return { ok: true }
}

export async function aplicarToma(id: string): Promise<InvResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('aplicar_conteo', { p_conteo_id: id })
  if (error) return { ok: false, error: traducirError(error.message) }

  revalidatePath('/admin/inventario')
  revalidatePath(`/admin/inventario/${id}`)
  return { ok: true }
}

export async function anularToma(id: string): Promise<InvResult> {
  const supabase = await createClient()

  const estado = await estadoDeToma(supabase, id)
  if (estado == null) return { ok: false, error: 'Toma no encontrada.' }
  if (estado !== 'en_conteo') return { ok: false, error: 'La toma ya no es editable.' }

  const { error } = await supabase.from('conteos_fisicos').update({ estado: 'anulada' }).eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }

  revalidatePath('/admin/inventario')
  revalidatePath(`/admin/inventario/${id}`)
  return { ok: true }
}
