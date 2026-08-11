'use client'
import { useState, useTransition } from 'react'
import { IconDescuentos } from '@/components/admin/icons'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import { formatPrice } from '@/lib/store/format'
import type { DescuentoPreset, DescuentoPresetTipo } from '@/types'
import {
  createDescuentoPreset, updateDescuentoPreset, toggleDescuentoPresetActivo,
  type DescuentoPresetForm,
} from './posActions'
import styles from './PosSection.module.css'

interface Props {
  descuentos: DescuentoPreset[]
}

const TIPO_LABEL: Record<DescuentoPresetTipo, string> = {
  porcentaje: 'Porcentaje',
  monto: 'Monto',
}

const EMPTY: DescuentoPresetForm = { etiqueta: '', tipo: 'porcentaje', valor: 0, orden: 0, activo: true }

function EstadoCell({ activo, onToggle, disabled }: { activo: boolean; onToggle: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.estadoCell}>
      <span className={activo ? styles.badgeActivo : styles.badgeInactivo}>{activo ? 'Activo' : 'Inactivo'}</span>
      <Toggle checked={activo} onChange={onToggle} disabled={disabled} />
    </div>
  )
}

function formatValor(tipo: DescuentoPresetTipo, valor: number): string {
  return tipo === 'porcentaje' ? `${valor}%` : formatPrice(valor)
}

// R2b Task 4: espeja MetodosPagoSection.tsx — pestaña "Descuentos" en
// Configuración para el CRUD de presets de descuento del mostrador (POS).
export default function DescuentosSection({ descuentos }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<DescuentoPreset | null>(null)
  const [form, setForm] = useState<DescuentoPresetForm>(EMPTY)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(d: DescuentoPreset) {
    setForm({ etiqueta: d.etiqueta, tipo: d.tipo, valor: d.valor, orden: d.orden, activo: d.activo })
    setFormError('')
    setEditing(d)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      const result = await toggleDescuentoPresetActivo(id, activo)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateDescuentoPreset(editing.id, form)
        : await createDescuentoPreset(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}><IconDescuentos className="iconoMerlin" />Descuentos</h2>
          <p className={styles.subtitle}>Presets de descuento para el mostrador</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nuevo descuento
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Etiqueta</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Orden</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {descuentos.map(d => (
              <tr key={d.id}>
                <td>{d.etiqueta}</td>
                <td>{TIPO_LABEL[d.tipo]}</td>
                <td className={styles.mono}>{formatValor(d.tipo, d.valor)}</td>
                <td className={styles.mono}>{d.orden}</td>
                <td>
                  <EstadoCell activo={d.activo} onToggle={checked => handleToggle(d.id, checked)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(d)}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {descuentos.length === 0 && <div className={styles.empty}>No hay descuentos preset registrados aún.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar descuento' : 'Nuevo descuento'} onClose={closeModal} maxWidth="480px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Etiqueta *
              <input
                type="text"
                value={form.etiqueta}
                onChange={e => setForm(p => ({ ...p, etiqueta: e.target.value }))}
                placeholder="Descuento empleado"
                required
              />
            </label>
            {modal === 'edit' ? (
              <div className={styles.formLabel}>
                Tipo
                <div className={styles.readOnlyValue}>{TIPO_LABEL[form.tipo]}</div>
                <span className={styles.helpText}>El tipo se fija al crear el descuento y no se puede cambiar.</span>
              </div>
            ) : (
              <label className={styles.formLabel}>
                Tipo
                <select
                  value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value as DescuentoPresetTipo }))}
                >
                  {Object.entries(TIPO_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.formLabel}>
              Valor
              <input
                type="number"
                min="0"
                max={form.tipo === 'porcentaje' ? 100 : undefined}
                value={form.valor}
                onChange={e => setForm(p => ({ ...p, valor: Number(e.target.value) }))}
              />
            </label>
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
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear descuento'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
