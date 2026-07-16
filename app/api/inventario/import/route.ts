import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { parseInventoryUpload } from '@/lib/store/inventoryRoundtrip'
import type { InventoryRow, ParseContext } from '@/lib/store/inventoryRoundtrip'
import type { Producto } from '@/types'

function leerPestaña(wb: XLSX.WorkBook, nombre: string): InventoryRow[] {
  const sheet = wb.Sheets[nombre]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<InventoryRow>(sheet, { defval: '' })
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

  const actualizar = leerPestaña(wb, 'Actualizar')
  const nuevos = leerPestaña(wb, 'Nuevos')

  const [{ data: existentes, error: prodError }, { data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor, categorias_padre').eq('tipo', 'subcat'),
  ])

  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })

  const ctx: ParseContext = {
    existentes: (existentes ?? []) as Producto[],
    categorias: categorias ?? [],
    subcategorias: subcategorias ?? [],
  }

  const { updates, creates, errors } = parseInventoryUpload({ actualizar, nuevos }, ctx)

  if (errors.length > 0) {
    return NextResponse.json({ error: 'No se importó nada. Corrige los errores y vuelve a subir.', errores: errors }, { status: 422 })
  }

  if (updates.length === 0 && creates.length === 0) {
    return NextResponse.json({ error: 'El archivo no tiene filas para actualizar ni crear.' }, { status: 400 })
  }

  const payload = [
    ...updates,
    ...creates.map(c => ({ ...c, id: crypto.randomUUID() })),
  ]

  const { error } = await supabase.from('productos').upsert(payload, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, actualizados: updates.length, creados: creates.length })
}
