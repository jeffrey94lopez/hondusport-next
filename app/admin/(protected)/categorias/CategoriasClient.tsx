'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Categoria } from '@/types'
import {
  createCategoria,
  updateCategoria,
  deleteCategoria,
  toggleCategoriaActivo,
  type CategoriaForm,
} from './actions'
import styles from './categorias.module.css'

interface Props {
  categorias: Categoria[]
}

type TipoTab = 'cat' | 'subcat' | 'talla' | 'genero'

const TABS: { key: TipoTab; label: string }[] = [
  { key: 'cat', label: 'Categorías' },
  { key: 'subcat', label: 'Subcategorías' },
  { key: 'talla', label: 'Tallas' },
  { key: 'genero', label: 'Género' },
]

const EMPTY_FORM = (tipo: TipoTab): CategoriaForm => ({
  tipo,
  valor: '',
  orden: 0,
  activo: true,
})

export default function CategoriasClient({ categorias }: Props) {
  const [activeTab, setActiveTab] = useState<TipoTab>('cat')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Categoria | null>(null)
  const [form, setForm] = useState<CategoriaForm>(EMPTY_FORM('cat'))
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  const byTipo = (tipo: TipoTab) => categorias.filter(c => c.tipo === tipo)
  const visible = byTipo(activeTab)

  function handleTabChange(tab: TipoTab) {
    setActiveTab(tab)
    setModal(null)
    setEditing(null)
    setFormError('')
  }

  function openCreate() {
    setForm(EMPTY_FORM(activeTab))
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: Categoria) {
    setForm({
      tipo: c.tipo,
      valor: c.valor,
      orden: c.orden,
      activo: c.activo,
    })
    setFormError('')
    setEditing(c)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
    setFormError('')
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      await toggleCategoriaActivo(id, activo)
    })
  }

  function handleDelete(id: string, valor: string) {
    if (!confirm(`¿Eliminar "${valor}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const result = await deleteCategoria(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.valor.trim()) {
      setFormError('El valor es requerido')
      return
    }

    startTransition(async () => {
      const result =
        modal === 'edit' && editing
          ? await updateCategoria(editing.id, form)
          : await createCategoria(form)
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
          <h1 className={styles.title}>Categorías</h1>
          <p className={styles.subtitle}>{categorias.length} entradas en total</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Nueva entrada
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.active : ''}`}
            onClick={() => handleTabChange(tab.key)}
            type="button"
          >
            {tab.label}
            <span className={styles.badge}>{byTipo(tab.key).length}</span>
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Valor</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(c => (
              <tr key={c.id}>
                <td>{c.orden}</td>
                <td>{c.valor}</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={checked => handleToggle(c.id, checked)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(c)}>
                      Editar
                    </button>
                    <button
                      className={styles.btnDelete}
                      onClick={() => handleDelete(c.id, c.valor)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className={styles.empty}>
            No hay entradas en esta categoría aún.
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar entrada' : 'Nueva entrada'}
          onClose={closeModal}
          maxWidth="480px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Tipo
              <select
                value={form.tipo}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    tipo: e.target.value as TipoTab,
                  }))
                }
              >
                {TABS.map(tab => (
                  <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.formLabel}>
              Valor *
              <input
                type="text"
                value={form.valor}
                onChange={e => setForm(prev => ({ ...prev, valor: e.target.value }))}
                required
                autoFocus
              />
            </label>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Orden
                <input
                  type="number"
                  value={form.orden}
                  onChange={e =>
                    setForm(prev => ({ ...prev, orden: parseInt(e.target.value) || 0 }))
                  }
                  min="0"
                />
              </label>
              <div className={styles.formLabel}>
                Activo
                <Toggle
                  checked={form.activo}
                  onChange={v => setForm(prev => ({ ...prev, activo: v }))}
                />
              </div>
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear entrada'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
