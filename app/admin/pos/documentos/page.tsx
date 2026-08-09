import { createClient } from '@/lib/supabase-server'
import { estadoDevolucionDocumento, type EstadoDevolucionDocumento } from '@/lib/pos/devoluciones'
import type { Documento, Caja, SesionCaja } from '@/types'
import DocumentosClient from './DocumentosClient'

// Embed real de cajas: FK simple (to-one) desde documentos.caja_id, PostgREST
// devuelve un OBJETO por fila (mismo caso documentado en app/admin/pos/page.tsx).
interface DocumentoConCaja extends Documento {
  cajas: { nombre: string } | null
}

export interface DocumentoListItem extends Documento {
  caja_nombre: string
  estadoDevolucion: EstadoDevolucionDocumento
}

export default async function DocumentosPage() {
  const supabase = await createClient()

  const [{ data }, { data: devolucionesData }, { data: sesiones }, { data: cajas }] = await Promise.all([
    supabase
      .from('documentos')
      .select('*, cajas(nombre)')
      .order('created_at', { ascending: false }),
    // POS P5a: notas de crédito/devoluciones no anuladas, para el badge
    // "Devuelto" — se suman por documento_origen_id (ver estadoDevolucionDocumento).
    supabase
      .from('documentos')
      .select('documento_origen_id, total')
      .in('tipo', ['nota_credito', 'devolucion'])
      .neq('estado', 'anulado'),
    // Sesiones de caja abiertas: para que DevolucionModal pueda ligar la
    // devolución a la caja que la recibe (mismo criterio que CobroModal de CxC).
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
  ])

  const sumaPorOrigen = new Map<string, number>()
  for (const d of devolucionesData ?? []) {
    if (!d.documento_origen_id) continue
    sumaPorOrigen.set(d.documento_origen_id, (sumaPorOrigen.get(d.documento_origen_id) ?? 0) + Number(d.total))
  }

  const documentos: DocumentoListItem[] = ((data ?? []) as unknown as DocumentoConCaja[]).map(({ cajas: cajaRow, ...d }) => ({
    ...d,
    total: Number(d.total),
    caja_nombre: cajaRow?.nombre ?? '—',
    estadoDevolucion: estadoDevolucionDocumento(d.tipo, Number(d.total), sumaPorOrigen.get(d.id) ?? 0),
  }))

  return (
    <DocumentosClient
      documentos={documentos}
      sesiones={(sesiones ?? []) as unknown as SesionCaja[]}
      cajas={(cajas ?? []) as unknown as Caja[]}
    />
  )
}
