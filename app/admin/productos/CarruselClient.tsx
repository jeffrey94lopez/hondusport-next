'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import ProductoFields, { productoAForm } from '@/components/admin/ProductoFields'
import Toggle from '@/components/admin/Toggle'
import { updateProducto } from './actions'
import { filtrarInventario, type CriteriosInventario } from '@/lib/store/inventoryFilters'
import type { Producto, ProductoForm, Categoria } from '@/types'
import styles from './carrusel.module.css'

interface Props {
  productos: Producto[]
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
}

export default function CarruselClient({ productos, categorias, subcategorias }: Props) {
  const [criterios, setCriterios] = useState<CriteriosInventario>({})
  const [catId, setCatId] = useState('')
  const [genero, setGenero] = useState('')
  const [started, setStarted] = useState(false)
  const [set, setSet] = useState<Producto[]>([])
  const [idx, setIdx] = useState(0)
  const [form, setForm] = useState<ProductoForm>(() => productoAForm(productos[0] ?? ({} as Producto)))
  const [guardados, setGuardados] = useState<Set<string>>(new Set())
  const [modoCampos, setModoCampos] = useState<'rapido' | 'completo'>('rapido')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const flag = (k: keyof CriteriosInventario) => (v: boolean) =>
    setCriterios(c => ({ ...c, [k]: v || undefined }))

  function empezar() {
    const c: CriteriosInventario = {
      ...criterios,
      categoriaIds: catId ? [catId] : undefined,
      generos: genero ? [genero] : undefined,
    }
    const lista = filtrarInventario(productos, c)
    setSet(lista)
    setIdx(0)
    if (lista[0]) cargar(lista[0])
    setStarted(true)
  }

  function cargar(p: Producto) {
    setForm(productoAForm(p))
    setModoCampos('rapido')
    setDirty(false)
    setError('')
  }

  const actual = set[idx]

  // envuelve setForm para marcar dirty
  const setFormDirty: React.Dispatch<React.SetStateAction<ProductoForm>> = updater => {
    setDirty(true)
    setForm(updater)
  }

  function irA(nuevo: number) {
    if (nuevo < 0 || nuevo >= set.length) return
    setIdx(nuevo)
    cargar(set[nuevo])
  }

  function siguienteConAviso() {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Avanzar sin guardar?')) return
    irA(idx + 1)
  }

  function guardarYSiguiente() {
    if (!actual) return
    startTransition(async () => {
      const res = await updateProducto(actual.id, form)
      if (res.error) { setError(res.error); return }
      setGuardados(prev => new Set(prev).add(actual.id))
      setDirty(false)
      if (idx + 1 < set.length) irA(idx + 1)
      else setIdx(set.length) // fin
    })
  }

  if (!started) {
    return (
      <div className={styles.page}>
        <h1>Modo carrusel</h1>
        <p>Elige los filtros y pulsa Empezar.</p>
        <div className={styles.filtros}>
          <div className={styles.grupo}>
            <div className={styles.grupoTitulo}>Faltantes</div>
            <div className={styles.checks}>
              <Toggle checked={!!criterios.sinCategoria} onChange={flag('sinCategoria')} label="Sin categoría" />
              <Toggle checked={!!criterios.sinImagen} onChange={flag('sinImagen')} label="Sin imagen" />
              <Toggle checked={!!criterios.sinDescripcion} onChange={flag('sinDescripcion')} label="Sin descripción" />
              <Toggle checked={!!criterios.sinPrecio} onChange={flag('sinPrecio')} label="Sin precio" />
              <Toggle checked={!!criterios.sinSku} onChange={flag('sinSku')} label="Sin SKU" />
            </div>
          </div>
          <div className={styles.grupo}>
            <div className={styles.grupoTitulo}>Categoría / género</div>
            <select value={catId} onChange={e => setCatId(e.target.value)}>
              <option value="">— Cualquier categoría —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.valor}</option>)}
            </select>
            <select value={genero} onChange={e => setGenero(e.target.value)}>
              <option value="">— Cualquier género —</option>
              {['Hombre', 'Mujer', 'Unisex', 'Niños'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className={styles.grupo}>
            <div className={styles.grupoTitulo}>Stock y estado</div>
            <div className={styles.checks}>
              <Toggle checked={!!criterios.stockBajo} onChange={flag('stockBajo')} label="Stock bajo (<5)" />
              <Toggle checked={!!criterios.sinStock} onChange={flag('sinStock')} label="Sin stock" />
              <Toggle checked={criterios.activo === true} onChange={v => setCriterios(c => ({ ...c, activo: v ? true : undefined }))} label="Solo activos" />
              <Toggle checked={criterios.activo === false} onChange={v => setCriterios(c => ({ ...c, activo: v ? false : undefined }))} label="Solo inactivos" />
            </div>
          </div>
        </div>
        <div className={styles.nav}>
          <Link href="/admin/productos">← Volver</Link>
          <button onClick={empezar}>Empezar</button>
        </div>
      </div>
    )
  }

  if (idx >= set.length) {
    return (
      <div className={styles.page}>
        <div className={styles.resumen}>
          <h2>¡Listo!</h2>
          <p>{guardados.size} guardados de {set.length} en el recorrido.</p>
          <Link href="/admin/productos">Volver a productos</Link>
        </div>
      </div>
    )
  }

  if (set.length === 0) {
    return (
      <div className={styles.page}>
        <p>Ningún producto coincide con esos filtros.</p>
        <button onClick={() => setStarted(false)}>← Cambiar filtros</button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.contador}>{idx + 1} / {set.length}</span>
          <span>
            {guardados.has(actual.id) && <span className={styles.saved}>✓ guardado</span>}{' '}
            <button onClick={() => setStarted(false)}>Cambiar filtros</button>
          </span>
        </div>
        <h3>{actual.nombre}</h3>
        <ProductoFields form={form} setForm={setFormDirty} categorias={categorias} subcategorias={subcategorias} modo={modoCampos} />
        {modoCampos === 'rapido' && (
          <button type="button" onClick={() => setModoCampos('completo')}>Ver más campos</button>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.nav}>
          <button onClick={() => irA(idx - 1)} disabled={idx === 0}>← Anterior</button>
          <button onClick={siguienteConAviso}>Saltar →</button>
          <button onClick={guardarYSiguiente} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar y siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
