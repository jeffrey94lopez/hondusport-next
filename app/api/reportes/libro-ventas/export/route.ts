import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import { obtenerLibroVentas } from '@/app/admin/reportes/libro-ventas/data'
import { filaLibro, totalesLibro, libroAoA } from '@/lib/reportes/libro-ventas'
import type { PresetRango } from '@/types'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const presetRaw = url.searchParams.get('preset')
  const preset: PresetRango = PRESETS.includes(presetRaw as PresetRango) ? (presetRaw as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), url.searchParams.get('desde') ?? undefined, url.searchParams.get('hasta') ?? undefined)

  const docs = await obtenerLibroVentas(rango.desde, rango.hasta)
  const filas = docs.map(filaLibro)
  const aoa = libroAoA(filas, totalesLibro(filas))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Libro de ventas')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="libro-ventas.xlsx"',
    },
  })
}
