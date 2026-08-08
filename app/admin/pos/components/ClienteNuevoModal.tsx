'use client'
import { useState, useTransition } from 'react'
import type { FormEvent } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import { crearClienteDesdePos } from '../actions'
import type { Cliente, ClienteForm } from '@/types'
import styles from '../pos.module.css'

interface ClienteNuevoModalProps {
  onCreado: (cliente: Cliente) => void
  onCerrar: () => void
}

const FORM_INICIAL: ClienteForm = {
  nombre: '',
  rtn: '',
  identidad: '',
  tipo_cliente: 'final',
  exonerado: false,
  constancia_exonerado: '',
  registro_sag: '',
  direccion: '',
  telefono: '',
  correo: '',
  notas: '',
}

export default function ClienteNuevoModal({ onCreado, onCerrar }: ClienteNuevoModalProps) {
  const [form, setForm] = useState<ClienteForm>(FORM_INICIAL)
  const [masDatos, setMasDatos] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) {
      setError('El nombre es requerido.')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await crearClienteDesdePos(form)
      if (!result.ok || !result.data) {
        setError(result.ok ? 'No se pudo completar la operación. Intenta de nuevo.' : result.error)
        return
      }
      onCreado(result.data.cliente)
    })
  }

  return (
    <Modal title="Nuevo cliente" onClose={onCerrar}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.formLabel}>
          Nombre *
          <input
            type="text"
            value={form.nombre}
            onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
            autoFocus
            disabled={isPending}
          />
        </label>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            RTN
            <input
              type="text"
              value={form.rtn}
              onChange={e => setForm(p => ({ ...p, rtn: e.target.value }))}
              placeholder="14 dígitos"
              disabled={isPending}
            />
          </label>
          <label className={styles.formLabel}>
            Identidad
            <input
              type="text"
              value={form.identidad}
              onChange={e => setForm(p => ({ ...p, identidad: e.target.value }))}
              disabled={isPending}
            />
          </label>
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Teléfono
            <input
              type="text"
              value={form.telefono}
              onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
              disabled={isPending}
            />
          </label>
          <label className={styles.formLabel}>
            Tipo
            <select
              value={form.tipo_cliente}
              onChange={e => setForm(p => ({ ...p, tipo_cliente: e.target.value as ClienteForm['tipo_cliente'] }))}
              disabled={isPending}
            >
              <option value="final">Consumidor final</option>
              <option value="revendedor">Revendedor</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className={styles.masDatosToggle}
          onClick={() => setMasDatos(v => !v)}
        >
          {masDatos ? '− Menos datos' : '+ Más datos'}
        </button>

        {masDatos && (
          <>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Dirección
                <input
                  type="text"
                  value={form.direccion}
                  onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                  disabled={isPending}
                />
              </label>
              <label className={styles.formLabel}>
                Correo
                <input
                  type="email"
                  value={form.correo}
                  onChange={e => setForm(p => ({ ...p, correo: e.target.value }))}
                  disabled={isPending}
                />
              </label>
            </div>

            <div className={styles.formChecks}>
              <Toggle
                checked={form.exonerado}
                onChange={v => setForm(p => (
                  v
                    ? { ...p, exonerado: v }
                    // Bug de P1: los campos de exonerado no deben persistirse
                    // si el checkbox se desmarca — se limpian aquí también en
                    // el estado del form, no solo en el payload del servidor.
                    : { ...p, exonerado: v, constancia_exonerado: '', registro_sag: '' }
                ))}
                label="Exonerado"
                disabled={isPending}
              />
            </div>

            {form.exonerado && (
              <div className={styles.formRow}>
                <label className={styles.formLabel}>
                  N.º de constancia de exoneración
                  <input
                    type="text"
                    value={form.constancia_exonerado}
                    onChange={e => setForm(p => ({ ...p, constancia_exonerado: e.target.value }))}
                    disabled={isPending}
                  />
                </label>
                <label className={styles.formLabel}>
                  Registro SAG (opcional)
                  <input
                    type="text"
                    value={form.registro_sag}
                    onChange={e => setForm(p => ({ ...p, registro_sag: e.target.value }))}
                    disabled={isPending}
                  />
                </label>
              </div>
            )}

            <label className={styles.formLabel}>
              Notas
              <textarea
                value={form.notas}
                onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                rows={3}
                disabled={isPending}
              />
            </label>
          </>
        )}

        {error && <div className={styles.formError}>{error}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onCerrar} disabled={isPending}>
            Cancelar
          </button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`} disabled={isPending}>
            {isPending ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
