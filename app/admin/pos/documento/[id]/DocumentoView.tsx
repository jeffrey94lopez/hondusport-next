'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DevolucionModal from '../../components/DevolucionModal'
import NotaCreditoHoja from '../../components/NotaCreditoHoja'
import { puedeDevolverDocumento, numeroDocumentoDevolucion, type EstadoDevolucionDocumento } from '@/lib/pos/devoluciones'
import type { Documento, DocumentoItem, Caja, CaiAutorizacion, ConfigMap, DocumentoPagoConMetodo, SesionCaja, NotaCreditoReembolso } from '@/types'
import DocumentoHoja, { numeroDocumento } from './DocumentoHoja'
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
  // POS P5a Task 5: solo se llenan cuando `documento.tipo` es nota_credito/
  // devolucion (ver page.tsx) — la hoja de venta (DocumentoHoja) no los usa.
  reembolsos: NotaCreditoReembolso[]
  origen: Pick<Documento, 'tipo' | 'correlativo' | 'numero_comprobante'> | null
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
}: Props) {
  const router = useRouter()
  const [formato, setFormato] = useState<Formato>(caja.formato_impresion)
  const [devolviendo, setDevolviendo] = useState(false)

  const esFactura = documento.tipo === 'factura'
  const esDevolucionDoc = documento.tipo === 'nota_credito' || documento.tipo === 'devolucion'
  const anulado = documento.estado === 'anulado'

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

      {devolviendo && (
        <DevolucionModal
          documentoId={documento.id}
          sesiones={sesiones}
          cajas={cajas}
          onClose={() => setDevolviendo(false)}
          onEmitida={() => router.refresh()}
        />
      )}
    </div>
  )
}
