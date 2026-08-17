'use client'
import { useState } from 'react'
import ComprobanteTurno, { type ComprobanteTurnoProps } from '@/components/pos/ComprobanteTurno'
import styles from './comprobante-turno-modal.module.css'

// Todo lo que `ComprobanteTurno` necesita EXCEPTO `impresoEn` (lo fija este
// modal, al montarse — así una reimpresión desde el detalle del turno
// muestra la hora real de esa reimpresión, no la del cierre original) y
// `variante` (siempre 'modal' aquí: es el único llamador de esa variante).
export type ComprobanteTurnoDatos = Omit<ComprobanteTurnoProps, 'impresoEn' | 'variante'>

interface Props {
  datos: ComprobanteTurnoDatos
  onCerrar: () => void
}

// Envoltorio compartido por los TRES puntos donde R7 muestra el comprobante
// de cierre de turno (CierreModal en el mostrador, TurnosClient y
// TurnoDetalleView, reimprimible): un solo lugar para el botón Imprimir +
// Cerrar y para el arreglo de impresión, en vez de tres copias con tres
// oportunidades de repetir el bug de botones sin caja (R6) o el envoltorio de
// página completa de `ComprobanteTurno` estorbando dentro de un modal (nota
// de revisión de la tarea anterior). Mismo patrón de overlay + neutralizado en
// impresión que `.modalDocumentoOverlay` de
// app/admin/pos/documento/documento.module.css: un `position: fixed` no
// fragmenta en paged media (paginado), así que se aplana a una sola hoja si
// no se neutraliza al imprimir.
export default function ComprobanteTurnoModal({ datos, onCerrar }: Props) {
  const [impresoEn] = useState(() => new Date().toISOString())

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <span className={styles.toolbarTitulo}>Comprobante de cierre de turno</span>
          <div className={styles.toolbarAcciones}>
            <button type="button" className={`btnMerlinPrimary ${styles.btnToolbar}`} onClick={() => window.print()}>
              Imprimir
            </button>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
        <div className={styles.body}>
          <ComprobanteTurno {...datos} impresoEn={impresoEn} variante="modal" />
        </div>
      </div>
    </div>
  )
}
