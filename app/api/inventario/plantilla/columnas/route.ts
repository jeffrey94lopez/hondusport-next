import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { sugerirMapeo, type Mapeo } from '@/lib/store/externalImport'

const CLAVE_MAPEO = 'import_plantilla_mapeo'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })

  const filas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
  const columnas = ((filas[0] as unknown[]) ?? []).map(c => String(c ?? '').trim()).filter(Boolean)
  if (columnas.length === 0) return NextResponse.json({ error: 'No se encontraron encabezados en la primera fila' }, { status: 400 })

  const { data: cfg } = await supabase.from('configuracion').select('value').eq('key', CLAVE_MAPEO).maybeSingle()
  let guardado: Mapeo | null = null
  if (cfg?.value) { try { guardado = JSON.parse(cfg.value) as Mapeo } catch { guardado = null } }

  return NextResponse.json({ columnas, sugerencia: sugerirMapeo(columnas), guardado })
}
