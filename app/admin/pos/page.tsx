import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import type { DocumentoParaArqueo, MetodoPagoTipo } from '@/types'
import PosClient from './PosClient'

const PRODUCTO_SELECT =
  '*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor), producto_variantes(*)'

// Embed real de documento_pagos → metodos_pago: es una FK simple (to-one), así
// que PostgREST devuelve un OBJETO por fila, no un arreglo — aunque el cliente
// de Supabase (sin `Database` generado) lo infiera como arreglo. Mismo caso ya
// documentado en cerrarSesion (app/admin/pos/actions.ts, Fix round 1 de Task 8).
interface DocumentoConPagosEmbed {
  sesion_id: string | null
  estado: string
  total: number
  documento_pagos: Array<{ monto: number; metodos_pago: { tipo: MetodoPagoTipo } | null }>
}

export default async function PosPage() {
  const supabase = await createClient()

  const [
    { data: cajas },
    { data: sesionesAbiertas },
    { data: vendedores },
    { data: metodos },
    { data: productos },
    { data: clientes },
    { data: cais },
    { data: config },
    // El page no sabe qué caja eligió el usuario (vive en localStorage, solo
    // se lee en el cliente): se traen TODAS las esperas y sesiones cerradas,
    // y PosClient las filtra por caja una vez que conoce cajaId. Mismo
    // criterio para las dos consultas.
    { data: esperas },
    { data: sesionesCerradas },
    { data: categorias },
  ] = await Promise.all([
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    supabase.from('vendedores').select('*').eq('activo', true).order('nombre'),
    supabase.from('metodos_pago').select('*').eq('activo', true).order('orden'),
    supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true).in('canal', ['mostrador', 'ambas']),
    supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
    supabase.from('cai_autorizaciones').select('*').eq('activo', true).eq('tipo_documento', '01'),
    supabase.from('configuracion').select('key, value'),
    supabase.from('ventas_espera').select('*').order('created_at', { ascending: false }),
    supabase.from('sesiones_caja').select('*').eq('estado', 'cerrada').order('cerrada_at', { ascending: false }).limit(30),
    supabase
      .from('categorias')
      .select('id, tipo, valor, slug, imagen, categorias_padre, orden, activo')
      .eq('activo', true)
      .in('tipo', ['cat', 'subcat'])
      .order('orden'),
  ])

  // Documentos de las sesiones actualmente abiertas (todas las cajas), con sus
  // pagos, para el resumen previo del modal de cierre en el cliente —
  // `esperadoCaja` (lib/pos/emision.ts) es la misma pura que usa `cerrarSesion`
  // para el cálculo definitivo al confirmar.
  const sesionIds = (sesionesAbiertas ?? []).map(s => s.id)
  const { data: documentosRows } = sesionIds.length
    ? await supabase
        .from('documentos')
        .select('sesion_id, estado, total, documento_pagos(monto, metodos_pago(tipo))')
        .in('sesion_id', sesionIds)
    : { data: [] }

  const documentosPorSesion: Record<string, DocumentoParaArqueo[]> = {}
  for (const d of (documentosRows ?? []) as unknown as DocumentoConPagosEmbed[]) {
    if (!d.sesion_id) continue
    const lista = documentosPorSesion[d.sesion_id] ?? (documentosPorSesion[d.sesion_id] = [])
    lista.push({
      estado: d.estado,
      total: Number(d.total),
      pagos: d.documento_pagos.map(dp => ({
        tipo: dp.metodos_pago?.tipo as MetodoPagoTipo,
        monto: Number(dp.monto),
      })),
    })
  }

  return (
    <PosClient
      cajas={cajas ?? []}
      sesionesAbiertas={sesionesAbiertas ?? []}
      vendedores={vendedores ?? []}
      metodos={metodos ?? []}
      productos={productos ?? []}
      clientes={clientes ?? []}
      cais={cais ?? []}
      config={toConfigMap(config ?? [])}
      esperas={esperas ?? []}
      sesionesCerradas={sesionesCerradas ?? []}
      documentosPorSesion={documentosPorSesion}
      categorias={categorias ?? []}
    />
  )
}
