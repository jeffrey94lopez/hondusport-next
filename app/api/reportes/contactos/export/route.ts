import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { obtenerContactos } from '@/app/admin/reportes/contactos/data'
import { contactosAoA } from '@/lib/reportes/contactos'
import type { RolContacto } from '@/types'

const ROLES: RolContacto[] = ['cliente', 'proveedor', 'ambos']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const rolRaw = url.searchParams.get('rol')
  const rol: RolContacto = ROLES.includes(rolRaw as RolContacto) ? (rolRaw as RolContacto) : 'cliente'

  const filas = await obtenerContactos(rol)
  const aoa = contactosAoA(filas)

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
