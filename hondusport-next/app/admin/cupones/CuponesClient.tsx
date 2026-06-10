'use client'
import { useState, useTransition } from 'react'
import Toggle from '@/components/admin/Toggle'
import Modal from '@/components/admin/Modal'
import type { Cupon } from '@/types'
import { createCupon, toggleCupon, deleteCupon } from './actions'
import styles from './cupones.module.css'

interface Props { cupones: Cupon[] }

export default function CuponesClient({ cupones }: Props) {
  const [modal, setModal] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [descuento, setDescuento] = useState<number>(10)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) { setFormError('El código es requerido'); return }
    if (descuento <= 0 || descuento > 100) { setFormError('El descuento debe estar entre 1 y 100'); return }
    setFormError('')
    startTransition(async () => {
      const result = await createCupon(codigo, descuento)
      if (result.error) { setFormError(result.error); return }
      setCodigo('')
      setDescuento(10)
      setModal(false)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Cupones</h1>
        <button className={styles.btnPrimary} onClick={() => setModal(true)}>+ Nuevo cupón</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descuento</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cupones.map(c => (
              <tr key={c.id}>
                <td><span className={styles.code}>{c.codigo}</span></td>
                <td>{c.descuento}%</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={v => startTransition(async () => { await toggleCupon(c.id, v) })}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <button
                    className={styles.btnDelete}
                    onClick={() => {
                      if (!confirm(`¿Eliminar cupón "${c.codigo}"?`)) return
                      startTransition(async () => { await deleteCupon(c.id) })
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cupones.length === 0 && <div className={styles.empty}>No hay cupones aún.</div>}
      </div>

      {modal && (
        <Modal title="Nuevo cupón" onClose={() => setModal(false)} maxWidth="400px">
          <form onSubmit={handleCreate} className={styles.form}>
            <label className={styles.formLabel}>
              Código (se guarda en mayúsculas)
              <input
                type="text"
                value={codigo}
                onChange={e => setCodigo(e.target.value.toUpperCase())}
                placeholder="HONDUSPORT10"
                required
              />
            </label>
            <label className={styles.formLabel}>
              Descuento (%)
              <input
                type="number"
                value={descuento}
                onChange={e => setDescuento(parseInt(e.target.value) || 0)}
                min="1"
                max="100"
                required
              />
            </label>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Creando…' : 'Crear cupón'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
