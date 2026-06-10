'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Envio } from '@/types'
import { createEnvio, updateEnvio, deleteEnvio } from './actions'
import styles from './envios.module.css'

interface Props { envios: Envio[] }

interface EnvioFormState {
  nombre: string
  descripcion: string
  tipo: 'delivery' | 'pickup'
  costo: number
  descuento: number
  activo: boolean
}

const EMPTY: EnvioFormState = {
  nombre: '',
  descripcion: '',
  tipo: 'delivery',
  costo: 0,
  descuento: 0,
  activo: true,
}

export default function EnviosClient({ envios }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Envio | null>(null)
  const [form, setForm] = useState<EnvioFormState>({ ...EMPTY })
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openEdit(e: Envio) {
    setForm({
      nombre: e.nombre,
      descripcion: e.descripcion ?? '',
      tipo: e.tipo,
      costo: e.costo,
      descuento: e.descuento,
      activo: e.activo,
    })
    setEditing(e)
    setFormError('')
    setModal('edit')
  }

  async function handleSubmit(evt: React.FormEvent) {
    evt.preventDefault()
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateEnvio(editing.id, form)
        : await createEnvio(form)
      if (result.error) { setFormError(result.error); return }
      setModal(null)
    })
  }

  function handleToggle(e: Envio, value: boolean) {
    startTransition(async () => {
      const result = await updateEnvio(e.id, {
        nombre: e.nombre,
        descripcion: e.descripcion ?? '',
        tipo: e.tipo,
        costo: e.costo,
        descuento: e.descuento,
        activo: value,
      })
      if (result.error) alert(result.error)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Opciones de Envío</h1>
        <button className={styles.btnPrimary} onClick={() => { setForm({ ...EMPTY }); setEditing(null); setModal('create') }}>
          + Nueva opción
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Costo</th>
              <th>Descuento</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {envios.map(e => (
              <tr key={e.id}>
                <td>
                  <div className={styles.nombre}>{e.nombre}</div>
                  {e.descripcion && <div className={styles.desc}>{e.descripcion}</div>}
                </td>
                <td><span className={`${styles.tipo} ${e.tipo === 'pickup' ? styles.pickup : ''}`}>{e.tipo}</span></td>
                <td>L. {e.costo.toLocaleString()}</td>
                <td>{e.descuento > 0 ? `${e.descuento}%` : '—'}</td>
                <td>
                  <Toggle checked={e.activo} onChange={v => handleToggle(e, v)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(e)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => {
                      if (!confirm(`¿Eliminar "${e.nombre}"?`)) return
                      startTransition(async () => { await deleteEnvio(e.id) })
                    }}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {envios.length === 0 && <div className={styles.empty}>No hay opciones de envío configuradas.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar envío' : 'Nueva opción de envío'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input type="text" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} required />
            </label>
            <label className={styles.formLabel}>
              Descripción
              <input type="text" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Entrega en 24-48h" />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Tipo
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as 'delivery' | 'pickup' }))}>
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Pickup en tienda</option>
                </select>
              </label>
              <label className={styles.formLabel}>
                Costo (L.)
                <input type="number" value={form.costo} onChange={e => setForm(p => ({ ...p, costo: parseFloat(e.target.value) || 0 }))} min="0" />
              </label>
            </div>
            <label className={styles.formLabel}>
              Descuento sobre costo (%)
              <input type="number" value={form.descuento} onChange={e => setForm(p => ({ ...p, descuento: parseFloat(e.target.value) || 0 }))} min="0" max="100" />
            </label>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
