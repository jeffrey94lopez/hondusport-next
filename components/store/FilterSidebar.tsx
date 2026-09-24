'use client'
import { useState } from 'react'
import styles from './FilterSidebar.module.css'
import { formatPrice } from '@/lib/store/format'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { FilterState } from '@/lib/store/filters'
import type { FilterTipo } from '@/lib/store/filterParams'
import type { Categoria } from '@/types/store'

const PRICE_MIN = 500
const PRICE_STEP = 100

type SeccionId = 'precio' | 'genero' | 'categoria' | 'subcategoria' | 'talla'

interface FilterSidebarProps {
  categorias: Categoria[]
  filters: FilterState
  maxPriceLimit?: number
  isOpen?: boolean
  onClose?: () => void
  onToggle: (tipo: FilterTipo, valor: string) => void
  onSelectCat: (valor: string) => void
  onMaxPrice: (n: number) => void
  onClearAll: () => void
}

// Sección contraíble estilo Amazon: encabezado clickeable con flecha que
// expande/colapsa el contenido con una transición suave (grid-template-rows
// 0fr->1fr, en vez de mostrar/ocultar de golpe). Precio y Categoría son fijas
// (collapsible=false): siempre visibles, sin botón ni flecha, porque son el
// filtro principal y no tiene sentido tener que reabrirlas cada vez.
function FilterSection({
  title,
  open,
  onToggle,
  collapsible = true,
  children,
}: {
  title: React.ReactNode
  open: boolean
  onToggle: () => void
  collapsible?: boolean
  children: React.ReactNode
}) {
  if (!collapsible) {
    return (
      <div className={styles.filterGroup}>
        <h4 className={styles.filterGroupTitleFija}>{title}</h4>
        {children}
      </div>
    )
  }

  return (
    <div className={styles.filterGroup}>
      <button type="button" className={styles.filterGroupHeader} onClick={onToggle} aria-expanded={open}>
        <h4>{title}</h4>
        <i className={`fa-solid fa-chevron-down ${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
      </button>
      <div className={`${styles.filterGroupBody} ${open ? styles.filterGroupBodyOpen : ''}`}>
        <div className={styles.filterGroupBodyContent}>{children}</div>
      </div>
    </div>
  )
}

export default function FilterSidebar({
  categorias,
  filters,
  maxPriceLimit = 5000,
  isOpen,
  onClose,
  onToggle,
  onSelectCat,
  onMaxPrice,
  onClearAll,
}: FilterSidebarProps) {
  useEscapeKey(isOpen ?? false, () => onClose?.())

  // Precio y Categoría son fijas (no colapsables, ver FilterSection). Las
  // demás arrancan contraídas para que el panel se vea corto de entrada.
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<SeccionId, boolean>>({
    precio: true,
    genero: false,
    categoria: true,
    subcategoria: false,
    talla: false,
  })
  const toggleSeccion = (id: SeccionId) => setSeccionesAbiertas(prev => ({ ...prev, [id]: !prev[id] }))

  const generoFiltros = categorias.filter(c => c.tipo === 'genero')
  const catFiltros = categorias.filter(c => c.tipo === 'cat')

  // Subcategoría y talla dependen de la(s) categoría(s) elegidas: sin
  // categoría activa se ven todas (para poder navegar libremente), pero en
  // cuanto hay una selección solo se muestran las que de verdad pertenecen a
  // esa categoría (via categorias_padre), igual que ya hace CategoryBar.
  const catIdsActivos = catFiltros.filter(c => filters.cats.includes(c.valor)).map(c => c.id)
  const perteneceACatActiva = (c: Categoria) =>
    catIdsActivos.length === 0 || (c.categorias_padre ?? []).some(id => catIdsActivos.includes(id))

  const tallaFiltros = categorias.filter(c => c.tipo === 'talla').filter(perteneceACatActiva)
  const subcatFiltros = categorias.filter(c => c.tipo === 'subcat').filter(perteneceACatActiva)

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarActive : ''}`}>
      <button className={styles.closeBtn} onClick={() => onClose?.()} aria-label="Cerrar filtros">
        ✕
      </button>

      <FilterSection
        title={<>PRECIO MÁXIMO: <span>{formatPrice(filters.maxPrice)}</span></>}
        open={seccionesAbiertas.precio}
        onToggle={() => toggleSeccion('precio')}
        collapsible={false}
      >
        <input
          type="range"
          className={styles.priceRange}
          min={PRICE_MIN}
          max={maxPriceLimit}
          step={PRICE_STEP}
          value={filters.maxPrice}
          onChange={e => onMaxPrice(Number(e.target.value))}
        />
      </FilterSection>

      {generoFiltros.length > 0 && (
        <FilterSection title="GÉNERO" open={seccionesAbiertas.genero} onToggle={() => toggleSeccion('genero')}>
          {generoFiltros.map(f => (
            <label key={f.id} className={styles.checkLabel}>
              <input
                type="checkbox"
                className={styles.filterCheck}
                checked={filters.generos.includes(f.valor)}
                onChange={() => onToggle('genero', f.valor)}
              />
              {f.valor}
            </label>
          ))}
        </FilterSection>
      )}

      {catFiltros.length > 0 && (
        <FilterSection title="CATEGORÍA" open={seccionesAbiertas.categoria} onToggle={() => toggleSeccion('categoria')} collapsible={false}>
          {catFiltros.map(f => (
            <label key={f.id} className={styles.checkLabel}>
              <input
                type="radio"
                name="filtro-categoria"
                className={styles.filterCheck}
                checked={filters.cats.includes(f.valor)}
                onChange={() => onSelectCat(f.valor)}
              />
              {f.valor}
            </label>
          ))}
        </FilterSection>
      )}

      {subcatFiltros.length > 0 && (
        <FilterSection title="SUBCATEGORÍA" open={seccionesAbiertas.subcategoria} onToggle={() => toggleSeccion('subcategoria')}>
          <div className={styles.tallaBtnGroup}>
            {subcatFiltros.map(f => (
              <button
                key={f.id}
                className={`${styles.tallaBtn} ${filters.subcats.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => onToggle('subcat', f.valor)}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {tallaFiltros.length > 0 && (
        <FilterSection title="TALLA" open={seccionesAbiertas.talla} onToggle={() => toggleSeccion('talla')}>
          <div className={styles.tallaBtnGroup}>
            {tallaFiltros.map(f => (
              <button
                key={f.id}
                className={`${styles.tallaBtn} ${filters.tallas.includes(f.valor) ? styles.tallaBtnActive : ''}`}
                onClick={() => onToggle('talla', f.valor)}
              >
                {f.valor}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      <button className={styles.clearBtn} onClick={onClearAll}>
        <i className="fa-solid fa-trash-can" /> LIMPIAR FILTROS
      </button>
    </aside>
  )
}
