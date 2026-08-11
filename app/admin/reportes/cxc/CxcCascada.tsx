'use client'
import { useState } from 'react'
import { formatPrice } from '@/lib/store/format'
import type { GrupoCxc } from '@/types'
import styles from './cxc.module.css'

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
        <input className={styles.filtro} placeholder="Filtrar cliente…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        <span className={styles.etiqueta}>Total por cobrar: {formatPrice(total)}</span>
        <div className={styles.acciones}>
          <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
          <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Cuentas por cobrar</h1>
        {visibles.map(g => {
          const open = abiertos.has(g.clienteId)
          return (
            <div key={g.clienteId} className={styles.grupo}>
              <button type="button" className={styles.clienteRow} onClick={() => toggle(g.clienteId)} aria-expanded={open}>
                <span className={styles.caret}>{open ? '▾' : '▸'}</span>
                <span className={styles.clienteNombre}>{g.cliente}</span>
                <span className={styles.clienteMeta}>{g.docs.length} doc(s)</span>
                <span className={styles.clienteTotal}>{formatPrice(g.total)}</span>
              </button>
              {(open || undefined) && (
                <table className={styles.docs}>
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
              )}
            </div>
          )
        })}
        {visibles.length === 0 && <div className={styles.vacio}>Sin cuentas por cobrar.</div>}
      </div>
    </>
  )
}

function fmt(s: string): string { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }
