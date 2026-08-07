'use client'
import { useState, useTransition, useMemo } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Cliente, ClienteForm } from '@/types'
import {
  createCliente,
  updateCliente,
  toggleClienteActivo,
  deleteCliente,
} from './actions'
import styles from './clientes.module.css'

interface Props {
  clientes: Cliente[]
}

const EMPTY_FORM: ClienteForm = {
  nombre: '',
  rtn: '',
  identidad: '',
  tipo_cliente: 'final',
  exonerado: false,
  constancia_exonerado: '',
  registro_sag: '',
  direccion: '',
  telefono: '',
  correo: '',
  notas: '',
}

function clienteAForm(c: Cliente): ClienteForm {
  return {
    nombre: c.nombre,
    rtn: c.rtn ?? '',
    identidad: c.identidad ?? '',
    tipo_cliente: c.tipo_cliente,
    exonerado: c.exonerado,
    constancia_exonerado: c.constancia_exonerado ?? '',
    registro_sag: c.registro_sag ?? '',
    direccion: c.direccion ?? '',
    telefono: c.telefono ?? '',
    correo: c.correo ?? '',
    notas: c.notas ?? '',
  }
}

export default function ClientesClient({ clientes }: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState<ClienteForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    if (!search.trim()) return clientes
    const q = search.toLowerCase()
    return clientes.filter(
      c =>
        c.nombre.toLowerCase().includes(q) ||
        c.rtn?.toLowerCase().includes(q)
    )
  }, [clientes, search])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: Cliente) {
    setForm(clienteAForm(c))
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
      await toggleClienteActivo(id, activo)
    })
  }

  function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer. Si solo quieres ocultarlo, usa "Desactivar".`)) return
    startTransition(async () => {
      const result = await deleteCliente(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }

    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateCliente(editing.id, form)
        : await createCliente(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Clientes</h1>
          <p className={styles.subtitle}>{filtered.length} de {clientes.length} clientes</p>
        </div>
        <div className={styles.actions}>
          <input
            type="text"
            placeholder="Buscar por nombre o RTN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.search}
          />
          <button className={`${styles.btnPrimary} btnMerlinPrimary`} onClick={openCreate}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RTN</th>
              <th>Tipo</th>
              <th>Exonerado</th>
              <th>Teléfono</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td>
                  <div className={styles.clienteName}>{c.nombre}</div>
                  {c.correo && <div className={styles.clienteMeta}>{c.correo}</div>}
                </td>
                <td>{c.rtn ?? '—'}</td>
                <td>
                  <span className={c.tipo_cliente === 'revendedor' ? styles.badgeRevendedor : styles.badgeFinal}>
                    {c.tipo_cliente === 'revendedor' ? 'Revendedor' : 'Final'}
                  </span>
                </td>
                <td>
                  <span className={c.exonerado ? styles.badgeExonerado : styles.badgeNoExonerado}>
                    {c.exonerado ? 'Sí' : 'No'}
                  </span>
                </td>
                <td>{c.telefono ?? '—'}</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={checked => handleToggle(c.id, checked)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(c)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(c.id, c.nombre)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {search ? `No hay clientes que coincidan con "${search}"` : 'No hay clientes aún.'}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}
          onClose={closeModal}
          maxWidth="560px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formRow}>
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
                Tipo de cliente
                <select
                  value={form.tipo_cliente}
                  onChange={e => setForm(p => ({ ...p, tipo_cliente: e.target.value as ClienteForm['tipo_cliente'] }))}
                >
                  <option value="final">Consumidor final</option>
                  <option value="revendedor">Revendedor</option>
                </select>
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                RTN (14 dígitos, opcional)
                <input
                  type="text"
                  value={form.rtn}
                  onChange={e => setForm(p => ({ ...p, rtn: e.target.value }))}
                  placeholder="08011990123456"
                />
              </label>
              <label className={styles.formLabel}>
                Identidad
                <input
                  type="text"
                  value={form.identidad}
                  onChange={e => setForm(p => ({ ...p, identidad: e.target.value }))}
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Teléfono
                <input
                  type="text"
                  value={form.telefono}
                  onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                />
              </label>
              <label className={styles.formLabel}>
                Correo
                <input
                  type="email"
                  value={form.correo}
                  onChange={e => setForm(p => ({ ...p, correo: e.target.value }))}
                />
              </label>
            </div>
            <label className={styles.formLabel}>
              Dirección
              <input
                type="text"
                value={form.direccion}
                onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
              />
            </label>
            <div className={styles.formChecks}>
              <Toggle
                checked={form.exonerado}
                onChange={v => setForm(p => (
                  v
                    ? { ...p, exonerado: v }
                    : { ...p, exonerado: v, constancia_exonerado: '', registro_sag: '' }
                ))}
                label="Exonerado"
              />
            </div>
            {form.exonerado && (
              <div className={styles.formRow}>
                <label className={styles.formLabel}>
                  N.º de constancia de exoneración
                  <input
                    type="text"
                    value={form.constancia_exonerado}
                    onChange={e => setForm(p => ({ ...p, constancia_exonerado: e.target.value }))}
                  />
                </label>
                <label className={styles.formLabel}>
                  Registro SAG (opcional)
                  <input
                    type="text"
                    value={form.registro_sag}
                    onChange={e => setForm(p => ({ ...p, registro_sag: e.target.value }))}
                  />
                </label>
              </div>
            )}
            <label className={styles.formLabel}>
              Notas
              <textarea
                value={form.notas}
                onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                rows={3}
              />
            </label>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={`${styles.btnPrimary} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
