import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase-server'
import { parseInventoryUpload } from '@/lib/store/inventoryRoundtrip'
import type { InventoryRow, ParseContext, VarianteRow, MovimientoImport } from '@/lib/store/inventoryRoundtrip'
import type { Producto, ProductoVariante } from '@/types'

function leerPestaña<T>(wb: XLSX.WorkBook, nombre: string): T[] {
  const sheet = wb.Sheets[nombre]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: '' })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  if (!wb.Sheets['Actualizar'] && !wb.Sheets['Nuevos']) {
    return NextResponse.json({ error: 'El archivo no tiene las pestañas "Actualizar" ni "Nuevos". Usa la plantilla de "Descargar inventario".' }, { status: 400 })
  }

  const actualizar = leerPestaña<InventoryRow>(wb, 'Actualizar')
  const nuevos = leerPestaña<InventoryRow>(wb, 'Nuevos')
  const variantes = leerPestaña<VarianteRow>(wb, 'Variantes')

  const [{ data: existentes, error: prodError }, { data: categorias }, { data: subcategorias }, { data: variantesExistentes }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat'),
    supabase.from('producto_variantes').select('*').limit(5000),
  ])

  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })

  const ctx: ParseContext = {
    existentes: (existentes ?? []) as Producto[],
    categorias: categorias ?? [],
    subcategorias: subcategorias ?? [],
    variantesExistentes: (variantesExistentes ?? []) as ProductoVariante[],
  }

  const { updates, creates, errors, variantes: variantesResult, movimientos } = parseInventoryUpload({ actualizar, nuevos, variantes }, ctx)

  if (errors.length > 0) {
    return NextResponse.json({ error: 'No se importó nada. Corrige los errores y vuelve a subir.', errores: errors }, { status: 422 })
  }

  if (updates.length === 0 && creates.length === 0 && variantesResult.updates.length === 0 && variantesResult.creates.length === 0) {
    return NextResponse.json({ error: 'El archivo no tiene filas para actualizar ni crear.' }, { status: 400 })
  }

  // Altas de producto: id generado aquí (round-trip); se indexa por slug para
  // que los movimientos de kardex de esas mismas filas (productoSlugTemp) lo
  // resuelvan antes de llamar la RPC. Las altas de variante en cambio quedan
  // sin id (se resuelven dentro de la RPC por producto_id+orden — ver migración).
  const idPorSlug = new Map<string, string>()
  const creadosConId = creates.map(c => {
    const id = randomUUID()
    idPorSlug.set(c.slug, id)
    return { ...c, id }
  })
  const p_productos = [...updates, ...creadosConId]
  const p_variantes = [
    ...variantesResult.updates,
    ...variantesResult.creates,
  ]

  const referencia = `import:${file.name}`
  const usuario = user.email ?? null
  const p_movimientos: MovimientoImport[] = []
  for (const m of movimientos) {
    let producto_id = m.producto_id
    if (!producto_id && m.productoSlugTemp) {
      producto_id = idPorSlug.get(m.productoSlugTemp) ?? null
      if (!producto_id) {
        return NextResponse.json(
          { error: `Error interno: no se pudo resolver el producto (slug "${m.productoSlugTemp}") para un movimiento de kardex.` },
          { status: 500 },
        )
      }
    }
    p_movimientos.push({ ...m, producto_id, referencia, usuario })
  }

  const { error } = await supabase.rpc('importar_productos_variantes', { p_productos, p_variantes, p_movimientos })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    actualizados: updates.length,
    creados: creates.length,
    variantesActualizadas: variantesResult.updates.length,
    variantesCreadas: variantesResult.creates.length,
    movimientos: p_movimientos.length,
  })
}
