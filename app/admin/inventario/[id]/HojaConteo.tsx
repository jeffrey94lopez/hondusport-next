'use client'
import type { AlcanceTipo, ConteoFisico, ConteoLinea } from '@/types'
import styles from './impresion.module.css'

interface Props {
  toma: ConteoFisico
  lineas: ConteoLinea[]
  onVolver: () => void
}

const ALCANCE_LABEL: Record<AlcanceTipo, string> = {
  todo: 'Todo el inventario',
  categoria: 'Categoría',
  subcategoria: 'Subcategoría',
  seleccion: 'Selección manual',
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-HN')
}

// Hoja de conteo EN BLANCO: a propósito no recibe/muestra stock_snapshot ni
// costo — solo lo necesario para identificar la línea en papel (SKU, nombre)
// más un renglón vacío para anotar el conteo a mano, así se puede contar a
// ciegas incluso si el toggle `inventario_conteo_ciego` está apagado (la
// pantalla puede mostrar el stock; el papel nunca). Mismo patrón "hoja carta
// + tinta fija" que HojaEstadoCuentaCliente (CxC): la barra vive en este
// componente, TomaEditor solo decide cuándo montarla.
export default function HojaConteo({ toma, lineas, onVolver }: Props) {
  return (
    <>
      <style>{'@page { size: letter; }'}</style>

      <div className={styles.page}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <div className={styles.toolbarLeft}>
            <button type="button" className={`btnMerlinTertiary ${styles.btnToolbar}`} onClick={onVolver}>
              ← Volver
            </button>
            <span className={styles.toolbarTitulo}>Hoja de conteo · {toma.numero}</span>
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

        <div className={styles.pageBg}>
          <div className={styles.hojaCarta}>
            <div className={styles.docTitulo}>
              <h1 className={styles.docTituloH1}>HOJA DE CONTEO</h1>
            </div>

            <div className={styles.metaGrid}>
              <div><strong>Toma:</strong> {toma.numero}</div>
              <div><strong>Fecha:</strong> {fechaCorta(toma.created_at)}</div>
              <div><strong>Alcance:</strong> {ALCANCE_LABEL[toma.alcance_tipo]}</div>
              {toma.descripcion && <div><strong>Descripción:</strong> {toma.descripcion}</div>}
            </div>

            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto / variante</th>
                  <th>Conteo</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map(l => (
                  <tr key={l.id}>
                    <td>{l.sku ?? '—'}</td>
                    <td>{l.nombre}</td>
                    <td><span className={styles.renglonConteo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lineas.length === 0 && (
              <div className={styles.hojaEmpty}>Esta toma no tiene líneas.</div>
            )}

            <div className={styles.firmaBlock}>
              <div className={styles.firmaItem}>
                <div className={styles.firmaLinea} />
                <div className={styles.firmaLabel}>Firma del responsable del conteo</div>
              </div>
              <div className={styles.firmaItem}>
                <div className={styles.firmaLinea} />
                <div className={styles.firmaLabel}>Firma del supervisor</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
