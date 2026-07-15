'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Categoria } from '@/types'
import { createCategoria, updateCategoria, deleteCategoria } from './actions'
import styles from './categorias.module.css'

const TIPOS = ['cat', 'subcat', 'talla', 'genero'] as const
type TipoTab = typeof TIPOS[number]
const TIPO_LABEL: Record<TipoTab, string> = {
  cat: 'Categorías',
  subcat: 'Subcategorías',
  talla: 'Tallas',
  genero: 'Géneros',
}

interface Props { categorias: Categoria[] }

const EMPTY = {
  tipo: 'cat' as TipoTab,
  valor: '',
  slug: '',
  imagen: '',
  categorias_padre: [] as string[],
  orden: 0,
  activo: true,
}

export default function CategoriasClient({ categorias }: Props) {
  const [tab, setTab] = useState<TipoTab>('cat')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Categoria | null>(null)
  const [form, setForm] = useState({ ...EMPTY, tipo: 'cat' as TipoTab })
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  const inTab = categorias.filter(c => c.tipo === tab)

  function openCreate() {
    setForm({ ...EMPTY, tipo: tab })
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: Categoria) {
    setForm({
      tipo: c.tipo,
      valor: c.valor,
      slug: c.slug,
      imagen: c.imagen ?? '',
      categorias_padre: c.categorias_padre ?? [],
      orden: c.orden,
      activo: c.activo,
    })
    setFormError('')
    setEditing(c)
    setModal('edit')
  }

  function handleDelete(id: string, valor: string) {
    if (!confirm(`¿Eliminar "${valor}"?`)) return
    startTransition(async () => {
      const result = await deleteCategoria(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.valor.trim()) { setFormError('El valor es requerido'); return }
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateCategoria(editing.id, form)
        : await createCategoria(form)
      if (result.error) { setFormError(result.error); return }
      setModal(null)
    })
  }

  function handleToggle(c: Categoria, value: boolean) {
    startTransition(async () => {
      const result = await updateCategoria(c.id, {
        tipo: c.tipo,
        valor: c.valor,
        slug: c.slug,
        imagen: c.imagen ?? '',
        categorias_padre: c.categorias_padre ?? [],
        orden: c.orden,
        activo: value,
      })
      if (result.error) alert(result.error)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Categorías</h1>
        <button className={styles.btnPrimary} onClick={openCreate}>+ Nueva</button>
      </div>

      <div className={styles.tabs}>
        {TIPOS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {TIPO_LABEL[t]} ({categorias.filter(c => c.tipo === t).length})
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Valor</th>
              {(tab === 'subcat' || tab === 'talla') && <th>Categorías padre</th>}
              <th>Orden</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inTab.map(c => (
              <tr key={c.id}>
                <td>{c.valor}</td>
                {(tab === 'subcat' || tab === 'talla') && (
                  <td>{(c.categorias_padre ?? []).map(id => categorias.find(x => x.id === id)?.valor ?? id).join(', ') || '—'}</td>
                )}
                <td>{c.orden}</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={v => handleToggle(c, v)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(c)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(c.id, c.valor)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {inTab.length === 0 && (
          <div className={styles.empty}>No hay {TIPO_LABEL[tab].toLowerCase()} aún.</div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? `Editar ${TIPO_LABEL[form.tipo].slice(0,-1)}` : `Nueva ${TIPO_LABEL[tab].slice(0,-1)}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Valor *
              <input
                type="text"
                value={form.valor}
                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                required
              />
            </label>
            <label className={styles.formLabel}>
              Slug (URL)
              <input type="text" value={form.slug}
                onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                placeholder="se genera del valor si lo dejas vacio" />
            </label>
            {(form.tipo === 'subcat' || form.tipo === 'talla') && (
              <fieldset className={styles.formLabel}>
                <legend>Categorías padre</legend>
                {categorias.filter(x => x.tipo === 'cat').map(padre => (
                  <label key={padre.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <input type="checkbox"
                      checked={form.categorias_padre.includes(padre.id)}
                      onChange={e => setForm(p => ({
                        ...p,
                        categorias_padre: e.target.checked
                          ? [...p.categorias_padre, padre.id]
                          : p.categorias_padre.filter(id => id !== padre.id),
                      }))} />
                    {padre.valor}
                  </label>
                ))}
              </fieldset>
            )}
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Orden
                <input
                  type="number"
                  value={form.orden}
                  onChange={e => setForm(p => ({ ...p, orden: parseInt(e.target.value) || 0 }))}
                  min="0"
                />
              </label>
              <label className={styles.formLabel}>
                Imagen URL
                <input
                  type="url"
                  value={form.imagen}
                  onChange={e => setForm(p => ({ ...p, imagen: e.target.value }))}
                />
              </label>
            </div>
            <Toggle
              checked={form.activo}
              onChange={v => setForm(p => ({ ...p, activo: v }))}
              label="Activo"
            />
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
