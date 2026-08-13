import type { RolContacto } from '@/types'
import { obtenerContactos } from './data'
import { rolLabel, tipoClienteLabel } from '@/lib/reportes/contactos'
import ContactosControls from './ContactosControls'
import styles from './contactos.module.css'

const ROLES: RolContacto[] = ['cliente', 'proveedor', 'ambos']

// R5a fixB: reenfocado como directorio de clientes/proveedores — datos de
// contacto del formulario real (nombre, RTN/identidad, teléfono, correo,
// dirección, rol, exonerado…), no montos de ventas/compras/saldos (esos ya
// están en los reportes de ventas/cxc/cxp). Por eso ya no filtra por fecha:
// es la lista vigente en `clientes`, "a la fecha" — no por período.
export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ rol?: string }> }) {
  const sp = await searchParams
  const rol: RolContacto = ROLES.includes(sp.rol as RolContacto) ? (sp.rol as RolContacto) : 'cliente'
  const filas = await obtenerContactos(rol)
  const qs = new URLSearchParams({ rol }).toString()

  return (
    <div className={styles.page}>
      <ContactosControls rol={rol} exportHref={`/api/reportes/contactos/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Clientes y proveedores</h1>
        <p className={styles.periodo}>{filas.length} contacto(s)</p>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Nombre</th><th>Rol</th><th>RTN/Identidad</th><th>Tipo</th>
              <th>Teléfono</th><th>Correo</th><th>Dirección</th>
              <th>Persona de contacto</th><th>Exonerado</th><th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id}>
                <td>{f.nombre}</td>
                <td>{rolLabel(f)}</td>
                <td>{f.rtn || f.identidad || '—'}</td>
                <td>{f.es_cliente ? tipoClienteLabel(f.tipoCliente) : '—'}</td>
                <td>{f.telefono || '—'}</td>
                <td>{f.correo || '—'}</td>
                <td>{f.direccion || '—'}</td>
                <td>{f.es_proveedor ? (f.contacto || '—') : '—'}</td>
                <td>{f.es_cliente ? (f.exonerado ? 'Sí' : 'No') : '—'}</td>
                <td>
                  <span className={f.activo ? styles.badgeActivo : styles.badgeInactivo}>{f.activo ? 'Sí' : 'No'}</span>
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={10} className={styles.vacio}>Sin contactos para el filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
