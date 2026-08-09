'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DevolucionModal from '../../components/DevolucionModal'
import { puedeDevolverDocumento, type EstadoDevolucionDocumento } from '@/lib/pos/devoluciones'
import type { Documento, DocumentoItem, Caja, CaiAutorizacion, ConfigMap, DocumentoPagoConMetodo, SesionCaja } from '@/types'
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
}: Props) {
  const router = useRouter()
  const [formato, setFormato] = useState<Formato>(caja.formato_impresion)
  const [devolviendo, setDevolviendo] = useState(false)

  const esFactura = documento.tipo === 'factura'
  const anulado = documento.estado === 'anulado'

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <div className={styles.toolbarLeft}>
          <Link href="/admin/pos/documentos" className="btnMerlinTertiary">← Documentos</Link>
          <span className={styles.toolbarTitulo}>
            {esFactura ? 'Factura' : 'Comprobante'} {numeroDocumento(documento)}
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
          <button type="button" className="btnMerlinPrimary" onClick={() => window.print()}>
            Imprimir
          </button>
          {volverPos && (
            <Link href="/admin/pos" className="btnMerlinSecondary">
              Nueva venta
            </Link>
          )}
        </div>
      </div>

      <DocumentoHoja documento={documento} items={items} pagos={pagos} cai={cai} config={config} formato={formato} />

      {devolviendo && (
        <DevolucionModal
          documentoId={documento.id}
          sesiones={sesiones}
          cajas={cajas}
          onClose={() => setDevolviendo(false)}
          onEmitida={() => { setDevolviendo(false); router.refresh() }}
        />
      )}
    </div>
  )
}
