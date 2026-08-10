'use server'
import { createClient } from '@/lib/supabase-server'
import { parseReferencia, saldoCorrido } from '@/lib/inventario/kardex'
import type {
  MovimientoInventario,
  MovimientoResuelto,
  FiltrosMovimientos,
  KardexResult,
} from '@/types'

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type ReferenciaResuelta = { etiqueta: string; href: string | null }

// Escapa un valor para usarlo dentro del patrón `col.ilike."%valor%"` de
// PostgREST: entre comillas dobles, `,`/`(`/`)` ya no rompen la microsintaxis
// de `.or()`; solo hay que escapar `\` y `"` (los caracteres que sí tienen
// significado dentro de la cadena entre comillas).
function escaparParaOr(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

interface DocumentoLookup {
  id: string
  tipo: string
  correlativo: string | null
  numero_comprobante: number | null
}

// Etiqueta base del documento según su tipo (sin el prefijo de venta/NC, que
// depende de la clase de referencia que apuntó a él).
function etiquetaBaseDocumento(d: DocumentoLookup): string {
  switch (d.tipo) {
    case 'factura': return `Factura ${d.correlativo ?? ''}`.trim()
    case 'comprobante': return `Comprobante C-${d.numero_comprobante ?? ''}`
    case 'nota_credito': return `Nota de crédito ${d.correlativo ?? ''}`.trim()
    case 'devolucion': return `Devolución D-${d.numero_comprobante ?? ''}`
    default: return d.tipo
  }
}

// Resuelve por lote la `referencia` cruda del kardex a { etiqueta, href }.
// Agrupa por `parseReferencia(ref).clase` y hace UN `select ... in (...)` por
// tabla destino (no N+1). Clave del Map = referencia cruda tal como viene en
// `movimientos_inventario.referencia`.
export async function resolverReferencias(
  supabase: SupabaseServerClient,
  movimientos: { referencia: string | null }[],
): Promise<Map<string, ReferenciaResuelta>> {
  const resultado = new Map<string, ReferenciaResuelta>()

  const porRef = new Map<string, { clase: string; valor: string | null }>()
  for (const m of movimientos) {
    if (!m.referencia || porRef.has(m.referencia)) continue
    porRef.set(m.referencia, parseReferencia(m.referencia))
  }

  const idsDocumento: { ref: string; valor: string }[] = []
  const idsNotaCredito: { ref: string; valor: string }[] = []
  const idsPedido: { ref: string; valor: string }[] = []
  const numsConteo: { ref: string; valor: string }[] = []
  const numsCompra: { ref: string; valor: string }[] = []

  for (const [ref, g] of porRef) {
    if (g.clase === 'documento' && g.valor) idsDocumento.push({ ref, valor: g.valor })
    else if (g.clase === 'nota_credito' && g.valor) idsNotaCredito.push({ ref, valor: g.valor })
    else if (g.clase === 'pedido' && g.valor) idsPedido.push({ ref, valor: g.valor })
    else if (g.clase === 'conteo' && g.valor) numsConteo.push({ ref, valor: g.valor })
    else if (g.clase === 'compra' && g.valor) numsCompra.push({ ref, valor: g.valor })
    else if (g.clase === 'alta') resultado.set(ref, { etiqueta: 'Alta inicial', href: null })
    else if (g.clase === 'manual') resultado.set(ref, { etiqueta: 'Ajuste manual', href: null })
    else if (g.clase === 'modalidad') resultado.set(ref, { etiqueta: 'Cambio de modalidad', href: null })
    else resultado.set(ref, { etiqueta: ref, href: null })
  }

  // `documento` y `nota_credito` apuntan a la misma tabla `documentos`: un
  // solo `in(...)` para ambas clases.
  const idsDocs = [...new Set([...idsDocumento, ...idsNotaCredito].map(x => x.valor))]
  if (idsDocs.length > 0) {
    const { data } = await supabase
      .from('documentos')
      .select('id, tipo, correlativo, numero_comprobante')
      .in('id', idsDocs)
    const porId = new Map((data ?? []).map(d => [d.id as string, d as DocumentoLookup]))

    for (const { ref, valor } of idsDocumento) {
      const d = porId.get(valor)
      resultado.set(ref, d
        ? { etiqueta: `Venta POS — ${etiquetaBaseDocumento(d)}`, href: `/admin/pos/documento/${valor}` }
        : { etiqueta: ref, href: null })
    }
    for (const { ref, valor } of idsNotaCredito) {
      const d = porId.get(valor)
      resultado.set(ref, d
        ? { etiqueta: `Nota de crédito — ${etiquetaBaseDocumento(d)}`, href: `/admin/pos/documento/${valor}` }
        : { etiqueta: ref, href: null })
    }
  }

  if (idsPedido.length > 0) {
    const ids = [...new Set(idsPedido.map(x => x.valor))]
    const { data } = await supabase.from('pedidos').select('id, numero').in('id', ids)
    const porId = new Map((data ?? []).map(p => [p.id as string, p.numero as number]))
    for (const { ref, valor } of idsPedido) {
      const numero = porId.get(valor)
      resultado.set(ref, numero != null
        ? { etiqueta: `Venta web — Pedido #${numero}`, href: '/admin/pedidos' }
        : { etiqueta: ref, href: null })
    }
  }

  if (numsCompra.length > 0) {
    const numeros = [...new Set(numsCompra.map(x => x.valor))]
    const { data } = await supabase.from('compras').select('id, numero').in('numero', numeros)
    const porNumero = new Map((data ?? []).map(c => [c.numero as string, c.id as string]))
    for (const { ref, valor } of numsCompra) {
      const id = porNumero.get(valor)
      resultado.set(ref, id
        ? { etiqueta: `Compra ${valor}`, href: `/admin/compras/${id}` }
        : { etiqueta: ref, href: null })
    }
  }

  // `conteo`: el número ya viene en la referencia, no hace falta lookup.
  for (const { ref, valor } of numsConteo) {
    resultado.set(ref, { etiqueta: `Conteo físico ${valor}`, href: '/admin/inventario' })
  }

  return resultado
}

function resolverEtiqueta(
  referencia: string | null,
  mapa: Map<string, ReferenciaResuelta>,
): { ref_etiqueta: string; ref_href: string | null } {
  if (!referencia) return { ref_etiqueta: 'Sin referencia', ref_href: null }
  const r = mapa.get(referencia)
  return r ? { ref_etiqueta: r.etiqueta, ref_href: r.href } : { ref_etiqueta: referencia, ref_href: null }
}

// Todos los movimientos de un ítem (producto o producto+variante), en orden
// ascendente con saldo corrido, y las variantes activas del producto (para el
// selector de la vista). Solo lectura.
export async function obtenerMovimientosItem(
  productoId: string,
  varianteId: string | null,
): Promise<KardexResult<{
  producto: { id: string; nombre: string; sku: string | null; stock: number | null; costo: number | null }
  variante: { id: string; nombre: string; stock: number | null; costo: number | null } | null
  variantes: { id: string; nombre: string }[]
  movimientos: MovimientoResuelto[]
}>> {
  const supabase = await createClient()

  const { data: producto, error: prodErr } = await supabase
    .from('productos')
    .select('id, nombre, sku, stock, costo')
    .eq('id', productoId)
    .maybeSingle()
  if (prodErr || !producto) return { ok: false, error: 'Producto no encontrado.' }

  let variante: { id: string; nombre: string; stock: number | null; costo: number | null; sku: string | null } | null = null
  if (varianteId) {
    // `.eq('producto_id', productoId)` evita que una variante de OTRO
    // producto (id crafteado en la URL) se muestre con la cabecera de este
    // producto; si no matchea, se trata como no encontrada.
    const { data: v, error: varErr } = await supabase
      .from('producto_variantes')
      .select('id, nombre, stock, costo, sku')
      .eq('id', varianteId)
      .eq('producto_id', productoId)
      .maybeSingle()
    if (varErr || !v) return { ok: false, error: 'Variante no encontrada.' }
    variante = v
  }

  const { data: variantesData } = await supabase
    .from('producto_variantes')
    .select('id, nombre')
    .eq('producto_id', productoId)
    .eq('activo', true)
    .order('orden')

  let query = supabase
    .from('movimientos_inventario')
    .select('*')
    .eq('producto_id', productoId)
  query = varianteId ? query.eq('variante_id', varianteId) : query.is('variante_id', null)

  const { data: movsData, error: movsErr } = await query.order('created_at', { ascending: true })
  if (movsErr) return { ok: false, error: ERROR_GENERICO }

  const movimientosAsc = (movsData ?? []) as MovimientoInventario[]
  const conSaldo = saldoCorrido(movimientosAsc)
  const mapaReferencias = await resolverReferencias(supabase, movimientosAsc)

  const sku = variante ? (variante.sku ?? null) : (producto.sku ?? null)

  const movimientos: MovimientoResuelto[] = conSaldo.map(m => {
    const { saldo, ...base } = m
    return {
      ...base,
      producto_nombre: producto.nombre,
      variante_nombre: variante?.nombre ?? null,
      sku,
      ...resolverEtiqueta(base.referencia, mapaReferencias),
      saldo,
    }
  })

  return {
    ok: true,
    data: {
      producto,
      variante: variante ? { id: variante.id, nombre: variante.nombre, stock: variante.stock, costo: variante.costo } : null,
      variantes: variantesData ?? [],
      movimientos,
    },
  }
}

// Listado global paginado de movimientos con filtros. Sin saldo corrido
// (multi-producto). Solo lectura.
export async function obtenerMovimientosGlobal(
  filtros: FiltrosMovimientos,
  pagina: number,
): Promise<KardexResult<{ movimientos: MovimientoResuelto[]; total: number }>> {
  const supabase = await createClient()

  let productoIds: string[] | null = null
  if (filtros.producto && filtros.producto.trim()) {
    const texto = escaparParaOr(filtros.producto.trim())
    const { data: productosMatch } = await supabase
      .from('productos')
      .select('id')
      .or(`nombre.ilike."%${texto}%",sku.ilike."%${texto}%"`)
    productoIds = (productosMatch ?? []).map(p => p.id as string)
    if (productoIds.length === 0) return { ok: true, data: { movimientos: [], total: 0 } }
  }

  let query = supabase
    .from('movimientos_inventario')
    .select('*, productos(nombre, sku), producto_variantes(nombre)', { count: 'exact' })

  // `created_at` es timestamptz; sin offset, `desde`/`hasta` (fecha local del
  // filtro) se interpretan en UTC y desfasan el borde del día para Honduras
  // (UTC-6). Se ancla explícitamente el offset de Honduras.
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros.desde) query = query.gte('created_at', `${filtros.desde}T00:00:00-06:00`)
  if (filtros.hasta) query = query.lte('created_at', `${filtros.hasta}T23:59:59.999-06:00`)
  if (filtros.usuario && filtros.usuario.trim()) query = query.ilike('usuario', `%${filtros.usuario.trim()}%`)
  if (productoIds) query = query.in('producto_id', productoIds)

  const inicio = pagina * 50
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(inicio, inicio + 49)
  if (error) return { ok: false, error: ERROR_GENERICO }

  const filas = (data ?? []) as (MovimientoInventario & {
    productos: { nombre: string; sku: string | null } | null
    producto_variantes: { nombre: string } | null
  })[]

  const mapaReferencias = await resolverReferencias(supabase, filas)

  const movimientos: MovimientoResuelto[] = filas.map(m => {
    const { productos, producto_variantes, ...base } = m
    return {
      ...base,
      producto_nombre: productos?.nombre ?? '',
      variante_nombre: producto_variantes?.nombre ?? null,
      sku: productos?.sku ?? null,
      ...resolverEtiqueta(base.referencia, mapaReferencias),
      saldo: null,
    }
  })

  return { ok: true, data: { movimientos, total: count ?? 0 } }
}
