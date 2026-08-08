'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { obtenerDocumento } from '../actions'
import DocumentoHoja from '../documento/[id]/DocumentoHoja'
import type { Documento, DocumentoItem, DocumentoPagoConMetodo, Caja, CaiAutorizacion, ConfigMap } from '@/types'
import styles from '../documento/documento.module.css'

type Formato = '80mm' | 'carta'

interface Props {
  documentoId: string
  formatoDefault: Formato
  onNuevaVenta: () => void
  onCerrar: () => void
}

interface DocumentoData {
  documento: Documento
  items: DocumentoItem[]
  pagos: DocumentoPagoConMetodo[]
  cai: CaiAutorizacion | null
  caja: Caja
  config: ConfigMap
}

// Se abre justo después de emitirVenta (ver handleEmitido en PosClient), sin
// navegar: el POS sigue montado detrás. Carga el documento con su propia
// server action (obtenerDocumento) en vez de recibirlo por props porque
// emitirVenta solo devuelve el id — releerlo aquí evita duplicar los campos
// fiscales calculados por la RPC en el cliente.
export default function DocumentoModal({ documentoId, formatoDefault, onNuevaVenta, onCerrar }: Props) {
  const [formato, setFormato] = useState<Formato>(formatoDefault)
  const [data, setData] = useState<DocumentoData | null>(null)
  const [error, setError] = useState('')
  // Arranca en `true` por lazy init (no en el efecto): `documentoId` no
  // cambia durante la vida de este componente (se monta una vez por venta
  // emitida, ver documentoModalId en PosClient), así que no hace falta
  // resetear cargando/error/data al inicio del efecto — evita el lint
  // `react-hooks/set-state-in-effect` de llamar setState síncrono ahí.
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    obtenerDocumento(documentoId).then(result => {
      if (cancelado) return
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo cargar el documento.' : result.error)
        setCargando(false)
        return
      }
      setData(result.data)
      setCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [documentoId])

  const titulo = data ? (data.documento.tipo === 'factura' ? 'Factura' : 'Comprobante') : 'Documento'

  return (
    <div className={styles.modalDocumentoOverlay}>
      <div className={styles.modalDocumento}>
        <div className={`${styles.modalDocumentoToolbar} ${styles.noPrint}`}>
          <div className={styles.modalDocumentoToolbarTop}>
            <span className={styles.modalDocumentoToolbarTitulo}>{titulo} emitido</span>
          </div>
          <div className={styles.modalDocumentoToolbarAcciones}>
            {data && (
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
            )}
            {data && (
              <button type="button" className={`btnMerlinPrimary ${styles.btnToolbar}`} onClick={() => window.print()}>
                Imprimir
              </button>
            )}
            <button type="button" className={`btnMerlinSecondary ${styles.btnToolbar}`} onClick={onNuevaVenta}>
              Nueva venta
            </button>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>

        <div className={styles.modalDocumentoBody}>
          {cargando && <div className={`${styles.modalDocumentoEstado} ${styles.noPrint}`}>Cargando documento…</div>}

          {!cargando && error && (
            <div className={`${styles.modalDocumentoEstado} ${styles.noPrint}`}>
              <p>{error}</p>
              {/* El documento YA está emitido (emitirVenta ya corrió la RPC) —
                  si la carga del modal falla, no puede perderse de vista: se
                  ofrece el enlace directo a la página del documento. */}
              <p>El documento ya fue emitido. Puedes abrirlo directamente:</p>
              <Link href={`/admin/pos/documento/${documentoId}`} className={`btnMerlinPrimary ${styles.btnToolbar}`}>
                Abrir el documento
              </Link>
            </div>
          )}

          {!cargando && data && (
            <DocumentoHoja
              documento={data.documento}
              items={data.items}
              pagos={data.pagos}
              cai={data.cai}
              config={data.config}
              formato={formato}
            />
          )}
        </div>
      </div>
    </div>
  )
}
