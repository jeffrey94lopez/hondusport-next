import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { agruparPorSku, parseExternalImport, validarMapeo, type Mapeo } from '@/lib/store/externalImport'
import type { ParseContext } from '@/lib/store/inventoryRoundtrip'
import type { Producto } from '@/types'

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

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const [{ data: existentes, error: prodError }, { data: cats }, { data: subs }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat'),
  ])
  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })

  const ctx: ParseContext = {
    existentes: (existentes ?? []) as Producto[],
    categorias: cats ?? [],
    subcategorias: subs ?? [],
  }

  const { grupos, sinSku } = agruparPorSku(rows, mapeo)
  const { updates, creates, errors, resumen } = parseExternalImport(grupos, ctx)
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
      })),
    })
  }

  if (todos.length) return NextResponse.json({ error: 'No se importó nada. Corrige los errores.', errores: todos }, { status: 422 })
  if (!updates.length && !creates.length) return NextResponse.json({ error: 'No hay productos para importar.' }, { status: 400 })

  const payload = [...updates, ...creates.map(c => ({ ...c, id: crypto.randomUUID() }))]
  const { error } = await supabase.from('productos').upsert(payload, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('configuracion').upsert({ key: CLAVE_MAPEO, value: JSON.stringify(mapeo) }, { onConflict: 'key' })

  return NextResponse.json({ success: true, actualizados: updates.length, creados: creates.length })
}
