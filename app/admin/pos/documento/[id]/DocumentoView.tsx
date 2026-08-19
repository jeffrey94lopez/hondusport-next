'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DevolucionModal from '../../components/DevolucionModal'
import AnularModal from '../../components/AnularModal'
import NotaCreditoHoja from '../../components/NotaCreditoHoja'
import { puedeDevolverDocumento, numeroDocumentoDevolucion, type EstadoDevolucionDocumento } from '@/lib/pos/devoluciones'
import type { Documento, DocumentoItem, Caja, CaiAutorizacion, ConfigMap, DocumentoPagoConMetodo, SesionCaja, NotaCreditoReembolso } from '@/types'
import DocumentoHoja from './DocumentoHoja'
import DocumentoPantalla from './DocumentoPantalla'
import { numeroDocumento } from '@/lib/pos/documentos'
import styles from '../documento.module.css'

type Formato = '80mm' | 'carta'

interface Props {
  documento: Documento
  items: DocumentoItem[]
  pagos: DocumentoPagoConMetodo[]
  caja: Caja
  cai: CaiAutorizacion | null
  config: ConfigMap
  volverPos: boolean
  estadoDevolucion: EstadoDevolucionDocumento
  sesiones: SesionCaja[]
  cajas: Caja[]
  // D2: nombre resuelto de `vendedor_id` (embed vendedores(nombre) en
  // page.tsx), para la pantalla de plataforma (DocumentoPantalla) — la hoja
  // imprimible no lo usa.
  vendedorNombre: string | null
  // POS P5a Task 5: solo se llenan cuando `documento.tipo` es nota_credito/
  // devolucion (ver page.tsx) — la hoja de venta (DocumentoHoja) no los usa.
  reembolsos: NotaCreditoReembolso[]
  origen: Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante'> | null
  // D2: datos para enlazar cada devolución/NC a su propio documento, en la
  // pantalla de plataforma (DocumentoPantalla).
  devoluciones: Array<{
    id: string
    tipo: 'nota_credito' | 'devolucion'
    correlativo: string | null
    numero_comprobante: number | null
    total: number
  }>
}

export default function DocumentoView({
  documento,
  items,
  pagos,
  caja,
  cai,
  config,
  volverPos,
  estadoDevolucion,
  sesiones,
  cajas,
  reembolsos,
  origen,
  devoluciones,
  vendedorNombre,
}: Props) {
  const router = useRouter()
  const [formato, setFormato] = useState<Formato>(caja.formato_impresion)
  const [devolviendo, setDevolviendo] = useState(false)
  const [anulando, setAnulando] = useState(false)

  const esFactura = documento.tipo === 'factura'
  const esDevolucionDoc = documento.tipo === 'nota_credito' || documento.tipo === 'devolucion'
  const anulado = documento.estado === 'anulado'

  // D2: mismas condiciones que la lista (DocumentosClient.tsx) — no se
  // relajan aquí. Solo un comprobante emitido y sin devoluciones se anula;
  // uno ya devuelto muestra el botón deshabilitado con su motivo, igual que
  // en la lista; una factura no se anula nunca (se revierte con nota de
  // crédito) y una NC/devolución no ofrece ni botón ni nota.
  const esComprobanteEmitido = documento.tipo === 'comprobante' && documento.estado === 'emitido'
  const puedeAnular = esComprobanteEmitido && estadoDevolucion === 'ninguna'
  const comprobanteYaDevuelto = esComprobanteEmitido && estadoDevolucion !== 'ninguna'

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <div className={styles.toolbarLeft}>
          <Link href="/admin/pos/documentos" className={`${styles.btnToolbar} btnMerlinTertiary`}>← Documentos</Link>
          <span className={styles.toolbarTitulo}>
            {esDevolucionDoc
              ? `${documento.tipo === 'nota_credito' ? 'Nota de crédito' : 'Devolución'} ${numeroDocumentoDevolucion(documento)}`
              : `${esFactura ? 'Factura' : 'Comprobante'} ${numeroDocumento(documento)}`}
          </span>
          {anulado && <span className={styles.badgeAnuladoToolbar}>ANULADO</span>}
          {estadoDevolucion !== 'ninguna' && (
            <span className={styles.badgeDevueltoToolbar}>
              {estadoDevolucion === 'total' ? 'Devuelto (total)' : 'Devuelto (parcial)'}
            </span>
          )}
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.formatoGroup}>
            <button
              type="button"
              className="btnMerlinChip"
              aria-pressed={formato === '80mm'}
              onClick={() => setFormato('80mm')}
            >
              80mm
            </button>
            <button
              type="button"
              className="btnMerlinChip"
              aria-pressed={formato === 'carta'}
              onClick={() => setFormato('carta')}
            >
              Carta
            </button>
          </div>
          {puedeDevolverDocumento(documento.tipo, documento.estado, estadoDevolucion) && (
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnToolbar}`}
              onClick={() => setDevolviendo(true)}
            >
              Devolver / Nota de crédito
            </button>
          )}
          {puedeAnular && (
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnToolbar}`}
              onClick={() => setAnulando(true)}
            >
              Anular
            </button>
          )}
          {comprobanteYaDevuelto && (
            <button
              type="button"
              className={`btnMerlinSecondary ${styles.btnToolbar}`}
              disabled
              title="No se puede anular un comprobante con devoluciones"
            >
              Anular
            </button>
          )}
          {esFactura && (
            <span className={styles.notaAnulacion}>
              Una factura no se anula: se revierte con una nota de crédito.
            </span>
          )}
          <button type="button" className={`${styles.btnToolbar} btnMerlinPrimary`} onClick={() => window.print()}>
            Imprimir
          </button>
          {volverPos && (
            <Link href="/admin/pos" className={`${styles.btnToolbar} btnMerlinSecondary`}>
              Nueva venta
            </Link>
          )}
        </div>
      </div>

      <div className={styles.noPrint}>
        <DocumentoPantalla
          documento={documento}
          items={items}
          pagos={pagos}
          caja={caja}
          vendedorNombre={vendedorNombre}
          devoluciones={devoluciones}
          origen={origen}
          reembolsos={reembolsos}
          estadoDevolucion={estadoDevolucion}
        />
      </div>

      {/* La hoja (DocumentoHoja/NotaCreditoHoja) se sigue montando siempre —
          no cambia lo que imprimen, solo cuándo se ven. En pantalla este
          contenedor va oculto (`display: none`, nunca `visibility: hidden`,
          que dejaría el hueco); al imprimir se vuelve visible y la barra +
          DocumentoPantalla se ocultan (`.noPrint`). Sin `overflow: hidden`
          en este contenedor ni en ningún ancestro: recortaría la hoja en la
          primera página en vez de fragmentarla (ver R7). */}
      <div className={styles.soloImprimir}>
        {esDevolucionDoc ? (
          <NotaCreditoHoja
            documento={documento}
            items={items}
            reembolsos={reembolsos}
            origen={origen}
            cai={cai}
            config={config}
            formato={formato}
          />
        ) : (
          <DocumentoHoja documento={documento} items={items} pagos={pagos} cai={cai} config={config} formato={formato} />
        )}
      </div>

      {devolviendo && (
        <DevolucionModal
          documentoId={documento.id}
          sesiones={sesiones}
          cajas={cajas}
          onClose={() => setDevolviendo(false)}
          onEmitida={() => router.refresh()}
        />
      )}

      {anulando && (
        <AnularModal
          documento={documento}
          onClose={() => setAnulando(false)}
          onAnulado={() => { setAnulando(false); router.refresh() }}
        />
      )}
    </div>
  )
}
