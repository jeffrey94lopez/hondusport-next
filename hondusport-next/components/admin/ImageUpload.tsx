'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-client'
import styles from './ImageUpload.module.css'

interface Props {
  bucket: string
  path: string
  onUpload: (url: string) => void
  currentUrl?: string | null
  accept?: string
}

export default function ImageUpload({
  bucket,
  path,
  onUpload,
  currentUrl,
  accept = 'image/*',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const filePath = `${path}${filename}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: false })

      if (uploadError) {
        setError(uploadError.message)
        return
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
      onUpload(data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={styles.wrapper}>
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="Preview" className={styles.preview} />
      )}
      <label className={`${styles.uploadBtn} ${loading ? styles.loading : ''}`}>
        {loading ? 'Subiendo…' : currentUrl ? 'Cambiar imagen' : 'Subir imagen'}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFile}
          disabled={loading}
          style={{ display: 'none' }}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
