import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { estadoDevolucionDocumento } from '@/lib/pos/devoluciones'
import type { Documento, DocumentoItem, DocumentoPago, Caja, CaiAutorizacion, MetodoPagoTipo, DocumentoPagoConMetodo, SesionCaja } from '@/types'
import DocumentoView from './DocumentoView'

// Embed real de documento_pagos → metodos_pago: FK simple (to-one), PostgREST
// devuelve un OBJETO por fila (mismo caso documentado en app/admin/pos/page.tsx
// y en cerrarSesion, app/admin/pos/actions.ts).
interface DocumentoPagoEmbed extends DocumentoPago {
  metodos_pago: { nombre: string; tipo: MetodoPagoTipo } | null
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
    { data: devolucionesData },
    { data: sesiones },
    { data: cajasAbiertas },
  ] = await Promise.all([
    supabase.from('documentos').select('*').eq('id', id).maybeSingle(),
    supabase.from('documento_items').select('*').eq('documento_id', id),
    supabase.from('documento_pagos').select('*, metodos_pago(nombre, tipo)').eq('documento_id', id),
    supabase.from('configuracion').select('key, value'),
    // POS P5a: notas de crédito/devoluciones de ESTE documento (para el badge
    // "Devuelto" — ver estadoDevolucionDocumento).
    supabase
      .from('documentos')
      .select('total')
      .eq('documento_origen_id', id)
      .in('tipo', ['nota_credito', 'devolucion'])
      .neq('estado', 'anulado'),
    // Sesiones de caja abiertas: para que DevolucionModal pueda ligar la
    // devolución a la caja que la recibe (mismo criterio que el listado).
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
  ])

  if (!documento) notFound()

  const [{ data: caja }, { data: cai }] = await Promise.all([
    supabase.from('cajas').select('*').eq('id', documento.caja_id).maybeSingle(),
    documento.cai_id
      ? supabase.from('cai_autorizaciones').select('*').eq('id', documento.cai_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!caja) notFound()
  // El CAI es garantía de la propia RPC `emitir_documento` (una factura nunca
  // se emite sin uno vigente): si falta aquí es un problema de datos, no un
  // caso normal — fallar duro en vez de imprimir en silencio una factura sin
  // CAI/rango/fecha límite (documento fiscalmente inválido).
  if (documento.tipo === 'factura' && !cai) notFound()

  const pagosConMetodo: DocumentoPagoConMetodo[] = ((pagos ?? []) as unknown as DocumentoPagoEmbed[]).map(
    ({ metodos_pago, ...p }) => ({
      ...p,
      metodo_nombre: metodos_pago?.nombre ?? 'Otro',
      metodo_tipo: metodos_pago?.tipo ?? 'otro',
    }),
  )

  const sumaDevuelta = (devolucionesData ?? []).reduce((s, d) => s + Number(d.total), 0)
  const estadoDevolucion = estadoDevolucionDocumento(documento.tipo, Number(documento.total), sumaDevuelta)

  return (
    <DocumentoView
      documento={documento as Documento}
      items={(items ?? []) as DocumentoItem[]}
      pagos={pagosConMetodo}
      caja={caja as Caja}
      cai={(cai ?? null) as CaiAutorizacion | null}
      config={toConfigMap(config ?? [])}
      volverPos={volver === 'pos'}
      estadoDevolucion={estadoDevolucion}
      sesiones={(sesiones ?? []) as unknown as SesionCaja[]}
      cajas={(cajasAbiertas ?? []) as unknown as Caja[]}
    />
  )
}
