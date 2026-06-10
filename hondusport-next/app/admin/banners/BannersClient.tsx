'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import ImageUpload from '@/components/admin/ImageUpload'
import type { Banner } from '@/types'
import { createBanner, updateBanner, deleteBanner } from './actions'
import styles from './banners.module.css'

interface Props { banners: Banner[] }

const EMPTY = {
  titulo: '',
  subtitulo: '',
  btn_texto: 'Ver más',
  btn_link: '#tienda',
  imagen: '',
  orden: 0,
  activo: true,
}

export default function BannersClient({ banners }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openEdit(b: Banner) {
    setForm({
      titulo: b.titulo ?? '',
      subtitulo: b.subtitulo ?? '',
      btn_texto: b.btn_texto,
      btn_link: b.btn_link,
      imagen: b.imagen ?? '',
      orden: b.orden,
      activo: b.activo,
    })
    setEditing(b)
    setFormError('')
    setModal('edit')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateBanner(editing.id, form)
        : await createBanner(form)
      if (result.error) { setFormError(result.error); return }
      setModal(null)
    })
  }

  function handleToggle(b: Banner, value: boolean) {
    startTransition(async () => {
      const result = await updateBanner(b.id, {
        titulo: b.titulo ?? '',
        subtitulo: b.subtitulo ?? '',
        btn_texto: b.btn_texto,
        btn_link: b.btn_link,
        imagen: b.imagen ?? '',
        orden: b.orden,
        activo: value,
      })
      if (result.error) alert(result.error)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Banners</h1>
        <button className={styles.btnPrimary} onClick={() => { setForm({ ...EMPTY }); setEditing(null); setModal('create') }}>
          + Nuevo banner
        </button>
      </div>

      <div className={styles.grid}>
        {banners.map(b => (
          <div key={b.id} className={styles.card}>
            <div className={styles.cardImg}>
              {b.imagen
                ? <img src={b.imagen} alt={b.titulo ?? ''} className={styles.img} />
                : <div className={styles.noImg}>Sin imagen</div>
              }
              <div className={styles.cardBadge}>#{b.orden}</div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}>{b.titulo || '(sin título)'}</div>
              {b.subtitulo && <div className={styles.cardSub}>{b.subtitulo}</div>}
              <div className={styles.cardFooter}>
                <Toggle checked={b.activo} onChange={v => handleToggle(b, v)} disabled={isPending} />
                <div className={styles.cardActions}>
                  <button className={styles.btnEdit} onClick={() => openEdit(b)}>Editar</button>
                  <button className={styles.btnDelete} onClick={() => {
                    if (!confirm('¿Eliminar este banner?')) return
                    startTransition(async () => { await deleteBanner(b.id) })
                  }}>Eliminar</button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && <div className={styles.empty}>No hay banners configurados.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar banner' : 'Nuevo banner'} onClose={() => setModal(null)} maxWidth="600px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <ImageUpload
              bucket="banners"
              value={form.imagen}
              onChange={url => setForm(p => ({ ...p, imagen: url }))}
              label="Imagen del banner"
            />
            <label className={styles.formLabel}>
              Título
              <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
            </label>
            <label className={styles.formLabel}>
              Subtítulo
              <input type="text" value={form.subtitulo} onChange={e => setForm(p => ({ ...p, subtitulo: e.target.value }))} />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Texto del botón
                <input type="text" value={form.btn_texto} onChange={e => setForm(p => ({ ...p, btn_texto: e.target.value }))} />
              </label>
              <label className={styles.formLabel}>
                Link del botón
                <input type="text" value={form.btn_link} onChange={e => setForm(p => ({ ...p, btn_link: e.target.value }))} />
              </label>
            </div>
            <label className={styles.formLabel}>
              Orden
              <input type="number" value={form.orden} onChange={e => setForm(p => ({ ...p, orden: parseInt(e.target.value) || 0 }))} min="0" />
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
