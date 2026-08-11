import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango, RolContacto } from '@/types'
import { obtenerContactos } from './data'
import ContactosControls from './ContactosControls'
import styles from './contactos.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']
const ROLES: RolContacto[] = ['cliente', 'proveedor', 'ambos']

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ preset?: string; desde?: string; hasta?: string; rol?: string }> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rol: RolContacto = ROLES.includes(sp.rol as RolContacto) ? (sp.rol as RolContacto) : 'cliente'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const filas = await obtenerContactos(rango.desde, rango.hasta, rol)
  const qs = new URLSearchParams({ preset, rol, ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString()
  const esAmbos = rol === 'ambos', esProv = rol === 'proveedor'

  return (
    <div className={styles.page}>
      <ContactosControls preset={preset} desde={sp.desde} hasta={sp.hasta} rol={rol} etiqueta={etiquetaRango(preset, rango)} exportHref={`/api/reportes/contactos/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Clientes y proveedores</h1>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Nombre</th><th>RTN/Identidad</th>
              {esAmbos && <th>Rol</th>}
              {!esProv && <th className={styles.num}>Total ventas</th>}
              {(esProv || esAmbos) && <th className={styles.num}>Total compras</th>}
              {!esProv && <th className={styles.num}>Saldo CxC</th>}
              {(esProv || esAmbos) && <th className={styles.num}>Saldo CxP</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id}>
                <td>{f.nombre}</td><td>{f.rtn || f.identidad}</td>
                {esAmbos && <td>{f.es_cliente && f.es_proveedor ? 'Cliente y proveedor' : f.es_proveedor ? 'Proveedor' : 'Cliente'}</td>}
                {!esProv && <td className={styles.num}>{formatPrice(f.total_ventas)}</td>}
                {(esProv || esAmbos) && <td className={styles.num}>{formatPrice(f.total_compras)}</td>}
                {!esProv && <td className={styles.num}>{formatPrice(f.saldo_cxc)}</td>}
                {(esProv || esAmbos) && <td className={styles.num}>{formatPrice(f.saldo_cxp)}</td>}
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={7} className={styles.vacio}>Sin contactos para el filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
