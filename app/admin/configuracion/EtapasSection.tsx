'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { CotizacionEtapa, CotizacionEtapaTipo, EtapaForm } from '@/types'
import { actualizarEtapa, crearEtapa, eliminarEtapa, reordenarEtapas, toggleEtapaActivo } from './etapasActions'
import styles from './EtapasSection.module.css'

interface Props {
  etapas: CotizacionEtapa[]
}

const TIPO_LABEL: Record<CotizacionEtapaTipo, string> = {
  abierta: 'Abierta',
  ganada: 'Ganada',
  perdida: 'Perdida',
}

const EMPTY_ETAPA: EtapaForm = { nombre: '', tipo: 'abierta', color: '#c9a84c' }

// Mismo patrón que EstadoCell de PosSection.tsx (badge + Toggle) para
// mantener consistencia visual entre secciones de Configuración.
function EstadoCell({ activo, onToggle, disabled }: { activo: boolean; onToggle: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.estadoCell}>
      <span className={activo ? styles.badgeActivo : styles.badgeInactivo}>{activo ? 'Activa' : 'Oculta'}</span>
      <Toggle checked={activo} onChange={onToggle} disabled={disabled} />
    </div>
  )
}

export default function EtapasSection({ etapas }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<CotizacionEtapa | null>(null)
  const [form, setForm] = useState<EtapaForm>(EMPTY_ETAPA)
  const [formError, setFormError] = useState('')
  const [listError, setListError] = useState('')
  const [isPending, startTransition] = useTransition()

  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden)

  function openCreate() {
    setForm(EMPTY_ETAPA)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(etapa: CotizacionEtapa) {
    setForm({ nombre: etapa.nombre, tipo: etapa.tipo, color: etapa.color })
    setFormError('')
    setEditing(etapa)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await actualizarEtapa(editing.id, form)
        : await crearEtapa(form)
      if (!result.ok) { setFormError(result.error); return }
      closeModal()
    })
  }

  // Intercambia la etapa con su vecina (arriba/abajo) y manda el orden
  // completo resultante a reordenarEtapas, que fija `orden` por posición.
  function mover(id: string, direccion: -1 | 1) {
    const idx = ordenadas.findIndex(e => e.id === id)
    const destino = idx + direccion
    if (idx === -1 || destino < 0 || destino >= ordenadas.length) return

    const ids = ordenadas.map(e => e.id)
    ;[ids[idx], ids[destino]] = [ids[destino], ids[idx]]

    setListError('')
    startTransition(async () => {
      const result = await reordenarEtapas(ids)
      if (!result.ok) setListError(result.error)
    })
  }

  function handleEliminar(etapa: CotizacionEtapa) {
    if (!window.confirm(`¿Eliminar la etapa "${etapa.nombre}"? Esta acción no se puede deshacer.`)) return
    setListError('')
    startTransition(async () => {
      const result = await eliminarEtapa(etapa.id)
      if (!result.ok) setListError(result.error)
    })
  }

  function handleToggle(etapa: CotizacionEtapa, activo: boolean) {
    setListError('')
    startTransition(async () => {
      const result = await toggleEtapaActivo(etapa.id, activo)
      if (!result.ok) setListError(result.error)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Etapas de cotización</h2>
          <p className={styles.subtitle}>Columnas del tablero kanban de cotizaciones</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nueva etapa
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Orden</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((etapa, idx) => (
              <tr key={etapa.id} className={etapa.activo ? undefined : styles.rowInactiva}>
                <td>
                  <span className={styles.colorDot} style={{ background: etapa.color }} />
                </td>
                <td>{etapa.nombre}</td>
                <td>{TIPO_LABEL[etapa.tipo]}</td>
                <td className={styles.mono}>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={`${styles.btnOrden} btnMerlinIcon`}
                      onClick={() => mover(etapa.id, -1)}
                      disabled={isPending || idx === 0}
                      aria-label={`Subir ${etapa.nombre}`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={`${styles.btnOrden} btnMerlinIcon`}
                      onClick={() => mover(etapa.id, 1)}
                      disabled={isPending || idx === ordenadas.length - 1}
                      aria-label={`Bajar ${etapa.nombre}`}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td>
                  <EstadoCell activo={etapa.activo} onToggle={v => handleToggle(etapa, v)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(etapa)}>Editar</button>
                    <button type="button" className={styles.btnEdit} onClick={() => handleEliminar(etapa)} disabled={isPending}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ordenadas.length === 0 && <div className={styles.empty}>No hay etapas registradas aún.</div>}
      </div>
      {listError && <p className={styles.formError}>{listError}</p>}

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar etapa' : 'Nueva etapa'} onClose={closeModal} maxWidth="420px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Enviada"
                required
              />
            </label>
            <label className={styles.formLabel}>
              Tipo
              <select
                value={form.tipo}
                onChange={e => setForm(p => ({ ...p, tipo: e.target.value as CotizacionEtapaTipo }))}
              >
                {Object.entries(TIPO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className={styles.formLabel}>
              Color
              <div className={styles.colorRow}>
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  className={styles.colorPicker}
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  placeholder="#c9a84c"
                  className={styles.colorText}
                />
              </div>
            </label>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button type="submit" className={`${styles.btnEdit} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear etapa'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
