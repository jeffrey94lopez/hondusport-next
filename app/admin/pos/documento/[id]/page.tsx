import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { estadoDevolucionDocumento } from '@/lib/pos/devoluciones'
import type { Documento, DocumentoItem, DocumentoPago, Caja, CaiAutorizacion, MetodoPagoTipo, DocumentoPagoConMetodo, SesionCaja, NotaCreditoReembolso } from '@/types'
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
    // "Devuelto" — ver estadoDevolucionDocumento). D2: se amplía el select
    // (id/tipo/correlativo/numero_comprobante) para poder enlazar a cada una
    // desde la pantalla — el conjunto de filas (filtros) no cambia.
    supabase
      .from('documentos')
      .select('id, tipo, correlativo, numero_comprobante, total')
      .eq('documento_origen_id', id)
      .in('tipo', ['nota_credito', 'devolucion'])
      .neq('estado', 'anulado')
      .order('created_at')
      .limit(200),
    // Sesiones de caja abiertas: para que DevolucionModal pueda ligar la
    // devolución a la caja que la recibe (mismo criterio que el listado).
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
  ])

  if (!documento) notFound()

  // POS P5a Task 5: una NC/devolución necesita datos que una factura/
  // comprobante no tiene (sus propios reembolsos y la referencia al
  // documento que devuelve) — se cargan aparte, gateados por tipo, para no
  // ensuciar el camino normal de venta con queries que siempre volverían
  // vacías.
  const esDevolucionDoc = documento.tipo === 'nota_credito' || documento.tipo === 'devolucion'

  const [{ data: caja }, { data: cai }, { data: reembolsos }, { data: origen }] = await Promise.all([
    supabase.from('cajas').select('*').eq('id', documento.caja_id).maybeSingle(),
    documento.cai_id
      ? supabase.from('cai_autorizaciones').select('*').eq('id', documento.cai_id).maybeSingle()
      : Promise.resolve({ data: null }),
    esDevolucionDoc
      ? supabase.from('nota_credito_reembolsos').select('*').eq('documento_id', id)
      : Promise.resolve({ data: [] as NotaCreditoReembolso[] }),
    esDevolucionDoc && documento.documento_origen_id
      ? supabase.from('documentos').select('id, tipo, correlativo, numero_comprobante').eq('id', documento.documento_origen_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!caja) notFound()
  // El CAI es garantía de la propia RPC (`emitir_documento`/`emitir_nota_credito`):
  // ni una factura ni una nota_credito se emiten nunca sin uno vigente — si
  // falta aquí es un problema de datos, no un caso normal. Fallar duro en vez
  // de imprimir en silencio un documento fiscal sin su bloque CAI/rango/fecha
  // límite. `devolucion` queda afuera a propósito: no es fiscal, no lleva CAI.
  if ((documento.tipo === 'factura' || documento.tipo === 'nota_credito') && !cai) notFound()

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
      reembolsos={(reembolsos ?? []) as NotaCreditoReembolso[]}
      origen={(origen ?? null) as Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante'> | null}
      devoluciones={(devolucionesData ?? []) as Array<{
        id: string
        tipo: 'nota_credito' | 'devolucion'
        correlativo: string | null
        numero_comprobante: number | null
        total: number
      }>}
    />
  )
}
