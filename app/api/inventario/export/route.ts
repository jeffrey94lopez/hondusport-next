import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { buildExportData, COLUMNAS, INSTRUCCIONES } from '@/lib/store/inventoryRoundtrip'
import type { Producto } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [{ data: productos }, { data: categorias }, { data: subcategorias }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre').limit(5000),
    supabase.from('categorias').select('id, valor').eq('tipo', 'cat'),
    supabase.from('categorias').select('id, valor').eq('tipo', 'subcat'),
  ])

  const { actualizar } = buildExportData(
    (productos ?? []) as Producto[],
    categorias ?? [],
    subcategorias ?? [],
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCCIONES.map(l => [l])), 'Instrucciones')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actualizar, { header: COLUMNAS as unknown as string[] }), 'Actualizar')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COLUMNAS as unknown as string[]]), 'Nuevos')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventario-${fecha}.xlsx"`,
    },
  })
}
