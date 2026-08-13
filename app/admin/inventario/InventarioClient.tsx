'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/admin/Modal'
import type { AlcanceTipo, Categoria, ConteoFisico, EstadoConteo } from '@/types'
import { crearToma } from './actions'
import styles from './inventario.module.css'

type CategoriaOpcion = Pick<Categoria, 'id' | 'valor'>
type SubcategoriaOpcion = Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>

interface Props {
  tomas: ConteoFisico[]
  categorias: CategoriaOpcion[]
  subcategorias: SubcategoriaOpcion[]
}

const ESTADO_LABEL: Record<EstadoConteo, string> = {
  en_conteo: 'En conteo',
  aplicada: 'Aplicada',
  anulada: 'Anulada',
}

// en_conteo ámbar (pendiente), aplicada verde, anulada rojo — mismos tonos
// que compras.module.css / PosSection.
const ESTADO_BADGE: Record<EstadoConteo, string> = {
  en_conteo: styles.badgeAmbar,
  aplicada: styles.badgeVerde,
  anulada: styles.badgeRojo,
}

const ALCANCE_LABEL: Record<AlcanceTipo, string> = {
  todo: 'Todo el inventario',
  categoria: 'Categoría',
  subcategoria: 'Subcategoría',
  seleccion: 'Selección manual',
}

const ALCANCES: AlcanceTipo[] = ['todo', 'categoria', 'subcategoria', 'seleccion']

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function InventarioClient({ tomas, categorias, subcategorias }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  const categoriaNombre = useMemo(() => new Map(categorias.map(c => [c.id, c.valor])), [categorias])
  const subcategoriaNombre = useMemo(() => new Map(subcategorias.map(s => [s.id, s.valor])), [subcategorias])

  function alcanceLabel(t: ConteoFisico): string {
    switch (t.alcance_tipo) {
      case 'todo': return 'Todo el inventario'
      case 'categoria': return `Categoría: ${categoriaNombre.get(t.alcance_ref ?? '') ?? 'Desconocida'}`
      case 'subcategoria': return `Subcategoría: ${subcategoriaNombre.get(t.alcance_ref ?? '') ?? 'Desconocida'}`
      case 'seleccion': return 'Selección manual'
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Inventario físico</h1>
          <p className={styles.subtitle}>
            {tomas.length} toma{tomas.length === 1 ? '' : 's'} registrada{tomas.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btnPrimary} btnMerlinPrimary`}
            onClick={() => setModalOpen(true)}
          >
            + Nueva toma
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Alcance</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tomas.map(t => (
              <tr
                key={t.id}
                className={styles.rowClickable}
                onClick={() => router.push('/admin/inventario/' + t.id)}
              >
                <td className={styles.numero}>{t.numero}</td>
                <td className={styles.fechaCol}>{fecha(t.created_at)}</td>
                <td>{alcanceLabel(t)}</td>
                <td>
                  <span className={`${styles.badge} ${ESTADO_BADGE[t.estado]}`}>{ESTADO_LABEL[t.estado]}</span>
                </td>
                <td className={styles.accionesCol}>
                  <button
                    type="button"
                    className={styles.btnAbrir}
                    onClick={e => {
                      e.stopPropagation()
                      router.push('/admin/inventario/' + t.id)
                    }}
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tomas.length === 0 && <div className={styles.empty}>No hay tomas de inventario aún.</div>}
      </div>

      {modalOpen && (
        <NuevaTomaModal
          categorias={categorias}
          subcategorias={subcategorias}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

function NuevaTomaModal({
  categorias,
  subcategorias,
  onClose,
}: {
  categorias: CategoriaOpcion[]
  subcategorias: SubcategoriaOpcion[]
  onClose: () => void
}) {
  const router = useRouter()
  const [alcanceTipo, setAlcanceTipo] = useState<AlcanceTipo>('todo')
  const [categoriaId, setCategoriaId] = useState('')
  const [subcategoriaId, setSubcategoriaId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    let alcanceRef: string | null = null
    if (alcanceTipo === 'categoria') {
      if (!categoriaId) { setFormError('Selecciona una categoría.'); return }
      alcanceRef = categoriaId
    } else if (alcanceTipo === 'subcategoria') {
      if (!subcategoriaId) { setFormError('Selecciona una subcategoría.'); return }
      alcanceRef = subcategoriaId
    }

    startTransition(async () => {
      const result = await crearToma({ alcanceTipo, alcanceRef, descripcion: descripcion.trim() || null })
      if (!result.ok) { setFormError(result.error); return }
      router.push('/admin/inventario/' + result.data?.id)
    })
  }

  return (
    <Modal title="Nueva toma de inventario" onClose={onClose} maxWidth="480px">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.formLabel}>
          Alcance
          <select className={styles.formInput} value={alcanceTipo} onChange={e => setAlcanceTipo(e.target.value as AlcanceTipo)}>
            {ALCANCES.map(a => (
              <option key={a} value={a}>{ALCANCE_LABEL[a]}</option>
            ))}
          </select>
        </label>

        {alcanceTipo === 'categoria' && (
          <label className={styles.formLabel}>
            Categoría
            <select className={styles.formInput} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
              <option value="">Selecciona…</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.valor}</option>
              ))}
            </select>
          </label>
        )}

        {alcanceTipo === 'subcategoria' && (
          <label className={styles.formLabel}>
            Subcategoría
            <select className={styles.formInput} value={subcategoriaId} onChange={e => setSubcategoriaId(e.target.value)}>
              <option value="">Selecciona…</option>
              {subcategorias.map(s => (
                <option key={s.id} value={s.id}>{s.valor}</option>
              ))}
            </select>
          </label>
        )}

        {alcanceTipo === 'seleccion' && (
          <p className={styles.helpText}>
            La toma se completa buscando o escaneando SKUs manualmente en el editor, sin materializar
            líneas de antemano.
          </p>
        )}

        <label className={styles.formLabel}>
          Descripción (opcional)
          <textarea
            className={styles.formInput}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Ej. Conteo mensual de calzado"
          />
        </label>

        {formError && <p className={styles.formError}>{formError}</p>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="submit" className={`${styles.btnSubmit} btnMerlinPrimary`} disabled={isPending}>
            {isPending ? 'Creando…' : 'Crear toma'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
