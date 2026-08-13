'use client'
import { useState } from 'react'
import { formatPrice } from '@/lib/store/format'
import type { GrupoCxc } from '@/types'
import styles from './cxc.module.css'

function IconoBuscar() {
  return (
    <svg className={styles.searchIcon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconoChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

export default function CxcCascada({ grupos, total, exportHref }: { grupos: GrupoCxc[]; total: number; exportHref: string }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState('')
  const visibles = grupos.filter(g => g.cliente.toLowerCase().includes(filtro.toLowerCase()))
  function toggle(id: string) {
    setAbiertos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  return (
    <>
      <div className={`${styles.controls} ${styles.noPrint}`}>
        <div className={styles.searchWrap}>
          <IconoBuscar />
          <input type="text" className={styles.filtro} placeholder="Filtrar cliente…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
        <span className={styles.etiqueta}>Total por cobrar: {formatPrice(total)}</span>
        <div className={styles.acciones}>
          <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
          <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <h1 className={styles.titulo}>Cuentas por cobrar</h1>
      <div className={styles.cascada}>
        {visibles.map(g => {
          const open = abiertos.has(g.clienteId)
          return (
            <div key={g.clienteId} className={styles.grupo}>
              <button type="button" className={styles.clienteRow} onClick={() => toggle(g.clienteId)} aria-expanded={open}>
                <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}><IconoChevron /></span>
                <span className={styles.clienteNombre}>{g.cliente}</span>
                <span className={styles.clienteMeta}>{g.docs.length} doc(s)</span>
                <span className={styles.clienteTotal}>{formatPrice(g.total)}</span>
              </button>
              <table className={`${styles.docs} ${open ? '' : styles.oculto}`}>
                <thead><tr><th>Número</th><th>Fecha</th><th>Vencimiento</th><th className={styles.num}>Días vencido</th><th className={styles.num}>Saldo</th></tr></thead>
                <tbody>
                  {g.docs.map(d => (
                    <tr key={d.documento_id} className={d.diasVencido > 0 ? styles.vencido : ''}>
                      <td>{d.numero}</td><td>{fmt(d.fecha)}</td><td>{fmt(d.vencimiento)}</td>
                      <td className={styles.num}>{d.diasVencido > 0 ? d.diasVencido : 0}</td>
                      <td className={styles.num}>{formatPrice(d.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
        {visibles.length === 0 && <div className={styles.vacio}>Sin cuentas por cobrar.</div>}
      </div>
    </>
  )
}

function fmt(s: string): string { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }
