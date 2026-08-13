'use client'
import { useRouter } from 'next/navigation'
import type { EstadoContacto, RolContacto } from '@/types'
import styles from './contactos.module.css'

const ROLES: { v: RolContacto; l: string }[] = [
  { v: 'cliente', l: 'Clientes' }, { v: 'proveedor', l: 'Proveedores' }, { v: 'ambos', l: 'Ambos' },
]
const ESTADOS: { v: EstadoContacto; l: string }[] = [
  { v: 'todos', l: 'Todos' }, { v: 'activos', l: 'Solo activos' }, { v: 'inactivos', l: 'Solo inactivos' },
]

// R5a fixB: el reporte de contactos es un directorio "a la fecha" (lista
// vigente de la tabla `clientes`), no un reporte por período — se quita el
// filtro de fechas (homogeneización de filtros, punto 2 del pase visual) y
// se conserva solo el filtro de rol, que sí aplica.
// R5a fixC: + filtro de estado (todos/activos/inactivos), mismo patrón de
// chips que el de rol; ambos filtros van juntos en la URL.
export default function ContactosControls({ rol, estado, exportHref }: { rol: RolContacto; estado: EstadoContacto; exportHref: string }) {
  const router = useRouter()
  function ir(nuevoRol: RolContacto, nuevoEstado: EstadoContacto) {
    router.push(`/admin/reportes/contactos?${new URLSearchParams({ rol: nuevoRol, estado: nuevoEstado }).toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.presets}>
        {ROLES.map(r => (
          <button key={r.v} type="button" className="btnMerlinChip" aria-pressed={rol === r.v}
            onClick={() => ir(r.v, estado)}>{r.l}</button>
        ))}
        {ESTADOS.map(e => (
          <button key={e.v} type="button" className="btnMerlinChip" aria-pressed={estado === e.v}
            onClick={() => ir(rol, e.v)}>{e.l}</button>
        ))}
      </div>
      <div className={styles.acciones}>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
