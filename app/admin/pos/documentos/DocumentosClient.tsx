'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import { formatPrice } from '@/lib/store/format'
import { anularDocumento } from '../actions'
import type { DocumentoListItem } from './page'
import styles from './documentos.module.css'

const PAGE_SIZE = 50

type FiltroTipo = 'todos' | 'factura' | 'comprobante'
type FiltroEstado = 'todos' | 'emitido' | 'anulado'

interface Props {
  documentos: DocumentoListItem[]
}

function numeroDocumento(d: DocumentoListItem): string {
  if (d.tipo === 'factura') return d.correlativo ?? '—'
  return `C-${String(d.numero_comprobante ?? 0).padStart(8, '0')}`
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DocumentosClient({ documentos }: Props) {
  const router = useRouter()
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [anulando, setAnulando] = useState<DocumentoListItem | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documentos.filter(d => {
      if (filtroTipo !== 'todos' && d.tipo !== filtroTipo) return false
      if (filtroEstado !== 'todos' && d.estado !== filtroEstado) return false
      if (q) {
        const numero = numeroDocumento(d).toLowerCase()
        const cliente = d.cliente_nombre.toLowerCase()
        if (!numero.includes(q) && !cliente.includes(q)) return false
      }
      return true
    })
  }, [documentos, filtroTipo, filtroEstado, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const paged = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE)

  function actualizarFiltroTipo(v: FiltroTipo) { setFiltroTipo(v); setPage(1) }
  function actualizarFiltroEstado(v: FiltroEstado) { setFiltroEstado(v); setPage(1) }
  function actualizarSearch(v: string) { setSearch(v); setPage(1) }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Documentos</h1>
          <p className={styles.subtitle}>{filtered.length} de {documentos.length} documentos</p>
        </div>
        <input
          type="text"
          placeholder="Buscar por número o cliente…"
          value={search}
          onChange={e => actualizarSearch(e.target.value)}
          className={styles.search}
        />
      </div>

      <div className={styles.filtros}>
        {(['todos', 'factura', 'comprobante'] as FiltroTipo[]).map(v => (
          <button
            key={v}
            className={`${styles.filtroBtn} ${filtroTipo === v ? styles.filtroActive : ''}`}
            onClick={() => actualizarFiltroTipo(v)}
          >
            {v === 'todos' ? 'Todos' : v === 'factura' ? 'Facturas' : 'Comprobantes'}
          </button>
        ))}
        <span className={styles.filtroDivider} />
        {(['todos', 'emitido', 'anulado'] as FiltroEstado[]).map(v => (
          <button
            key={v}
            className={`${styles.filtroBtn} ${filtroEstado === v ? styles.filtroActive : ''}`}
            onClick={() => actualizarFiltroEstado(v)}
          >
            {v === 'todos' ? 'Cualquier estado' : v === 'emitido' ? 'Emitidos' : 'Anulados'}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Número</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Caja</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.map(d => (
              <tr key={d.id}>
                <td>{fecha(d.created_at)}</td>
                <td>
                  <span className={d.tipo === 'factura' ? styles.badgeFactura : styles.badgeComprobante}>
                    {d.tipo === 'factura' ? 'Factura' : 'Comprobante'}
                  </span>
                </td>
                <td>
                  <Link href={`/admin/pos/documento/${d.id}`} className={styles.numeroLink}>
                    {numeroDocumento(d)}
                  </Link>
                </td>
                <td>{d.cliente_nombre}</td>
                <td>{formatPrice(d.total)}</td>
                <td>
                  <span
                    className={d.estado === 'anulado' ? styles.badgeAnulado : styles.badgeEmitido}
                    title={d.estado === 'anulado' ? (d.anulado_motivo ?? undefined) : undefined}
                  >
                    {d.estado === 'anulado' ? 'Anulado' : 'Emitido'}
                  </span>
                </td>
                <td>{d.caja_nombre}</td>
                <td>
                  {d.tipo === 'comprobante' && d.estado === 'emitido' ? (
                    <button className={styles.btnAnular} onClick={() => setAnulando(d)}>Anular</button>
                  ) : d.tipo === 'factura' ? (
                    <span className={styles.sinAccion} title="Las facturas se corrigen con nota de crédito">
                      —
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {search || filtroTipo !== 'todos' || filtroEstado !== 'todos'
              ? 'No hay documentos que coincidan con los filtros.'
              : 'No hay documentos emitidos aún.'}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginacion}>
          <button
            className={styles.pagBtn}
            disabled={pageClamped <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Anterior
          </button>
          <span className={styles.pagInfo}>Página {pageClamped} de {totalPages}</span>
          <button
            className={styles.pagBtn}
            disabled={pageClamped >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Siguiente →
          </button>
        </div>
      )}

      {anulando && (
        <AnularModal
          documento={anulando}
          onClose={() => setAnulando(null)}
          onAnulado={() => { setAnulando(null); router.refresh() }}
        />
      )}
    </div>
  )
}

interface AnularModalProps {
  documento: DocumentoListItem
  onClose: () => void
  onAnulado: () => void
}

function AnularModal({ documento, onClose, onAnulado }: AnularModalProps) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo.trim()) { setError('El motivo es requerido.'); return }
    setError('')
    startTransition(async () => {
      const result = await anularDocumento(documento.id, motivo.trim())
      if (!result.ok) { setError(result.error); return }
      onAnulado()
    })
  }

  return (
    <Modal title={`Anular comprobante ${numeroDocumento(documento)}`} onClose={onClose} maxWidth="480px">
      <form onSubmit={handleSubmit} className={styles.formAnular}>
        <p className={styles.avisoAnular}>
          Esta acción no se puede deshacer. Si el comprobante descontó stock
          de mostrador, se repone automáticamente.
        </p>
        <label className={styles.formLabel}>
          Motivo *
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Explica por qué se anula este comprobante"
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="submit" className="btnMerlinPrimary" disabled={isPending}>
            {isPending ? 'Anulando…' : 'Anular comprobante'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
