# POS P7a — Reportes: Libro SAR + Reporte de ventas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo de Reportes (índice + menú + exportación xlsx) y entregar el Libro de ventas SAR (fiscal) y el Reporte de ventas (filtros + detallado), todo solo lectura.

**Architecture:** Lógica pura de armado de filas/totales en `lib/reportes/` (fuente única para la tabla HTML y el xlsx, con tests). Cada reporte: un módulo server `data.ts` (consulta filtrada), una página Server Component que renderiza la tabla, un client component para controles (filtros/imprimir), y un Route Handler que exporta xlsx reusando el mismo `data.ts` + AoA. Excel real con la lib `xlsx` (SheetJS) ya instalada, solo en route handlers server-side.

**Tech Stack:** Next.js 16 (Server Components + Route Handlers), Supabase (cliente de servidor), TypeScript, Vitest, CSS Modules con tokens Merlin, `xlsx` (SheetJS `^0.18.5`, ya en package.json).

## Global Constraints

- Idioma español; moneda en Lempiras con `formatPrice()` (de `@/lib/store/format`).
- **Solo lectura:** ningún reporte escribe en la BD; todas las consultas son `select`.
- **Libro SAR = solo documentos fiscales:** `documentos.tipo in ('factura','nota_credito')`. Comprobantes y devoluciones internas NO entran. NC en negativo. Totales del período.
- **Excel real, server-side:** `import * as XLSX from 'xlsx'` SOLO en route handlers (`app/api/reportes/…/export/route.ts`), nunca en el bundle del cliente. Patrón idéntico a `app/api/inventario/export/route.ts` (auth con `supabase.auth.getUser()` → 401 si no hay user; `XLSX.write(wb,{type:'buffer',bookType:'xlsx'})`; `new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="…xlsx"' } })`).
- **Fechas ancladas a Honduras:** reuso `rangoDesdePreset` (`lib/dashboard/rango.ts`); consultas filtran por `created_at` timestamptz en `[desde, hasta)`.
- **La lógica de armado de filas/totales vive en `lib/reportes/` puro y testeado** (una fuente para tabla HTML y xlsx).
- Impresión HTML + `@media print`. CSS Modules con tokens Merlin; iconos dorados (regla `.iconoMerlin` de P6).
- Cliente de Supabase de **servidor** en páginas y route handlers. `SUPABASE_SERVICE_ROLE_KEY` nunca al cliente.
- Al terminar cada tarea: `npm test` y, si se tocaron tipos/Server Actions/route handlers, `npx tsc --noEmit`. Reportar resultados reales.

---

## File Structure

- `types/index.ts` — `FilaLibroVentas`, `TotalesLibroVentas`, `DocumentoFiscal`, `FilaReporteVenta`, `FiltrosReporteVentas` (Tasks 1, 4).
- `lib/reportes/libro-ventas.ts` + tests — puras del libro (Task 1).
- `lib/reportes/ventas.ts` + tests — puras del reporte de ventas (Task 4).
- `lib/reportes/fecha.ts` — helper puro `fechaHN(iso)` compartido (Task 1).
- `components/admin/icons.tsx` (+ icono `reportes`), `components/admin/Sidebar.tsx` (ítem Reportes), `app/admin/reportes/page.tsx` (índice) + css (Task 2).
- `app/admin/reportes/libro-ventas/{data.ts, page.tsx, LibroVentasControls.tsx, libro.module.css}` + `app/api/reportes/libro-ventas/export/route.ts` (Task 3).
- `app/admin/reportes/ventas/{data.ts, page.tsx, VentasControls.tsx, ventas.module.css}` + `app/api/reportes/ventas/export/route.ts` (Task 5).

---

## Task 1: Puras del Libro de ventas + helper de fecha

**Files:**
- Modify: `types/index.ts`
- Create: `lib/reportes/fecha.ts`
- Create: `lib/reportes/libro-ventas.ts`
- Test: `lib/reportes/tests/libro-ventas.test.ts`

**Interfaces:**
- Produces:
  - Tipos `DocumentoFiscal`, `FilaLibroVentas`, `TotalesLibroVentas`.
  - `fechaHN(iso: string): string` (→ 'DD/MM/YYYY' día local Honduras).
  - `filaLibro(d: DocumentoFiscal): FilaLibroVentas`
  - `totalesLibro(filas: FilaLibroVentas[]): TotalesLibroVentas`
  - `libroAoA(filas: FilaLibroVentas[], totales: TotalesLibroVentas): (string|number)[][]`

- [ ] **Step 1: Agregar tipos en `types/index.ts`** (al final)

```typescript
// ── POS P7a: Reportes ──────────────────────────────────────────────
export interface DocumentoFiscal extends Documento {
  cai_codigo: string | null
}
export interface FilaLibroVentas {
  fecha: string
  correlativo: string
  cai: string
  cliente: string
  rtn: string
  exento: number
  exonerado: number
  gravado15: number
  isv15: number
  gravado18: number
  isv18: number
  total: number
  esNota: boolean
}
export interface TotalesLibroVentas {
  exento: number; exonerado: number; gravado15: number; isv15: number
  gravado18: number; isv18: number; total: number
}
```

- [ ] **Step 2: Crear `lib/reportes/fecha.ts`**

```typescript
// Día local de Honduras (UTC-6, sin DST) de un instante ISO → 'DD/MM/YYYY'.
const OFFSET_HONDURAS_MS = 6 * 60 * 60 * 1000
export function fechaHN(iso: string): string {
  const local = new Date(new Date(iso).getTime() - OFFSET_HONDURAS_MS)
  const d = String(local.getUTCDate()).padStart(2, '0')
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const y = local.getUTCFullYear()
  return `${d}/${m}/${y}`
}
```

- [ ] **Step 3: Escribir el test (falla)** — `lib/reportes/tests/libro-ventas.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { filaLibro, totalesLibro, libroAoA } from '../libro-ventas'
import { fechaHN } from '../fecha'
import type { DocumentoFiscal } from '@/types'

function doc(over: Partial<DocumentoFiscal>): DocumentoFiscal {
  return {
    id: 'x', tipo: 'factura', correlativo: '000-001-01-00000001', numero_comprobante: null,
    cai_id: 'c', caja_id: 'k', sesion_id: null, vendedor_id: null, cliente_id: null,
    cliente_nombre: 'Juan', cliente_rtn: '0801-1990-12345', cliente_identidad: null,
    exonerado: false, orden_compra_exenta: null, constancia_exonerado: null, registro_sag: null,
    pedido_id: null, documento_origen_id: null, total_exento: 0, total_exonerado: 0,
    total_gravado15: 200, total_gravado18: 0, isv15: 30, isv18: 0, descuento_total: 0,
    total: 230, total_letras: '', tasa_usd: null, estado: 'emitido', anulado_motivo: null,
    anulado_at: null, notas: null, usuario: null, created_at: '2026-08-10T15:00:00Z',
    cai_codigo: 'ABC123', ...over,
  }
}

describe('filaLibro', () => {
  it('factura: valores en positivo', () => {
    const f = filaLibro(doc({}))
    expect(f.gravado15).toBe(200); expect(f.isv15).toBe(30); expect(f.total).toBe(230)
    expect(f.cai).toBe('ABC123'); expect(f.rtn).toBe('0801-1990-12345'); expect(f.esNota).toBe(false)
  })
  it('nota de crédito: valores en negativo', () => {
    const f = filaLibro(doc({ tipo: 'nota_credito', correlativo: '000-001-03-00000005' }))
    expect(f.gravado15).toBe(-200); expect(f.isv15).toBe(-30); expect(f.total).toBe(-230)
    expect(f.esNota).toBe(true)
  })
})

describe('totalesLibro', () => {
  it('suma factura + NC (neto)', () => {
    const filas = [filaLibro(doc({})), filaLibro(doc({ tipo: 'nota_credito' }))]
    const t = totalesLibro(filas)
    expect(t.gravado15).toBe(0); expect(t.isv15).toBe(0); expect(t.total).toBe(0)
  })
})

describe('libroAoA', () => {
  it('encabezado + filas + fila de totales', () => {
    const filas = [filaLibro(doc({}))]
    const aoa = libroAoA(filas, totalesLibro(filas))
    expect(aoa[0][0]).toBe('Fecha')
    expect(aoa[1][1]).toBe('000-001-01-00000001')
    expect(aoa[aoa.length - 1][0]).toBe('TOTALES')
    expect(aoa[aoa.length - 1][11]).toBe(230)
  })
})

describe('fechaHN', () => {
  it('formatea el día local de Honduras', () => {
    // 2026-08-10T02:00:00Z = 2026-08-09 20:00 Honduras
    expect(fechaHN('2026-08-10T02:00:00Z')).toBe('09/08/2026')
  })
})
```

- [ ] **Step 4: Correr el test para verlo fallar**

Run: `npm test -- lib/reportes/tests/libro-ventas.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 5: Implementar `lib/reportes/libro-ventas.ts`**

```typescript
import type { DocumentoFiscal, FilaLibroVentas, TotalesLibroVentas } from '@/types'
import { fechaHN } from './fecha'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function filaLibro(d: DocumentoFiscal): FilaLibroVentas {
  const s = d.tipo === 'nota_credito' ? -1 : 1
  return {
    fecha: d.created_at,
    correlativo: d.correlativo ?? '—',
    cai: d.cai_codigo ?? '—',
    cliente: d.cliente_nombre,
    rtn: d.cliente_rtn ?? '',
    exento: round2(s * d.total_exento),
    exonerado: round2(s * d.total_exonerado),
    gravado15: round2(s * d.total_gravado15),
    isv15: round2(s * d.isv15),
    gravado18: round2(s * d.total_gravado18),
    isv18: round2(s * d.isv18),
    total: round2(s * d.total),
    esNota: d.tipo === 'nota_credito',
  }
}

export function totalesLibro(filas: FilaLibroVentas[]): TotalesLibroVentas {
  return filas.reduce<TotalesLibroVentas>((t, f) => ({
    exento: round2(t.exento + f.exento),
    exonerado: round2(t.exonerado + f.exonerado),
    gravado15: round2(t.gravado15 + f.gravado15),
    isv15: round2(t.isv15 + f.isv15),
    gravado18: round2(t.gravado18 + f.gravado18),
    isv18: round2(t.isv18 + f.isv18),
    total: round2(t.total + f.total),
  }), { exento: 0, exonerado: 0, gravado15: 0, isv15: 0, gravado18: 0, isv18: 0, total: 0 })
}

export function libroAoA(filas: FilaLibroVentas[], totales: TotalesLibroVentas): (string | number)[][] {
  const head = ['Fecha', 'Correlativo', 'CAI', 'Cliente', 'RTN', 'Exento', 'Exonerado', 'Gravado 15%', 'ISV 15%', 'Gravado 18%', 'ISV 18%', 'Total']
  const body = filas.map(f => [
    fechaHN(f.fecha), f.correlativo, f.cai, f.cliente, f.rtn,
    f.exento, f.exonerado, f.gravado15, f.isv15, f.gravado18, f.isv18, f.total,
  ])
  const foot = ['TOTALES', '', '', '', '', totales.exento, totales.exonerado, totales.gravado15, totales.isv15, totales.gravado18, totales.isv18, totales.total]
  return [head, ...body, foot]
}
```

- [ ] **Step 6: Correr los tests (pasan)**

Run: `npm test -- lib/reportes/tests/libro-ventas.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add types/index.ts lib/reportes/fecha.ts lib/reportes/libro-ventas.ts lib/reportes/tests/libro-ventas.test.ts
git commit -m "feat(reportes): puras del libro de ventas (fila/totales/AoA, NC en negativo) + fechaHN"
```

---

## Task 2: Menú "Reportes" + índice del módulo

**Files:**
- Modify: `components/admin/icons.tsx` (agregar icono `reportes`)
- Modify: `components/admin/Sidebar.tsx` (ítem Reportes en INGRESOS)
- Create: `app/admin/reportes/page.tsx`
- Create: `app/admin/reportes/reportes.module.css`

**Interfaces:**
- Consumes: `ICONOS`/`IconoKey` (P6).
- Produces: ruta `/admin/reportes` (índice); nueva clave de icono `reportes`.

- [ ] **Step 1: Agregar el icono `reportes` en `components/admin/icons.tsx`**

Seguir el patrón existente (`base(path, className)`, SVG viewBox 0 0 24 24, stroke currentColor). Agregar un icono de barras/reporte y registrarlo en el mapa `ICONOS`:

```tsx
export const IconReportes = ({ className }: { className?: string }) => base(
  <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  className,
)
```
y en el objeto `ICONOS` agregar `reportes: IconReportes,`.

- [ ] **Step 2: Agregar el ítem "Reportes" al grupo INGRESOS en `Sidebar.tsx`**

En `NAV_GROUPS`, grupo `INGRESOS`, agregar como último ítem (después de `cuentas-por-cobrar`):

```tsx
      { href: '/admin/reportes', icon: 'reportes', label: 'Reportes' },
```

(No se toca `isActive` ni la estructura; el nuevo href entra a `ALL_HREFS` automáticamente.)

- [ ] **Step 3: Crear el índice `app/admin/reportes/page.tsx`**

Server Component estático que lista los reportes disponibles (Ola 1: Libro de ventas SAR y Reporte de ventas). Los de Ola 2 no se listan.

```tsx
import Link from 'next/link'
import styles from './reportes.module.css'

const REPORTES = [
  { href: '/admin/reportes/libro-ventas', titulo: 'Libro de ventas (SAR)', desc: 'Registro fiscal de facturas y notas de crédito, con desglose de base e ISV por tasa. Exportable a Excel.' },
  { href: '/admin/reportes/ventas', titulo: 'Reporte de ventas', desc: 'Ventas por documento con filtros (fecha, tipo, cliente, vendedor, caja, método) y detalle de ítems. Exportable a Excel.' },
]

export default function ReportesIndexPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Reportes</h1>
      <div className={styles.grid}>
        {REPORTES.map(r => (
          <Link key={r.href} href={r.href} className={styles.card}>
            <div className={styles.cardTitulo}>{r.titulo}</div>
            <div className={styles.cardDesc}>{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Crear `app/admin/reportes/reportes.module.css`**

```css
.page { padding: 1.5rem; }
.title { font-size: 1.25rem; font-weight: 800; margin-bottom: 1.25rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
.card {
  display: block; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 1.25rem;
  text-decoration: none; color: inherit; transition: border-color 0.12s;
}
.card:hover { border-color: var(--accent); }
.cardTitulo { font-size: 0.98rem; font-weight: 800; color: var(--accent); margin-bottom: 0.4rem; }
.cardDesc { font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; }
```

- [ ] **Step 5: Verificación, typecheck, lint, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores en los archivos tocados; build OK.

Visual (si el dev server es viable): menú muestra "Reportes" en Ingresos con icono dorado; `/admin/reportes` lista las 2 cards.

```bash
git add components/admin/icons.tsx components/admin/Sidebar.tsx app/admin/reportes/page.tsx app/admin/reportes/reportes.module.css
git commit -m "feat(reportes): icono + item de menu Reportes e indice del modulo"
```

---

## Task 3: Libro de ventas SAR (página + impresión + export xlsx)

**Files:**
- Create: `app/admin/reportes/libro-ventas/data.ts`
- Create: `app/admin/reportes/libro-ventas/page.tsx`
- Create: `app/admin/reportes/libro-ventas/LibroVentasControls.tsx`
- Create: `app/admin/reportes/libro-ventas/libro.module.css`
- Create: `app/api/reportes/libro-ventas/export/route.ts`

**Interfaces:**
- Consumes: `filaLibro`, `totalesLibro`, `libroAoA`, `fechaHN` (Task 1); `rangoDesdePreset` (`lib/dashboard/rango.ts`); `formatPrice`.
- Produces: `obtenerLibroVentas(desde: string, hasta: string): Promise<DocumentoFiscal[]>` en `data.ts`.

- [ ] **Step 1: Crear el módulo de datos `data.ts`**

```typescript
import { createClient } from '@/lib/supabase-server'
import type { DocumentoFiscal } from '@/types'

// Embed cai_autorizaciones(cai) por FK simple documento.cai_id (to-one → objeto).
interface DocFiscalEmbed {
  cai_autorizaciones: { cai: string } | null
  [k: string]: unknown
}

export async function obtenerLibroVentas(desde: string, hasta: string): Promise<DocumentoFiscal[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documentos')
    .select('*, cai_autorizaciones(cai)')
    .in('tipo', ['factura', 'nota_credito'])
    .gte('created_at', desde)
    .lt('created_at', hasta)
    .order('created_at', { ascending: true })
  if (error) console.error('[libro-ventas] error:', error.message)
  return ((data ?? []) as unknown as DocFiscalEmbed[]).map(({ cai_autorizaciones, ...d }) => ({
    ...(d as unknown as DocumentoFiscal),
    cai_codigo: cai_autorizaciones?.cai ?? null,
  }))
}
```

- [ ] **Step 2: Crear la página `page.tsx`** (Server Component)

Lee el período de `searchParams` (`?preset=&desde=&hasta=`, default `mes`), obtiene los documentos, arma las filas y renderiza la tabla + los controles.

```tsx
import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { obtenerLibroVentas } from './data'
import { filaLibro, totalesLibro } from '@/lib/reportes/libro-ventas'
import { fechaHN } from '@/lib/reportes/fecha'
import LibroVentasControls from './LibroVentasControls'
import styles from './libro.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function LibroVentasPage({
  searchParams,
}: { searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const docs = await obtenerLibroVentas(rango.desde, rango.hasta)
  const filas = docs.map(filaLibro)
  const totales = totalesLibro(filas)
  const qs = new URLSearchParams({ preset, ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString()

  return (
    <div className={styles.page}>
      <LibroVentasControls preset={preset} desde={sp.desde} hasta={sp.hasta}
        etiqueta={etiquetaRango(preset, rango)} exportHref={`/api/reportes/libro-ventas/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Libro de ventas</h1>
        <p className={styles.periodo}>{etiquetaRango(preset, rango)}</p>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th><th>Correlativo</th><th>CAI</th><th>Cliente</th><th>RTN</th>
              <th>Exento</th><th>Exonerado</th><th>Gravado 15%</th><th>ISV 15%</th>
              <th>Gravado 18%</th><th>ISV 18%</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className={f.esNota ? styles.filaNota : ''}>
                <td>{fechaHN(f.fecha)}</td><td>{f.correlativo}</td><td>{f.cai}</td>
                <td>{f.cliente}</td><td>{f.rtn}</td>
                <td className={styles.num}>{formatPrice(f.exento)}</td>
                <td className={styles.num}>{formatPrice(f.exonerado)}</td>
                <td className={styles.num}>{formatPrice(f.gravado15)}</td>
                <td className={styles.num}>{formatPrice(f.isv15)}</td>
                <td className={styles.num}>{formatPrice(f.gravado18)}</td>
                <td className={styles.num}>{formatPrice(f.isv18)}</td>
                <td className={styles.num}>{formatPrice(f.total)}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={12} className={styles.vacio}>Sin documentos fiscales en el período.</td></tr>}
          </tbody>
          <tfoot>
            <tr className={styles.totales}>
              <td colSpan={5}>TOTALES</td>
              <td className={styles.num}>{formatPrice(totales.exento)}</td>
              <td className={styles.num}>{formatPrice(totales.exonerado)}</td>
              <td className={styles.num}>{formatPrice(totales.gravado15)}</td>
              <td className={styles.num}>{formatPrice(totales.isv15)}</td>
              <td className={styles.num}>{formatPrice(totales.gravado18)}</td>
              <td className={styles.num}>{formatPrice(totales.isv18)}</td>
              <td className={styles.num}>{formatPrice(totales.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear `LibroVentasControls.tsx`** (client: selector de período, imprimir, exportar)

```tsx
'use client'
import { useRouter } from 'next/navigation'
import type { PresetRango } from '@/types'
import styles from './libro.module.css'

const PRESETS: { v: PresetRango; l: string }[] = [
  { v: 'mes', l: 'Mes' }, { v: 'anio', l: 'Año' }, { v: 'personalizado', l: 'Personalizado' },
]

export default function LibroVentasControls({ preset, desde, hasta, etiqueta, exportHref }: {
  preset: PresetRango; desde?: string; hasta?: string; etiqueta: string; exportHref: string
}) {
  const router = useRouter()
  function ir(next: { preset?: PresetRango; desde?: string; hasta?: string }) {
    const p = new URLSearchParams()
    p.set('preset', next.preset ?? preset)
    const d = next.desde ?? desde, h = next.hasta ?? hasta
    if ((next.preset ?? preset) === 'personalizado') { if (d) p.set('desde', d); if (h) p.set('hasta', h) }
    router.push(`/admin/reportes/libro-ventas?${p.toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.presets}>
        {PRESETS.map(pr => (
          <button key={pr.v} type="button" className={`${styles.presetBtn} ${preset === pr.v ? styles.presetOn : ''}`}
            onClick={() => ir({ preset: pr.v })}>{pr.l}</button>
        ))}
        {preset === 'personalizado' && (
          <span className={styles.rangoLibre}>
            <input type="date" value={desde ?? ''} onChange={e => ir({ preset: 'personalizado', desde: e.target.value, hasta: hasta ?? e.target.value })} />
            <span>a</span>
            <input type="date" value={hasta ?? ''} onChange={e => ir({ preset: 'personalizado', desde: desde ?? e.target.value, hasta: e.target.value })} />
          </span>
        )}
        <span className={styles.etiqueta}>{etiqueta}</span>
      </div>
      <div className={styles.acciones}>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Crear `libro.module.css`**

```css
.page { padding: 1.25rem; }
.controls { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.presets { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.presetBtn { border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted); border-radius: var(--radius-input); padding: 0.3rem 0.8rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.presetOn { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
.rangoLibre { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
.rangoLibre input { border: 1px solid var(--border); border-radius: var(--radius-input); padding: 0.25rem 0.5rem; }
.etiqueta { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
.acciones { display: flex; gap: 0.5rem; }
.btnAccion { padding: 0.4rem 0.9rem; display: inline-flex; align-items: center; }
.hoja { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 1.5rem; overflow-x: auto; }
.titulo { font-size: 1.1rem; font-weight: 800; }
.periodo { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; text-transform: capitalize; }
.tabla { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.tabla th, .tabla td { border: 1px solid var(--border); padding: 0.35rem 0.5rem; text-align: left; white-space: nowrap; }
.tabla th { background: var(--bg-hover); font-weight: 700; }
.num { text-align: right; }
.filaNota { color: var(--error-strong); }
.totales td { font-weight: 800; background: var(--bg-hover); }
.vacio { text-align: center; color: var(--text-muted); padding: 1rem; }
@media print {
  .noPrint { display: none; }
  .page { padding: 0; }
  .hoja { border: none; box-shadow: none; padding: 0; }
}
```

- [ ] **Step 5: Crear el route handler de export `app/api/reportes/libro-ventas/export/route.ts`**

Sigue el patrón de `app/api/inventario/export/route.ts` (auth + XLSX buffer).

```typescript
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import { obtenerLibroVentas } from '@/app/admin/reportes/libro-ventas/data'
import { filaLibro, totalesLibro, libroAoA } from '@/lib/reportes/libro-ventas'
import type { PresetRango } from '@/types'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const presetRaw = url.searchParams.get('preset')
  const preset: PresetRango = PRESETS.includes(presetRaw as PresetRango) ? (presetRaw as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), url.searchParams.get('desde') ?? undefined, url.searchParams.get('hasta') ?? undefined)

  const docs = await obtenerLibroVentas(rango.desde, rango.hasta)
  const filas = docs.map(filaLibro)
  const aoa = libroAoA(filas, totalesLibro(filas))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Libro de ventas')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="libro-ventas.xlsx"',
    },
  })
}
```

- [ ] **Step 6: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; build OK.

Visual (si el dev server es viable, requiere sesión admin): `/admin/reportes/libro-ventas` muestra la tabla del mes con NC en negativo y totales; "Exportar Excel" descarga un `.xlsx` que abre con los datos + fila de totales; "Imprimir" oculta los controles. Si no es viable, razonar la correctitud y anotarlo.

```bash
git add app/admin/reportes/libro-ventas app/api/reportes/libro-ventas
git commit -m "feat(reportes): libro de ventas SAR (tabla fiscal por periodo, imprimible, export xlsx)"
```

---

## Task 4: Puras del Reporte de ventas

**Files:**
- Modify: `types/index.ts`
- Create: `lib/reportes/ventas.ts`
- Test: `lib/reportes/tests/ventas.test.ts`

**Interfaces:**
- Consumes: `fechaHN` (Task 1).
- Produces:
  - Tipos `FilaReporteVenta`, `FiltrosReporteVentas`.
  - `tipoDocLabel(tipo: string): string`
  - `ventasAoA(filas: FilaReporteVenta[], incluirItems: boolean): (string|number)[][]`

- [ ] **Step 1: Agregar tipos en `types/index.ts`** (al final)

```typescript
export interface FilaReporteVenta {
  id: string
  numero: string
  fecha: string
  cliente: string
  vendedor: string
  caja: string
  tipo: 'factura' | 'comprobante' | 'nota_credito' | 'devolucion'
  total: number
  items: { descripcion: string; cantidad: number; precio: number; importe: number }[]
}
export interface FiltrosReporteVentas {
  desde: string; hasta: string
  tipo?: 'factura' | 'comprobante' | 'nota_credito' | 'devolucion'
  clienteId?: string; vendedorId?: string; cajaId?: string; metodoId?: string
}
```

- [ ] **Step 2: Escribir el test (falla)** — `lib/reportes/tests/ventas.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { tipoDocLabel, ventasAoA } from '../ventas'
import type { FilaReporteVenta } from '@/types'

const fila: FilaReporteVenta = {
  id: 'd1', numero: 'C-00000001', fecha: '2026-08-10T15:00:00Z', cliente: 'Juan',
  vendedor: 'Ana', caja: 'Caja 1', tipo: 'comprobante', total: 230,
  items: [{ descripcion: 'Camiseta', cantidad: 2, precio: 115, importe: 230 }],
}

describe('tipoDocLabel', () => {
  it('traduce los tipos', () => {
    expect(tipoDocLabel('factura')).toBe('Factura')
    expect(tipoDocLabel('nota_credito')).toBe('Nota de crédito')
    expect(tipoDocLabel('devolucion')).toBe('Devolución')
  })
})

describe('ventasAoA', () => {
  it('resumen: una fila por documento', () => {
    const aoa = ventasAoA([fila], false)
    expect(aoa[0]).toEqual(['Número', 'Fecha', 'Cliente', 'Vendedor', 'Caja', 'Tipo doc', 'Total'])
    expect(aoa[1][0]).toBe('C-00000001')
    expect(aoa[1][6]).toBe(230)
    expect(aoa).toHaveLength(2)
  })
  it('detallado: documento + filas de ítem', () => {
    const aoa = ventasAoA([fila], true)
    expect(aoa[0][0]).toBe('Tipo fila')
    expect(aoa[1][0]).toBe('Documento')
    expect(aoa[2][0]).toBe('  Ítem')
    expect(aoa[2][7]).toBe('Camiseta')
    expect(aoa).toHaveLength(3)
  })
})
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `npm test -- lib/reportes/tests/ventas.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar `lib/reportes/ventas.ts`**

```typescript
import type { FilaReporteVenta } from '@/types'
import { fechaHN } from './fecha'

export function tipoDocLabel(tipo: string): string {
  switch (tipo) {
    case 'factura': return 'Factura'
    case 'comprobante': return 'Comprobante'
    case 'nota_credito': return 'Nota de crédito'
    case 'devolucion': return 'Devolución'
    default: return tipo
  }
}

export function ventasAoA(filas: FilaReporteVenta[], incluirItems: boolean): (string | number)[][] {
  if (!incluirItems) {
    const head = ['Número', 'Fecha', 'Cliente', 'Vendedor', 'Caja', 'Tipo doc', 'Total']
    return [head, ...filas.map(f => [f.numero, fechaHN(f.fecha), f.cliente, f.vendedor, f.caja, tipoDocLabel(f.tipo), f.total])]
  }
  const head = ['Tipo fila', 'Número', 'Fecha', 'Cliente', 'Vendedor', 'Caja', 'Tipo doc', 'Descripción', 'Cantidad', 'Precio', 'Importe/Total']
  const rows: (string | number)[][] = [head]
  for (const f of filas) {
    rows.push(['Documento', f.numero, fechaHN(f.fecha), f.cliente, f.vendedor, f.caja, tipoDocLabel(f.tipo), '', '', '', f.total])
    for (const it of f.items) {
      rows.push(['  Ítem', '', '', '', '', '', '', it.descripcion, it.cantidad, it.precio, it.importe])
    }
  }
  return rows
}
```

- [ ] **Step 5: Correr los tests (pasan)**

Run: `npm test -- lib/reportes/tests/ventas.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add types/index.ts lib/reportes/ventas.ts lib/reportes/tests/ventas.test.ts
git commit -m "feat(reportes): puras del reporte de ventas (tipoDocLabel, ventasAoA resumen/detallado)"
```

---

## Task 5: Reporte de ventas (página + filtros + detallado + export xlsx)

**Files:**
- Create: `app/admin/reportes/ventas/data.ts`
- Create: `app/admin/reportes/ventas/page.tsx`
- Create: `app/admin/reportes/ventas/VentasControls.tsx`
- Create: `app/admin/reportes/ventas/ventas.module.css`
- Create: `app/api/reportes/ventas/export/route.ts`

**Interfaces:**
- Consumes: `tipoDocLabel`, `ventasAoA` (Task 4); `filaVenta`-equivalente construido en `data.ts`; `rangoDesdePreset` (rango); `numeroDocumento` (`@/lib/pos/documentos`) y `numeroDocumentoDevolucion` (`@/lib/pos/devoluciones`); `formatPrice`.
- Produces: `obtenerReporteVentas(filtros: FiltrosReporteVentas): Promise<FilaReporteVenta[]>` + `obtenerOpcionesFiltro(): Promise<{ clientes; vendedores; cajas; metodos }>` en `data.ts`.

- [ ] **Step 1: Crear `data.ts`** (consulta con filtros + armado de filas)

```typescript
import { createClient } from '@/lib/supabase-server'
import { numeroDocumento } from '@/lib/pos/documentos'
import { numeroDocumentoDevolucion } from '@/lib/pos/devoluciones'
import type { FiltrosReporteVentas, FilaReporteVenta, Documento, DocumentoItem } from '@/types'

interface DocConItems extends Documento {
  documento_items: DocumentoItem[]
  vendedores: { nombre: string } | null
  cajas: { nombre: string } | null
}

function numero(d: Documento): string {
  return d.tipo === 'factura' || d.tipo === 'comprobante'
    ? numeroDocumento({ tipo: d.tipo, correlativo: d.correlativo, numero_comprobante: d.numero_comprobante })
    : numeroDocumentoDevolucion(d)
}

export async function obtenerReporteVentas(f: FiltrosReporteVentas): Promise<FilaReporteVenta[]> {
  const supabase = await createClient()
  let q = supabase
    .from('documentos')
    .select('*, documento_items(descripcion, cantidad, precio_unitario, importe), vendedores(nombre), cajas(nombre)')
    .neq('estado', 'anulado')
    .gte('created_at', f.desde).lt('created_at', f.hasta)
    .order('created_at', { ascending: false })
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.clienteId) q = q.eq('cliente_id', f.clienteId)
  if (f.vendedorId) q = q.eq('vendedor_id', f.vendedorId)
  if (f.cajaId) q = q.eq('caja_id', f.cajaId)

  // Filtro por método de pago: documentos con al menos un pago de ese método.
  let idsPorMetodo: Set<string> | null = null
  if (f.metodoId) {
    const { data: pagos } = await supabase.from('documento_pagos').select('documento_id').eq('metodo_id', f.metodoId)
    idsPorMetodo = new Set((pagos ?? []).map(p => p.documento_id as string))
  }

  const { data, error } = await q
  if (error) console.error('[reporte-ventas] error:', error.message)
  let rows = (data ?? []) as unknown as DocConItems[]
  if (idsPorMetodo) rows = rows.filter(d => idsPorMetodo!.has(d.id))

  return rows.map(d => ({
    id: d.id,
    numero: numero(d),
    fecha: d.created_at,
    cliente: d.cliente_nombre,
    vendedor: d.vendedores?.nombre ?? '—',
    caja: d.cajas?.nombre ?? '—',
    tipo: d.tipo,
    total: Number(d.total),
    items: (d.documento_items ?? []).map(it => ({
      descripcion: it.descripcion, cantidad: Number(it.cantidad),
      precio: Number(it.precio_unitario), importe: Number(it.importe),
    })),
  }))
}

export async function obtenerOpcionesFiltro() {
  const supabase = await createClient()
  const [{ data: clientes }, { data: vendedores }, { data: cajas }, { data: metodos }] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cajas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('metodos_pago').select('id, nombre').eq('activo', true).order('orden'),
  ])
  return { clientes: clientes ?? [], vendedores: vendedores ?? [], cajas: cajas ?? [], metodos: metodos ?? [] }
}

// Construye los FiltrosReporteVentas desde searchParams (para página y route).
export function parseFiltros(sp: URLSearchParams, desde: string, hasta: string): FiltrosReporteVentas {
  const tipo = sp.get('tipo')
  const tipos = ['factura', 'comprobante', 'nota_credito', 'devolucion']
  return {
    desde, hasta,
    tipo: tipo && tipos.includes(tipo) ? (tipo as FiltrosReporteVentas['tipo']) : undefined,
    clienteId: sp.get('clienteId') || undefined,
    vendedorId: sp.get('vendedorId') || undefined,
    cajaId: sp.get('cajaId') || undefined,
    metodoId: sp.get('metodoId') || undefined,
  }
}
```

- [ ] **Step 2: Crear la página `page.tsx`**

```tsx
import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { Fragment } from 'react'
import { obtenerReporteVentas, obtenerOpcionesFiltro, parseFiltros } from './data'
import { tipoDocLabel } from '@/lib/reportes/ventas'
import { fechaHN } from '@/lib/reportes/fecha'
import VentasControls from './VentasControls'
import styles from './ventas.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function VentasReportePage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const usp = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][])
  const filtros = parseFiltros(usp, rango.desde, rango.hasta)
  const detallado = sp.detallado === '1'

  const [filas, opciones] = await Promise.all([obtenerReporteVentas(filtros), obtenerOpcionesFiltro()])
  const qs = usp.toString()

  return (
    <div className={styles.page}>
      <VentasControls sp={sp} preset={preset} etiqueta={etiquetaRango(preset, rango)}
        opciones={opciones} detallado={detallado} exportHref={`/api/reportes/ventas/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Reporte de ventas</h1>
        <p className={styles.periodo}>{etiquetaRango(preset, rango)} · {filas.length} documento(s)</p>
        <table className={styles.tabla}>
          <thead>
            <tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Caja</th><th>Tipo</th><th className={styles.num}>Total</th></tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <Fragment key={f.id}>
                <tr>
                  <td>{f.numero}</td><td>{fechaHN(f.fecha)}</td><td>{f.cliente}</td>
                  <td>{f.vendedor}</td><td>{f.caja}</td><td>{tipoDocLabel(f.tipo)}</td>
                  <td className={styles.num}>{formatPrice(f.total)}</td>
                </tr>
                {detallado && f.items.map((it, j) => (
                  <tr key={`${f.id}-${j}`} className={styles.filaItem}>
                    <td></td><td colSpan={4}>{it.descripcion}</td>
                    <td>{it.cantidad} × {formatPrice(it.precio)}</td>
                    <td className={styles.num}>{formatPrice(it.importe)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {filas.length === 0 && <tr><td colSpan={7} className={styles.vacio}>Sin documentos para los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear `VentasControls.tsx`** (client: filtros, toggle detallado, imprimir, exportar)

```tsx
'use client'
import { useRouter } from 'next/navigation'
import type { PresetRango } from '@/types'
import styles from './ventas.module.css'

type Opcion = { id: string; nombre: string }
interface Props {
  sp: Record<string, string | undefined>
  preset: PresetRango
  etiqueta: string
  detallado: boolean
  opciones: { clientes: Opcion[]; vendedores: Opcion[]; cajas: Opcion[]; metodos: Opcion[] }
  exportHref: string
}

const PRESETS: { v: PresetRango; l: string }[] = [
  { v: 'hoy', l: 'Hoy' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mes' }, { v: 'anio', l: 'Año' }, { v: 'personalizado', l: 'Personalizado' },
]

export default function VentasControls({ sp, preset, etiqueta, detallado, opciones, exportHref }: Props) {
  const router = useRouter()
  function ir(cambios: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { ...sp, ...cambios }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    router.push(`/admin/reportes/ventas?${p.toString()}`)
  }
  return (
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <div className={styles.fila}>
        {PRESETS.map(pr => (
          <button key={pr.v} type="button" className={`${styles.presetBtn} ${preset === pr.v ? styles.presetOn : ''}`}
            onClick={() => ir({ preset: pr.v, desde: undefined, hasta: undefined })}>{pr.l}</button>
        ))}
        {preset === 'personalizado' && (
          <>
            <input type="date" value={sp.desde ?? ''} onChange={e => ir({ preset: 'personalizado', desde: e.target.value })} />
            <input type="date" value={sp.hasta ?? ''} onChange={e => ir({ preset: 'personalizado', hasta: e.target.value })} />
          </>
        )}
        <span className={styles.etiqueta}>{etiqueta}</span>
      </div>
      <div className={styles.fila}>
        <select value={sp.tipo ?? ''} onChange={e => ir({ tipo: e.target.value || undefined })}>
          <option value="">Todos los tipos</option>
          <option value="factura">Factura</option><option value="comprobante">Comprobante</option>
          <option value="nota_credito">Nota de crédito</option><option value="devolucion">Devolución</option>
        </select>
        <select value={sp.clienteId ?? ''} onChange={e => ir({ clienteId: e.target.value || undefined })}>
          <option value="">Todos los clientes</option>
          {opciones.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={sp.vendedorId ?? ''} onChange={e => ir({ vendedorId: e.target.value || undefined })}>
          <option value="">Todos los vendedores</option>
          {opciones.vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <select value={sp.cajaId ?? ''} onChange={e => ir({ cajaId: e.target.value || undefined })}>
          <option value="">Todas las cajas</option>
          {opciones.cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={sp.metodoId ?? ''} onChange={e => ir({ metodoId: e.target.value || undefined })}>
          <option value="">Todos los métodos</option>
          {opciones.metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={detallado} onChange={e => ir({ detallado: e.target.checked ? '1' : undefined })} /> Detallado
        </label>
        <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
        <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Crear `ventas.module.css`**

Reusa el mismo look que `libro.module.css`. (Copiar las reglas de `.page/.controls/.presetBtn/.presetOn/.etiqueta/.btnAccion/.hoja/.titulo/.periodo/.tabla/.num/.vacio/@media print` de Task 3 Step 4, y agregar):

```css
.fila { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.controls { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
.controls select, .controls input[type="date"] { border: 1px solid var(--border); border-radius: var(--radius-input); padding: 0.3rem 0.5rem; font-size: 0.8rem; background: var(--bg-card); }
.check { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
.filaItem { color: var(--text-muted); font-size: 0.76rem; }
.filaItem td { background: var(--bg-hover); }
```

> El implementador debe incluir en `ventas.module.css` TODAS las clases que la página y el control referencian (`page, controls, fila, presetBtn, presetOn, etiqueta, check, btnAccion, hoja, titulo, periodo, tabla, num, vacio, filaItem, noPrint` + `@media print`). Copiar las compartidas de `libro.module.css`.

- [ ] **Step 5: Crear el route handler `app/api/reportes/ventas/export/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import { obtenerReporteVentas, parseFiltros } from '@/app/admin/reportes/ventas/data'
import { ventasAoA } from '@/lib/reportes/ventas'
import type { PresetRango } from '@/types'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const presetRaw = url.searchParams.get('preset')
  const preset: PresetRango = PRESETS.includes(presetRaw as PresetRango) ? (presetRaw as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), url.searchParams.get('desde') ?? undefined, url.searchParams.get('hasta') ?? undefined)
  const filtros = parseFiltros(url.searchParams, rango.desde, rango.hasta)
  const detallado = url.searchParams.get('detallado') === '1'

  const filas = await obtenerReporteVentas(filtros)
  const aoa = ventasAoA(filas, detallado)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Ventas')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reporte-ventas.xlsx"',
    },
  })
}
```

- [ ] **Step 6: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; build OK.

Visual (si el dev server es viable): `/admin/reportes/ventas` con los 6 filtros + toggle detallado (expande ítems); "Exportar Excel" respeta filtros y modo detallado; "Imprimir" oculta controles. Si no es viable, razonar la correctitud.

```bash
git add app/admin/reportes/ventas app/api/reportes/ventas
git commit -m "feat(reportes): reporte de ventas (filtros, detallado, imprimible, export xlsx)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Índice + menú Reportes → Task 2. ✅
- Export xlsx server-side (lib ya instalada) → Tasks 3, 5 (route handlers). ✅
- Libro SAR (solo fiscales, período, columnas, NC negativo, totales) → Tasks 1 (puras) + 3 (página/export). ✅
- Reporte de ventas (6 filtros + detallado) → Tasks 4 (puras) + 5 (página/export). ✅
- Impresión HTML → Tasks 3, 5 (`@media print`, `.noPrint`). ✅
- Lógica pura en `lib/reportes/` con tests → Tasks 1, 4. ✅
- Solo lectura → todas las consultas son `select`. ✅

**2. Placeholder scan:** sin TBD/TODO. El único "copiar reglas compartidas de libro.module.css" (Task 5 Step 4) es una instrucción concreta con la lista exacta de clases requeridas, no un placeholder de lógica.

**3. Type consistency:** `DocumentoFiscal`/`FilaLibroVentas`/`TotalesLibroVentas` (Task 1) usados en Task 3; `FilaReporteVenta`/`FiltrosReporteVentas` (Task 4) usados en Task 5. `libroAoA`/`ventasAoA`/`tipoDocLabel`/`fechaHN` con firmas consistentes entre las puras (Tasks 1, 4) y sus consumidores (Tasks 3, 5). `obtenerLibroVentas`/`obtenerReporteVentas`/`parseFiltros` definidos en `data.ts` y reusados por página y route handler. ✅

## Notas de entrega (para el controlador SDD)

- **No hay migración** en P7a — todo es solo lectura sobre tablas existentes. No hay smoke SQL.
- Verificación visual final: menú "Reportes", índice, Libro SAR del mes (NC en negativo, totales), Reporte de ventas (filtros + detallado), y una exportación xlsx de prueba de cada uno que abra en Excel.
- Al mergear: FF a `main` (sin paso de migración esta vez). Verificar deploy READY por SHA.
