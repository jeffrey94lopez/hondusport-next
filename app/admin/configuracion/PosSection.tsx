'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Caja, MetodoPago, MetodoPagoTipo, Vendedor } from '@/types'
import { saveConfig } from './actions'
import {
  createCaja, updateCaja, toggleCajaActivo,
  createVendedor, updateVendedor, toggleVendedorActivo,
  createMetodoPago, updateMetodoPago, toggleMetodoPagoActivo,
  type CajaForm, type VendedorForm, type MetodoPagoForm,
} from './posActions'
import styles from './PosSection.module.css'

interface Props {
  cajas: Caja[]
  vendedores: Vendedor[]
  metodos: MetodoPago[]
  limiteConsumidorFinal: string
}

const TIPO_LABEL: Record<MetodoPagoTipo, string> = {
  efectivo_lps: 'Efectivo (Lempiras)',
  efectivo_usd: 'Efectivo (Dólares)',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia / Depósito',
  otro: 'Otro',
}

const EMPTY_CAJA: CajaForm = { nombre: '', punto_emision: '001', formato_impresion: '80mm', activo: true }
const EMPTY_VENDEDOR: VendedorForm = { nombre: '', activo: true }
const EMPTY_METODO: MetodoPagoForm = { nombre: '', tipo: 'efectivo_lps', orden: 0, activo: true }

function EstadoCell({ activo, onToggle, disabled }: { activo: boolean; onToggle: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.estadoCell}>
      <span className={activo ? styles.badgeActivo : styles.badgeInactivo}>{activo ? 'Activo' : 'Inactivo'}</span>
      <Toggle checked={activo} onChange={onToggle} disabled={disabled} />
    </div>
  )
}

export default function PosSection({ cajas, vendedores, metodos, limiteConsumidorFinal }: Props) {
  return (
    <div className={styles.wrap}>
      <LimiteConsumidorFinal inicial={limiteConsumidorFinal} />
      <CajasBlock cajas={cajas} />
      <VendedoresBlock vendedores={vendedores} />
      <MetodosBlock metodos={metodos} />
    </div>
  )
}

function LimiteConsumidorFinal({ inicial }: { inicial: string }) {
  const [valor, setValor] = useState(inicial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError('')
    startTransition(async () => {
      const result = await saveConfig({ pos_limite_consumidor_final: valor })
      if (result.error) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Límite para Consumidor Final</h2>
          <p className={styles.subtitle}>
            Ventas por encima de este monto (L.) requieren datos del cliente en el documento fiscal.
          </p>
        </div>
      </div>
      <div className={styles.limiteRow}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={valor}
          onChange={e => setValor(e.target.value)}
          className={styles.limiteInput}
        />
        <button
          type="button"
          className={`${styles.btnEdit} btnMerlinPrimary`}
          onClick={handleSave}
          disabled={isPending}
        >
          {saved ? '✓ Guardado' : isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  )
}

function CajasBlock({ cajas }: { cajas: Caja[] }) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Caja | null>(null)
  const [form, setForm] = useState<CajaForm>(EMPTY_CAJA)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_CAJA)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: Caja) {
    setForm({ nombre: c.nombre, punto_emision: c.punto_emision, formato_impresion: c.formato_impresion, activo: c.activo })
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
      const result = await toggleCajaActivo(id, activo)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateCaja(editing.id, form)
        : await createCaja(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Cajas</h2>
          <p className={styles.subtitle}>Puntos de venta del mostrador</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nueva caja
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Punto de emisión</th>
              <th>Formato de impresión</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cajas.map(c => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td className={styles.mono}>{c.punto_emision}</td>
                <td>{c.formato_impresion === '80mm' ? 'Ticket 80mm' : 'Carta'}</td>
                <td>
                  <EstadoCell activo={c.activo} onToggle={checked => handleToggle(c.id, checked)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(c)}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cajas.length === 0 && <div className={styles.empty}>No hay cajas registradas aún.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar caja' : 'Nueva caja'} onClose={closeModal} maxWidth="480px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Caja 1"
                required
              />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Punto de emisión
                <input
                  type="text"
                  value={form.punto_emision}
                  onChange={e => setForm(p => ({ ...p, punto_emision: e.target.value }))}
                  placeholder="001"
                  maxLength={3}
                />
              </label>
              <label className={styles.formLabel}>
                Formato de impresión
                <select
                  value={form.formato_impresion}
                  onChange={e => setForm(p => ({ ...p, formato_impresion: e.target.value as CajaForm['formato_impresion'] }))}
                >
                  <option value="80mm">Ticket 80mm</option>
                  <option value="carta">Carta</option>
                </select>
              </label>
            </div>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button type="submit" className={`${styles.btnEdit} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear caja'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function VendedoresBlock({ vendedores }: { vendedores: Vendedor[] }) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Vendedor | null>(null)
  const [form, setForm] = useState<VendedorForm>(EMPTY_VENDEDOR)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_VENDEDOR)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(v: Vendedor) {
    setForm({ nombre: v.nombre, activo: v.activo })
    setFormError('')
    setEditing(v)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      const result = await toggleVendedorActivo(id, activo)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateVendedor(editing.id, form)
        : await createVendedor(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Vendedores</h2>
          <p className={styles.subtitle}>Personas que atienden el mostrador</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nuevo vendedor
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map(v => (
              <tr key={v.id}>
                <td>{v.nombre}</td>
                <td>
                  <EstadoCell activo={v.activo} onToggle={checked => handleToggle(v.id, checked)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(v)}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vendedores.length === 0 && <div className={styles.empty}>No hay vendedores registrados aún.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar vendedor' : 'Nuevo vendedor'} onClose={closeModal} maxWidth="420px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre del vendedor"
                required
              />
            </label>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button type="submit" className={`${styles.btnEdit} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear vendedor'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function MetodosBlock({ metodos }: { metodos: MetodoPago[] }) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<MetodoPago | null>(null)
  const [form, setForm] = useState<MetodoPagoForm>(EMPTY_METODO)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_METODO)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(m: MetodoPago) {
    setForm({ nombre: m.nombre, tipo: m.tipo, orden: m.orden, activo: m.activo })
    setFormError('')
    setEditing(m)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      const result = await toggleMetodoPagoActivo(id, activo)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateMetodoPago(editing.id, form)
        : await createMetodoPago(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Métodos de pago</h2>
          <p className={styles.subtitle}>Formas de pago disponibles en caja</p>
        </div>
        <button type="button" className={`${styles.btnEdit} btnMerlinPrimary`} onClick={openCreate}>
          + Nuevo método
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Orden</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {metodos.map(m => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>{TIPO_LABEL[m.tipo]}</td>
                <td className={styles.mono}>{m.orden}</td>
                <td>
                  <EstadoCell activo={m.activo} onToggle={checked => handleToggle(m.id, checked)} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(m)}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {metodos.length === 0 && <div className={styles.empty}>No hay métodos de pago registrados aún.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar método de pago' : 'Nuevo método de pago'} onClose={closeModal} maxWidth="480px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Efectivo L."
                required
              />
            </label>
            {modal === 'edit' ? (
              <div className={styles.formLabel}>
                Tipo
                <div className={styles.readOnlyValue}>{TIPO_LABEL[form.tipo]}</div>
                <span className={styles.helpText}>El tipo se fija al crear el método y no se puede cambiar.</span>
              </div>
            ) : (
              <label className={styles.formLabel}>
                Tipo
                <select
                  value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value as MetodoPagoTipo }))}
                >
                  {Object.entries(TIPO_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.formLabel}>
              Orden
              <input
                type="number"
                min="0"
                value={form.orden}
                onChange={e => setForm(p => ({ ...p, orden: Number(e.target.value) }))}
              />
            </label>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button type="submit" className={`${styles.btnEdit} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear método'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
