'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import ClienteFields, { clienteAForm } from '@/components/admin/ClienteFields'
import { numeroDocumento } from '@/lib/pos/documentos'
import { formatPrice } from '@/lib/store/format'
import type { Cliente, ClienteForm, Cobro, Compra, Documento } from '@/types'
import { updateCliente } from '../actions'
import styles from './ficha.module.css'

type DocumentoFila = Pick<Documento, 'id' | 'tipo' | 'correlativo' | 'numero_comprobante' | 'estado' | 'total' | 'created_at'>
type CobroFila = Pick<Cobro, 'id' | 'numero' | 'fecha' | 'metodo' | 'monto' | 'referencia'>
type CompraFila = Pick<Compra, 'id' | 'numero' | 'fecha' | 'estado' | 'total'>

interface Props {
  cliente: Cliente
  saldoCxc: number
  saldoFavor: number
  documentos: DocumentoFila[]
  cobros: CobroFila[]
  compras: CompraFila[]
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
  saldo_favor: 'Saldo a favor',
}

const COMPRA_ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  ordenada: 'Ordenada',
  parcial: 'Parcial',
  recibida: 'Recibida',
  anulada: 'Anulada',
}

// Fecha guardada como DATE puro (YYYY-MM-DD, sin hora/zona): reformatear con
// `new Date(...)` interpretaría la medianoche como UTC y, al mostrarla en
// America/Tegucigalpa (UTC-6), correría un día hacia atrás. Se reordena el
// propio string en vez de pasar por Date — mismo criterio que `formatFecha`
// en EstadoCuentaClienteView.tsx.
function formatFechaSolo(fecha: string | null): string {
  if (!fecha) return '—'
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  if (!anio || !mes || !dia) return fecha
  return `${dia}/${mes}/${anio}`
}

// `created_at` sí es un timestamp real (con hora); aquí `new Date` + timeZone
// explícito es correcto y necesario (Vercel corre en UTC).
function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ClienteFichaView({ cliente, saldoCxc, saldoFavor, documentos, cobros, compras }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<ClienteForm>(() => clienteAForm(cliente))
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function abrirEdicion() {
    setForm(clienteAForm(cliente))
    setFormError('')
    setEditando(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    if (!form.es_cliente && !form.es_proveedor) {
      setFormError('El contacto debe ser cliente, proveedor o ambos.')
      return
    }
    startTransition(async () => {
      const result = await updateCliente(cliente.id, form)
      if (result.error) { setFormError(result.error); return }
      setEditando(false)
      router.refresh()
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>{cliente.nombre}</h1>
          <p className={styles.subtitle}>
            {cliente.es_cliente && 'Cliente'}
            {cliente.es_cliente && cliente.es_proveedor && ' · '}
            {cliente.es_proveedor && 'Proveedor'}
            {!cliente.activo && ' · Inactivo'}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/clientes" className={`${styles.btn} btnMerlinSecondary`}>
            ← Clientes
          </Link>
          <button type="button" className={`${styles.btn} btnMerlinPrimary`} onClick={abrirEdicion}>
            Editar
          </button>
        </div>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Identidad</h2>
        <div className={styles.grid}>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>RTN</span>
            <span className={styles.datoValor}>{cliente.rtn ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Identidad</span>
            <span className={styles.datoValor}>{cliente.identidad ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Teléfono</span>
            <span className={styles.datoValor}>{cliente.telefono ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Correo</span>
            <span className={styles.datoValor}>{cliente.correo ?? '—'}</span>
          </div>
          <div className={styles.dato}>
            <span className={styles.datoLabel}>Dirección</span>
            <span className={styles.datoValor}>{cliente.direccion ?? '—'}</span>
          </div>
          {cliente.es_proveedor && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Persona de contacto</span>
              <span className={styles.datoValor}>{cliente.contacto ?? '—'}</span>
            </div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Condiciones</h2>
        <div className={styles.grid}>
          {cliente.es_cliente && (
            <>
              <div className={styles.dato}>
                <span className={styles.datoLabel}>Tipo de cliente</span>
                <span className={styles.datoValor}>
                  {cliente.tipo_cliente === 'revendedor' ? 'Revendedor' : 'Consumidor final'}
                </span>
              </div>
              <div className={styles.dato}>
                <span className={styles.datoLabel}>Exonerado</span>
                <span className={styles.datoValor}>{cliente.exonerado ? 'Sí' : 'No'}</span>
              </div>
              <div className={styles.dato}>
                <span className={styles.datoLabel}>Límite de crédito</span>
                <span className={styles.datoValor}>
                  {cliente.limite_credito != null ? formatPrice(cliente.limite_credito) : 'Sin límite'}
                </span>
              </div>
            </>
          )}
          {cliente.es_proveedor && (
            <div className={styles.dato}>
              <span className={styles.datoLabel}>Días de crédito</span>
              <span className={styles.datoValor}>{cliente.dias_credito}</span>
            </div>
          )}
        </div>
        {cliente.notas && (
          <div className={styles.notas}>
            <span className={styles.datoLabel}>Notas</span>
            <p>{cliente.notas}</p>
          </div>
        )}
      </section>

      {/* Regla no negociable: si el contacto no es cliente, estos tres
          bloques no se renderizan (ni siquiera en L. 0.00). Mostrar un
          "saldo por cobrar L. 0.00" a alguien a quien nunca se le factura
          es un dato falso disfrazado de información. */}
      {cliente.es_cliente && (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Saldos</h2>
            <div className={styles.saldosRow}>
              <Link href={`/admin/cuentas-por-cobrar/cliente/${cliente.id}`} className={styles.saldoCard}>
                <span className={styles.datoLabel}>Saldo por cobrar</span>
                <span className={styles.saldoMonto}>{formatPrice(saldoCxc)}</span>
              </Link>
              {saldoFavor > 0 && (
                <Link href="/admin/cuentas-por-cobrar" className={styles.saldoCard}>
                  <span className={styles.datoLabel}>Saldo a favor</span>
                  <span className={`${styles.saldoMonto} ${styles.saldoFavor}`}>{formatPrice(saldoFavor)}</span>
                </Link>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Documentos emitidos</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map(d => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/admin/pos/documento/${d.id}`} className={styles.numeroLink}>
                          {numeroDocumento(d as { tipo: 'factura' | 'comprobante'; correlativo: string | null; numero_comprobante: number | null })}
                        </Link>
                      </td>
                      <td>{formatFechaHora(d.created_at)}</td>
                      <td>
                        <span className={d.estado === 'anulado' ? styles.badgeAnulado : styles.badgeEmitido}>
                          {d.estado === 'anulado' ? 'Anulado' : 'Emitido'}
                        </span>
                      </td>
                      <td>{formatPrice(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {documentos.length === 0 && (
                <div className={styles.empty}>Este cliente no tiene documentos emitidos.</div>
              )}
            </div>
            {documentos.length === 50 && (
              <Link href={`/admin/cuentas-por-cobrar/cliente/${cliente.id}`} className={styles.verTodo}>
                Ver estado de cuenta completo →
              </Link>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Cobros recibidos</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Método</th>
                    <th>Referencia</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {cobros.map(c => (
                    <tr key={c.id}>
                      <td>{c.numero}</td>
                      <td>{formatFechaSolo(c.fecha)}</td>
                      <td>{METODO_LABEL[c.metodo] ?? c.metodo}</td>
                      <td>{c.referencia || '—'}</td>
                      <td>{formatPrice(c.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cobros.length === 0 && (
                <div className={styles.empty}>Este cliente no tiene cobros registrados.</div>
              )}
            </div>
            {cobros.length === 50 && (
              <Link href={`/admin/cuentas-por-cobrar/cliente/${cliente.id}`} className={styles.verTodo}>
                Ver estado de cuenta completo →
              </Link>
            )}
          </section>
        </>
      )}

      {cliente.es_proveedor && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Compras al proveedor</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/compras/${c.id}`} className={styles.numeroLink}>
                        {c.numero}
                      </Link>
                    </td>
                    <td>{formatFechaSolo(c.fecha)}</td>
                    <td>{COMPRA_ESTADO_LABEL[c.estado] ?? c.estado}</td>
                    <td>{formatPrice(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compras.length === 0 && (
              <div className={styles.empty}>Este proveedor no tiene compras registradas.</div>
            )}
          </div>
          {compras.length === 50 && (
            <Link href="/admin/compras" className={styles.verTodo}>
              Ver todas las compras →
            </Link>
          )}
        </section>
      )}

      {editando && (
        <Modal title="Editar contacto" onClose={() => setEditando(false)} maxWidth="560px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <ClienteFields form={form} onChange={setForm} />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button type="submit" className={`${styles.btn} btnMerlinPrimary`} disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
