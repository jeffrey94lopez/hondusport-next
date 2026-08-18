'use client'
import Toggle from './Toggle'
import type { Cliente, ClienteForm } from '@/types'
import styles from '@/app/admin/clientes/clientes.module.css'

export function clienteAForm(c: Cliente): ClienteForm {
  return {
    nombre: c.nombre,
    rtn: c.rtn ?? '',
    identidad: c.identidad ?? '',
    tipo_cliente: c.tipo_cliente,
    exonerado: c.exonerado,
    constancia_exonerado: c.constancia_exonerado ?? '',
    registro_sag: c.registro_sag ?? '',
    direccion: c.direccion ?? '',
    telefono: c.telefono ?? '',
    correo: c.correo ?? '',
    notas: c.notas ?? '',
    es_cliente: c.es_cliente,
    es_proveedor: c.es_proveedor,
    contacto: c.contacto ?? '',
    dias_credito: c.dias_credito,
    limite_credito: c.limite_credito != null ? String(c.limite_credito) : '',
  }
}

interface Props {
  form: ClienteForm
  onChange: (form: ClienteForm) => void
}

export default function ClienteFields({ form, onChange }: Props) {
  return (
    <>
      <label className={styles.formLabel}>
        Nombre *
        <input
          type="text"
          value={form.nombre}
          onChange={e => onChange({ ...form, nombre: e.target.value })}
          required
        />
      </label>
      <div className={styles.formChecks}>
        <Toggle
          checked={form.es_cliente}
          onChange={v => onChange({ ...form, es_cliente: v })}
          label="Es cliente"
        />
        <Toggle
          checked={form.es_proveedor}
          onChange={v => onChange({ ...form, es_proveedor: v })}
          label="Es proveedor"
        />
      </div>
      {form.es_cliente && (
        <>
          <label className={styles.formLabel}>
            Tipo de cliente
            <select
              value={form.tipo_cliente}
              onChange={e => onChange({ ...form, tipo_cliente: e.target.value as ClienteForm['tipo_cliente'] })}
            >
              <option value="final">Consumidor final</option>
              <option value="revendedor">Revendedor</option>
            </select>
          </label>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              RTN (14 dígitos, opcional)
              <input
                type="text"
                value={form.rtn}
                onChange={e => onChange({ ...form, rtn: e.target.value })}
                placeholder="08011990123456"
              />
            </label>
            <label className={styles.formLabel}>
              Identidad
              <input
                type="text"
                value={form.identidad}
                onChange={e => onChange({ ...form, identidad: e.target.value })}
              />
            </label>
          </div>
          <label className={styles.formLabel}>
            Límite de crédito (L.)
            <input
              type="text"
              inputMode="decimal"
              value={form.limite_credito ?? ''}
              onChange={e => onChange({ ...form, limite_credito: e.target.value })}
              placeholder="Sin límite"
            />
          </label>
        </>
      )}
      {form.es_proveedor && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Persona de contacto
            <input
              type="text"
              value={form.contacto}
              onChange={e => onChange({ ...form, contacto: e.target.value })}
            />
          </label>
          <label className={styles.formLabel}>
            Días de crédito
            <input
              type="number"
              value={form.dias_credito}
              onChange={e => onChange({ ...form, dias_credito: parseInt(e.target.value) || 0 })}
              min="0"
            />
          </label>
        </div>
      )}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Teléfono
          <input
            type="text"
            value={form.telefono}
            onChange={e => onChange({ ...form, telefono: e.target.value })}
          />
        </label>
        <label className={styles.formLabel}>
          Correo
          <input
            type="email"
            value={form.correo}
            onChange={e => onChange({ ...form, correo: e.target.value })}
          />
        </label>
      </div>
      <label className={styles.formLabel}>
        Dirección
        <input
          type="text"
          value={form.direccion}
          onChange={e => onChange({ ...form, direccion: e.target.value })}
        />
      </label>
      {form.es_cliente && (
        <>
          <div className={styles.formChecks}>
            <Toggle
              checked={form.exonerado}
              onChange={v => onChange(
                v
                  ? { ...form, exonerado: v }
                  : { ...form, exonerado: v, constancia_exonerado: '', registro_sag: '' }
              )}
              label="Exonerado"
            />
          </div>
          {form.exonerado && (
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                N.º de constancia de exoneración
                <input
                  type="text"
                  value={form.constancia_exonerado}
                  onChange={e => onChange({ ...form, constancia_exonerado: e.target.value })}
                />
              </label>
              <label className={styles.formLabel}>
                Registro SAG (opcional)
                <input
                  type="text"
                  value={form.registro_sag}
                  onChange={e => onChange({ ...form, registro_sag: e.target.value })}
                />
              </label>
            </div>
          )}
        </>
      )}
      <label className={styles.formLabel}>
        Notas
        <textarea
          value={form.notas}
          onChange={e => onChange({ ...form, notas: e.target.value })}
          rows={3}
        />
      </label>
    </>
  )
}
