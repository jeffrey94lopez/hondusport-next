'use client'
import Link from 'next/link'
import type { CompraConDatos, ConfigMap } from '@/types'
import HojaOrdenCompra from './HojaOrdenCompra'
import styles from './orden.module.css'

interface Props {
  compra: CompraConDatos
  config: ConfigMap
}

// Barra de acciones (no imprimible) + hoja. Mismo patrón que DocumentoView
// (app/admin/pos/documento/[id]/DocumentoView.tsx), simplificado: la orden de
// compra no tiene elección de formato 80mm/Carta, solo Carta.
export default function CompraOrdenView({ compra, config }: Props) {
  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}>
        <div className={styles.toolbarLeft}>
          <Link href={`/admin/compras/${compra.id}`} className={`btnMerlinTertiary ${styles.btnToolbar}`}>
            ← Volver
          </Link>
          <span className={styles.toolbarTitulo}>Orden de compra {compra.numero}</span>
        </div>
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={`btnMerlinPrimary ${styles.btnToolbar}`}
            onClick={() => window.print()}
          >
            Imprimir
          </button>
        </div>
      </div>

      <HojaOrdenCompra compra={compra} config={config} />
    </div>
  )
}
