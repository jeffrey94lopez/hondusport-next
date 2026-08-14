import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { esperadoCaja } from '@/lib/pos/emision'
import type { Caja, Documento, MetodoPagoTipo, SesionCaja } from '@/types'
import TurnoDetalleView, { type DocumentoTurno } from './TurnoDetalleView'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TurnoDetallePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sesion } = await supabase
    .from('sesiones_caja')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!sesion) notFound()

  // `sesiones_caja` solo trae `caja_id`, no el nombre: se carga la caja aparte.
  const [{ data: caja }, { data: documentosRows }] = await Promise.all([
    supabase.from('cajas').select('id, nombre').eq('id', sesion.caja_id).maybeSingle(),
    // Mismo `select` que `cerrarSesion` (app/admin/pos/actions.ts:199-203) para
    // estado/total/pagos, más los campos que el detalle muestra. `.limit()`
    // explícito para no depender del tope por defecto de PostgREST.
    supabase
      .from('documentos')
      .select(
        'id, tipo, correlativo, numero_comprobante, created_at, estado, total, documento_pagos(monto, metodos_pago(tipo))',
      )
      .eq('sesion_id', id)
      .order('created_at', { ascending: true })
      .limit(5000),
  ])

  // Sin tipos de Database generados, el cliente de Supabase infiere las
  // relaciones embebidas como arreglo por defecto (no puede conocer la
  // cardinalidad del FK). En runtime, PostgREST devuelve OBJETO para un embed
  // to-one como documento_pagos → metodos_pago (metodo_id es FK simple, no hay
  // muchos métodos por pago): se corrige el tipo aquí para reflejar la forma
  // real, no la inferida (mismo ajuste que `cerrarSesion`).
  interface DocumentoConPagos {
    id: string
    tipo: Documento['tipo']
    correlativo: string | null
    numero_comprobante: number | null
    created_at: string
    estado: string
    total: number
    documento_pagos: Array<{ monto: number; metodos_pago: { tipo: MetodoPagoTipo } | null }>
  }
  const documentos = (documentosRows ?? []) as unknown as DocumentoConPagos[]

  const docsParaEsperado = documentos.map(d => ({
    estado: d.estado,
    total: Number(d.total),
    pagos: d.documento_pagos.map(dp => ({
      tipo: dp.metodos_pago?.tipo as MetodoPagoTipo,
      monto: Number(dp.monto),
    })),
  }))

  // Solo se usa para el desglose por método, que no se persiste. Para el
  // encabezado del arqueo de un turno cerrado se muestran los valores
  // congelados en `sesiones_caja` (ver TurnoDetalleView).
  const { efectivoEsperado, porMetodo } = esperadoCaja(Number(sesion.monto_inicial), docsParaEsperado)

  const documentosTurno: DocumentoTurno[] = documentos.map(d => ({
    id: d.id,
    tipo: d.tipo,
    correlativo: d.correlativo,
    numero_comprobante: d.numero_comprobante,
    created_at: d.created_at,
    estado: d.estado as Documento['estado'],
    total: Number(d.total),
  }))

  return (
    <TurnoDetalleView
      sesion={sesion as SesionCaja}
      caja={(caja as Pick<Caja, 'id' | 'nombre'>) ?? null}
      esperadoEnVivo={efectivoEsperado}
      porMetodo={porMetodo}
      documentos={documentosTurno}
    />
  )
}
