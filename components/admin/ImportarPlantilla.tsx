'use client'
import { useState } from 'react'
import Modal from './Modal'
import { CAMPOS_PLATAFORMA, type Mapeo, type CampoPlataforma } from '@/lib/store/externalImport'
import styles from '@/app/admin/productos/productos.module.css'

type Paso = 'subir' | 'mapear' | 'preview'
interface ErrItem { sku: string | null; fila: number | null; motivo: string }
interface PreviewData {
  resumen: { crear: number; actualizar: number; conError: number }
  errores: ErrItem[]
  muestra: { sku: string; nombre?: string; precio?: string; stock?: string; tallas: string[]; colores: string[] }[]
}

export default function ImportarPlantilla() {
  const [abierto, setAbierto] = useState(false)
  const [paso, setPaso] = useState<Paso>('subir')
  const [file, setFile] = useState<File | null>(null)
  const [columnas, setColumnas] = useState<string[]>([])
  const [mapeo, setMapeo] = useState<Mapeo>({})
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  function reset() { setPaso('subir'); setFile(null); setColumnas([]); setMapeo({}); setPreview(null); setError('') }
  function abrir() { reset(); setAbierto(true) }
  function cerrar() { setAbierto(false) }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFile(f); setError(''); setCargando(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await fetch('/api/inventario/plantilla/columnas', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al leer el archivo'); return }
      setColumnas(json.columnas)
      const base: Mapeo = { ...json.sugerencia }
      if (json.guardado) {
        for (const [k, v] of Object.entries(json.guardado as Mapeo)) {
          if (v && json.columnas.includes(v)) base[k as CampoPlataforma] = v
        }
      }
      setMapeo(base); setPaso('mapear')
    } catch { setError('No se pudo leer el archivo.') }
    finally { setCargando(false); e.target.value = '' }
  }

  function setCampo(campo: CampoPlataforma, col: string) {
    setMapeo(m => { const n = { ...m }; if (col) n[campo] = col; else delete n[campo]; return n })
  }

  const obligatoriosOk = CAMPOS_PLATAFORMA.filter(c => c.obligatorio).every(c => mapeo[c.campo])

  async function enviar(confirmar: boolean) {
    if (!file) return
    setCargando(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('mapeo', JSON.stringify(mapeo)); fd.append('confirmar', String(confirmar))
      const res = await fetch('/api/inventario/plantilla/importar', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al procesar')
        if (json.errores) setPreview(p => (p ? { ...p, errores: json.errores } : p))
        return
      }
      if (confirmar) { window.location.reload(); return }
      setPreview(json); setPaso('preview')
    } catch { setError('No se pudo procesar (error de red).') }
    finally { setCargando(false) }
  }

  return (
    <>
      <button className={styles.btnSecondary} onClick={abrir} type="button">↑ Importar plantilla</button>
      {abierto && (
        <Modal title="Importar plantilla externa" onClose={cerrar} maxWidth="720px">
          {error && <p className={styles.formError}>{error}</p>}

          {paso === 'subir' && (
            <div>
              <p>Sube un archivo .xlsx de otro programa. Luego eliges qué columna corresponde a cada campo.</p>
              <label className={styles.btnSecondary}>
                {cargando ? 'Leyendo…' : 'Elegir archivo'}
                <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} disabled={cargando} />
              </label>
            </div>
          )}

          {paso === 'mapear' && (
            <div>
              <p>Asigna cada campo a una columna del archivo. Los marcados con * son obligatorios.</p>
              <table className={styles.table}>
                <thead><tr><th>Campo de la plataforma</th><th>Columna del archivo</th></tr></thead>
                <tbody>
                  {CAMPOS_PLATAFORMA.map(({ campo, label, obligatorio }) => (
                    <tr key={campo}>
                      <td>{label}{obligatorio ? ' *' : ''}</td>
                      <td>
                        <select value={mapeo[campo] ?? ''} onChange={e => setCampo(campo, e.target.value)}>
                          <option value="">— ninguna —</option>
                          {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button className={styles.btnCancel} onClick={() => setPaso('subir')} type="button">Atrás</button>
                <button className={styles.btnPrimary} onClick={() => enviar(false)} disabled={!obligatoriosOk || cargando} type="button">
                  {cargando ? 'Procesando…' : 'Ver preview'}
                </button>
              </div>
            </div>
          )}

          {paso === 'preview' && preview && (
            <div>
              <p>Resumen: <b>{preview.resumen.crear}</b> a crear, <b>{preview.resumen.actualizar}</b> a actualizar, <b>{preview.resumen.conError}</b> con error.</p>
              {preview.errores.length > 0 && (
                <div>
                  <p>Errores (no se aplicará nada hasta corregirlos):</p>
                  <ul>
                    {preview.errores.slice(0, 50).map((er, i) => (
                      <li key={i}>{er.sku ? `SKU ${er.sku}` : `fila ${er.fila}`}: {er.motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.errores.length === 0 && preview.muestra.length > 0 && (
                <div>
                  <p>Muestra:</p>
                  <table className={styles.table}>
                    <thead><tr><th>SKU</th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Tallas</th><th>Colores</th></tr></thead>
                    <tbody>
                      {preview.muestra.map((m, i) => (
                        <tr key={`${m.sku}-${i}`}>
                          <td>{m.sku}</td><td>{m.nombre}</td><td>{m.precio}</td><td>{m.stock}</td>
                          <td>{m.tallas.join(', ')}</td><td>{m.colores.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button className={styles.btnCancel} onClick={() => setPaso('mapear')} type="button">Atrás</button>
                <button className={styles.btnPrimary} onClick={() => enviar(true)} disabled={preview.errores.length > 0 || cargando} type="button">
                  {cargando ? 'Importando…' : 'Confirmar import'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
