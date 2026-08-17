import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { obtenerCotizacionParaPos, type CotizacionPrefillPos } from '@/app/admin/cotizaciones/actions'
import type { DocumentoParaArqueo, MetodoPagoTipo } from '@/types'
import PosClient from './PosClient'
import styles from './pos.module.css'

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

export default async function PosPage({
  searchParams,
}: {
  // Next 16: `searchParams` es async. Solo se usa `cotizacion` (id) para el
  // flujo "Facturar desde cotización" (Task 8 de POS P3).
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()

  // Prefill de cotización: se carga en el server para no parpadear en cliente.
  // Si el id no viene o la carga falla, se pasa null (el POS ignora el prefill).
  const cotizacionParam = (await searchParams).cotizacion
  const cotizacionId = typeof cotizacionParam === 'string' ? cotizacionParam : null
  let cotizacionPrefill: CotizacionPrefillPos | null = null
  if (cotizacionId) {
    const r = await obtenerCotizacionParaPos(cotizacionId)
    cotizacionPrefill = r.ok && r.data ? r.data : null
  }

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
    // R2b Task 5: presets de descuento por línea (chips del modal Editar
    // Ítem) y del descuento global (Task 6) — mismo listado para ambos.
    { data: descuentos },
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
    supabase.from('descuentos_preset').select('*').eq('activo', true).order('orden'),
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

  // R7: interruptor `pos_cierre_ciegas`. Criterio del proyecto ("ausente =
  // valor por defecto"): sin la clave todavía en `configuracion`, el cierre a
  // ciegas queda activo (el más estricto).
  const configMap = toConfigMap(config ?? [])
  const cierreCiegas = configMap.pos_cierre_ciegas !== 'false'

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

  // El overlay fullscreen se aplica AQUÍ (no en app/admin/pos/layout.tsx,
  // que es un passthrough) para que solo /admin/pos quede a pantalla
  // completa. Las rutas hermanas /admin/pos/documentos y
  // /admin/pos/documento/[id] no importan este CSS module, así que
  // conservan el Sidebar del admin visible (ver pos.module.css `.overlay`
  // para el detalle de por qué es `fixed` y su `@media print`).
  return (
    <div className={styles.overlay}>
      <PosClient
        cajas={cajas ?? []}
        sesionesAbiertas={sesionesAbiertas ?? []}
        vendedores={vendedores ?? []}
        metodos={metodos ?? []}
        productos={productos ?? []}
        clientes={clientes ?? []}
        cais={cais ?? []}
        config={configMap}
        cierreCiegas={cierreCiegas}
        esperas={esperas ?? []}
        sesionesCerradas={sesionesCerradas ?? []}
        documentosPorSesion={documentosPorSesion}
        categorias={categorias ?? []}
        cotizacionPrefill={cotizacionPrefill}
        descuentos={descuentos ?? []}
      />
    </div>
  )
}
