import { createClient } from '@/lib/supabase-server'
import type { Documento } from '@/types'
import DocumentosClient from './DocumentosClient'

// Embed real de cajas: FK simple (to-one) desde documentos.caja_id, PostgREST
// devuelve un OBJETO por fila (mismo caso documentado en app/admin/pos/page.tsx).
interface DocumentoConCaja extends Documento {
  cajas: { nombre: string } | null
}

export interface DocumentoListItem extends Documento {
  caja_nombre: string
}

export default async function DocumentosPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('documentos')
    .select('*, cajas(nombre)')
    .order('created_at', { ascending: false })

  const documentos: DocumentoListItem[] = ((data ?? []) as unknown as DocumentoConCaja[]).map(({ cajas, ...d }) => ({
    ...d,
    total: Number(d.total),
    caja_nombre: cajas?.nombre ?? '—',
  }))

  return <DocumentosClient documentos={documentos} />
}
