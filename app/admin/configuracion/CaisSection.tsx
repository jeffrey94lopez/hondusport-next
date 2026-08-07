'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import { estadoCai, formatearCorrelativo } from '@/lib/pos/fiscal'
import type { CaiAutorizacion, CaiForm } from '@/types'
import { createCai, updateCai, toggleCaiActivo } from './caiActions'
import styles from './CaisSection.module.css'

interface Props { cais: CaiAutorizacion[] }

const EMPTY_FORM: CaiForm = {
  cai: '',
  establecimiento: '000',
  punto_emision: '001',
  tipo_documento: '01',
  rango_desde: 1,
  rango_hasta: 1000,
  fecha_limite: '',
  activo: true,
}

function caiAForm(c: CaiAutorizacion): CaiForm {
  return {
    cai: c.cai,
    establecimiento: c.establecimiento,
    punto_emision: c.punto_emision,
    tipo_documento: c.tipo_documento,
    rango_desde: c.rango_desde,
    rango_hasta: c.rango_hasta,
    fecha_limite: c.fecha_limite,
    activo: c.activo,
  }
}

export default function CaisSection({ cais }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<CaiAutorizacion | null>(null)
  const [form, setForm] = useState<CaiForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()
  // Se calcula una vez por render (no por fila) para las alertas de estadoCai.
  const HOY = new Date()

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: CaiAutorizacion) {
    setForm(caiAForm(c))
    setFormError('')
    setEditing(c)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      const result = await toggleCaiActivo(id, activo)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateCai(editing.id, form)
        : await createCai(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>CAIs</h2>
          <p className={styles.subtitle}>Autorizaciones de emisión de documentos fiscales</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nuevo CAI
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>CAI</th>
              <th>Identificador</th>
              <th>Rango</th>
              <th>Correlativo actual</th>
              <th>Fecha límite</th>
              <th>Estado</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cais.map(c => {
              const estado = estadoCai(c, HOY)
              const badgeClass = !estado.vigente
                ? styles.badgeVencido
                : estado.alerta
                  ? styles.badgeAlerta
                  : styles.badgeVigente
              const badgeLabel = !estado.vigente ? 'Vencido' : estado.alerta ? 'Por vencer' : 'Vigente'
              return (
                <tr key={c.id}>
                  <td className={styles.caiCode}>{c.cai}</td>
                  <td className={styles.mono}>{c.establecimiento}-{c.punto_emision}-{c.tipo_documento}</td>
                  <td className={styles.mono}>{c.rango_desde} – {c.rango_hasta}</td>
                  <td className={styles.mono}>{formatearCorrelativo(c, c.correlativo_actual)}</td>
                  <td>{new Date(c.fecha_limite + 'T00:00:00').toLocaleDateString('es-HN')}</td>
                  <td>
                    <span className={badgeClass}>
                      {badgeLabel}
                      {estado.alerta && <span className={styles.alertaDetalle}>{estado.alerta}</span>}
                    </span>
                  </td>
                  <td>
                    <Toggle
                      checked={c.activo}
                      onChange={checked => handleToggle(c.id, checked)}
                      disabled={isPending}
                    />
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.btnEdit} onClick={() => openEdit(c)}>Editar</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {cais.length === 0 && <div className={styles.empty}>No hay CAIs registrados aún.</div>}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar CAI' : 'Nuevo CAI'}
          onClose={closeModal}
          maxWidth="560px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              CAI *
              <input
                type="text"
                value={form.cai}
                onChange={e => setForm(p => ({ ...p, cai: e.target.value }))}
                placeholder="Código de autorización (SAR)"
                required
              />
            </label>
            <div className={styles.formRow3}>
              <label className={styles.formLabel}>
                Establecimiento
                <input
                  type="text"
                  value={form.establecimiento}
                  onChange={e => setForm(p => ({ ...p, establecimiento: e.target.value }))}
                  placeholder="000"
                  maxLength={3}
                />
              </label>
              <label className={styles.formLabel}>
                Punto de emisión
                <input
                  type="text"
                  value={form.punto_emision}
                  onChange={e => setForm(p => ({ ...p, punto_emision: e.target.value }))}
                  placeholder="001"
                  maxLength={3}
                />
              </label>
              <label className={styles.formLabel}>
                Tipo de documento
                <input
                  type="text"
                  value={form.tipo_documento}
                  onChange={e => setForm(p => ({ ...p, tipo_documento: e.target.value }))}
                  placeholder="01"
                  maxLength={2}
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Rango desde
                <input
                  type="number"
                  value={form.rango_desde}
                  onChange={e => setForm(p => ({ ...p, rango_desde: Number(e.target.value) }))}
                  min={1}
                />
              </label>
              <label className={styles.formLabel}>
                Rango hasta
                <input
                  type="number"
                  value={form.rango_hasta}
                  onChange={e => setForm(p => ({ ...p, rango_hasta: Number(e.target.value) }))}
                  min={form.rango_desde}
                />
              </label>
            </div>
            {modal === 'edit' && editing && (
              <div className={styles.formLabel}>
                Correlativo actual
                <div className={styles.readOnlyValue}>{formatearCorrelativo(editing, editing.correlativo_actual)}</div>
                <span className={styles.helpText}>Solo se fija al crear el CAI; avanza automáticamente con cada documento emitido.</span>
              </div>
            )}
            <label className={styles.formLabel}>
              Fecha límite
              <input
                type="date"
                value={form.fecha_limite}
                onChange={e => setForm(p => ({ ...p, fecha_limite: e.target.value }))}
                required
              />
            </label>
            <Toggle
              checked={form.activo}
              onChange={v => setForm(p => ({ ...p, activo: v }))}
              label="Activo"
            />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={`${styles.btnEdit} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear CAI'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
