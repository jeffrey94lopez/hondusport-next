import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { agruparProductos } from '@/lib/xlsx-parser'
import type { XlsxRow } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Request inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(sheet)

  const productos = agruparProductos(rows)
  if (productos.length === 0) {
    return NextResponse.json({ error: 'No se encontraron productos activos en el archivo' }, { status: 422 })
  }

  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, valor')
    .eq('tipo', 'cat')

  const catMap = new Map((categorias ?? []).map((c: { id: string; valor: string }) => [c.valor.toLowerCase(), c.id]))

  const rows_to_insert = productos.map(p => ({
    nombre: p.nombre,
    descripcion: p.descripcion || null,
    precio: p.precio,
    stock: p.stock,
    tallas: p.tallas.length ? p.tallas : null,
    colores: p.colores.length ? p.colores : null,
    marca: p.marca || null,
    sku: p.sku || null,
    categoria_id: catMap.get(p.categoria.toLowerCase()) ?? null,
    activo: p.activo,
  }))

  const { error } = await supabase
    .from('productos')
    .upsert(rows_to_insert, { onConflict: 'sku', ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: rows_to_insert.length })
}
