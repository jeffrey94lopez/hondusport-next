import Link from 'next/link'
import styles from './reportes.module.css'

function IconoLibro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function IconoVentas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function IconoGanancias() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  )
}

function IconoContactos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconoCxc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function IconoFlecha() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

const REPORTES = [
  { href: '/admin/reportes/libro-ventas', titulo: 'Libro de ventas (SAR)', desc: 'Registro fiscal de facturas y notas de crédito, con desglose de base e ISV por tasa. Exportable a Excel.', icono: IconoLibro },
  { href: '/admin/reportes/ventas', titulo: 'Reporte de ventas', desc: 'Ventas por documento con filtros (fecha, tipo, cliente, vendedor, caja, método) y detalle de ítems. Exportable a Excel.', icono: IconoVentas },
  { href: '/admin/reportes/ganancias', titulo: 'Ganancias por ítem', desc: 'Ventas, costos y ganancia por producto/variante en un período, con margen %. Exportable a Excel.', icono: IconoGanancias },
  { href: '/admin/reportes/contactos', titulo: 'Clientes y proveedores', desc: 'Directorio con los datos de contacto del formulario (RTN/identidad, teléfono, correo, dirección, exonerado), filtrable por rol. Exportable a Excel.', icono: IconoContactos },
  { href: '/admin/reportes/cxc', titulo: 'Cuentas por cobrar', desc: 'Deuda pendiente por cliente, navegable en cascada hasta sus documentos y días vencidos. Exportable a Excel.', icono: IconoCxc },
]

export default function ReportesIndexPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Reportes</h1>
        <p className={styles.subtitle}>Seleccione el reporte que desea consultar o exportar.</p>
      </div>
      <div className={styles.grid}>
        {REPORTES.map(r => {
          const Icono = r.icono
          return (
            <Link key={r.href} href={r.href} className={styles.card}>
              <div className={styles.cardIcono}>
                <Icono />
              </div>
              <div className={styles.cardTitulo}>{r.titulo}</div>
              <div className={styles.cardDesc}>{r.desc}</div>
              <div className={styles.cardCta}>
                <IconoFlecha />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
