'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Documento, DocumentoItem, Caja, CaiAutorizacion, ConfigMap, DocumentoPagoConMetodo } from '@/types'
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
}

export default function DocumentoView({ documento, items, pagos, caja, cai, config, volverPos }: Props) {
  const [formato, setFormato] = useState<Formato>(caja.formato_impresion)

  const esFactura = documento.tipo === 'factura'
  const anulado = documento.estado === 'anulado'

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <div className={styles.toolbarLeft}>
          <Link href="/admin/pos/documentos" className={styles.backLink}>← Documentos</Link>
          <span className={styles.toolbarTitulo}>
            {esFactura ? 'Factura' : 'Comprobante'} {numeroDocumento(documento)}
          </span>
          {anulado && <span className={styles.badgeAnuladoToolbar}>ANULADO</span>}
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.formatoGroup}>
            <button
              type="button"
              className={`${styles.formatoBtn} ${formato === '80mm' ? styles.formatoBtnActive : ''}`}
              onClick={() => setFormato('80mm')}
            >
              80mm
            </button>
            <button
              type="button"
              className={`${styles.formatoBtn} ${formato === 'carta' ? styles.formatoBtnActive : ''}`}
              onClick={() => setFormato('carta')}
            >
              Carta
            </button>
          </div>
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
    </div>
  )
}
