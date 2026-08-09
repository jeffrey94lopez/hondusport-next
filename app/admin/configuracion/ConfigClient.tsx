'use client'
import { useState, useTransition } from 'react'
import ImageUpload from '@/components/admin/ImageUpload'
import Toggle from '@/components/admin/Toggle'
import { validarRtn } from '@/lib/pos/fiscal'
import type { CaiAutorizacion, Caja, ConfigMap, CotizacionEtapa, MetodoPago, Vendedor } from '@/types'
import { saveConfig } from './actions'
import CaisSection from './CaisSection'
import EtapasSection from './EtapasSection'
import PosSection from './PosSection'
import styles from './config.module.css'

interface Props {
  config: ConfigMap
  cais: CaiAutorizacion[]
  cajas: Caja[]
  vendedores: Vendedor[]
  metodos: MetodoPago[]
  etapas: CotizacionEtapa[]
}

const GRUPOS = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'facturador', label: 'Facturador' },
  { id: 'pos', label: 'POS' },
  { id: 'tienda', label: 'Tienda' },
] as const

type GrupoId = typeof GRUPOS[number]['id']

const SECTIONS = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'contacto', label: 'Contacto & Ubicación' },
  { id: 'redes', label: 'Redes Sociales' },
  { id: 'seo', label: 'SEO' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'usuarios', label: 'Usuarios' },
] as const

type SectionId = typeof SECTIONS[number]['id']

// Valores por defecto de claves nuevas: si aún no existen en la BD, se
// muestran (y se guardan) con este valor en vez de en blanco.
const DEFAULTS: ConfigMap = {
  cotizacion_estilo: 'ejecutivo',
  metodo_costeo: 'promedio',
  fiscal_leyenda: 'LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA',
}

export default function ConfigClient({ config: initial, cais, cajas, vendedores, metodos, etapas }: Props) {
  const [grupo, setGrupo] = useState<GrupoId>('empresa')
  const [tab, setTab] = useState<SectionId>('identidad')
  const [cfg, setCfg] = useState<ConfigMap>({ ...DEFAULTS, ...initial })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function set(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setCfg(c => ({ ...c, [key]: e.target.value }))
  }

  function setToggle(key: string) {
    return (checked: boolean) => setCfg(c => ({ ...c, [key]: checked ? 'true' : 'false' }))
  }

  function bool(key: string) { return cfg[key] === 'true' }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const rtn = (cfg.fiscal_rtn ?? '').trim()
    if (rtn) {
      const rtnError = validarRtn(rtn)
      if (rtnError) { setError(rtnError); return }
    }

    startTransition(async () => {
      const result = await saveConfig(cfg)
      if (result.error) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Configuración</h1>
        <button
          form="config-form"
          type="submit"
          className={`${styles.btnPrimary} ${saved ? styles.saved : ''}`}
          disabled={isPending}
        >
          {saved ? '✓ Guardado' : isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <div className={styles.tabs}>
        {GRUPOS.map(g => (
          <button
            key={g.id}
            type="button"
            className={`${styles.tab} ${grupo === g.id ? styles.tabActive : ''}`}
            onClick={() => setGrupo(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <form id="config-form" onSubmit={handleSave} className={styles.form}>
        {grupo === 'empresa' && (
          <div className={styles.section}>
            <label className={styles.formLabel}>
              Nombre comercial
              <input type="text" value={cfg.empresa_nombre_comercial ?? ''} onChange={set('empresa_nombre_comercial')} />
            </label>
            <div className={styles.formRow}>
              <ImageUpload
                bucket="banners"
                value={cfg.logo_url ?? ''}
                onChange={url => setCfg(c => ({ ...c, logo_url: url }))}
                label="Logo (documentos)"
              />
              <ImageUpload
                bucket="banners"
                value={cfg.empresa_icono_url ?? ''}
                onChange={url => setCfg(c => ({ ...c, empresa_icono_url: url }))}
                label="Ícono"
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Teléfono
                <input type="text" value={cfg.empresa_telefono ?? ''} onChange={set('empresa_telefono')} />
              </label>
              <label className={styles.formLabel}>
                Correo
                <input type="email" value={cfg.email_contacto ?? ''} onChange={set('email_contacto')} />
              </label>
            </div>
            <label className={styles.formLabel}>
              Dirección
              <input type="text" value={cfg.direccion ?? ''} onChange={set('direccion')} />
            </label>
            <label className={styles.formLabel}>
              Términos de cotización
              <textarea value={cfg.empresa_terminos_cotizacion ?? ''} onChange={set('empresa_terminos_cotizacion')} rows={3} />
            </label>
            <label className={styles.formLabel}>
              Términos de factura
              <textarea value={cfg.empresa_terminos_factura ?? ''} onChange={set('empresa_terminos_factura')} rows={3} />
            </label>
            <label className={styles.formLabel}>
              Estilo de cotización
              <select value={cfg.cotizacion_estilo ?? 'ejecutivo'} onChange={set('cotizacion_estilo')}>
                <option value="ejecutivo">Ejecutivo</option>
              </select>
            </label>
            <div className={styles.toggleRow}>
              <Toggle checked={bool('moneda_secundaria_activa')} onChange={setToggle('moneda_secundaria_activa')} label="Mostrar moneda secundaria (USD)" />
              <label className={styles.formLabel}>
                Tasa de cambio (L. por USD)
                <input type="number" step="0.01" min="0" value={cfg.tasa_cambio_usd ?? ''} onChange={set('tasa_cambio_usd')} />
              </label>
            </div>
          </div>
        )}

        {grupo === 'facturador' && (
          <div className={styles.section}>
            <label className={styles.formLabel}>
              RTN (14 dígitos)
              <input type="text" value={cfg.fiscal_rtn ?? ''} onChange={set('fiscal_rtn')} placeholder="08011990123456" />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Razón social
                <input type="text" value={cfg.fiscal_razon_social ?? ''} onChange={set('fiscal_razon_social')} />
              </label>
              <label className={styles.formLabel}>
                Nombre comercial
                <input type="text" value={cfg.fiscal_nombre_comercial ?? ''} onChange={set('fiscal_nombre_comercial')} />
              </label>
            </div>
            <label className={styles.formLabel}>
              Domicilio fiscal
              <input type="text" value={cfg.fiscal_domicilio ?? ''} onChange={set('fiscal_domicilio')} />
            </label>
            <label className={styles.formLabel}>
              Teléfono
              <input type="text" value={cfg.fiscal_telefono ?? ''} onChange={set('fiscal_telefono')} />
            </label>
            <label className={styles.formLabel}>
              Leyenda de factura
              <input type="text" value={cfg.fiscal_leyenda ?? ''} onChange={set('fiscal_leyenda')} />
            </label>
            <label className={styles.formLabel}>
              Método de costeo
              <select value={cfg.metodo_costeo ?? 'promedio'} onChange={set('metodo_costeo')}>
                <option value="promedio">Promedio ponderado</option>
                <option value="ultimo">Último costo</option>
              </select>
              <span className={styles.helpText}>El cambio aplica a entradas futuras.</span>
            </label>
          </div>
        )}

        {grupo === 'pos' && (
          <div className={styles.section}>
            <p className={styles.helpText}>
              Cajas, vendedores, métodos de pago y el límite para consumidor final del mostrador.
            </p>
          </div>
        )}

        {grupo === 'tienda' && (
          <>
            <div className={styles.tabs}>
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.tab} ${tab === s.id ? styles.tabActive : ''}`}
                  onClick={() => setTab(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {tab === 'identidad' && (
              <div className={styles.section}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>
                    Nombre del negocio
                    <input type="text" value={cfg.site_name ?? ''} onChange={set('site_name')} />
                  </label>
                  <label className={styles.formLabel}>
                    URL del sitio
                    <input type="url" value={cfg.site_url ?? ''} onChange={set('site_url')} />
                  </label>
                </div>
                <label className={styles.formLabel}>
                  Eslogan
                  <input type="text" value={cfg.eslogan ?? ''} onChange={set('eslogan')} />
                </label>
                <label className={styles.formLabel}>
                  Color principal
                  <div className={styles.colorRow}>
                    <input type="color" value={cfg.color_principal ?? '#C9A84C'} onChange={set('color_principal')} className={styles.colorPicker} />
                    <input type="text" value={cfg.color_principal ?? ''} onChange={set('color_principal')} placeholder="#C9A84C" className={styles.colorText} />
                  </div>
                </label>
                <ImageUpload
                  bucket="banners"
                  value={cfg.logo_url ?? ''}
                  onChange={url => setCfg(c => ({ ...c, logo_url: url }))}
                  label="Logo"
                />
              </div>
            )}

            {tab === 'contacto' && (
              <div className={styles.section}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>
                    WhatsApp principal
                    <input type="text" value={cfg.whatsapp_principal ?? ''} onChange={set('whatsapp_principal')} placeholder="50499999999" />
                  </label>
                  <label className={styles.formLabel}>
                    WhatsApp secundario
                    <input type="text" value={cfg.whatsapp_secundario ?? ''} onChange={set('whatsapp_secundario')} />
                  </label>
                </div>
                <label className={styles.formLabel}>
                  Email de contacto
                  <input type="email" value={cfg.email_contacto ?? ''} onChange={set('email_contacto')} />
                </label>
                <label className={styles.formLabel}>
                  Dirección
                  <input type="text" value={cfg.direccion ?? ''} onChange={set('direccion')} />
                </label>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>
                    Ciudad
                    <input type="text" value={cfg.ciudad ?? ''} onChange={set('ciudad')} />
                  </label>
                  <label className={styles.formLabel}>
                    Horario
                    <input type="text" value={cfg.horario ?? ''} onChange={set('horario')} placeholder="Lun-Sáb 9am-6pm" />
                  </label>
                </div>
              </div>
            )}

            {tab === 'redes' && (
              <div className={styles.section}>
                {(['instagram', 'facebook', 'twitter', 'youtube', 'tiktok'] as const).map(red => (
                  <label key={red} className={styles.formLabel}>
                    {red.charAt(0).toUpperCase() + red.slice(1)}
                    <input type="url" value={cfg[red] ?? ''} onChange={set(red)} placeholder={`https://${red}.com/...`} />
                  </label>
                ))}
              </div>
            )}

            {tab === 'seo' && (
              <div className={styles.section}>
                <label className={styles.formLabel}>
                  Meta descripción
                  <textarea value={cfg.meta_descripcion ?? ''} onChange={set('meta_descripcion')} rows={3} />
                </label>
                <ImageUpload
                  bucket="banners"
                  value={cfg.og_image_url ?? ''}
                  onChange={url => setCfg(c => ({ ...c, og_image_url: url }))}
                  label="OG Image (imagen para redes sociales)"
                />
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>
                    Google Analytics ID
                    <input type="text" value={cfg.ga_id ?? ''} onChange={set('ga_id')} placeholder="G-XXXXXXXXXX" />
                  </label>
                  <label className={styles.formLabel}>
                    Google Tag Manager ID
                    <input type="text" value={cfg.gtm_id ?? ''} onChange={set('gtm_id')} placeholder="GTM-XXXXXXX" />
                  </label>
                </div>
              </div>
            )}

            {tab === 'funcionalidades' && (
              <div className={styles.section}>
                <div className={styles.toggleRow}>
                  <Toggle checked={bool('free_shipping_activo')} onChange={setToggle('free_shipping_activo')} label="Barra de envío gratis" />
                  <label className={styles.formLabel}>
                    Mínimo para envío gratis (L.)
                    <input type="number" value={cfg.free_shipping_minimo ?? ''} onChange={set('free_shipping_minimo')} min="0" />
                  </label>
                </div>
                <div className={styles.toggleRow}>
                  <Toggle checked={bool('cupones_popup_activo')} onChange={setToggle('cupones_popup_activo')} label="Popup de cupón al salir" />
                </div>
                <div className={styles.toggleRow}>
                  <Toggle checked={bool('promo_bar_activo')} onChange={setToggle('promo_bar_activo')} label="Barra promocional superior" />
                  <label className={styles.formLabel}>
                    Texto de la barra
                    <input type="text" value={cfg.promo_bar_texto ?? ''} onChange={set('promo_bar_texto')} />
                  </label>
                </div>
                <div className={styles.toggleRow}>
                  <Toggle checked={bool('modo_mantenimiento')} onChange={setToggle('modo_mantenimiento')} label="Modo mantenimiento" />
                </div>
              </div>
            )}

            {tab === 'usuarios' && (
              <div className={styles.section}>
                <p className={styles.helpText}>
                  Los usuarios del admin se gestionan en el dashboard de Supabase → Authentication → Users.
                  Solo el propietario puede invitar nuevos usuarios desde allí.
                </p>
              </div>
            )}
          </>
        )}

        {error && <p className={styles.formError}>{error}</p>}
      </form>

      {grupo === 'facturador' && <CaisSection cais={cais} />}
      {grupo === 'pos' && (
        <>
          <PosSection
            cajas={cajas}
            vendedores={vendedores}
            metodos={metodos}
            limiteConsumidorFinal={initial.pos_limite_consumidor_final ?? '10000'}
            documentoModal={initial.pos_documento_modal ?? 'true'}
            bloquearLimite={initial.cxc_bloquear_limite ?? 'false'}
          />
          <EtapasSection etapas={etapas} />
        </>
      )}
    </div>
  )
}
