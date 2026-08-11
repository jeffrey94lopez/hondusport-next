'use client'
import { useState, useTransition } from 'react'
import { IconMetodosPago } from '@/components/admin/icons'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { MetodoPago, MetodoPagoTipo } from '@/types'
import {
  createMetodoPago, updateMetodoPago, toggleMetodoPagoActivo,
  type MetodoPagoForm,
} from './posActions'
import styles from './PosSection.module.css'

interface Props {
  metodos: MetodoPago[]
}

const TIPO_LABEL: Record<MetodoPagoTipo, string> = {
  efectivo_lps: 'Efectivo (Lempiras)',
  efectivo_usd: 'Efectivo (Dólares)',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia / Depósito',
  otro: 'Otro',
  credito: 'Crédito',
  saldo_favor: 'Saldo a favor',
}

const EMPTY_METODO: MetodoPagoForm = { nombre: '', tipo: 'efectivo_lps', orden: 0, activo: true }

function EstadoCell({ activo, onToggle, disabled }: { activo: boolean; onToggle: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.estadoCell}>
      <span className={activo ? styles.badgeActivo : styles.badgeInactivo}>{activo ? 'Activo' : 'Inactivo'}</span>
      <Toggle checked={activo} onChange={onToggle} disabled={disabled} />
    </div>
  )
}

// Task 6 (R2a): extraído de PosSection para tener su propia pestaña
// "Métodos de pago" en Configuración, separada de cajas/vendedores/POS.
// Mismos server actions de posActions.ts, sin cambios de lógica.
export default function MetodosPagoSection({ metodos }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<MetodoPago | null>(null)
  const [form, setForm] = useState<MetodoPagoForm>(EMPTY_METODO)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_METODO)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(m: MetodoPago) {
    setForm({ nombre: m.nombre, tipo: m.tipo, orden: m.orden, activo: m.activo })
    setFormError('')
    setEditing(m)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      const result = await toggleMetodoPagoActivo(id, activo)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateMetodoPago(editing.id, form)
        : await createMetodoPago(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}><IconMetodosPago className="iconoMerlin" />Métodos de pago</h2>
          <p className={styles.subtitle}>Formas de pago disponibles en caja</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nuevo método
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Orden</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {metodos.map(m => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>{TIPO_LABEL[m.tipo]}</td>
                <td className={styles.mono}>{m.orden}</td>
                <td>
                  <EstadoCell activo={m.activo} onToggle={checked => handleToggle(m.id, checked)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(m)}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {metodos.length === 0 && <div className={styles.empty}>No hay métodos de pago registrados aún.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar método de pago' : 'Nuevo método de pago'} onClose={closeModal} maxWidth="480px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Efectivo L."
                required
              />
            </label>
            {modal === 'edit' ? (
              <div className={styles.formLabel}>
                Tipo
                <div className={styles.readOnlyValue}>{TIPO_LABEL[form.tipo]}</div>
                <span className={styles.helpText}>El tipo se fija al crear el método y no se puede cambiar.</span>
              </div>
            ) : (
              <label className={styles.formLabel}>
                Tipo
                <select
                  value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value as MetodoPagoTipo }))}
                >
                  {Object.entries(TIPO_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.formLabel}>
              Orden
              <input
                type="number"
                min="0"
                value={form.orden}
                onChange={e => setForm(p => ({ ...p, orden: Number(e.target.value) }))}
              />
            </label>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button type="submit" className={`${styles.btnEdit} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear método'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
