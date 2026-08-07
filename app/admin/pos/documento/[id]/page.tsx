import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { Documento, DocumentoItem, DocumentoPago, Caja, CaiAutorizacion, MetodoPagoTipo } from '@/types'
import DocumentoView from './DocumentoView'

// Embed real de documento_pagos → metodos_pago: FK simple (to-one), PostgREST
// devuelve un OBJETO por fila (mismo caso documentado en app/admin/pos/page.tsx
// y en cerrarSesion, app/admin/pos/actions.ts).
interface DocumentoPagoConMetodo extends DocumentoPago {
  metodos_pago: { nombre: string; tipo: MetodoPagoTipo } | null
}

export interface PagoConMetodo extends DocumentoPago {
  metodo_nombre: string
  metodo_tipo: MetodoPagoTipo
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ volver?: string }>
}

export default async function DocumentoPage({ params, searchParams }: Props) {
  const { id } = await params
  const { volver } = await searchParams
  const supabase = await createClient()

  const [
    { data: documento },
    { data: items },
    { data: pagos },
    { data: config },
  ] = await Promise.all([
    supabase.from('documentos').select('*').eq('id', id).maybeSingle(),
    supabase.from('documento_items').select('*').eq('documento_id', id),
    supabase.from('documento_pagos').select('*, metodos_pago(nombre, tipo)').eq('documento_id', id),
    supabase.from('configuracion').select('key, value'),
  ])

  if (!documento) notFound()

  const [{ data: caja }, { data: cai }] = await Promise.all([
    supabase.from('cajas').select('*').eq('id', documento.caja_id).maybeSingle(),
    documento.cai_id
      ? supabase.from('cai_autorizaciones').select('*').eq('id', documento.cai_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!caja) notFound()

  const pagosConMetodo: PagoConMetodo[] = ((pagos ?? []) as unknown as DocumentoPagoConMetodo[]).map(
    ({ metodos_pago, ...p }) => ({
      ...p,
      metodo_nombre: metodos_pago?.nombre ?? 'Otro',
      metodo_tipo: metodos_pago?.tipo ?? 'otro',
    }),
  )

  return (
    <DocumentoView
      documento={documento as Documento}
      items={(items ?? []) as DocumentoItem[]}
      pagos={pagosConMetodo}
      caja={caja as Caja}
      cai={(cai ?? null) as CaiAutorizacion | null}
      config={toConfigMap(config ?? [])}
      volverPos={volver === 'pos'}
    />
  )
}
