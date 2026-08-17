'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Caja, Vendedor } from '@/types'
import { saveConfig } from './actions'
import {
  createCaja, updateCaja, toggleCajaActivo,
  createVendedor, updateVendedor, toggleVendedorActivo,
  type CajaForm, type VendedorForm,
} from './posActions'
import styles from './PosSection.module.css'

interface Props {
  cajas: Caja[]
  vendedores: Vendedor[]
  limiteConsumidorFinal: string
  documentoModal: string
  bloquearLimite: string
  conteoCiego: string
  devolucionesSinEfectivo: string
  cierreCiegas: string
}

const EMPTY_CAJA: CajaForm = { nombre: '', punto_emision: '001', formato_impresion: '80mm', activo: true }
const EMPTY_VENDEDOR: VendedorForm = { nombre: '', activo: true }

function EstadoCell({ activo, onToggle, disabled }: { activo: boolean; onToggle: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.estadoCell}>
      <span className={activo ? styles.badgeActivo : styles.badgeInactivo}>{activo ? 'Activo' : 'Inactivo'}</span>
      <Toggle checked={activo} onChange={onToggle} disabled={disabled} />
    </div>
  )
}

export default function PosSection({ cajas, vendedores, limiteConsumidorFinal, documentoModal, bloquearLimite, conteoCiego, devolucionesSinEfectivo, cierreCiegas }: Props) {
  return (
    <div className={styles.wrap}>
      <LimiteConsumidorFinal inicial={limiteConsumidorFinal} />
      <DocumentoModalToggle inicial={documentoModal !== 'false'} />
      <BloquearLimiteToggle inicial={bloquearLimite === 'true'} />
      <ConteoCiegoToggle inicial={conteoCiego === 'true'} />
      <DevolucionesSinEfectivoToggle inicial={devolucionesSinEfectivo === 'true'} />
      <CierreCiegasToggle inicial={cierreCiegas !== 'false'} />
      <CajasBlock cajas={cajas} />
      <VendedoresBlock vendedores={vendedores} />
    </div>
  )
}

// Task 11: interruptor de `pos_documento_modal`. Mismo criterio de "ausente
// = activo" que usa PosClient al leerlo (config.pos_documento_modal !==
// 'false') — la clave puede no existir aún en `configuracion` si la
// migración de la Task 4 no se ha aplicado.
function DocumentoModalToggle({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleChange(valor: boolean) {
    setActivo(valor)
    setError('')
    startTransition(async () => {
      const result = await saveConfig({ pos_documento_modal: valor ? 'true' : 'false' })
      if (result.error) {
        setError(result.error)
        setActivo(!valor)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Documento tras cobrar</h2>
          <p className={styles.subtitle}>
            Al emitir una venta, muestra la factura o comprobante en una ventana sobre el punto de
            venta en vez de navegar a una página aparte.
          </p>
        </div>
      </div>
      <Toggle
        checked={activo}
        onChange={handleChange}
        disabled={isPending}
        label="Abrir el documento en modal tras cobrar"
      />
      {saved && <p className={styles.helpText}>Guardado.</p>}
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  )
}

// R7: interruptor de `pos_cierre_ciegas`. Mismo patrón que
// DocumentoModalToggle. Ausente = 'true' (a ciegas activo por defecto):
// con el toggle activo, el cajero cuenta el efectivo de la gaveta al cerrar
// turno sin ver antes cuánto se espera, para no sesgar el conteo; el arqueo
// (esperado, contado y diferencia) se muestra siempre después de confirmar.
// Nadie consume esta clave todavía — la leerán el POS y Turnos en tareas
// posteriores.
function CierreCiegasToggle({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleChange(valor: boolean) {
    setActivo(valor)
    setError('')
    startTransition(async () => {
      const result = await saveConfig({ pos_cierre_ciegas: valor ? 'true' : 'false' })
      if (result.error) {
        setError(result.error)
        setActivo(!valor)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Cierre de caja a ciegas</h2>
          <p className={styles.subtitle}>
            El cajero cuenta el efectivo sin ver antes cuánto se espera. El arqueo (esperado, contado
            y diferencia) se muestra siempre después de confirmar.
          </p>
        </div>
      </div>
      <Toggle
        checked={activo}
        onChange={handleChange}
        disabled={isPending}
        label="Contar el efectivo a ciegas al cerrar turno"
      />
      {saved && <p className={styles.helpText}>Guardado.</p>}
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  )
}

// P4c (CxC): interruptor de `cxc_bloquear_limite`. Mismo patrón que
// DocumentoModalToggle. Ausente = 'false' (no bloquear): si el cliente supera
// su límite de crédito, la venta al crédito solo muestra un aviso; con el
// toggle activo, se bloquea la emisión.
function BloquearLimiteToggle({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleChange(valor: boolean) {
    setActivo(valor)
    setError('')
    startTransition(async () => {
      const result = await saveConfig({ cxc_bloquear_limite: valor ? 'true' : 'false' })
      if (result.error) {
        setError(result.error)
        setActivo(!valor)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Límite de crédito</h2>
          <p className={styles.subtitle}>
            Al vender al crédito, si el saldo del cliente más el nuevo crédito superan su límite,
            bloquea la emisión. Si está apagado, solo se muestra un aviso y la venta continúa.
          </p>
        </div>
      </div>
      <Toggle
        checked={activo}
        onChange={handleChange}
        disabled={isPending}
        label="Bloquear ventas que superen el límite de crédito"
      />
      {saved && <p className={styles.helpText}>Guardado.</p>}
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  )
}

// P4d (Inventario físico): interruptor de `inventario_conteo_ciego`. Mismo
// patrón que BloquearLimiteToggle. Ausente = 'true' (a ciegas por defecto,
// igual que sembró la migración de P4d): con el toggle activo, el editor de
// la toma oculta el stock del sistema mientras se cuenta, para no sesgar al
// contador; apagado, el conteo se ve junto al stock del sistema.
function ConteoCiegoToggle({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleChange(valor: boolean) {
    setActivo(valor)
    setError('')
    startTransition(async () => {
      const result = await saveConfig({ inventario_conteo_ciego: valor ? 'true' : 'false' })
      if (result.error) {
        setError(result.error)
        setActivo(!valor)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Conteo físico a ciegas</h2>
          <p className={styles.subtitle}>
            Al contar una toma de inventario, oculta el stock que tiene el sistema para que el
            contador no se guíe por él.
          </p>
        </div>
      </div>
      <Toggle
        checked={activo}
        onChange={handleChange}
        disabled={isPending}
        label="Ocultar el stock del sistema durante el conteo"
      />
      {saved && <p className={styles.helpText}>Guardado.</p>}
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  )
}

// P5a (Devoluciones): interruptor de `devoluciones_sin_efectivo`. Mismo
// patrón que BloquearLimiteToggle. Ausente = 'false' (la migración lo sembró
// así): con el toggle activo, el reembolso en efectivo se bloquea al devolver
// una factura/comprobante — solo quedan disponibles saldo a favor o abono a
// CxC como forma de reembolso.
function DevolucionesSinEfectivoToggle({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleChange(valor: boolean) {
    setActivo(valor)
    setError('')
    startTransition(async () => {
      const result = await saveConfig({ devoluciones_sin_efectivo: valor ? 'true' : 'false' })
      if (result.error) {
        setError(result.error)
        setActivo(!valor)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Devoluciones en efectivo</h2>
          <p className={styles.subtitle}>
            Al devolver una factura o comprobante, bloquea el reembolso en efectivo. El cliente solo
            podrá recibir el reembolso como saldo a favor o como abono a su cuenta por cobrar.
          </p>
        </div>
      </div>
      <Toggle
        checked={activo}
        onChange={handleChange}
        disabled={isPending}
        label="No permitir devoluciones en efectivo"
      />
      {saved && <p className={styles.helpText}>Guardado.</p>}
      {error && <p className={styles.formError}>{error}</p>}
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
