'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Envio } from '@/types'
import {
  createEnvio,
  updateEnvio,
  deleteEnvio,
  toggleEnvioActivo,
  updateFreeShipping,
  type EnvioForm,
} from './actions'
import styles from './envios.module.css'

interface Props {
  envios: Envio[]
  freeShippingActivo: boolean
  freeShippingMinimo: string
}

const EMPTY_FORM: EnvioForm = {
  nombre: '',
  descripcion: '',
  tipo: 'delivery',
  costo: 0,
  descuento: 0,
  activo: true,
}

export default function EnviosClient({ envios, freeShippingActivo, freeShippingMinimo }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Envio | null>(null)
  const [form, setForm] = useState<EnvioForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Free shipping local state
  const [fsActivo, setFsActivo] = useState(freeShippingActivo)
  const [fsMinimo, setFsMinimo] = useState(freeShippingMinimo)

  function handleFreeShippingToggle(checked: boolean) {
    setFsActivo(checked)
    startTransition(async () => {
      await updateFreeShipping(checked, parseFloat(fsMinimo) || 0)
    })
  }

  function handleMinimoBlur() {
    startTransition(async () => {
      await updateFreeShipping(fsActivo, parseFloat(fsMinimo) || 0)
    })
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(e: Envio) {
    setForm({
      nombre: e.nombre,
      descripcion: e.descripcion ?? '',
      tipo: e.tipo,
      costo: e.costo,
      descuento: e.descuento,
      activo: e.activo,
    })
    setFormError('')
    setEditing(e)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      await toggleEnvioActivo(id, activo)
    })
  }

  function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const result = await deleteEnvio(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) {
      setFormError('El nombre es requerido')
      return
    }

    startTransition(async () => {
      const result =
        modal === 'edit' && editing
          ? await updateEnvio(editing.id, form)
          : await createEnvio(form)
      if (result.error) {
        setFormError(result.error)
        return
      }
      closeModal()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Envíos</h1>
          <p className={styles.subtitle}>{envios.length} método{envios.length !== 1 ? 's' : ''} de envío</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Nuevo método
          </button>
        </div>
      </div>

      {/* Global free shipping card */}
      <div className={styles.globalCard}>
        <div className={styles.globalCardHeader}>
          <div className={styles.globalCardInfo}>
            <h2 className={styles.globalCardTitle}>Envío gratis</h2>
            <p className={styles.globalCardDesc}>
              Los clientes con pedidos sobre el monto mínimo no pagan envío
            </p>
          </div>
          <Toggle
            checked={fsActivo}
            onChange={handleFreeShippingToggle}
            disabled={isPending}
            label="Activar envío gratis"
          />
        </div>
        {fsActivo && (
          <div className={styles.globalCardBody}>
            <label className={styles.formLabel}>
              Monto mínimo (L.)
              <input
                type="number"
                value={fsMinimo}
                onChange={e => setFsMinimo(e.target.value)}
                onBlur={handleMinimoBlur}
                min="0"
                step="0.01"
                className={styles.minimoInput}
              />
            </label>
          </div>
        )}
      </div>

      {/* Table */}
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
            {envios.map(envio => (
              <tr key={envio.id}>
                <td>
                  <div className={styles.envioName}>{envio.nombre}</div>
                  {envio.descripcion && (
                    <div className={styles.envioDesc}>{envio.descripcion}</div>
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.tipoBadge} ${
                      envio.tipo === 'delivery' ? styles.tipoDelivery : styles.tipoPickup
                    }`}
                  >
                    {envio.tipo === 'delivery' ? 'Delivery' : 'Pickup'}
                  </span>
                </td>
                <td className={styles.costo}>L. {envio.costo.toLocaleString()}</td>
                <td className={styles.descuento}>
                  {envio.descuento > 0 ? `${envio.descuento}%` : '—'}
                </td>
                <td>
                  <Toggle
                    checked={envio.activo}
                    onChange={checked => handleToggle(envio.id, checked)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(envio)}>
                      Editar
                    </button>
                    <button
                      className={styles.btnDelete}
                      onClick={() => handleDelete(envio.id, envio.nombre)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {envios.length === 0 && (
          <div className={styles.empty}>No hay métodos de envío configurados.</div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar método de envío' : 'Nuevo método de envío'}
          onClose={closeModal}
          maxWidth="520px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                required
              />
            </label>
            <label className={styles.formLabel}>
              Descripción
              <textarea
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                rows={2}
              />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Tipo
                <select
                  value={form.tipo}
                  onChange={e =>
                    setForm(p => ({ ...p, tipo: e.target.value as 'delivery' | 'pickup' }))
                  }
                >
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Pickup</option>
                </select>
              </label>
              <label className={styles.formLabel}>
                Costo (L.)
                <input
                  type="number"
                  value={form.costo}
                  onChange={e =>
                    setForm(p => ({ ...p, costo: parseFloat(e.target.value) || 0 }))
                  }
                  min="0"
                  step="0.01"
                />
              </label>
            </div>
            <label className={styles.formLabel}>
              Descuento (%)
              <input
                type="number"
                value={form.descuento}
                onChange={e =>
                  setForm(p => ({ ...p, descuento: parseFloat(e.target.value) || 0 }))
                }
                min="0"
                max="100"
                step="0.01"
              />
            </label>
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
                {isPending
                  ? 'Guardando…'
                  : modal === 'edit'
                  ? 'Guardar cambios'
                  : 'Crear método'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
