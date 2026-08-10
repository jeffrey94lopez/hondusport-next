import Link from 'next/link'
import styles from './reportes.module.css'

const REPORTES = [
  { href: '/admin/reportes/libro-ventas', titulo: 'Libro de ventas (SAR)', desc: 'Registro fiscal de facturas y notas de crédito, con desglose de base e ISV por tasa. Exportable a Excel.' },
  { href: '/admin/reportes/ventas', titulo: 'Reporte de ventas', desc: 'Ventas por documento con filtros (fecha, tipo, cliente, vendedor, caja, método) y detalle de ítems. Exportable a Excel.' },
]

export default function ReportesIndexPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Reportes</h1>
      <div className={styles.grid}>
        {REPORTES.map(r => (
          <Link key={r.href} href={r.href} className={styles.card}>
            <div className={styles.cardTitulo}>{r.titulo}</div>
            <div className={styles.cardDesc}>{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
