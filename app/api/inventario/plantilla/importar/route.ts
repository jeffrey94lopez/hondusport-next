import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase-server'
import { agruparPorSku, parseExternalImport, validarMapeo, type Mapeo } from '@/lib/store/externalImport'
import { parseNum, type ParseContext } from '@/lib/store/inventoryRoundtrip'
import type { Producto, ProductoVariante } from '@/types'

const CLAVE_MAPEO = 'import_plantilla_mapeo'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
  let mapeo: Mapeo
  try { mapeo = JSON.parse(String(formData.get('mapeo') ?? '{}')) as Mapeo } catch { return NextResponse.json({ error: 'Mapeo inválido' }, { status: 400 }) }
  const confirmar = String(formData.get('confirmar') ?? 'false') === 'true'

  const faltan = validarMapeo(mapeo)
  if (faltan.length) return NextResponse.json({ error: 'Mapeo incompleto: ' + faltan.join(', ') }, { status: 400 })

  let wb
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo. ¿Es un .xlsx válido?' }, { status: 400 })
  }
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const [{ data: cats, error: catError }, { data: subs, error: subError }, { data: variantesExistentes }] = await Promise.all([
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat'),
    supabase.from('producto_variantes').select('*').limit(5000),
  ])
  if (catError || subError) return NextResponse.json({ error: (catError ?? subError)!.message }, { status: 500 })

  const existentes: Producto[] = []
  const PASO = 1000
  for (let desde = 0; ; desde += PASO) {
    const { data, error: prodError } = await supabase.from('productos').select('*').order('id').range(desde, desde + PASO - 1)
    if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })
    existentes.push(...((data ?? []) as Producto[]))
    if (!data || data.length < PASO) break
  }

  const ctx: ParseContext = {
    existentes,
    categorias: cats ?? [],
    subcategorias: subs ?? [],
    variantesExistentes: (variantesExistentes ?? []) as ProductoVariante[],
  }

  const { grupos, sinSku } = agruparPorSku(rows, mapeo)
  const { updates, creates, errors, resumen, variantes } = parseExternalImport(grupos, ctx)
  const erroresSinSku = sinSku.map(fila => ({ sku: null, fila, motivo: 'la fila tiene datos pero no tiene SKU' }))
  const todos = [...erroresSinSku, ...errors]
  const conError = resumen.conError + erroresSinSku.length

  if (!confirmar) {
    return NextResponse.json({
      resumen: { ...resumen, conError },
      errores: todos,
      muestra: grupos.slice(0, 10).map(g => ({
        sku: g.sku, nombre: g.nombre, precio: g.precio, stock: g.stock,
        tallas: g.tallas, colores: g.colores,
        variantes: g.variantes.map(v => {
          const precio = parseNum(v.precio)
          const stock = parseNum(v.stock)
          return {
            nombre: v.nombre,
            precio: precio !== undefined && !Number.isNaN(precio) ? precio : null,
            stock: stock !== undefined && !Number.isNaN(stock) ? stock : null,
          }
        }),
      })),
    })
  }

  if (todos.length) return NextResponse.json({ error: 'No se importó nada. Corrige los errores.', errores: todos }, { status: 422 })
  if (!updates.length && !creates.length) return NextResponse.json({ error: 'No hay productos para importar.' }, { status: 400 })

  // Resolver productoSku -> producto_id para las altas de variantes: los
  // productos existentes ya traen sku en `updates`; los nuevos reciben un id
  // generado aquí y se indexan bajo el mismo sku para que sus variantes lo encuentren.
  const idPorSku = new Map<string, string>()
  for (const u of updates) if (u.sku) idPorSku.set(u.sku, u.id)
  const creadosConId = creates.map(c => {
    const id = randomUUID()
    if (c.sku) idPorSku.set(c.sku, id)
    return { ...c, id }
  })

  const variantesCreatesConId: (Omit<typeof variantes.creates[number], 'productoSku'> & { producto_id: string })[] = []
  for (const { productoSku, ...v } of variantes.creates) {
    const producto_id = idPorSku.get(productoSku)
    if (!producto_id) {
      return NextResponse.json(
        { error: `Error interno: no se pudo resolver el producto (SKU "${productoSku}") para la variante "${v.nombre}".` },
        { status: 500 },
      )
    }
    variantesCreatesConId.push({ ...v, producto_id })
  }

  const p_productos = [...updates, ...creadosConId]
  const p_variantes = [...variantes.updates, ...variantesCreatesConId]

  const { error } = await supabase.rpc('importar_productos_variantes', { p_productos, p_variantes })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('configuracion').upsert({ key: CLAVE_MAPEO, value: JSON.stringify(mapeo) }, { onConflict: 'key' })

  return NextResponse.json({
    success: true,
    actualizados: updates.length,
    creados: creates.length,
    variantesActualizadas: variantes.updates.length,
    variantesCreadas: variantes.creates.length,
  })
}
