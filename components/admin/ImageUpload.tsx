'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import styles from './ImageUpload.module.css'

interface Props {
  bucket: 'productos' | 'banners'
  value: string
  onChange: (url: string) => void
  label?: string
}

export default function ImageUpload({ bucket, value, onChange, label = 'Imagen' }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true })
    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.labelText}>{label}</span>
      {value && (
        <div className={styles.preview}>
          <img src={value} alt="preview" className={styles.previewImg} />
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onChange('')}
          >
            ×
          </button>
        </div>
      )}
      {!value && (
        <label className={`${styles.uploadBtn} ${uploading ? styles.uploading : ''}`}>
          {uploading ? 'Subiendo…' : '+ Subir imagen'}
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      )}
      {value && !uploading && (
        <label className={styles.changeBtn}>
          Cambiar imagen
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
