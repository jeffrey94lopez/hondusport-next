import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { estaVencida, hoyHonduras } from '@/lib/cotizaciones/cotizaciones'
import { nombreComercial, razonSocial, rtn, telefonoEmpresa, domicilioFiscal, logoEmpresa } from '@/lib/empresa/perfil'
import type { LineaPos } from '@/types'
import { obtenerCotizacion } from '../../actions'
import CotizacionPdfView, { type EstiloCotizacion, type EmpresaPdf } from './CotizacionPdfView'

export const dynamic = 'force-dynamic'

const ESTILOS_VALIDOS: EstiloCotizacion[] = ['ejecutivo', 'minimalista', 'catalogo']

function resolverEstilo(pedido: string | undefined, porDefecto: string): EstiloCotizacion {
  const candidato = (pedido ?? porDefecto) as EstiloCotizacion
  return ESTILOS_VALIDOS.includes(candidato) ? candidato : 'ejecutivo'
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ estilo?: string }>
}

// Página del PDF de cotización (patrón "HTML + CSS de impresión", como el papel
// fiscal del POS): relee la cotización y la config de empresa, recalcula totales
// con las puras del POS (frontera de confianza — no se confía en el `total`
// guardado) y, para el estilo Catálogo, carga la primera imagen de cada
// producto. `estilo` sale de searchParams (default config.cotizacion_formato_default).
export default async function CotizacionPdfPage({ params, searchParams }: Props) {
  const { id } = await params
  const { estilo: estiloParam } = await searchParams
  const supabase = await createClient()

  const [cot, { data: configRows }] = await Promise.all([
    obtenerCotizacion(id),
    supabase.from('configuracion').select('key, value'),
  ])

  if (!cot.ok || !cot.data) notFound()
  const cotizacion = cot.data
  const config = toConfigMap(configRows ?? [])

  // Exoneración del cliente: se relee para reproducir los totales con la misma
  // regla fiscal que usó guardarCotizacion (no se persiste en la cotización).
  let exonerado = false
  if (cotizacion.cliente_id) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('exonerado')
      .eq('id', cotizacion.cliente_id)
      .maybeSingle()
    exonerado = cli?.exonerado ?? false
  }

  // Totales con las puras del POS (mismo pipeline que guardarCotizacion).
  const lineas: LineaPos[] = cotizacion.items.map(i => ({
    producto_id: i.producto_id,
    variante_id: i.variante_id,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    descuento: i.descuento,
    isv: i.isv,
  }))
  const prorrateadas = prorratearDescuentoGlobal(lineas, cotizacion.descuento_global)
  const desglosadas = prorrateadas.map(l => desglosarLinea(l, exonerado))
  const totales = totalesDocumento(desglosadas, cotizacion.descuento_global, '')

  // Imágenes de producto para el estilo Catálogo (productos.imagenes[0]).
  const productoIds = [...new Set(cotizacion.items.filter(i => i.producto_id).map(i => i.producto_id!))]
  const imagenesPorProducto: Record<string, string> = {}
  if (productoIds.length > 0) {
    const { data: prods } = await supabase.from('productos').select('id, imagenes').in('id', productoIds)
    for (const p of (prods ?? []) as { id: string; imagenes: string[] | null }[]) {
      const primera = (p.imagenes ?? []).filter(Boolean)[0]
      if (primera) imagenesPorProducto[p.id] = primera
    }
  }

  const empresa: EmpresaPdf = {
    nombre: nombreComercial(config) || 'Hondusport',
    razonSocial: razonSocial(config) || null,
    rtn: rtn(config) || null,
    domicilio: domicilioFiscal(config) || null,
    telefono: telefonoEmpresa(config) || null,
    logoUrl: logoEmpresa(config) || null,
  }

  const vencida = estaVencida(new Date(cotizacion.valido_hasta + 'T00:00:00Z'), hoyHonduras(new Date()))
  const estilo = resolverEstilo(estiloParam, config.cotizacion_formato_default || 'ejecutivo')

  return (
    <CotizacionPdfView
      estilo={estilo}
      cotizacion={cotizacion}
      totales={totales}
      empresa={empresa}
      config={config}
      vencida={vencida}
      imagenesPorProducto={imagenesPorProducto}
    />
  )
}
