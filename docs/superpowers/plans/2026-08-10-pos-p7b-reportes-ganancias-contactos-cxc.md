# POS P7b — Reportes Ola 2: Ganancias + Contactos + CxC cascada — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el módulo de Reportes con Ganancias por ítem, Clientes/proveedores (directorio) y CxC en cascada, reusando la infra de P7a.

**Architecture:** Dos funciones SQL de agregación (ganancias por ítem con costo del kardex; contactos con totales de rango + saldos snapshot). Lógica pura de filas/totales/AoA en `lib/reportes/` (fuente única para tabla HTML y xlsx). Cada reporte: `data.ts` server (reusado por página y route handler), página Server Component, controls client, export xlsx server-only. Mismo patrón que P7a (libro-ventas/ventas).

**Tech Stack:** Next.js 16 (Server Components + Route Handlers), Supabase (RPC/consultas de servidor), TypeScript, Vitest, CSS Modules con tokens Merlin, `xlsx` (SheetJS, ya instalada).

## Global Constraints

- Idioma español; moneda en Lempiras con `formatPrice()`.
- **Solo lectura:** ninguna escritura; consultas y funciones SQL solo `select`/agregación.
- **Ganancias sin ISV:** ventas = base (Σ `documento_items.base`); `Ganancia = Ventas − Costo`; costo del kardex `venta_pos` neto de devoluciones NC (misma matemática que `dashboard_resumen.costo_ventas` de P6.1). Ítems libres (`producto_id null`) incluidos como una fila "Ítems libres" con costo 0.
- **Excel real, server-only:** `import * as XLSX from 'xlsx'` SOLO en route handlers (`app/api/reportes/…/export/route.ts`). Auth `getUser()`→401. Patrón idéntico a P7a (`app/api/reportes/libro-ventas/export/route.ts`).
- **`.limit(5000)`** en toda consulta de lista (lección de P7a: evita el tope silencioso ~1000 de Supabase).
- **Fechas ancladas a Honduras:** reuso `rangoDesdePreset`; consultas por `created_at` en `[desde, hasta)`.
- **Matemática de dinero en SQL; nombres/SKU/categoría resueltos en el server por lote.** Lógica de filas/totales/AoA en `lib/reportes/` puro y testeado.
- Migración idempotente (`create or replace function`), aplicada por el usuario antes del push; smoke con `to_regprocedure`.
- Impresión HTML + `@media print`. CSS Modules con tokens Merlin; iconos dorados.
- Cliente de Supabase de **servidor** en páginas y route handlers. `SUPABASE_SERVICE_ROLE_KEY` nunca al cliente.
- Al terminar cada tarea: `npm test` y, si se tocaron tipos/route handlers, `npx tsc --noEmit`. Reportar resultados reales.

---

## File Structure

- `supabase/migrations/2026-08-10-pos-p7b-reportes.sql` + `supabase/smoke-p7b-reportes.sql` (Task 1).
- `types/index.ts` — tipos nuevos (Task 2).
- `lib/reportes/{ganancias.ts, contactos.ts, cxc-cascada.ts}` + tests (Task 2).
- `app/admin/reportes/ganancias/{data.ts, page.tsx, GananciasControls.tsx, ganancias.module.css}` + `app/api/reportes/ganancias/export/route.ts` (Task 3).
- `app/admin/reportes/contactos/{data.ts, page.tsx, ContactosControls.tsx, contactos.module.css}` + `app/api/reportes/contactos/export/route.ts` (Task 4).
- `app/admin/reportes/cxc/{data.ts, page.tsx, CxcCascada.tsx, cxc.module.css}` + `app/api/reportes/cxc/export/route.ts` (Task 5).
- `app/admin/reportes/page.tsx` — se agrega una card por reporte en su tarea (Tasks 3, 4, 5).

---

## Task 1: Migración SQL — `reporte_ganancias_items` + `reporte_contactos`

**Files:**
- Create: `supabase/migrations/2026-08-10-pos-p7b-reportes.sql`
- Create: `supabase/smoke-p7b-reportes.sql`

**Interfaces:**
- Produces (RPC `security invoker`, `revoke from public,anon` + `grant to authenticated`):
  - `reporte_ganancias_items(p_desde timestamptz, p_hasta timestamptz)` → `(producto_id uuid, variante_id uuid, cantidad numeric, ventas numeric, costo numeric)`.
  - `reporte_contactos(p_desde timestamptz, p_hasta timestamptz)` → `(id uuid, nombre text, rtn text, identidad text, es_cliente boolean, es_proveedor boolean, total_ventas numeric, total_compras numeric, saldo_cxc numeric, saldo_cxp numeric)`.

**Notas de esquema (verificadas):** `documento_items(producto_id, variante_id, base, cantidad)`; `movimientos_inventario(tipo, cantidad, costo_resultante, referencia, created_at)` con `venta_pos`→`referencia='documento:'||uuid` (cantidad negativa) y devolución de venta→`referencia='nota_credito:'||uuid`; `documentos(tipo, estado, total, cliente_id, created_at)`; `compras(proveedor_id, estado, total, created_at)`; vista `documento_saldos(cliente_id, saldo)`; vista `compra_saldos(proveedor_id, saldo)`; `clientes(id, nombre, rtn, identidad, es_cliente, es_proveedor, activo)`.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/2026-08-10-pos-p7b-reportes.sql`:

```sql
-- POS P7b — Funciones de agregación de reportes (SOLO LECTURA).
-- Ganancias: ventas SIN ISV (documento_items.base) vs costo del kardex (venta_pos
-- neto de devoluciones NC), por producto/variante. Ítems libres (producto_id null)
-- colapsan en una sola fila. Contactos: totales de rango + saldos snapshot.

create or replace function reporte_ganancias_items(p_desde timestamptz, p_hasta timestamptz)
returns table (producto_id uuid, variante_id uuid, cantidad numeric, ventas numeric, costo numeric)
language sql
security invoker
set search_path = public
as $$
  with ventas as (
    select di.producto_id, di.variante_id,
      sum(case when d.tipo in ('factura','comprobante') then di.cantidad else -di.cantidad end) as cantidad,
      sum(case when d.tipo in ('factura','comprobante') then di.base else -di.base end) as ventas
    from documento_items di
    join documentos d on d.id = di.documento_id
    where d.estado <> 'anulado'
      and d.tipo in ('factura','comprobante','nota_credito','devolucion')
      and d.created_at >= p_desde and d.created_at < p_hasta
    group by di.producto_id, di.variante_id
  ),
  costos as (
    select m.producto_id, m.variante_id, sum(m.c) as costo
    from (
      select mi.producto_id, mi.variante_id, (mi.costo_resultante * (-mi.cantidad)) as c
      from movimientos_inventario mi
      join documentos d on d.id = split_part(mi.referencia, ':', 2)::uuid
      where mi.tipo = 'venta_pos' and mi.referencia like 'documento:%'
        and d.estado <> 'anulado'
        and mi.created_at >= p_desde and mi.created_at < p_hasta
      union all
      select mi.producto_id, mi.variante_id, -(mi.costo_resultante * mi.cantidad) as c
      from movimientos_inventario mi
      where mi.tipo = 'devolucion' and mi.referencia like 'nota_credito:%'
        and mi.created_at >= p_desde and mi.created_at < p_hasta
    ) m
    group by m.producto_id, m.variante_id
  )
  select
    coalesce(v.producto_id, c.producto_id) as producto_id,
    coalesce(v.variante_id, c.variante_id) as variante_id,
    coalesce(v.cantidad, 0)::numeric as cantidad,
    coalesce(v.ventas, 0)::numeric as ventas,
    coalesce(c.costo, 0)::numeric as costo
  from ventas v
  full outer join costos c
    on v.producto_id is not distinct from c.producto_id
   and v.variante_id is not distinct from c.variante_id;
$$;

create or replace function reporte_contactos(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id uuid, nombre text, rtn text, identidad text,
  es_cliente boolean, es_proveedor boolean,
  total_ventas numeric, total_compras numeric, saldo_cxc numeric, saldo_cxp numeric
)
language sql
security invoker
set search_path = public
as $$
  select cl.id, cl.nombre, cl.rtn, cl.identidad, cl.es_cliente, cl.es_proveedor,
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then d.total else -d.total end)
      from documentos d
      where d.cliente_id = cl.id and d.estado <> 'anulado'
        and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as total_ventas,
    coalesce((
      select sum(c.total) from compras c
      where c.proveedor_id = cl.id and c.estado <> 'anulada'
        and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::numeric as total_compras,
    coalesce((select sum(s.saldo) from documento_saldos s where s.cliente_id = cl.id and s.saldo > 0), 0)::numeric as saldo_cxc,
    coalesce((select sum(s.saldo) from compra_saldos s where s.proveedor_id = cl.id and s.saldo > 0), 0)::numeric as saldo_cxp
  from clientes cl
  where cl.activo = true;
$$;

revoke execute on function reporte_ganancias_items(timestamptz, timestamptz) from public, anon;
revoke execute on function reporte_contactos(timestamptz, timestamptz) from public, anon;
grant execute on function reporte_ganancias_items(timestamptz, timestamptz) to authenticated;
grant execute on function reporte_contactos(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Escribir el smoke**

`supabase/smoke-p7b-reportes.sql`:

```sql
do $$
begin
  if to_regprocedure('public.reporte_ganancias_items(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta reporte_ganancias_items'; end if;
  if to_regprocedure('public.reporte_contactos(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta reporte_contactos'; end if;
  perform * from reporte_ganancias_items(now() - interval '30 days', now());
  perform * from reporte_contactos(now() - interval '30 days', now());
  raise notice 'Smoke P7b reportes: 2 funciones OK';
end $$;
select 'Success: reportes P7b OK' as resultado;
```

- [ ] **Step 3: Typecheck del repo (no aplica la migración)**

Run: `npx tsc --noEmit`
Expected: sin errores (la migración es SQL; la aplica el usuario antes del push).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-10-pos-p7b-reportes.sql supabase/smoke-p7b-reportes.sql
git commit -m "feat(reportes): funciones SQL de ganancias por item y contactos (P7b)"
```

---

## Task 2: Tipos + puras `lib/reportes/` (ganancias, contactos, cxc-cascada)

**Files:**
- Modify: `types/index.ts`
- Create: `lib/reportes/ganancias.ts`
- Create: `lib/reportes/contactos.ts`
- Create: `lib/reportes/cxc-cascada.ts`
- Test: `lib/reportes/tests/ganancias.test.ts`
- Test: `lib/reportes/tests/contactos.test.ts`
- Test: `lib/reportes/tests/cxc-cascada.test.ts`

**Interfaces:**
- Consumes: `utilidadNeta`, `margen` de `lib/dashboard/metricas` (P6.1); `fechaHN` de `lib/reportes/fecha` (P7a).
- Produces (ver Step 1 para los tipos):
  - `filaGanancia(base): FilaGananciaItem`, `totalesGanancias(filas): TotalesGanancias`, `gananciasAoA(filas, totales): (string|number)[][]`.
  - `filaContacto(row): FilaContacto`, `contactosAoA(filas, rol): (string|number)[][]`.
  - `agruparCxc(saldos, hoy): GrupoCxc[]`, `cxcAoA(grupos): (string|number)[][]`.

- [ ] **Step 1: Agregar tipos en `types/index.ts`** (al final)

```typescript
// ── POS P7b: Reportes Ola 2 ─────────────────────────────────────────
export interface FilaGananciaItem {
  codigo: string
  nombre: string
  variante: string
  categoria: string
  cantidad: number
  ventas: number
  costo: number
  ganancia: number
  margen: number
}
export interface TotalesGanancias {
  ventas: number; costo: number; ganancia: number; margen: number
}
export type RolContacto = 'cliente' | 'proveedor' | 'ambos'
export interface FilaContacto {
  id: string
  nombre: string
  rtn: string
  identidad: string
  es_cliente: boolean
  es_proveedor: boolean
  total_ventas: number
  total_compras: number
  saldo_cxc: number
  saldo_cxp: number
}
export interface DocCxc {
  documento_id: string
  numero: string
  fecha: string
  vencimiento: string
  diasVencido: number
  saldo: number
}
export interface GrupoCxc {
  clienteId: string
  cliente: string
  total: number
  docs: DocCxc[]
}
```

- [ ] **Step 2: Escribir los tests (fallan)**

`lib/reportes/tests/ganancias.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { filaGanancia, totalesGanancias, gananciasAoA } from '../ganancias'

const base = { codigo: 'A1', nombre: 'Camiseta', variante: 'M', categoria: 'Ropa', cantidad: 3, ventas: 600, costo: 360 }

describe('filaGanancia', () => {
  it('ganancia = ventas − costo, margen%', () => {
    const f = filaGanancia(base)
    expect(f.ganancia).toBe(240)
    expect(f.margen).toBe(40)
  })
  it('ventas 0 → margen 0', () => {
    expect(filaGanancia({ ...base, ventas: 0, costo: 0 }).margen).toBe(0)
  })
})
describe('totalesGanancias', () => {
  it('suma ventas/costo/ganancia y margen global', () => {
    const filas = [filaGanancia(base), filaGanancia({ ...base, ventas: 400, costo: 300 })]
    const t = totalesGanancias(filas)
    expect(t.ventas).toBe(1000); expect(t.costo).toBe(660); expect(t.ganancia).toBe(340); expect(t.margen).toBe(34)
  })
})
describe('gananciasAoA', () => {
  it('encabezado + filas + totales', () => {
    const filas = [filaGanancia(base)]
    const aoa = gananciasAoA(filas, totalesGanancias(filas))
    expect(aoa[0][0]).toBe('Código')
    expect(aoa[1][0]).toBe('A1')
    expect(aoa[aoa.length - 1][0]).toBe('TOTALES')
  })
})
```

`lib/reportes/tests/contactos.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { filaContacto, contactosAoA } from '../contactos'
import type { FilaContacto } from '@/types'

const row = {
  id: 'c1', nombre: 'Juan', rtn: '0801-1990-1', identidad: null as string | null,
  es_cliente: true, es_proveedor: false,
  total_ventas: 5000, total_compras: 0, saldo_cxc: 1200, saldo_cxp: 0,
}

describe('filaContacto', () => {
  it('normaliza identidad null a "" y arma la fila', () => {
    const f = filaContacto(row)
    expect(f.identidad).toBe('')
    expect(f.es_cliente).toBe(true)
    expect(f.saldo_cxc).toBe(1200)
  })
})
describe('contactosAoA', () => {
  it('rol cliente: columnas de venta/CxC', () => {
    const aoa = contactosAoA([filaContacto(row)] as FilaContacto[], 'cliente')
    expect(aoa[0]).toContain('Total ventas')
    expect(aoa[0]).toContain('Saldo CxC')
    expect(aoa[1][0]).toBe('Juan')
  })
})
```

`lib/reportes/tests/cxc-cascada.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { agruparCxc, cxcAoA } from '../cxc-cascada'

const hoy = new Date('2026-08-10T12:00:00Z')
const saldos = [
  { documento_id: 'd1', cliente_id: 'c1', cliente_nombre: 'Juan', numero: 'F-1', fecha: '2026-08-01', fecha_vencimiento: '2026-08-05', saldo: 500 },
  { documento_id: 'd2', cliente_id: 'c1', cliente_nombre: 'Juan', numero: 'F-2', fecha: '2026-08-08', fecha_vencimiento: '2026-08-20', saldo: 300 },
  { documento_id: 'd3', cliente_id: 'c2', cliente_nombre: 'Ana', numero: 'F-3', fecha: '2026-08-02', fecha_vencimiento: '2026-08-06', saldo: 200 },
]

describe('agruparCxc', () => {
  it('agrupa por cliente con total y docs', () => {
    const g = agruparCxc(saldos, hoy)
    expect(g).toHaveLength(2)
    const juan = g.find(x => x.clienteId === 'c1')!
    expect(juan.total).toBe(800)
    expect(juan.docs).toHaveLength(2)
    expect(juan.docs[0].diasVencido).toBeGreaterThan(0) // F-1 venció el 05, hoy es 10
  })
})
describe('cxcAoA', () => {
  it('filas de cliente + documentos intercaladas', () => {
    const aoa = cxcAoA(agruparCxc(saldos, hoy))
    expect(aoa[0][0]).toBe('Tipo fila')
    expect(aoa.some(r => r[0] === 'Cliente')).toBe(true)
    expect(aoa.some(r => r[0] === '  Documento')).toBe(true)
  })
})
```

- [ ] **Step 3: Correr los tests para verlos fallar**

Run: `npm test -- lib/reportes/tests/ganancias.test.ts lib/reportes/tests/contactos.test.ts lib/reportes/tests/cxc-cascada.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 4: Implementar `lib/reportes/ganancias.ts`**

```typescript
import type { FilaGananciaItem, TotalesGanancias } from '@/types'
import { utilidadNeta, margen } from '@/lib/dashboard/metricas'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function filaGanancia(base: Omit<FilaGananciaItem, 'ganancia' | 'margen'>): FilaGananciaItem {
  const ganancia = utilidadNeta(base.ventas, base.costo)
  return { ...base, ganancia, margen: margen(base.ventas, ganancia) }
}

export function totalesGanancias(filas: FilaGananciaItem[]): TotalesGanancias {
  const ventas = round2(filas.reduce((s, f) => s + f.ventas, 0))
  const costo = round2(filas.reduce((s, f) => s + f.costo, 0))
  const ganancia = round2(ventas - costo)
  return { ventas, costo, ganancia, margen: margen(ventas, ganancia) }
}

export function gananciasAoA(filas: FilaGananciaItem[], t: TotalesGanancias): (string | number)[][] {
  const head = ['Código', 'Nombre', 'Variante', 'Categoría', 'Cantidad', 'Ventas', 'Costos', 'Ganancia', 'Ganancia %']
  const body = filas.map(f => [f.codigo, f.nombre, f.variante, f.categoria, f.cantidad, f.ventas, f.costo, f.ganancia, f.margen])
  const foot = ['TOTALES', '', '', '', '', t.ventas, t.costo, t.ganancia, t.margen]
  return [head, ...body, foot]
}
```

- [ ] **Step 5: Implementar `lib/reportes/contactos.ts`**

```typescript
import type { FilaContacto, RolContacto } from '@/types'

interface ContactoRow {
  id: string; nombre: string; rtn: string | null; identidad: string | null
  es_cliente: boolean; es_proveedor: boolean
  total_ventas: number; total_compras: number; saldo_cxc: number; saldo_cxp: number
}

export function filaContacto(row: ContactoRow): FilaContacto {
  return {
    id: row.id, nombre: row.nombre, rtn: row.rtn ?? '', identidad: row.identidad ?? '',
    es_cliente: row.es_cliente, es_proveedor: row.es_proveedor,
    total_ventas: Number(row.total_ventas), total_compras: Number(row.total_compras),
    saldo_cxc: Number(row.saldo_cxc), saldo_cxp: Number(row.saldo_cxp),
  }
}

function rolLabel(f: FilaContacto): string {
  if (f.es_cliente && f.es_proveedor) return 'Cliente y proveedor'
  if (f.es_proveedor) return 'Proveedor'
  return 'Cliente'
}

export function contactosAoA(filas: FilaContacto[], rol: RolContacto): (string | number)[][] {
  if (rol === 'cliente') {
    return [['Nombre', 'RTN/Identidad', 'Total ventas', 'Saldo CxC'],
      ...filas.map(f => [f.nombre, f.rtn || f.identidad, f.total_ventas, f.saldo_cxc])]
  }
  if (rol === 'proveedor') {
    return [['Nombre', 'RTN/Identidad', 'Total compras', 'Saldo CxP'],
      ...filas.map(f => [f.nombre, f.rtn || f.identidad, f.total_compras, f.saldo_cxp])]
  }
  return [['Nombre', 'RTN/Identidad', 'Rol', 'Total ventas', 'Total compras', 'Saldo CxC', 'Saldo CxP'],
    ...filas.map(f => [f.nombre, f.rtn || f.identidad, rolLabel(f), f.total_ventas, f.total_compras, f.saldo_cxc, f.saldo_cxp])]
}
```

- [ ] **Step 6: Implementar `lib/reportes/cxc-cascada.ts`**

```typescript
import type { GrupoCxc, DocCxc } from '@/types'
import { fechaHN } from './fecha'

interface SaldoRow {
  documento_id: string; cliente_id: string; cliente_nombre: string
  numero: string; fecha: string; fecha_vencimiento: string; saldo: number
}

// Días vencidos: > 0 si fecha_vencimiento ya pasó respecto a hoy (día local).
function diasVencido(fechaVenc: string, hoy: Date): number {
  const venc = new Date(fechaVenc + 'T00:00:00Z').getTime()
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.floor((h - venc) / (24 * 60 * 60 * 1000))
}

export function agruparCxc(saldos: SaldoRow[], hoy: Date): GrupoCxc[] {
  const mapa = new Map<string, GrupoCxc>()
  for (const s of saldos) {
    let g = mapa.get(s.cliente_id)
    if (!g) { g = { clienteId: s.cliente_id, cliente: s.cliente_nombre, total: 0, docs: [] }; mapa.set(s.cliente_id, g) }
    const doc: DocCxc = {
      documento_id: s.documento_id, numero: s.numero,
      fecha: s.fecha, vencimiento: s.fecha_vencimiento,
      diasVencido: diasVencido(s.fecha_vencimiento, hoy), saldo: Number(s.saldo),
    }
    g.docs.push(doc)
    g.total = Math.round((g.total + doc.saldo) * 100) / 100
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
}

export function cxcAoA(grupos: GrupoCxc[]): (string | number)[][] {
  const head = ['Tipo fila', 'Cliente / Número', 'Fecha', 'Vencimiento', 'Días vencido', 'Saldo']
  const rows: (string | number)[][] = [head]
  for (const g of grupos) {
    rows.push(['Cliente', g.cliente, '', '', '', g.total])
    for (const d of g.docs) {
      rows.push(['  Documento', d.numero, fechaHN(d.fecha), fechaHN(d.vencimiento + 'T00:00:00Z'), d.diasVencido, d.saldo])
    }
  }
  return rows
}
```

> Nota: `fecha`/`fecha_vencimiento` de `documento_saldos` son `date` (llegan como `'YYYY-MM-DD'`). `fechaHN` espera un ISO; para el `date` se le pasa `+ 'T00:00:00Z'` para formatearlo sin desfase (es medianoche UTC → el mismo día en Honduras al restar 6h queda el día anterior; para fechas `date` puras conviene formatear directo). **Ajuste:** en `cxcAoA`, para las columnas de fecha de un `date` puro, NO uses `fechaHN` (que resta 6h); formatéalas con un helper local que reordene `'YYYY-MM-DD'` → `'DD/MM/YYYY'` sin tocar zona. Agrega en `cxc-cascada.ts`:

```typescript
function fechaDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
```

y usa `fechaDate(d.fecha)` / `fechaDate(d.vencimiento)` en `cxcAoA` (en vez de `fechaHN`). Actualiza el test de `cxcAoA` si comparas fechas.

- [ ] **Step 7: Correr los tests (pasan)**

Run: `npm test -- lib/reportes`
Expected: PASS (los 3 nuevos + los de P7a).

- [ ] **Step 8: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add types/index.ts lib/reportes/ganancias.ts lib/reportes/contactos.ts lib/reportes/cxc-cascada.ts lib/reportes/tests/
git commit -m "feat(reportes): puras de ganancias, contactos y CxC en cascada (P7b)"
```

---

## Task 3: Ganancias por ítem (página + impresión + export)

**Files:**
- Create: `app/admin/reportes/ganancias/data.ts`
- Create: `app/admin/reportes/ganancias/page.tsx`
- Create: `app/admin/reportes/ganancias/GananciasControls.tsx`
- Create: `app/admin/reportes/ganancias/ganancias.module.css`
- Create: `app/api/reportes/ganancias/export/route.ts`
- Modify: `app/admin/reportes/page.tsx` (agregar card)

**Interfaces:**
- Consumes: `filaGanancia`, `totalesGanancias`, `gananciasAoA` (Task 2); `reporte_ganancias_items` (Task 1); `rangoDesdePreset`/`etiquetaRango`; `formatPrice`.
- Produces: `obtenerGanancias(desde, hasta): Promise<FilaGananciaItem[]>` en `data.ts`.

- [ ] **Step 1: Crear `data.ts`** (RPC + resolución de nombres por lote)

```typescript
import { createClient } from '@/lib/supabase-server'
import { filaGanancia } from '@/lib/reportes/ganancias'
import type { FilaGananciaItem } from '@/types'

interface RowGanancia { producto_id: string | null; variante_id: string | null; cantidad: number; ventas: number; costo: number }

export async function obtenerGanancias(desde: string, hasta: string): Promise<FilaGananciaItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reporte_ganancias_items', { p_desde: desde, p_hasta: hasta })
  if (error) console.error('[ganancias] error:', error.message)
  const rows = (data ?? []) as RowGanancia[]

  const prodIds = [...new Set(rows.map(r => r.producto_id).filter(Boolean) as string[])]
  const varIds = [...new Set(rows.map(r => r.variante_id).filter(Boolean) as string[])]

  const [{ data: productos }, { data: variantes }] = await Promise.all([
    prodIds.length
      ? supabase.from('productos').select('id, sku, nombre, categorias:categorias!productos_categoria_id_fkey(valor)').in('id', prodIds)
      : Promise.resolve({ data: [] as { id: string; sku: string | null; nombre: string; categorias: { valor: string } | null }[] }),
    varIds.length
      ? supabase.from('producto_variantes').select('id, nombre').in('id', varIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  const pMap = new Map((productos ?? []).map(p => [p.id, p]))
  const vMap = new Map((variantes ?? []).map(v => [v.id, v.nombre]))

  return rows.map(r => {
    if (r.producto_id == null) {
      return filaGanancia({ codigo: '', nombre: 'Ítems libres', variante: '', categoria: '', cantidad: Number(r.cantidad), ventas: Number(r.ventas), costo: Number(r.costo) })
    }
    const p = pMap.get(r.producto_id)
    return filaGanancia({
      codigo: p?.sku ?? '', nombre: p?.nombre ?? '—',
      variante: r.variante_id ? (vMap.get(r.variante_id) ?? '') : '',
      categoria: p?.categorias?.valor ?? '',
      cantidad: Number(r.cantidad), ventas: Number(r.ventas), costo: Number(r.costo),
    })
  }).sort((a, b) => b.ganancia - a.ganancia)
}
```

> Nota: verificar el nombre del constraint del FK de categoría (`productos_categoria_id_fkey`) contra el embed usado en otras páginas (p. ej. `app/admin/pos/page.tsx` usa `categorias!productos_categoria_id_fkey(valor)`); si difiere, ajustar.

- [ ] **Step 2: Crear la página `page.tsx`**

Usa el MISMO patrón que `app/admin/reportes/libro-ventas/page.tsx` (ya en el repo — léelo como referencia): lee `searchParams` (preset default `mes`), calcula el rango, obtiene las filas, calcula totales con `totalesGanancias`, y renderiza controles + tabla. Estructura:

```tsx
import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import { obtenerGanancias } from './data'
import { totalesGanancias } from '@/lib/reportes/ganancias'
import GananciasControls from './GananciasControls'
import styles from './ganancias.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function GananciasPage({ searchParams }: { searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const filas = await obtenerGanancias(rango.desde, rango.hasta)
  const t = totalesGanancias(filas)
  const qs = new URLSearchParams({ preset, ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString()

  return (
    <div className={styles.page}>
      <GananciasControls preset={preset} desde={sp.desde} hasta={sp.hasta} etiqueta={etiquetaRango(preset, rango)} exportHref={`/api/reportes/ganancias/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Ganancias por ítem</h1>
        <div className={styles.totales}>
          <div><span className={styles.totLabel}>Total ventas</span><span className={styles.totVal}>{formatPrice(t.ventas)}</span></div>
          <div><span className={styles.totLabel}>Total costos</span><span className={styles.totVal}>{formatPrice(t.costo)}</span></div>
          <div><span className={styles.totLabel}>Total ganancias</span><span className={styles.totVal}>{formatPrice(t.ganancia)}</span></div>
          <div><span className={styles.totLabel}>Margen</span><span className={styles.totVal}>{t.margen}%</span></div>
        </div>
        <table className={styles.tabla}>
          <thead><tr><th>Código</th><th>Nombre</th><th>Variante</th><th>Categoría</th><th className={styles.num}>Cantidad</th><th className={styles.num}>Ventas</th><th className={styles.num}>Costos</th><th className={styles.num}>Ganancia</th><th className={styles.num}>Ganancia %</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{f.codigo}</td><td>{f.nombre}</td><td>{f.variante}</td><td>{f.categoria}</td>
                <td className={styles.num}>{f.cantidad}</td>
                <td className={styles.num}>{formatPrice(f.ventas)}</td>
                <td className={styles.num}>{formatPrice(f.costo)}</td>
                <td className={styles.num}>{formatPrice(f.ganancia)}</td>
                <td className={styles.num}>{f.margen}%</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={9} className={styles.vacio}>Sin ventas en el período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear `GananciasControls.tsx`**

Igual que `LibroVentasControls.tsx` de P7a (léelo): presets (Hoy/Semana/Mes/Año/Personalizado) que actualizan `searchParams` vía `useRouter`, + botones "Exportar Excel" (`<a href={exportHref}>`) e "Imprimir" (`window.print()`). Ruta base `/admin/reportes/ganancias`. Props `{ preset, desde?, hasta?, etiqueta, exportHref }`.

- [ ] **Step 4: Crear `ganancias.module.css`**

Copia el patrón de `libro.module.css` de P7a (page/controls/presetBtn/presetOn/etiqueta/acciones/btnAccion/hoja/titulo/tabla/num/vacio/@media print) y agrega:

```css
.totales { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.totales > div { display: flex; flex-direction: column; }
.totLabel { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
.totVal { font-size: 1.1rem; font-weight: 800; color: var(--accent); }
```

> Incluir TODAS las clases que page.tsx y el control referencian.

- [ ] **Step 5: Crear el route handler `app/api/reportes/ganancias/export/route.ts`**

Patrón idéntico al de P7a (`app/api/reportes/libro-ventas/export/route.ts`):

```typescript
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import { obtenerGanancias } from '@/app/admin/reportes/ganancias/data'
import { totalesGanancias, gananciasAoA } from '@/lib/reportes/ganancias'
import type { PresetRango } from '@/types'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = new URL(req.url)
  const p = url.searchParams.get('preset')
  const preset: PresetRango = PRESETS.includes(p as PresetRango) ? (p as PresetRango) : 'mes'
  const rango = rangoDesdePreset(preset, new Date(), url.searchParams.get('desde') ?? undefined, url.searchParams.get('hasta') ?? undefined)
  const filas = await obtenerGanancias(rango.desde, rango.hasta)
  const aoa = gananciasAoA(filas, totalesGanancias(filas))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Ganancias')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ganancias.xlsx"',
    },
  })
}
```

- [ ] **Step 6: Agregar la card al índice `app/admin/reportes/page.tsx`**

En el arreglo `REPORTES`, agregar:

```tsx
  { href: '/admin/reportes/ganancias', titulo: 'Ganancias por ítem', desc: 'Ventas, costos y ganancia por producto/variante en un período, con margen %. Exportable a Excel.' },
```

- [ ] **Step 7: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; build OK. Visual si el dev server es viable (totales + tabla + fila Ítems libres; export descarga xlsx). Si no, razonar.

```bash
git add app/admin/reportes/ganancias app/api/reportes/ganancias app/admin/reportes/page.tsx
git commit -m "feat(reportes): ganancias por item (tabla + totales, imprimible, export xlsx)"
```

---

## Task 4: Clientes y proveedores (directorio)

**Files:**
- Create: `app/admin/reportes/contactos/data.ts`
- Create: `app/admin/reportes/contactos/page.tsx`
- Create: `app/admin/reportes/contactos/ContactosControls.tsx`
- Create: `app/admin/reportes/contactos/contactos.module.css`
- Create: `app/api/reportes/contactos/export/route.ts`
- Modify: `app/admin/reportes/page.tsx` (card)

**Interfaces:**
- Consumes: `filaContacto`, `contactosAoA` (Task 2); `reporte_contactos` (Task 1); `rangoDesdePreset`; `formatPrice`.
- Produces: `obtenerContactos(desde, hasta, rol): Promise<FilaContacto[]>` en `data.ts`.

- [ ] **Step 1: Crear `data.ts`**

```typescript
import { createClient } from '@/lib/supabase-server'
import { filaContacto } from '@/lib/reportes/contactos'
import type { FilaContacto, RolContacto } from '@/types'

export async function obtenerContactos(desde: string, hasta: string, rol: RolContacto): Promise<FilaContacto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reporte_contactos', { p_desde: desde, p_hasta: hasta })
  if (error) console.error('[contactos] error:', error.message)
  let filas = (data ?? []).map(filaContacto)
  // Solo contactos con actividad o saldo (no listar inertes).
  filas = filas.filter(f => f.total_ventas !== 0 || f.total_compras !== 0 || f.saldo_cxc !== 0 || f.saldo_cxp !== 0)
  if (rol === 'cliente') filas = filas.filter(f => f.es_cliente)
  else if (rol === 'proveedor') filas = filas.filter(f => f.es_proveedor)
  filas.sort((a, b) => (rol === 'proveedor' ? b.total_compras - a.total_compras : b.total_ventas - a.total_ventas))
  return filas
}
```

- [ ] **Step 2: Crear `page.tsx`** — patrón de P7a; incluye un selector de rol además del rango. Muestra columnas según el rol (cliente → Total ventas/Saldo CxC; proveedor → Total compras/Saldo CxP; ambos → todas).

```tsx
import { rangoDesdePreset, etiquetaRango } from '@/lib/dashboard/rango'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango, RolContacto } from '@/types'
import { obtenerContactos } from './data'
import ContactosControls from './ContactosControls'
import styles from './contactos.module.css'

const PRESETS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']
const ROLES: RolContacto[] = ['cliente', 'proveedor', 'ambos']

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ preset?: string; desde?: string; hasta?: string; rol?: string }> }) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS.includes(sp.preset as PresetRango) ? (sp.preset as PresetRango) : 'mes'
  const rol: RolContacto = ROLES.includes(sp.rol as RolContacto) ? (sp.rol as RolContacto) : 'cliente'
  const rango = rangoDesdePreset(preset, new Date(), sp.desde, sp.hasta)
  const filas = await obtenerContactos(rango.desde, rango.hasta, rol)
  const qs = new URLSearchParams({ preset, rol, ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString()
  const esAmbos = rol === 'ambos', esProv = rol === 'proveedor'

  return (
    <div className={styles.page}>
      <ContactosControls preset={preset} desde={sp.desde} hasta={sp.hasta} rol={rol} etiqueta={etiquetaRango(preset, rango)} exportHref={`/api/reportes/contactos/export?${qs}`} />
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Clientes y proveedores</h1>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Nombre</th><th>RTN/Identidad</th>
              {esAmbos && <th>Rol</th>}
              {!esProv && <th className={styles.num}>Total ventas</th>}
              {(esProv || esAmbos) && <th className={styles.num}>Total compras</th>}
              {!esProv && <th className={styles.num}>Saldo CxC</th>}
              {(esProv || esAmbos) && <th className={styles.num}>Saldo CxP</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id}>
                <td>{f.nombre}</td><td>{f.rtn || f.identidad}</td>
                {esAmbos && <td>{f.es_cliente && f.es_proveedor ? 'Cliente y proveedor' : f.es_proveedor ? 'Proveedor' : 'Cliente'}</td>}
                {!esProv && <td className={styles.num}>{formatPrice(f.total_ventas)}</td>}
                {(esProv || esAmbos) && <td className={styles.num}>{formatPrice(f.total_compras)}</td>}
                {!esProv && <td className={styles.num}>{formatPrice(f.saldo_cxc)}</td>}
                {(esProv || esAmbos) && <td className={styles.num}>{formatPrice(f.saldo_cxp)}</td>}
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={7} className={styles.vacio}>Sin contactos para el filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear `ContactosControls.tsx`** — como `LibroVentasControls` pero con un `<select>` de rol (cliente/proveedor/ambos) que actualiza `?rol=`. Props `{ preset, desde?, hasta?, rol, etiqueta, exportHref }`. Ruta base `/admin/reportes/contactos`. Al cambiar preset o rol, reconstruye los searchParams preservando ambos.

- [ ] **Step 4: Crear `contactos.module.css`** — copia el patrón de `libro.module.css` (todas las clases usadas: page/controls/presetBtn/presetOn/etiqueta/acciones/btnAccion/hoja/titulo/tabla/num/vacio/@media print). Agrega el estilo del `<select>` de rol (mismo que los inputs de P7a).

- [ ] **Step 5: Crear `app/api/reportes/contactos/export/route.ts`** — patrón de P7a; lee `rol` del query, llama `obtenerContactos(desde,hasta,rol)`, arma con `contactosAoA(filas, rol)`, hoja "Contactos", filename `contactos.xlsx`.

- [ ] **Step 6: Agregar la card al índice**

```tsx
  { href: '/admin/reportes/contactos', titulo: 'Clientes y proveedores', desc: 'Directorio con total transado en el período y saldo actual (CxC/CxP), filtrable por rol. Exportable a Excel.' },
```

- [ ] **Step 7: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; build OK.

```bash
git add app/admin/reportes/contactos app/api/reportes/contactos app/admin/reportes/page.tsx
git commit -m "feat(reportes): directorio de clientes y proveedores (totales + saldo, imprimible, export xlsx)"
```

---

## Task 5: CxC en cascada (navegable)

**Files:**
- Create: `app/admin/reportes/cxc/data.ts`
- Create: `app/admin/reportes/cxc/page.tsx`
- Create: `app/admin/reportes/cxc/CxcCascada.tsx` (client: acordeón + imprimir + exportar)
- Create: `app/admin/reportes/cxc/cxc.module.css`
- Create: `app/api/reportes/cxc/export/route.ts`
- Modify: `app/admin/reportes/page.tsx` (card)

**Interfaces:**
- Consumes: `agruparCxc`, `cxcAoA` (Task 2); `hoyHonduras` (de `lib/cotizaciones/cotizaciones`); `formatPrice`.
- Produces: `obtenerCxc(): Promise<GrupoCxc[]>` en `data.ts`.

- [ ] **Step 1: Crear `data.ts`** (snapshot; sin rango)

```typescript
import { createClient } from '@/lib/supabase-server'
import { agruparCxc } from '@/lib/reportes/cxc-cascada'
import { hoyHonduras } from '@/lib/cotizaciones/cotizaciones'
import type { GrupoCxc } from '@/types'

export async function obtenerCxc(): Promise<GrupoCxc[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documento_saldos')
    .select('documento_id, cliente_id, cliente_nombre, tipo, correlativo, numero_comprobante, fecha, fecha_vencimiento, saldo')
    .gt('saldo', 0)
    .order('cliente_nombre', { ascending: true })
    .limit(5000)
  if (error) console.error('[cxc] error:', error.message)
  const rows = (data ?? []).map(r => ({
    documento_id: r.documento_id as string,
    cliente_id: r.cliente_id as string,
    cliente_nombre: r.cliente_nombre as string,
    numero: (r.tipo === 'factura' ? (r.correlativo as string | null) ?? '—' : `C-${String((r.numero_comprobante as number | null) ?? 0).padStart(8, '0')}`),
    fecha: r.fecha as string,
    fecha_vencimiento: r.fecha_vencimiento as string,
    saldo: Number(r.saldo),
  }))
  return agruparCxc(rows, hoyHonduras(new Date()))
}
```

> `documento_saldos` expone `tipo` ('factura'|'comprobante'), `correlativo`, `numero_comprobante`, `fecha`, `fecha_vencimiento`, `cliente_id`, `cliente_nombre`, `saldo` (ver `types/index.ts` `DocumentoSaldo`). Verificar que la vista incluya `cliente_id` y `documento_id` (P4c/P5a); si el nombre de la columna id difiere, ajustar.

- [ ] **Step 2: Crear la página `page.tsx`** (Server Component que obtiene los grupos y los pasa al cliente)

```tsx
import { obtenerCxc } from './data'
import CxcCascada from './CxcCascada'
import styles from './cxc.module.css'

export default async function CxcReportePage() {
  const grupos = await obtenerCxc()
  const total = grupos.reduce((s, g) => s + g.total, 0)
  return (
    <div className={styles.page}>
      <CxcCascada grupos={grupos} total={total} exportHref="/api/reportes/cxc/export" />
    </div>
  )
}
```

- [ ] **Step 3: Crear `CxcCascada.tsx`** (client: acordeón expand/colapsar + imprimir + exportar + filtro por cliente)

```tsx
'use client'
import { useState } from 'react'
import { formatPrice } from '@/lib/store/format'
import type { GrupoCxc } from '@/types'
import styles from './cxc.module.css'

export default function CxcCascada({ grupos, total, exportHref }: { grupos: GrupoCxc[]; total: number; exportHref: string }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState('')
  const visibles = grupos.filter(g => g.cliente.toLowerCase().includes(filtro.toLowerCase()))
  function toggle(id: string) {
    setAbiertos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  return (
    <>
      <div className={`${styles.controls} ${styles.noPrint}`}>
        <input className={styles.filtro} placeholder="Filtrar cliente…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        <span className={styles.etiqueta}>Total por cobrar: {formatPrice(total)}</span>
        <div className={styles.acciones}>
          <a href={exportHref} className={`btnMerlinSecondary ${styles.btnAccion}`}>Exportar Excel</a>
          <button type="button" className={`btnMerlinPrimary ${styles.btnAccion}`} onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <div className={styles.hoja}>
        <h1 className={styles.titulo}>Cuentas por cobrar</h1>
        {visibles.map(g => {
          const open = abiertos.has(g.clienteId)
          return (
            <div key={g.clienteId} className={styles.grupo}>
              <button type="button" className={styles.clienteRow} onClick={() => toggle(g.clienteId)} aria-expanded={open}>
                <span className={styles.caret}>{open ? '▾' : '▸'}</span>
                <span className={styles.clienteNombre}>{g.cliente}</span>
                <span className={styles.clienteMeta}>{g.docs.length} doc(s)</span>
                <span className={styles.clienteTotal}>{formatPrice(g.total)}</span>
              </button>
              {(open || undefined) && (
                <table className={`${styles.docs} ${styles.printExpand}`}>
                  <thead><tr><th>Número</th><th>Fecha</th><th>Vencimiento</th><th className={styles.num}>Días vencido</th><th className={styles.num}>Saldo</th></tr></thead>
                  <tbody>
                    {g.docs.map(d => (
                      <tr key={d.documento_id} className={d.diasVencido > 0 ? styles.vencido : ''}>
                        <td>{d.numero}</td><td>{fmt(d.fecha)}</td><td>{fmt(d.vencimiento)}</td>
                        <td className={styles.num}>{d.diasVencido > 0 ? d.diasVencido : 0}</td>
                        <td className={styles.num}>{formatPrice(d.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
        {visibles.length === 0 && <div className={styles.vacio}>Sin cuentas por cobrar.</div>}
      </div>
    </>
  )
}

function fmt(s: string): string { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }
```

> Para impresión, `.printExpand` debe mostrarse SIEMPRE en `@media print` (que todos los documentos salgan aunque estén colapsados en pantalla): en el CSS, `@media print { .docs { display: table !important } }` y ocultar los carets. Alternativamente, en impresión se listan todos expandidos vía CSS. Implementar en el CSS del Step 4.

- [ ] **Step 4: Crear `cxc.module.css`**

Copia las clases base del patrón P7a (page/hoja/titulo/tabla/num/vacio/controls/etiqueta/acciones/btnAccion/noPrint/@media print) y agrega el acordeón:

```css
.filtro { border: 1px solid var(--border); border-radius: var(--radius-input); padding: 0.3rem 0.6rem; font-size: 0.85rem; }
.grupo { border-bottom: 1px solid var(--border); }
.clienteRow { display: flex; align-items: center; gap: 0.75rem; width: 100%; background: none; border: none; cursor: pointer; padding: 0.6rem 0.4rem; text-align: left; font-size: 0.88rem; }
.clienteRow:hover { background: var(--bg-hover); }
.caret { width: 1rem; color: var(--text-muted); }
.clienteNombre { font-weight: 700; flex: 1; }
.clienteMeta { color: var(--text-muted); font-size: 0.78rem; }
.clienteTotal { font-weight: 800; color: var(--accent); white-space: nowrap; }
.docs { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin: 0 0 0.5rem 1.5rem; }
.docs th, .docs td { border: 1px solid var(--border); padding: 0.3rem 0.5rem; text-align: left; white-space: nowrap; }
.docs th { background: var(--bg-hover); }
.vencido { color: var(--error-strong); }
@media print {
  .noPrint { display: none; }
  .docs { display: table !important; }
  .caret { display: none; }
}
```

- [ ] **Step 5: Crear `app/api/reportes/cxc/export/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { obtenerCxc } from '@/app/admin/reportes/cxc/data'
import { cxcAoA } from '@/lib/reportes/cxc-cascada'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const grupos = await obtenerCxc()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cxcAoA(grupos)), 'CxC')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cuentas-por-cobrar.xlsx"',
    },
  })
}
```

- [ ] **Step 6: Agregar la card al índice**

```tsx
  { href: '/admin/reportes/cxc', titulo: 'Cuentas por cobrar', desc: 'Deuda pendiente por cliente, navegable en cascada hasta sus documentos y días vencidos. Exportable a Excel.' },
```

- [ ] **Step 7: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; build OK. Visual si es viable (acordeón expande, filtro, export). Si no, razonar.

```bash
git add app/admin/reportes/cxc app/api/reportes/cxc app/admin/reportes/page.tsx
git commit -m "feat(reportes): CxC en cascada navegable (acordeon, imprimible, export xlsx)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Ganancias por ítem (sin ISV, ítems libres, costo kardex, totales, margen) → Tasks 1 (SQL) + 2 (puras) + 3 (página). ✅
- Clientes/proveedores (directorio, rol, totales rango + saldo) → Tasks 1 + 2 + 4. ✅
- CxC en cascada (snapshot, acordeón, días vencido) → Tasks 2 + 5. ✅
- Alta de los 3 en el índice → Tasks 3, 4, 5 (cada uno su card). ✅
- Export xlsx server-only + `.limit(5000)` + impresión → Tasks 3–5. ✅
- Puras con tests → Task 2. ✅ Solo lectura → todas. ✅

**2. Placeholder scan:** sin TBD/TODO de lógica. Las notas "verificar el nombre del FK de categoría" / "verificar columnas de documento_saldos" son verificaciones de esquema concretas contra archivos existentes, no placeholders.

**3. Type consistency:** `FilaGananciaItem`/`TotalesGanancias`/`FilaContacto`/`RolContacto`/`GrupoCxc`/`DocCxc` (Task 2) usados en Tasks 3–5. `filaGanancia`/`totalesGanancias`/`gananciasAoA`, `filaContacto`/`contactosAoA`, `agruparCxc`/`cxcAoA` con firmas consistentes entre puras (Task 2) y consumidores (Tasks 3–5). Las funciones SQL (Task 1) devuelven las columnas que `data.ts` lee. Reuso de `utilidadNeta`/`margen` (P6.1) y `fechaHN` (P7a). ✅

## Notas de entrega (para el controlador SDD)

- Antes del push: el usuario aplica `supabase/migrations/2026-08-10-pos-p7b-reportes.sql` y corre `supabase/smoke-p7b-reportes.sql` (espera `Success: reportes P7b OK`).
- Verificación visual final: índice con 5 reportes; Ganancias (totales + Ítems libres); Clientes/proveedores (filtro rol); CxC cascada (acordeón); una exportación xlsx de cada uno.
