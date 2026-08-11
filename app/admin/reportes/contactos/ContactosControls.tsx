'use client'
import { useRouter } from 'next/navigation'
import type { PresetRango, RolContacto } from '@/types'
import styles from './contactos.module.css'

const PRESETS: { v: PresetRango; l: string }[] = [
  { v: 'hoy', l: 'Hoy' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mes' }, { v: 'anio', l: 'Año' }, { v: 'personalizado', l: 'Personalizado' },
]
const ROLES: { v: RolContacto; l: string }[] = [
  { v: 'cliente', l: 'Clientes' }, { v: 'proveedor', l: 'Proveedores' }, { v: 'ambos', l: 'Ambos' },
]

export default function ContactosControls({ preset, desde, hasta, rol, etiqueta, exportHref }: {
  preset: PresetRango; desde?: string; hasta?: string; rol: RolContacto; etiqueta: string; exportHref: string
}) {
  const router = useRouter()
  function ir(next: { preset?: PresetRango; desde?: string; hasta?: string; rol?: RolContacto }) {
    const p = new URLSearchParams()
    p.set('preset', next.preset ?? preset)
    p.set('rol', next.rol ?? rol)
    const d = next.desde ?? desde, h = next.hasta ?? hasta
    if ((next.preset ?? preset) === 'personalizado') { if (d) p.set('desde', d); if (h) p.set('hasta', h) }
    router.push(`/admin/reportes/contactos?${p.toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.presets}>
        {PRESETS.map(pr => (
          <button key={pr.v} type="button" className={`${styles.presetBtn} ${preset === pr.v ? styles.presetOn : ''}`}
            onClick={() => ir({ preset: pr.v })}>{pr.l}</button>
        ))}
        {preset === 'personalizado' && (
          <span className={styles.rangoLibre}>
            <input type="date" value={desde ?? ''} onChange={e => ir({ preset: 'personalizado', desde: e.target.value, hasta: hasta ?? e.target.value })} />
            <span>a</span>
            <input type="date" value={hasta ?? ''} onChange={e => ir({ preset: 'personalizado', desde: desde ?? e.target.value, hasta: e.target.value })} />
          </span>
        )}
        <select className={styles.selectRol} value={rol} onChange={e => ir({ rol: e.target.value as RolContacto })}>
          {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <span className={styles.etiqueta}>{etiqueta}</span>
      </div>
      <div className={styles.acciones}>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
