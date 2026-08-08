'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '@/components/admin/Modal'
import {
  brutoLinea,
  clampDescuentoLinea,
  descuentoDesdePorcentaje,
  topeCantidad,
} from '@/lib/pos/carrito'
import type { LineaVenta, DescuentoModo } from '@/lib/pos/carrito'
import { formatPrice } from '@/lib/store/format'
import { round2, parseMoneyInput, valorMostrado } from '../pos-helpers'
import type { IsvTipo } from '@/types'
import styles from '../pos.module.css'

export interface LineaEditorModalProps {
  linea: LineaVenta
  stockDisponible: number | null // null = ilimitado
  onGuardar: (linea: LineaVenta) => void
  onCerrar: () => void
}

// Los ítems libres (producto_id null) editan además descripción e ISV; los
// de inventario no (su descripción/ISV vienen del catálogo, no se editan
// aquí). El resto de los campos (cantidad, precio, descuento) son comunes.
export default function LineaEditorModal({ linea, stockDisponible, onGuardar, onCerrar }: LineaEditorModalProps) {
  const [borrador, setBorrador] = useState<LineaVenta>(linea)
  const [formError, setFormError] = useState('')

  const esLibre = linea.producto_id === null
  // Tope fijo sobre la cantidad ORIGINAL de la línea (no la del borrador):
  // es el mismo criterio que usa topeCantidad en la fila — nunca le baja al
  // cajero una cantidad ya capturada en el carrito.
  const tope = topeCantidad(stockDisponible, linea.cantidad)
  const bruto = brutoLinea(borrador)
  const pctActual = bruto > 0 ? round2((borrador.descuento / bruto) * 100) : 0
  const subtotal = brutoLinea(borrador) - borrador.descuento

  // Precio y descuento son inputs de dinero en texto plano (sin flechas, sin
  // cero forzado, ver spec de UX de mostrador): el estado real del input es
  // el string crudo tecleado; `borrador.precio_unitario`/`descuento` se
  // recalculan en cada tecla para que el resto del formulario (subtotal,
  // %, clamp al guardar) siga operando sobre el número derivado. Mientras el
  // campo tiene foco se muestra ese texto crudo tal cual; en cualquier otro
  // momento (al montar, al perder foco, o si el % cambia porque el precio
  // cambió) se muestra el valor canónico derivado (0 = vacío).
  const [precioTexto, setPrecioTexto] = useState(valorMostrado(linea.precio_unitario))
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  const [descuentoTexto, setDescuentoTexto] = useState(
    valorMostrado(linea.descuentoModo === 'monto' ? linea.descuento : pctActual),
  )
  const [editandoDescuento, setEditandoDescuento] = useState(false)

  const precioMostrado = editandoPrecio ? precioTexto : valorMostrado(borrador.precio_unitario)
  const descuentoMostrado = editandoDescuento
    ? descuentoTexto
    : valorMostrado(borrador.descuentoModo === 'monto' ? borrador.descuento : pctActual)

  function handleCantidad(valor: string) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return
    setBorrador(b => ({ ...b, cantidad: Math.max(1, Math.min(Math.round(n), tope)) }))
  }

  function handlePrecioFocus() {
    setPrecioTexto(valorMostrado(borrador.precio_unitario))
    setEditandoPrecio(true)
  }

  function handlePrecio(texto: string) {
    setPrecioTexto(texto)
    const n = parseMoneyInput(texto)
    setBorrador(b => ({ ...b, precio_unitario: Math.max(0, n), precioManual: true }))
  }

  function handleDescuentoFocus() {
    setDescuentoTexto(valorMostrado(borrador.descuentoModo === 'monto' ? borrador.descuento : pctActual))
    setEditandoDescuento(true)
  }

  function handleDescuento(texto: string) {
    setDescuentoTexto(texto)
    const n = Math.max(0, parseMoneyInput(texto))
    setBorrador(b =>
      b.descuentoModo === 'monto' ? { ...b, descuento: n } : { ...b, descuento: descuentoDesdePorcentaje(b, n) },
    )
  }

  function handleDescuentoModo(modo: DescuentoModo) {
    setBorrador(b => ({ ...b, descuentoModo: modo }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (esLibre && !borrador.descripcion.trim()) {
      setFormError('La descripción es requerida.')
      return
    }
    const final = esLibre ? { ...borrador, descripcion: borrador.descripcion.trim() } : borrador
    onGuardar(clampDescuentoLinea(final))
  }

  return (
    <Modal title="Editar línea" onClose={onCerrar}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {esLibre && (
          <label className={styles.formLabel}>
            Descripción
            <input
              type="text"
              value={borrador.descripcion}
              onChange={e => setBorrador(b => ({ ...b, descripcion: e.target.value }))}
              autoFocus
            />
          </label>
        )}

        <label className={styles.formLabel}>
          Cantidad
          <input
            type="number"
            min={1}
            max={Number.isFinite(tope) ? tope : undefined}
            step="1"
            value={borrador.cantidad}
            onChange={e => handleCantidad(e.target.value)}
          />
        </label>

        <label className={styles.formLabel}>
          Precio unitario (L.)
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={precioMostrado}
            onFocus={handlePrecioFocus}
            onChange={e => handlePrecio(e.target.value)}
            onBlur={() => setEditandoPrecio(false)}
          />
        </label>

        <label className={styles.formLabel}>
          Descuento
          <div className={styles.editorDescuentoRow}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={styles.editorDescuentoInput}
              value={descuentoMostrado}
              onFocus={handleDescuentoFocus}
              onChange={e => handleDescuento(e.target.value)}
              onBlur={() => setEditandoDescuento(false)}
            />
            <select
              className={styles.editorModoSelect}
              value={borrador.descuentoModo}
              onChange={e => handleDescuentoModo(e.target.value as DescuentoModo)}
            >
              <option value="monto">L.</option>
              <option value="porcentaje">%</option>
            </select>
          </div>
        </label>

        {esLibre && (
          <label className={styles.formLabel}>
            ISV
            <select value={borrador.isv} onChange={e => setBorrador(b => ({ ...b, isv: e.target.value as IsvTipo }))}>
              <option value="15">15%</option>
              <option value="18">18%</option>
              <option value="exento">Exento</option>
            </select>
          </label>
        )}

        <div className={styles.editorSubtotal}>Subtotal: {formatPrice(subtotal)}</div>

        {formError && <div className={styles.formError}>{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={`btnMerlinTertiary ${styles.btnCancel}`} onClick={onCerrar}>Cancelar</button>
          <button type="submit" className={`btnMerlinPrimary ${styles.btnSubmit}`}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
