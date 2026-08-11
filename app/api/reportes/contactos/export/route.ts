import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import { obtenerContactos } from '@/app/admin/reportes/contactos/data'
import { contactosAoA } from '@/lib/reportes/contactos'
import type { PresetRango, RolContacto } from '@/types'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']
const ROLES: RolContacto[] = ['cliente', 'proveedor', 'ambos']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const presetRaw = url.searchParams.get('preset')
  const preset: PresetRango = PRESETS.includes(presetRaw as PresetRango) ? (presetRaw as PresetRango) : 'mes'
  const rolRaw = url.searchParams.get('rol')
  const rol: RolContacto = ROLES.includes(rolRaw as RolContacto) ? (rolRaw as RolContacto) : 'cliente'
  const rango = rangoDesdePreset(preset, new Date(), url.searchParams.get('desde') ?? undefined, url.searchParams.get('hasta') ?? undefined)

  const filas = await obtenerContactos(rango.desde, rango.hasta, rol)
  const aoa = contactosAoA(filas, rol)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Contactos')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="contactos.xlsx"',
    },
  })
}
