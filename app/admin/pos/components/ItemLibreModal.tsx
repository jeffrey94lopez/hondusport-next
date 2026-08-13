'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '@/components/admin/Modal'
import { parseMoneyInput } from '../pos-helpers'
import type { IsvTipo } from '@/types'
import styles from '../pos.module.css'

interface ItemLibreModalProps {
  onClose: () => void
  onSave: (descripcion: string, cantidad: number, precio: number, isv: IsvTipo) => void
}

export default function ItemLibreModal({ onClose, onSave }: ItemLibreModalProps) {
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [isv, setIsv] = useState<IsvTipo>('15')
  const [formError, setFormError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cantidadNum = Number(cantidad)
    const precioNum = parseMoneyInput(precio)
    if (!descripcion.trim()) {
      setFormError('La descripción es requerida.')
      return
    }
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setFormError('La cantidad debe ser mayor a 0.')
      return
    }
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      setFormError('El precio debe ser un número válido.')
      return
    }
    onSave(descripcion.trim(), cantidadNum, precioNum, isv)
  }

  // R4 Task 7 (look Stitch): namespace propio `.itemLibreForm`/`.itemLibreInput`
  // (ver pos.module.css) en vez de las clases `.form`/`.formLabel` genéricas
  // que antes compartía con la apertura de sesión — así el look nuevo (pill
  // sin borde, fondo bg-hover) no se filtra a esa pantalla ni a
  // DocumentosClient/LineaEditorModal, fuera de alcance de esta tarea.
  return (
    <Modal title="Ítem libre" onClose={onClose}>
      <form className={styles.itemLibreForm} onSubmit={handleSubmit}>
        <label className={styles.formLabel}>
          Descripción
          <input
            type="text"
            className={styles.itemLibreInput}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            autoFocus
          />
        </label>

        <div className={styles.itemLibreRow}>
          <label className={styles.formLabel}>
            Cantidad
            <input
              type="number"
              min="1"
              step="1"
              className={styles.itemLibreInput}
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
            />
          </label>
          <label className={styles.formLabel}>
            ISV
            <select className={styles.itemLibreInput} value={isv} onChange={e => setIsv(e.target.value as IsvTipo)}>
              <option value="15">15%</option>
              <option value="18">18%</option>
              <option value="exento">Exento</option>
            </select>
          </label>
        </div>

        <label className={styles.formLabel}>
          Precio (L.)
          <div className={styles.pagoMontoWrap}>
            <span className={styles.pagoMontoPrefix}>L.</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={styles.pagoMontoInput}
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
          </div>
        </label>

        {formError && <div className={styles.formError}>{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onClose}>Cancelar</button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`}>Agregar</button>
        </div>
      </form>
    </Modal>
  )
}
