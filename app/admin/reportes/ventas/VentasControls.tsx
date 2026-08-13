'use client'
import { useRouter } from 'next/navigation'
import type { PresetRango } from '@/types'
import styles from './ventas.module.css'

type Opcion = { id: string; nombre: string }
interface Props {
  sp: Record<string, string | undefined>
  preset: PresetRango
  etiqueta: string
  detallado: boolean
  opciones: { clientes: Opcion[]; vendedores: Opcion[]; cajas: Opcion[]; metodos: Opcion[] }
  exportHref: string
}

// R5a fixB (homogeneización de filtros, punto 2): este reporte ya tiene el
// set completo (presets + rango personalizado + tipo/cliente/vendedor/caja/
// método) — es la referencia que se propagó a libro-ventas (presets) y se
// evaluó para ganancias/cxc/contactos (documentado en cada uno por qué se
// omitió lo que no aplicaba sin inventar queries nuevas).
const PRESETS: { v: PresetRango; l: string }[] = [
  { v: 'hoy', l: 'Hoy' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mes' }, { v: 'anio', l: 'Año' }, { v: 'personalizado', l: 'Personalizado' },
]

export default function VentasControls({ sp, preset, etiqueta, detallado, opciones, exportHref }: Props) {
  const router = useRouter()
  function ir(cambios: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { ...sp, ...cambios }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    router.push(`/admin/reportes/ventas?${p.toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.fila}>
        {PRESETS.map(pr => (
          <button key={pr.v} type="button" className="btnMerlinChip" aria-pressed={preset === pr.v}
            onClick={() => ir({ preset: pr.v, desde: undefined, hasta: undefined })}>{pr.l}</button>
        ))}
        {preset === 'personalizado' && (
          <>
            <input type="date" value={sp.desde ?? ''} onChange={e => ir({ preset: 'personalizado', desde: e.target.value })} />
            <input type="date" value={sp.hasta ?? ''} onChange={e => ir({ preset: 'personalizado', hasta: e.target.value })} />
          </>
        )}
        <span className={styles.etiqueta}>{etiqueta}</span>
      </div>
      <div className={styles.fila}>
        <select value={sp.tipo ?? ''} onChange={e => ir({ tipo: e.target.value || undefined })}>
          <option value="">Todos los tipos</option>
          <option value="factura">Factura</option><option value="comprobante">Comprobante</option>
          <option value="nota_credito">Nota de crédito</option><option value="devolucion">Devolución</option>
        </select>
        <select value={sp.clienteId ?? ''} onChange={e => ir({ clienteId: e.target.value || undefined })}>
          <option value="">Todos los clientes</option>
          {opciones.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={sp.vendedorId ?? ''} onChange={e => ir({ vendedorId: e.target.value || undefined })}>
          <option value="">Todos los vendedores</option>
          {opciones.vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <select value={sp.cajaId ?? ''} onChange={e => ir({ cajaId: e.target.value || undefined })}>
          <option value="">Todas las cajas</option>
          {opciones.cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={sp.metodoId ?? ''} onChange={e => ir({ metodoId: e.target.value || undefined })}>
          <option value="">Todos los métodos</option>
          {opciones.metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={detallado} onChange={e => ir({ detallado: e.target.checked ? '1' : undefined })} /> Detallado
        </label>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
