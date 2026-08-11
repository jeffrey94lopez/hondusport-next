import { obtenerCxc } from './data'
import CxcCascada from './CxcCascada'
import styles from './cxc.module.css'

export default async function CxcReportePage() {
  const grupos = await obtenerCxc()
  const total = grupos.reduce((s, g) => s + g.total, 0)
  return (
    <div className={styles.page}>
      <CxcCascada grupos={grupos} total={total} exportHref="/api/reportes/cxc/export" />
    </div>
  )
}
