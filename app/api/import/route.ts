import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { agruparProductos } from '@/lib/xlsx-parser'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { XlsxRow } from '@/types'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(sheet)

  const productos = agruparProductos(rows)

  if (productos.length === 0) {
    return NextResponse.json({ error: 'No se encontraron productos activos en el archivo' }, { status: 400 })
  }

  const payload = productos.map(p => ({
    nombre: p.nombre,
    precio: p.precio,
    stock: p.stock,
    tallas: p.tallas.length > 0 ? p.tallas : null,
    colores: p.colores.length > 0 ? p.colores : null,
    marca: p.marca || null,
    sku: p.sku || null,
    descripcion: p.descripcion || null,
    activo: true,
  }))

  const { data, error } = await supabase
    .from('productos')
    .upsert(payload, { onConflict: 'sku', ignoreDuplicates: false })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    imported: data?.length ?? productos.length,
    total: productos.length,
  })
}
