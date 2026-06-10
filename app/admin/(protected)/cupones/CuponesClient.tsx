'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Cupon } from '@/types'
import {
  createCupon,
  updateCupon,
  deleteCupon,
  toggleCuponActivo,
  togglePopupActivo,
  type CuponForm,
} from './actions'
import styles from './cupones.module.css'

interface Props {
  cupones: Cupon[]
  popupActivo: boolean
}

const EMPTY_FORM: CuponForm = {
  codigo: '',
  descuento: 0,
  tipo: 'porcentaje',
  activo: true,
}

export default function CuponesClient({ cupones, popupActivo }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Cupon | null>(null)
  const [form, setForm] = useState<CuponForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: Cupon) {
    setForm({
      codigo: c.codigo,
      descuento: c.descuento,
      tipo: c.tipo,
      activo: c.activo,
    })
    setFormError('')
    setEditing(c)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggleCupon(id: string, activo: boolean) {
    startTransition(async () => {
      await toggleCuponActivo(id, activo)
    })
  }

  function handleTogglePopup(activo: boolean) {
    startTransition(async () => {
      await togglePopupActivo(activo)
    })
  }

  function handleDelete(id: string, codigo: string) {
    if (!confirm(`¿Eliminar el cupón "${codigo}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const result = await deleteCupon(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.codigo.trim()) { setFormError('El código es requerido'); return }
    if (form.descuento <= 0 || form.descuento > 100) {
      setFormError('El descuento debe ser entre 1 y 100')
      return
    }

    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateCupon(editing.id, form)
        : await createCupon(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Cupones</h1>
          <p className={styles.subtitle}>{cupones.length} cupón{cupones.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Nuevo cupón
          </button>
        </div>
      </div>

      <div className={styles.globalToggleCard}>
        <div className={styles.globalToggleInfo}>
          <span className={styles.globalToggleLabel}>Popup de cupón al salir</span>
          <span className={styles.globalToggleDesc}>
            Mostrar popup con código de descuento cuando el cliente intenta salir
          </span>
        </div>
        <Toggle
          checked={popupActivo}
          onChange={handleTogglePopup}
          disabled={isPending}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descuento</th>
              <th>Tipo</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cupones.map(c => (
              <tr key={c.id}>
                <td>
                  <span className={styles.codigoBadge}>{c.codigo}</span>
                </td>
                <td className={styles.descuento}>{c.descuento}%</td>
                <td className={styles.tipo}>{c.tipo}</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={checked => handleToggleCupon(c.id, checked)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(c)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(c.id, c.codigo)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cupones.length === 0 && (
          <div className={styles.empty}>No hay cupones aún.</div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar cupón' : 'Nuevo cupón'}
          onClose={closeModal}
          maxWidth="480px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Código *
              <input
                type="text"
                value={form.codigo}
                onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                placeholder="VERANO20"
                required
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Descuento (%) *
                <input
                  type="number"
                  value={form.descuento}
                  onChange={e => setForm(p => ({ ...p, descuento: parseFloat(e.target.value) || 0 }))}
                  min="1"
                  max="100"
                  step="1"
                  required
                />
              </label>
              <label className={styles.formLabel}>
                Tipo
                <select
                  value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                >
                  <option value="porcentaje">porcentaje</option>
                </select>
              </label>
            </div>
            <div className={styles.formChecks}>
              <Toggle
                checked={form.activo}
                onChange={v => setForm(p => ({ ...p, activo: v }))}
                label="Activo"
              />
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear cupón'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
