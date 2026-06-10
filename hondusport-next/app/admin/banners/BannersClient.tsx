'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import ImageUpload from '@/components/admin/ImageUpload'
import type { Banner } from '@/types'
import {
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActivo,
} from './actions'
import type { BannerForm } from './actions'
import styles from './banners.module.css'

interface Props {
  banners: Banner[]
}

const EMPTY_FORM: BannerForm = {
  titulo: '',
  subtitulo: '',
  btn_texto: 'Ver más',
  btn_link: '#tienda',
  imagen: null,
  orden: 1,
  activo: true,
}

export default function BannersClient({ banners }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(b: Banner) {
    setForm({
      titulo: b.titulo ?? '',
      subtitulo: b.subtitulo ?? '',
      btn_texto: b.btn_texto,
      btn_link: b.btn_link,
      imagen: b.imagen,
      orden: b.orden,
      activo: b.activo,
    })
    setFormError('')
    setEditing(b)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      await toggleBannerActivo(id, activo)
    })
  }

  function handleDelete(id: string, titulo: string) {
    if (!confirm(`¿Eliminar "${titulo || 'este banner'}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const result = await deleteBanner(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    startTransition(async () => {
      const result =
        modal === 'edit' && editing
          ? await updateBanner(editing.id, form)
          : await createBanner(form)
      if (result.error) {
        setFormError(result.error)
        return
      }
      closeModal()
    })
  }

  const f =
    (field: keyof BannerForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Banners</h1>
          <p className={styles.subtitle}>{banners.length} banner{banners.length !== 1 ? 's' : ''}</p>
        </div>
        <button className={styles.btnPrimary} onClick={openCreate}>
          + Nuevo banner
        </button>
      </div>

      <div className={styles.grid}>
        {banners.length === 0 && (
          <div className={styles.empty}>No hay banners aún. Crea el primero.</div>
        )}
        {banners.map(b => (
          <div key={b.id} className={styles.card}>
            {b.imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imagen} alt={b.titulo ?? 'Banner'} className={styles.cardImage} />
            ) : (
              <div className={styles.cardImagePlaceholder}>Sin imagen</div>
            )}
            <div className={styles.cardBody}>
              <p className={styles.cardTitle}>{b.titulo || '(sin título)'}</p>
              {b.subtitulo && <p className={styles.cardSubtitle}>{b.subtitulo}</p>}
            </div>
            <div className={styles.cardFooter}>
              <span className={styles.ordenBadge}>#{b.orden}</span>
              <Toggle
                checked={b.activo}
                onChange={checked => handleToggle(b.id, checked)}
                disabled={isPending}
              />
              <div className={styles.cardActions}>
                <button className={styles.btnEdit} onClick={() => openEdit(b)}>
                  Editar
                </button>
                <button
                  className={styles.btnDelete}
                  onClick={() => handleDelete(b.id, b.titulo ?? '')}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar banner' : 'Nuevo banner'}
          onClose={closeModal}
          maxWidth="600px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Imagen
              <ImageUpload
                bucket="banners"
                path="hero/"
                onUpload={url => setForm(prev => ({ ...prev, imagen: url }))}
                currentUrl={form.imagen}
              />
            </label>

            <label className={styles.formLabel}>
              Título
              <input type="text" value={form.titulo} onChange={f('titulo')} />
            </label>

            <label className={styles.formLabel}>
              Subtítulo
              <input type="text" value={form.subtitulo} onChange={f('subtitulo')} />
            </label>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Texto del botón
                <input type="text" value={form.btn_texto} onChange={f('btn_texto')} />
              </label>
              <label className={styles.formLabel}>
                Enlace del botón
                <input type="text" value={form.btn_link} onChange={f('btn_link')} />
              </label>
            </div>

            <label className={styles.formLabel}>
              Orden
              <input
                type="number"
                value={form.orden}
                onChange={e => setForm(prev => ({ ...prev, orden: parseInt(e.target.value) || 1 }))}
                min="1"
              />
            </label>

            <div className={styles.formChecks}>
              <Toggle
                checked={form.activo}
                onChange={v => setForm(prev => ({ ...prev, activo: v }))}
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
                  : 'Crear banner'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
