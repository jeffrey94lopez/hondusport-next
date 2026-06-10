'use client'
import { useState } from 'react'
import type { ConfigMap } from '@/types'
import Toggle from '@/components/admin/Toggle'
import { saveConfig } from './actions'
import styles from './config.module.css'

interface Props {
  config: ConfigMap
}

type SectionStatus = { saving: boolean; success: boolean; error: string }
const defaultStatus = (): SectionStatus => ({ saving: false, success: false, error: '' })

const SECTION_KEYS = {
  identidad: ['site_name', 'eslogan', 'logo_url', 'color_principal'],
  contacto: ['whatsapp_principal', 'whatsapp_secundario', 'email_contacto', 'direccion', 'ciudad', 'horario', 'moneda'],
  redes: ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok'],
  seo: ['site_url', 'meta_descripcion', 'og_image_url', 'ga_id', 'gtm_id'],
  funcionalidades: ['free_shipping_activo', 'free_shipping_minimo', 'cupones_popup_activo', 'promo_bar_activo', 'promo_bar_texto', 'modo_mantenimiento'],
} as const

type SectionKey = keyof typeof SECTION_KEYS

export default function ConfigClient({ config: initial }: Props) {
  const [cfg, setCfg] = useState<ConfigMap>(initial)
  const [status, setStatus] = useState<Record<SectionKey, SectionStatus>>({
    identidad: defaultStatus(),
    contacto: defaultStatus(),
    redes: defaultStatus(),
    seo: defaultStatus(),
    funcionalidades: defaultStatus(),
  })

  function set(key: string, value: string) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  function bool(key: string): boolean {
    return cfg[key] === 'true'
  }

  function setToggle(key: string, checked: boolean) {
    set(key, checked ? 'true' : 'false')
  }

  async function handleSave(section: SectionKey) {
    setStatus(prev => ({ ...prev, [section]: { saving: true, success: false, error: '' } }))
    const keys = SECTION_KEYS[section] as readonly string[]
    const updates: Record<string, string> = {}
    for (const k of keys) {
      updates[k] = cfg[k] ?? ''
    }
    const result = await saveConfig(updates)
    if (result.error) {
      setStatus(prev => ({ ...prev, [section]: { saving: false, success: false, error: result.error! } }))
    } else {
      setStatus(prev => ({ ...prev, [section]: { saving: false, success: true, error: '' } }))
      setTimeout(() => {
        setStatus(prev => ({ ...prev, [section]: defaultStatus() }))
      }, 3000)
    }
  }

  function SaveRow({ section }: { section: SectionKey }) {
    const s = status[section]
    return (
      <div className={styles.saveRow}>
        {s.success && <span className={styles.successMsg}>Guardado correctamente</span>}
        {s.error && <span className={styles.errorMsg}>{s.error}</span>}
        <button
          className={styles.btnSave}
          disabled={s.saving}
          onClick={() => handleSave(section)}
        >
          {s.saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Configuración</h1>
          <p className={styles.subtitle}>Ajustes generales de la tienda</p>
        </div>
      </div>

      <div className={styles.sectionsGrid}>

        {/* ── Sección 1: Identidad ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Identidad</h2>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Nombre del sitio
              <input
                className="input"
                type="text"
                value={cfg.site_name ?? ''}
                onChange={e => set('site_name', e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Eslogan
              <input
                className="input"
                type="text"
                value={cfg.eslogan ?? ''}
                onChange={e => set('eslogan', e.target.value)}
              />
            </label>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Logo URL
              <input
                className="input"
                type="text"
                value={cfg.logo_url ?? ''}
                onChange={e => set('logo_url', e.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className={styles.fieldLabel}>
              Color principal
              <div className={styles.colorRow}>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={cfg.color_principal || '#C9A84C'}
                  onChange={e => set('color_principal', e.target.value)}
                />
                <input
                  className={`input ${styles.colorHex}`}
                  type="text"
                  value={cfg.color_principal ?? '#C9A84C'}
                  onChange={e => set('color_principal', e.target.value)}
                  maxLength={7}
                />
              </div>
            </label>
          </div>

          <SaveRow section="identidad" />
        </section>

        {/* ── Sección 2: Contacto & Ubicación ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Contacto &amp; Ubicación</h2>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              WhatsApp principal
              <input
                className="input"
                type="text"
                value={cfg.whatsapp_principal ?? ''}
                onChange={e => set('whatsapp_principal', e.target.value)}
                placeholder="+504..."
              />
            </label>
            <label className={styles.fieldLabel}>
              WhatsApp secundario
              <input
                className="input"
                type="text"
                value={cfg.whatsapp_secundario ?? ''}
                onChange={e => set('whatsapp_secundario', e.target.value)}
                placeholder="+504..."
              />
            </label>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Email de contacto
              <input
                className="input"
                type="email"
                value={cfg.email_contacto ?? ''}
                onChange={e => set('email_contacto', e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Moneda
              <input
                className="input"
                type="text"
                value={cfg.moneda ?? 'L.'}
                onChange={e => set('moneda', e.target.value)}
                placeholder="L."
              />
            </label>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Ciudad
              <input
                className="input"
                type="text"
                value={cfg.ciudad ?? ''}
                onChange={e => set('ciudad', e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              Horario
              <input
                className="input"
                type="text"
                value={cfg.horario ?? ''}
                onChange={e => set('horario', e.target.value)}
                placeholder="Lun–Sáb 8am–6pm"
              />
            </label>
          </div>

          <div className={styles.fieldRow1}>
            <label className={styles.fieldLabel}>
              Dirección
              <input
                className="input"
                type="text"
                value={cfg.direccion ?? ''}
                onChange={e => set('direccion', e.target.value)}
              />
            </label>
          </div>

          <SaveRow section="contacto" />
        </section>

        {/* ── Sección 3: Redes Sociales ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Redes Sociales</h2>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Instagram
              <input
                className="input"
                type="text"
                value={cfg.instagram ?? ''}
                onChange={e => set('instagram', e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </label>
            <label className={styles.fieldLabel}>
              Facebook
              <input
                className="input"
                type="text"
                value={cfg.facebook ?? ''}
                onChange={e => set('facebook', e.target.value)}
                placeholder="https://facebook.com/..."
              />
            </label>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Twitter / X
              <input
                className="input"
                type="text"
                value={cfg.twitter ?? ''}
                onChange={e => set('twitter', e.target.value)}
                placeholder="https://x.com/..."
              />
            </label>
            <label className={styles.fieldLabel}>
              YouTube
              <input
                className="input"
                type="text"
                value={cfg.youtube ?? ''}
                onChange={e => set('youtube', e.target.value)}
                placeholder="https://youtube.com/..."
              />
            </label>
          </div>

          <div className={styles.fieldRow1}>
            <label className={styles.fieldLabel}>
              TikTok
              <input
                className="input"
                type="text"
                value={cfg.tiktok ?? ''}
                onChange={e => set('tiktok', e.target.value)}
                placeholder="https://tiktok.com/..."
              />
            </label>
          </div>

          <SaveRow section="redes" />
        </section>

        {/* ── Sección 4: SEO ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>SEO</h2>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              URL del sitio
              <input
                className="input"
                type="text"
                value={cfg.site_url ?? ''}
                onChange={e => set('site_url', e.target.value)}
                placeholder="https://hondusport.hn"
              />
            </label>
            <label className={styles.fieldLabel}>
              OG Image URL
              <input
                className="input"
                type="text"
                value={cfg.og_image_url ?? ''}
                onChange={e => set('og_image_url', e.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              Google Analytics ID
              <input
                className="input"
                type="text"
                value={cfg.ga_id ?? ''}
                onChange={e => set('ga_id', e.target.value)}
                placeholder="G-XXXXXXXXXX"
              />
            </label>
            <label className={styles.fieldLabel}>
              Google Tag Manager ID
              <input
                className="input"
                type="text"
                value={cfg.gtm_id ?? ''}
                onChange={e => set('gtm_id', e.target.value)}
                placeholder="GTM-XXXXXXX"
              />
            </label>
          </div>

          <div className={styles.fieldRow1}>
            <label className={styles.fieldLabel}>
              Meta descripción
              <textarea
                className="input"
                rows={3}
                value={cfg.meta_descripcion ?? ''}
                onChange={e => set('meta_descripcion', e.target.value)}
                placeholder="Descripción breve del sitio para motores de búsqueda…"
                style={{ resize: 'vertical' }}
              />
            </label>
          </div>

          <SaveRow section="seo" />
        </section>

        {/* ── Sección 5: Funcionalidades ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Funcionalidades</h2>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Envío gratis</span>
            <Toggle
              checked={bool('free_shipping_activo')}
              onChange={v => setToggle('free_shipping_activo', v)}
            />
          </div>

          <div className={styles.fieldRow1} style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
            <label className={styles.fieldLabel}>
              Monto mínimo para envío gratis (L.)
              <input
                className="input"
                type="number"
                min={0}
                value={cfg.free_shipping_minimo ?? ''}
                onChange={e => set('free_shipping_minimo', e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Popup de cupones</span>
            <Toggle
              checked={bool('cupones_popup_activo')}
              onChange={v => setToggle('cupones_popup_activo', v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Barra promocional</span>
            <Toggle
              checked={bool('promo_bar_activo')}
              onChange={v => setToggle('promo_bar_activo', v)}
            />
          </div>

          <div className={styles.fieldRow1} style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
            <label className={styles.fieldLabel}>
              Texto de la barra promocional
              <input
                className="input"
                type="text"
                value={cfg.promo_bar_texto ?? ''}
                onChange={e => set('promo_bar_texto', e.target.value)}
                placeholder="¡Envío gratis en compras mayores a L.500!"
              />
            </label>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Modo mantenimiento</span>
            <Toggle
              checked={bool('modo_mantenimiento')}
              onChange={v => setToggle('modo_mantenimiento', v)}
            />
          </div>

          <SaveRow section="funcionalidades" />
        </section>

        {/* ── Sección 6: Usuarios ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Usuarios</h2>
          <p className={styles.notice}>
            La gestión de usuarios se realiza desde el panel de Supabase Auth.
            Contacta al administrador para agregar o eliminar accesos.
          </p>
        </section>

      </div>
    </div>
  )
}
