'use client'
import { useRouter } from 'next/navigation'
import type { RolContacto } from '@/types'
import styles from './contactos.module.css'

const ROLES: { v: RolContacto; l: string }[] = [
  { v: 'cliente', l: 'Clientes' }, { v: 'proveedor', l: 'Proveedores' }, { v: 'ambos', l: 'Ambos' },
]

// R5a fixB: el reporte de contactos es un directorio "a la fecha" (lista
// vigente de la tabla `clientes`), no un reporte por período — se quita el
// filtro de fechas (homogeneización de filtros, punto 2 del pase visual) y
// se conserva solo el filtro de rol, que sí aplica.
export default function ContactosControls({ rol, exportHref }: { rol: RolContacto; exportHref: string }) {
  const router = useRouter()
  function ir(nuevoRol: RolContacto) {
    router.push(`/admin/reportes/contactos?${new URLSearchParams({ rol: nuevoRol }).toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.presets}>
        {ROLES.map(r => (
          <button key={r.v} type="button" className="btnMerlinChip" aria-pressed={rol === r.v}
            onClick={() => ir(r.v)}>{r.l}</button>
        ))}
      </div>
      <div className={styles.acciones}>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
