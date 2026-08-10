# POS P6 — Navegación + Dashboard — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar la navegación del admin (5 grupos + fixes de colapso/overlay/iconos) y reconstruir el dashboard con KPIs reales, gráficos SVG y filtro de fechas, sobre una capa de agregación de solo lectura que P7 reusará.

**Architecture:** Capa pura `lib/dashboard/` (rango de fechas anclado a Honduras + métricas) con tests; 4 funciones SQL de agregación de solo lectura; un server helper que las llama y arma `DashboardData`; page + client components (filtro, gráficos SVG). En navegación: mover el overlay fullscreen del layout POS a la propia pantalla POS (así Documentos recupera el menú), rediseñar el `Sidebar` a 5 grupos con iconos SVG dorados, y arreglar el colapso reversible.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (RPC vía cliente de servidor), TypeScript, Vitest, CSS Modules con tokens Merlin.

## Global Constraints

- Idioma español; moneda en Lempiras con `formatPrice()` (de `@/lib/store/format` o donde ya se use en el repo).
- **Solo lectura:** P6 no escribe en `documentos`, `movimientos_inventario`, stock ni caja. Las funciones SQL solo agregan (`select`).
- **Ventas = documento fiscal:** `factura` + `comprobante` con `estado <> 'anulado'`, **menos** `nota_credito` + `devolucion` no anulados (netas). Pedidos web = pipeline aparte, nunca sumado al monto.
- **Fechas ancladas a hora Honduras (UTC-6, sin DST):** los bordes del rango se calculan en TS puro y testeado; el SQL recupera el día local con `at time zone 'America/Tegucigalpa'`. Nunca el día UTC crudo.
- Migración idempotente (`create or replace function`), **aplicada por el usuario antes del push**; smoke con `to_regprocedure`. Estilo P4c/P5.
- CSS Modules con tokens Merlin. **Iconos dorados sin fondo** (regla nueva en `app/merlin.css`, color `var(--brand)` = `#c9a84c`). Gráficos en SVG/CSS, sin librerías.
- Cliente de Supabase de **servidor** (`@/lib/supabase-server`) para leer las RPC. `SUPABASE_SERVICE_ROLE_KEY` nunca al cliente.
- La capa `lib/dashboard/` y las funciones SQL quedan pensadas para que **P7 (Reportes)** las reuse (mismos rangos, misma definición de venta neta).
- Al terminar cada tarea: `npm test` y, si se tocaron Server Actions/tipos, `npx tsc --noEmit`. Reportar resultados reales.

---

## File Structure

- `types/index.ts` — nuevos tipos del dashboard (Task 1).
- `lib/dashboard/rango.ts` + `lib/dashboard/metricas.ts` + `lib/dashboard/tests/*.test.ts` — lógica pura (Task 1).
- `supabase/migrations/2026-08-10-pos-p6-dashboard.sql` + `supabase/smoke-p6-dashboard.sql` — 4 funciones de agregación (Task 2).
- `app/admin/dashboard-data.ts` — server helper que llama las RPC + arma `DashboardData` (Task 3).
- `app/admin/GraficoBarras.tsx` + `app/admin/GraficoLinea.tsx` + `app/admin/graficos.module.css` — gráficos SVG (Task 4).
- `app/admin/FiltroFechas.tsx` — control de rango (Task 5).
- `app/admin/page.tsx` (reconstruido) + `app/admin/dashboard.module.css` (extendido) (Task 6).
- `app/admin/pos/layout.tsx` + `app/admin/pos/page.tsx` — mover overlay (Task 7).
- `app/merlin.css` + `components/admin/icons.tsx` — regla + set SVG de iconos dorados (Task 8).
- `components/admin/Sidebar.tsx` + `components/admin/Sidebar.module.css` — rediseño (Task 9).

---

## Task 1: Tipos + lógica pura de `lib/dashboard/`

**Files:**
- Modify: `types/index.ts` (agregar tipos al final)
- Create: `lib/dashboard/rango.ts`
- Create: `lib/dashboard/metricas.ts`
- Test: `lib/dashboard/tests/rango.test.ts`
- Test: `lib/dashboard/tests/metricas.test.ts`

**Interfaces:**
- Consumes: nada (usa solo `Date` nativo).
- Produces:
  - Tipos: `PresetRango = 'hoy'|'semana'|'mes'|'anio'|'personalizado'`; `RangoFechas { desde: string; hasta: string }`; `DashboardResumen`, `VentaPorDia`, `TopItem`, `TopCliente`, `DashboardData` (ver Step 1).
  - `rangoDesdePreset(preset: PresetRango, instante: Date, desde?: string, hasta?: string): RangoFechas`
  - `etiquetaRango(preset: PresetRango, rango: RangoFechas): string`
  - `ticketPromedio(ventasNetas: number, numDocumentos: number): number`
  - `ordenarPorMetrica<T extends { monto: number; cantidad: number }>(filas: T[], metrica: 'monto'|'cantidad'): T[]`
  - `maxValor<T>(filas: T[], selector: (f: T) => number): number`

- [ ] **Step 1: Agregar los tipos en `types/index.ts`**

Al final del archivo:

```typescript
// ── POS P6: Dashboard ──────────────────────────────────────────────
export type PresetRango = 'hoy' | 'semana' | 'mes' | 'anio' | 'personalizado'

// Bordes del rango como ISO timestamptz (desde inclusivo, hasta exclusivo).
export interface RangoFechas {
  desde: string
  hasta: string
}

export interface DashboardResumen {
  ventas_netas: number
  num_documentos: number
  pedidos_web: number
  pedidos_sin_procesar: number
  cxc_pendiente: number
  cxp_pendiente: number
  cotizaciones_abiertas: number
  cotizaciones_monto: number
}

export interface VentaPorDia {
  dia: string // 'YYYY-MM-DD'
  ventas: number
}

export interface TopItem {
  producto_id: string | null
  variante_id: string | null
  nombre: string
  cantidad: number
  monto: number
}

export interface TopCliente {
  cliente_id: string
  nombre: string
  num_compras: number
  monto: number
}

export interface DashboardUltimoDocumento {
  id: string
  tipo: 'factura' | 'comprobante'
  numero: string
  cliente_nombre: string
  total: number
  created_at: string
}

export interface DashboardData {
  preset: PresetRango
  rango: RangoFechas
  resumen: DashboardResumen
  stockBajo: number
  ventasPorDia: VentaPorDia[]
  topItems: TopItem[]
  topClientes: TopCliente[]
  ultimosDocumentos: DashboardUltimoDocumento[]
}
```

- [ ] **Step 2: Escribir el test de `rango.ts` (falla)**

`lib/dashboard/tests/rango.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { rangoDesdePreset, etiquetaRango } from '../rango'

// Honduras es UTC-6 fijo. Un instante de la tarde/noche local NO debe
// adelantar el día. 2026-08-10T02:00:00Z = 2026-08-09 20:00 en Honduras,
// así que "hoy" en Honduras es el 9 de agosto.
const instante = new Date('2026-08-10T02:00:00Z')

describe('rangoDesdePreset', () => {
  it('hoy: desde 00:00 Honduras del día local a 00:00 del día siguiente', () => {
    const r = rangoDesdePreset('hoy', instante)
    // 9 ago 00:00 Honduras = 9 ago 06:00Z; 10 ago 00:00 Honduras = 10 ago 06:00Z
    expect(r.desde).toBe('2026-08-09T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('semana: lunes 00:00 Honduras de la semana en curso hasta mañana', () => {
    // 9 ago 2026 es domingo → el lunes de su semana es el 3 de agosto.
    const r = rangoDesdePreset('semana', instante)
    expect(r.desde).toBe('2026-08-03T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('mes: día 1 del mes local hasta mañana', () => {
    const r = rangoDesdePreset('mes', instante)
    expect(r.desde).toBe('2026-08-01T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('anio: 1 de enero local hasta mañana', () => {
    const r = rangoDesdePreset('anio', instante)
    expect(r.desde).toBe('2026-01-01T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-10T06:00:00.000Z')
  })

  it('personalizado: desde 00:00 hasta el día "hasta" +1 (inclusivo)', () => {
    const r = rangoDesdePreset('personalizado', instante, '2026-08-01', '2026-08-05')
    expect(r.desde).toBe('2026-08-01T06:00:00.000Z')
    expect(r.hasta).toBe('2026-08-06T06:00:00.000Z')
  })
})

describe('etiquetaRango', () => {
  it('semana da una etiqueta legible', () => {
    const r = rangoDesdePreset('semana', instante)
    expect(etiquetaRango('semana', r)).toMatch(/semana/i)
  })
})
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `npm test -- lib/dashboard/tests/rango.test.ts`
Expected: FAIL ("Cannot find module '../rango'").

- [ ] **Step 4: Implementar `lib/dashboard/rango.ts`**

```typescript
import type { PresetRango, RangoFechas } from '@/types'

// Honduras usa UTC-6 todo el año (sin horario de verano).
const OFFSET_HONDURAS_MS = 6 * 60 * 60 * 1000

// Componentes calendario (año/mes/día) del día local de Honduras para un instante.
function partesHonduras(instante: Date): { y: number; m: number; d: number } {
  const local = new Date(instante.getTime() - OFFSET_HONDURAS_MS)
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() }
}

// Medianoche Honduras (00:00 UTC-6) de un día calendario local, como Date (UTC).
// 00:00 en Honduras = 06:00 UTC del mismo día.
function medianocheHonduras(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) + OFFSET_HONDURAS_MS)
}

// Día de la semana (0=lunes … 6=domingo) del día local.
function diaSemanaLunes0(y: number, m: number, d: number): number {
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay() // 0=domingo
  return (dow + 6) % 7 // 0=lunes
}

export function rangoDesdePreset(
  preset: PresetRango,
  instante: Date,
  desde?: string,
  hasta?: string,
): RangoFechas {
  const { y, m, d } = partesHonduras(instante)
  const manana = medianocheHonduras(y, m, d + 1) // 00:00 del día siguiente (exclusivo)

  if (preset === 'hoy') {
    return { desde: medianocheHonduras(y, m, d).toISOString(), hasta: manana.toISOString() }
  }
  if (preset === 'semana') {
    const offLun = diaSemanaLunes0(y, m, d)
    return { desde: medianocheHonduras(y, m, d - offLun).toISOString(), hasta: manana.toISOString() }
  }
  if (preset === 'mes') {
    return { desde: medianocheHonduras(y, m, 1).toISOString(), hasta: manana.toISOString() }
  }
  if (preset === 'anio') {
    return { desde: medianocheHonduras(y, 0, 1).toISOString(), hasta: manana.toISOString() }
  }
  // personalizado: 'YYYY-MM-DD' → 00:00 Honduras; hasta +1 día (inclusivo del día).
  const [dy, dm, dd] = (desde ?? `${y}-01-01`).split('-').map(Number)
  const [hy, hm, hd] = (hasta ?? `${y}-12-31`).split('-').map(Number)
  return {
    desde: medianocheHonduras(dy, dm - 1, dd).toISOString(),
    hasta: medianocheHonduras(hy, hm - 1, hd + 1).toISOString(),
  }
}

export function etiquetaRango(preset: PresetRango, rango: RangoFechas): string {
  if (preset === 'hoy') return 'Hoy'
  if (preset === 'semana') return 'Semana en curso'
  if (preset === 'mes') return 'Mes en curso'
  if (preset === 'anio') return 'Año en curso'
  const fmt = (iso: string, restarDia = false) => {
    const t = new Date(iso).getTime() - OFFSET_HONDURAS_MS - (restarDia ? 24 * 60 * 60 * 1000 : 0)
    const dloc = new Date(t)
    return dloc.toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return `${fmt(rango.desde)} – ${fmt(rango.hasta, true)}`
}
```

- [ ] **Step 5: Correr el test de rango (pasa)**

Run: `npm test -- lib/dashboard/tests/rango.test.ts`
Expected: PASS.

- [ ] **Step 6: Escribir el test de `metricas.ts` (falla)**

`lib/dashboard/tests/metricas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ticketPromedio, ordenarPorMetrica, maxValor } from '../metricas'

describe('ticketPromedio', () => {
  it('divide ventas entre documentos, redondeado a 2', () => {
    expect(ticketPromedio(1000, 3)).toBe(333.33)
  })
  it('0 documentos → 0 (sin división por cero)', () => {
    expect(ticketPromedio(1000, 0)).toBe(0)
  })
})

describe('ordenarPorMetrica', () => {
  const filas = [
    { nombre: 'A', monto: 10, cantidad: 5 },
    { nombre: 'B', monto: 30, cantidad: 1 },
    { nombre: 'C', monto: 20, cantidad: 8 },
  ]
  it('por monto descendente', () => {
    expect(ordenarPorMetrica(filas, 'monto').map(f => f.nombre)).toEqual(['B', 'C', 'A'])
  })
  it('por cantidad descendente', () => {
    expect(ordenarPorMetrica(filas, 'cantidad').map(f => f.nombre)).toEqual(['C', 'A', 'B'])
  })
  it('no muta el arreglo original', () => {
    const copia = [...filas]
    ordenarPorMetrica(filas, 'monto')
    expect(filas).toEqual(copia)
  })
})

describe('maxValor', () => {
  it('devuelve el máximo del selector', () => {
    expect(maxValor([{ v: 3 }, { v: 9 }, { v: 4 }], f => f.v)).toBe(9)
  })
  it('todo 0 → 1 (evita división por cero al escalar barras)', () => {
    expect(maxValor([{ v: 0 }, { v: 0 }], f => f.v)).toBe(1)
  })
  it('lista vacía → 1', () => {
    expect(maxValor([] as { v: number }[], f => f.v)).toBe(1)
  })
})
```

- [ ] **Step 7: Correr el test para verlo fallar**

Run: `npm test -- lib/dashboard/tests/metricas.test.ts`
Expected: FAIL ("Cannot find module '../metricas'").

- [ ] **Step 8: Implementar `lib/dashboard/metricas.ts`**

```typescript
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function ticketPromedio(ventasNetas: number, numDocumentos: number): number {
  return numDocumentos > 0 ? round2(ventasNetas / numDocumentos) : 0
}

export function ordenarPorMetrica<T extends { monto: number; cantidad: number }>(
  filas: T[],
  metrica: 'monto' | 'cantidad',
): T[] {
  return [...filas].sort((a, b) => b[metrica] - a[metrica])
}

export function maxValor<T>(filas: T[], selector: (f: T) => number): number {
  const m = filas.reduce((acc, f) => Math.max(acc, selector(f)), 0)
  return m > 0 ? m : 1
}
```

- [ ] **Step 9: Correr toda la suite de `lib/dashboard/`**

Run: `npm test -- lib/dashboard`
Expected: PASS (ambos archivos).

- [ ] **Step 10: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add types/index.ts lib/dashboard/
git commit -m "feat(dashboard): tipos + logica pura de rango (Honduras) y metricas"
```

---

## Task 2: Migración SQL de agregación (solo lectura)

**Files:**
- Create: `supabase/migrations/2026-08-10-pos-p6-dashboard.sql`
- Create: `supabase/smoke-p6-dashboard.sql`

**Interfaces:**
- Produces (funciones RPC, todas `security invoker`, `revoke from public, anon` + `grant to authenticated`):
  - `dashboard_resumen(p_desde timestamptz, p_hasta timestamptz)` → una fila con las 8 columnas de `DashboardResumen`.
  - `dashboard_ventas_por_dia(p_desde timestamptz, p_hasta timestamptz)` → filas `(dia date, ventas numeric)`.
  - `dashboard_top_items(p_desde timestamptz, p_hasta timestamptz, p_limite integer)` → `(producto_id uuid, variante_id uuid, nombre text, cantidad numeric, monto numeric)`.
  - `dashboard_top_clientes(p_desde timestamptz, p_hasta timestamptz, p_limite integer)` → `(cliente_id uuid, nombre text, num_compras integer, monto numeric)`.

**Notas de esquema (verificar nombres reales antes de escribir):** `documentos(tipo, estado, total, cliente_id, cliente_nombre, created_at)`; `documento_items(documento_id, producto_id, variante_id, descripcion, cantidad, importe)`; vista `documento_saldos(saldo, cliente_id, ...)`; vista `compra_saldos(saldo, ...)`; `cotizaciones(total, etapa_id, ...)` con `cotizacion_etapas(tipo)` donde `tipo='abierta'`; `pedidos(estado, created_at)`; `clientes(id, nombre)`. Si algún nombre difiere, ajustar y anotarlo.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/2026-08-10-pos-p6-dashboard.sql`:

```sql
-- POS P6 — Funciones de agregación del dashboard (SOLO LECTURA).
-- Venta neta = factura+comprobante (no anulados) menos nota_credito+devolucion
-- (no anulados). Fechas: los bordes llegan ya calculados (hora Honduras) desde
-- el server (lib/dashboard/rango.ts). El día local se recupera con
-- at time zone 'America/Tegucigalpa' (Honduras UTC-6, sin DST).

-- 1) Resumen (KPIs). Los campos "snapshot" (cxc/cxp/cotizaciones/sin_procesar)
--    NO dependen del rango; se devuelven en la misma fila por conveniencia.
create or replace function dashboard_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table (
  ventas_netas numeric,
  num_documentos integer,
  pedidos_web integer,
  pedidos_sin_procesar integer,
  cxc_pendiente numeric,
  cxp_pendiente numeric,
  cotizaciones_abiertas integer,
  cotizaciones_monto numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then d.total else -d.total end)
      from documentos d
      where d.estado <> 'anulado'
        and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as ventas_netas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as num_documentos,
    coalesce((
      select count(*) from pedidos p
      where p.created_at >= p_desde and p.created_at < p_hasta
    ), 0)::integer as pedidos_web,
    coalesce((
      select count(*) from pedidos p where p.estado = 'recibido'
    ), 0)::integer as pedidos_sin_procesar,
    coalesce((
      select sum(s.saldo) from documento_saldos s where s.saldo > 0
    ), 0)::numeric as cxc_pendiente,
    coalesce((
      select sum(s.saldo) from compra_saldos s where s.saldo > 0
    ), 0)::numeric as cxp_pendiente,
    coalesce((
      select count(*) from cotizaciones c
      join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta'
    ), 0)::integer as cotizaciones_abiertas,
    coalesce((
      select sum(c.total) from cotizaciones c
      join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta'
    ), 0)::numeric as cotizaciones_monto;
$$;

-- 2) Ventas netas por día (sin huecos: generate_series sobre los días del rango).
create or replace function dashboard_ventas_por_dia(p_desde timestamptz, p_hasta timestamptz)
returns table (dia date, ventas numeric)
language sql
security invoker
set search_path = public
as $$
  select g.dia,
    coalesce(sum(
      case when d.tipo in ('factura','comprobante') then d.total else -d.total end
    ), 0)::numeric as ventas
  from generate_series(
         (p_desde at time zone 'America/Tegucigalpa')::date,
         ((p_hasta at time zone 'America/Tegucigalpa') - interval '1 day')::date,
         interval '1 day'
       ) as g(dia)
  left join documentos d
    on (d.created_at at time zone 'America/Tegucigalpa')::date = g.dia
   and d.estado <> 'anulado'
   and d.tipo in ('factura','comprobante','nota_credito','devolucion')
  group by g.dia
  order by g.dia;
$$;

-- 3) Top ítems (neto). Ítems libres (producto_id null) cuentan por su descripción.
create or replace function dashboard_top_items(
  p_desde timestamptz, p_hasta timestamptz, p_limite integer
)
returns table (
  producto_id uuid, variante_id uuid, nombre text, cantidad numeric, monto numeric
)
language sql
security invoker
set search_path = public
as $$
  with lineas as (
    select di.producto_id, di.variante_id, di.descripcion,
      case when d.tipo in ('factura','comprobante') then 1 else -1 end as signo,
      di.cantidad, di.importe
    from documento_items di
    join documentos d on d.id = di.documento_id
    where d.estado <> 'anulado'
      and d.tipo in ('factura','comprobante','nota_credito','devolucion')
      and d.created_at >= p_desde and d.created_at < p_hasta
  )
  select producto_id, variante_id, max(descripcion) as nombre,
    sum(signo * cantidad)::numeric as cantidad,
    sum(signo * importe)::numeric as monto
  from lineas
  group by producto_id, variante_id, descripcion
  order by monto desc
  limit p_limite;
$$;

-- 4) Top clientes (neto), excluye CONSUMIDOR FINAL (cliente_id null).
create or replace function dashboard_top_clientes(
  p_desde timestamptz, p_hasta timestamptz, p_limite integer
)
returns table (
  cliente_id uuid, nombre text, num_compras integer, monto numeric
)
language sql
security invoker
set search_path = public
as $$
  with ventas as (
    select d.cliente_id,
      case when d.tipo in ('factura','comprobante') then 1 else -1 end as signo,
      d.total
    from documentos d
    where d.estado <> 'anulado'
      and d.tipo in ('factura','comprobante','nota_credito','devolucion')
      and d.created_at >= p_desde and d.created_at < p_hasta
      and d.cliente_id is not null
  )
  select v.cliente_id, c.nombre,
    count(*) filter (where v.signo = 1)::integer as num_compras,
    sum(v.signo * v.total)::numeric as monto
  from ventas v
  join clientes c on c.id = v.cliente_id
  group by v.cliente_id, c.nombre
  order by monto desc
  limit p_limite;
$$;

revoke execute on function dashboard_resumen(timestamptz, timestamptz) from public, anon;
revoke execute on function dashboard_ventas_por_dia(timestamptz, timestamptz) from public, anon;
revoke execute on function dashboard_top_items(timestamptz, timestamptz, integer) from public, anon;
revoke execute on function dashboard_top_clientes(timestamptz, timestamptz, integer) from public, anon;
grant execute on function dashboard_resumen(timestamptz, timestamptz) to authenticated;
grant execute on function dashboard_ventas_por_dia(timestamptz, timestamptz) to authenticated;
grant execute on function dashboard_top_items(timestamptz, timestamptz, integer) to authenticated;
grant execute on function dashboard_top_clientes(timestamptz, timestamptz, integer) to authenticated;
```

- [ ] **Step 2: Escribir el smoke**

`supabase/smoke-p6-dashboard.sql`:

```sql
do $$
begin
  if to_regprocedure('public.dashboard_resumen(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta dashboard_resumen'; end if;
  if to_regprocedure('public.dashboard_ventas_por_dia(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta dashboard_ventas_por_dia'; end if;
  if to_regprocedure('public.dashboard_top_items(timestamptz, timestamptz, integer)') is null
    then raise exception 'FALLO: falta dashboard_top_items'; end if;
  if to_regprocedure('public.dashboard_top_clientes(timestamptz, timestamptz, integer)') is null
    then raise exception 'FALLO: falta dashboard_top_clientes'; end if;
  -- Llamada de ejemplo (semana): no debe lanzar error.
  perform * from dashboard_resumen(now() - interval '7 days', now());
  perform * from dashboard_ventas_por_dia(now() - interval '7 days', now());
  perform * from dashboard_top_items(now() - interval '7 days', now(), 10);
  perform * from dashboard_top_clientes(now() - interval '7 days', now(), 10);
  raise notice 'Smoke P6 dashboard: 4 funciones OK';
end $$;
select 'Success: dashboard P6 OK' as resultado;
```

- [ ] **Step 3: Verificar sintaxis con typecheck del repo (no aplica la migración)**

Run: `npx tsc --noEmit`
Expected: sin errores (la migración es SQL; este paso solo confirma que no se rompió TS). La migración la aplica el usuario antes del push.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-10-pos-p6-dashboard.sql supabase/smoke-p6-dashboard.sql
git commit -m "feat(dashboard): funciones SQL de agregacion (resumen, ventas/dia, top items/clientes)"
```

---

## Task 3: Server helper `dashboard-data.ts`

**Files:**
- Create: `app/admin/dashboard-data.ts`

**Interfaces:**
- Consumes: `rangoDesdePreset` (Task 1); RPC de Task 2; `stockEfectivo` de `@/lib/store/variantes`; tipos de Task 1.
- Produces: `obtenerDashboardData(preset: PresetRango, desde?: string, hasta?: string): Promise<DashboardData>`.

- [ ] **Step 1: Implementar el helper**

`app/admin/dashboard-data.ts`:

```typescript
import { createClient } from '@/lib/supabase-server'
import { stockEfectivo } from '@/lib/store/variantes'
import { rangoDesdePreset } from '@/lib/dashboard/rango'
import type {
  PresetRango, DashboardData, DashboardResumen, VentaPorDia,
  TopItem, TopCliente, DashboardUltimoDocumento,
} from '@/types'
import { numeroDocumento } from '@/lib/pos/documentos'

const RESUMEN_VACIO: DashboardResumen = {
  ventas_netas: 0, num_documentos: 0, pedidos_web: 0, pedidos_sin_procesar: 0,
  cxc_pendiente: 0, cxp_pendiente: 0, cotizaciones_abiertas: 0, cotizaciones_monto: 0,
}

export async function obtenerDashboardData(
  preset: PresetRango, desde?: string, hasta?: string,
): Promise<DashboardData> {
  const rango = rangoDesdePreset(preset, new Date(), desde, hasta)
  const supabase = await createClient()
  const args = { p_desde: rango.desde, p_hasta: rango.hasta }

  const [
    { data: resumenRows },
    { data: ventasDia },
    { data: topItems },
    { data: topClientes },
    { data: productosStock },
    { data: ultimosRows },
  ] = await Promise.all([
    supabase.rpc('dashboard_resumen', args),
    supabase.rpc('dashboard_ventas_por_dia', args),
    supabase.rpc('dashboard_top_items', { ...args, p_limite: 10 }),
    supabase.rpc('dashboard_top_clientes', { ...args, p_limite: 10 }),
    supabase.from('productos')
      .select('id, stock, activo, producto_variantes(stock, activo)')
      .eq('activo', true).limit(5000),
    supabase.from('documentos')
      .select('id, tipo, correlativo, numero_comprobante, cliente_nombre, total, created_at')
      .in('tipo', ['factura', 'comprobante']).neq('estado', 'anulado')
      .order('created_at', { ascending: false }).limit(8),
  ])

  // Stock bajo: mismo criterio que el dashboard previo (stockEfectivo por
  // producto/variante). Se calcula en el server, no en SQL (evita replicar la
  // lógica padre/variante en Postgres). Umbral: < 5 (como el dashboard actual).
  const stockBajo = (productosStock ?? []).filter(p => {
    const s = stockEfectivo(p.stock, (p.producto_variantes ?? []).filter(v => v.activo))
    return s != null && s < 5
  }).length

  const ultimosDocumentos: DashboardUltimoDocumento[] = (ultimosRows ?? []).map(d => ({
    id: d.id,
    tipo: d.tipo as 'factura' | 'comprobante',
    numero: numeroDocumento(d as { correlativo: string | null; numero_comprobante: number | null; tipo: string }),
    cliente_nombre: d.cliente_nombre,
    total: Number(d.total),
    created_at: d.created_at,
  }))

  const resumen = (resumenRows?.[0] as DashboardResumen | undefined) ?? RESUMEN_VACIO

  return {
    preset, rango, resumen, stockBajo,
    ventasPorDia: (ventasDia ?? []) as VentaPorDia[],
    topItems: (topItems ?? []) as TopItem[],
    topClientes: (topClientes ?? []) as TopCliente[],
    ultimosDocumentos,
  }
}
```

> Nota: `numeroDocumento` vive en `@/lib/pos/documentos` (módulo puro; ver GOTCHA de P4c — no importarlo desde un módulo `'use client'`). Verificar su firma real y adaptar el objeto que recibe.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (No hay test unitario: la lógica pura ya está testeada en Task 1; este helper es I/O y se verifica en la validación visual tras aplicar la migración.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/dashboard-data.ts
git commit -m "feat(dashboard): server helper que arma DashboardData desde las RPC"
```

---

## Task 4: Gráficos SVG (`GraficoBarras`, `GraficoLinea`)

**Files:**
- Create: `app/admin/GraficoBarras.tsx`
- Create: `app/admin/GraficoLinea.tsx`
- Create: `app/admin/graficos.module.css`

**Interfaces:**
- Consumes: `maxValor`, `ordenarPorMetrica` (Task 1); `formatPrice`.
- Produces:
  - `GraficoBarras` (client): props `{ filas: { nombre: string; monto: number; cantidad: number; href?: string }[]; metrica: 'monto'|'cantidad'; onMetrica?: (m) => void }`.
  - `GraficoLinea` (client): props `{ puntos: { dia: string; ventas: number }[] }`.

- [ ] **Step 1: Implementar `GraficoBarras.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { maxValor, ordenarPorMetrica } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import styles from './graficos.module.css'

interface FilaBarra { nombre: string; monto: number; cantidad: number; href?: string }

interface Props {
  filas: FilaBarra[]
  metrica: 'monto' | 'cantidad'
  onMetrica: (m: 'monto' | 'cantidad') => void
}

export default function GraficoBarras({ filas, metrica, onMetrica }: Props) {
  const ordenadas = ordenarPorMetrica(filas, metrica)
  const max = maxValor(ordenadas, f => f[metrica])

  return (
    <div className={styles.barras}>
      <div className={styles.toggle}>
        <button type="button" className={metrica === 'monto' ? styles.toggleOn : ''} onClick={() => onMetrica('monto')}>L.</button>
        <button type="button" className={metrica === 'cantidad' ? styles.toggleOn : ''} onClick={() => onMetrica('cantidad')}>Uds.</button>
      </div>
      {ordenadas.length === 0 && <div className={styles.vacio}>Sin datos en el rango.</div>}
      {ordenadas.map((f, i) => {
        const valor = f[metrica]
        const pct = Math.max(2, (valor / max) * 100)
        const etiqueta = metrica === 'monto' ? formatPrice(f.monto) : `${f.cantidad}`
        return (
          <div key={`${f.nombre}-${i}`} className={styles.fila}>
            <span className={styles.nombre} title={f.nombre}>
              {f.href ? <Link href={f.href}>{f.nombre}</Link> : f.nombre}
            </span>
            <span className={styles.pista}>
              <span className={styles.relleno} style={{ width: `${pct}%` }} />
            </span>
            <span className={styles.valor}>{etiqueta}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Implementar `GraficoLinea.tsx`**

Barras verticales (una por día); simple y legible con SVG. Escala con `maxValor`.

```tsx
'use client'
import { maxValor } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import styles from './graficos.module.css'

interface Props { puntos: { dia: string; ventas: number }[] }

export default function GraficoLinea({ puntos }: Props) {
  const max = maxValor(puntos, p => p.ventas)
  if (puntos.length === 0) return <div className={styles.vacio}>Sin datos en el rango.</div>

  return (
    <div className={styles.linea}>
      {puntos.map(p => {
        const pct = Math.max(1, (p.ventas / max) * 100)
        const etiquetaDia = p.dia.slice(8) // 'DD'
        return (
          <div key={p.dia} className={styles.columna} title={`${p.dia}: ${formatPrice(p.ventas)}`}>
            <span className={styles.columnaPista}>
              <span className={styles.columnaRelleno} style={{ height: `${pct}%` }} />
            </span>
            <span className={styles.columnaDia}>{etiquetaDia}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Escribir `graficos.module.css`**

```css
/* Barras horizontales (top ítems / clientes) */
.barras { display: flex; flex-direction: column; gap: 0.5rem; }
.toggle { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; }
.toggle button {
  border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted);
  border-radius: var(--radius-input); padding: 0.15rem 0.6rem; font-size: 0.72rem;
  font-weight: 700; cursor: pointer;
}
.toggleOn { background: var(--accent-dim) !important; color: var(--accent) !important; border-color: var(--accent) !important; }
.fila { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; }
.nombre { width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nombre a { color: var(--accent); text-decoration: none; }
.nombre a:hover { text-decoration: underline; }
.pista { flex: 1; height: 14px; background: var(--bg-hover); border-radius: var(--radius-tag); overflow: hidden; }
.relleno { display: block; height: 100%; background: var(--accent); border-radius: var(--radius-tag); }
.valor { width: 22%; text-align: right; font-weight: 700; white-space: nowrap; }
.vacio { padding: 1rem 0; text-align: center; color: var(--text-muted); font-size: 0.82rem; }

/* Barras verticales (ventas por día) */
.linea { display: flex; align-items: flex-end; gap: 0.35rem; height: 160px; padding-top: 0.5rem; }
.columna { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.columnaPista { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.columnaRelleno { width: 70%; margin: 0 auto; background: var(--accent); border-radius: var(--radius-tag) var(--radius-tag) 0 0; min-height: 1px; }
.columnaDia { font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem; }
```

- [ ] **Step 4: Typecheck, lint y commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

```bash
git add app/admin/GraficoBarras.tsx app/admin/GraficoLinea.tsx app/admin/graficos.module.css
git commit -m "feat(dashboard): graficos SVG/CSS (barras con toggle L./uds. y ventas por dia)"
```

---

## Task 5: Filtro de fechas (`FiltroFechas`)

**Files:**
- Create: `app/admin/FiltroFechas.tsx`

**Interfaces:**
- Consumes: `PresetRango` (Task 1); `useRouter`, `useSearchParams` de `next/navigation`.
- Produces: `FiltroFechas` (client): props `{ preset: PresetRango; desde?: string; hasta?: string; etiqueta: string }`. Actualiza los `searchParams` (`?preset=&desde=&hasta=`) al cambiar.

- [ ] **Step 1: Implementar el control**

```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PresetRango } from '@/types'
import styles from './dashboard.module.css'

const PRESETS: { valor: PresetRango; label: string }[] = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: 'semana', label: 'Semana' },
  { valor: 'mes', label: 'Mes' },
  { valor: 'anio', label: 'Año' },
  { valor: 'personalizado', label: 'Personalizado' },
]

interface Props { preset: PresetRango; desde?: string; hasta?: string; etiqueta: string }

export default function FiltroFechas({ preset, desde, hasta, etiqueta }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function aplicar(next: Partial<{ preset: PresetRango; desde: string; hasta: string }>) {
    const p = new URLSearchParams(params.toString())
    if (next.preset) p.set('preset', next.preset)
    if (next.desde !== undefined) p.set('desde', next.desde)
    if (next.hasta !== undefined) p.set('hasta', next.hasta)
    if (next.preset && next.preset !== 'personalizado') { p.delete('desde'); p.delete('hasta') }
    router.push(`/admin?${p.toString()}`)
  }

  return (
    <div className={styles.filtro}>
      <div className={styles.presets}>
        {PRESETS.map(pr => (
          <button
            key={pr.valor}
            type="button"
            className={`${styles.presetBtn} ${preset === pr.valor ? styles.presetOn : ''}`}
            onClick={() => aplicar({ preset: pr.valor })}
          >
            {pr.label}
          </button>
        ))}
      </div>
      {preset === 'personalizado' && (
        <div className={styles.rangoLibre}>
          <input type="date" value={desde ?? ''} onChange={e => aplicar({ preset: 'personalizado', desde: e.target.value, hasta: hasta ?? e.target.value })} />
          <span>a</span>
          <input type="date" value={hasta ?? ''} onChange={e => aplicar({ preset: 'personalizado', desde: desde ?? e.target.value, hasta: e.target.value })} />
        </div>
      )}
      <span className={styles.filtroEtiqueta}>{etiqueta}</span>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

```bash
git add app/admin/FiltroFechas.tsx
git commit -m "feat(dashboard): filtro de fechas (presets + rango personalizado) via searchParams"
```

---

## Task 6: Reconstruir el dashboard (`app/admin/page.tsx`)

**Files:**
- Modify: `app/admin/page.tsx` (reescribir)
- Modify: `app/admin/dashboard.module.css` (extender con filtro + grid de gráficos)

**Interfaces:**
- Consumes: `obtenerDashboardData` (Task 3); `etiquetaRango` (Task 1); `FiltroFechas` (Task 5); `GraficoBarras`, `GraficoLinea` (Task 4); `formatPrice`.

- [ ] **Step 1: Reescribir `app/admin/page.tsx`**

```tsx
import { obtenerDashboardData } from './dashboard-data'
import { etiquetaRango } from '@/lib/dashboard/rango'
import { ticketPromedio } from '@/lib/dashboard/metricas'
import { formatPrice } from '@/lib/store/format'
import type { PresetRango } from '@/types'
import FiltroFechas from './FiltroFechas'
import DashboardGraficos from './DashboardGraficos'
import Link from 'next/link'
import styles from './dashboard.module.css'

const PRESETS_VALIDOS: PresetRango[] = ['hoy', 'semana', 'mes', 'anio', 'personalizado']

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }>
}) {
  const sp = await searchParams
  const preset: PresetRango = PRESETS_VALIDOS.includes(sp.preset as PresetRango)
    ? (sp.preset as PresetRango) : 'semana'
  const data = await obtenerDashboardData(preset, sp.desde, sp.hasta)
  const { resumen, stockBajo } = data
  const ticket = ticketPromedio(resumen.ventas_netas, resumen.num_documentos)

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Inicio</h1>
      </div>

      <FiltroFechas preset={preset} desde={sp.desde} hasta={sp.hasta} etiqueta={etiquetaRango(preset, data.rango)} />

      <h2 className={styles.filaTitulo}>En el rango</h2>
      <div className={styles.stats}>
        <Kpi num={formatPrice(resumen.ventas_netas)} label="Ventas netas (POS)" />
        <Kpi num={String(resumen.num_documentos)} label="Documentos" />
        <Kpi num={formatPrice(ticket)} label="Ticket promedio" />
        <Kpi num={String(resumen.pedidos_web)} label="Pedidos web" badge={resumen.pedidos_sin_procesar} badgeLabel="sin procesar" alert={resumen.pedidos_sin_procesar > 0} />
      </div>

      <h2 className={styles.filaTitulo}>Ahora mismo</h2>
      <div className={styles.stats}>
        <Kpi num={formatPrice(resumen.cxc_pendiente)} label="Por cobrar (CxC)" />
        <Kpi num={formatPrice(resumen.cxp_pendiente)} label="Por pagar (CxP)" />
        <Kpi num={`${resumen.cotizaciones_abiertas} · ${formatPrice(resumen.cotizaciones_monto)}`} label="Cotizaciones abiertas" />
        <Kpi num={String(stockBajo)} label="Stock bajo (<5)" warn={stockBajo > 0} />
      </div>

      <DashboardGraficos
        ventasPorDia={data.ventasPorDia}
        topItems={data.topItems}
        topClientes={data.topClientes}
      />

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Últimos documentos</h2>
        <div className={styles.pedidosList}>
          {data.ultimosDocumentos.map(d => (
            <Link key={d.id} href={`/admin/pos/documento/${d.id}`} className={styles.pedidoRow}>
              <span className={styles.pedidoNum}>{d.numero}</span>
              <span className={styles.pedidoCliente}>{d.cliente_nombre}</span>
              <span className={styles.pedidoTotal}>{formatPrice(d.total)}</span>
              <span className={styles.pedidoEstado}>{d.tipo === 'factura' ? 'Factura' : 'Comprobante'}</span>
              <span className={styles.pedidoFecha}>
                {new Date(d.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </Link>
          ))}
          {data.ultimosDocumentos.length === 0 && <div className={styles.empty}>Sin documentos aún.</div>}
        </div>
      </div>
    </div>
  )
}

function Kpi({ num, label, badge, badgeLabel, alert, warn }: {
  num: string; label: string; badge?: number; badgeLabel?: string; alert?: boolean; warn?: boolean
}) {
  return (
    <div className={`${styles.stat} ${alert ? styles.statAlert : ''} ${warn ? styles.statWarn : ''}`}>
      <div className={styles.statNum}>{num}</div>
      <div className={styles.statLabel}>
        {label}
        {badge != null && badge > 0 && <span className={styles.kpiBadge}> · {badge} {badgeLabel}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `app/admin/DashboardGraficos.tsx` (client, dueño del estado del toggle)**

El toggle monto/cantidad es estado de cliente compartido por los dos gráficos de barras; este componente lo posee y no re-consulta (ambas métricas ya vienen en las filas).

```tsx
'use client'
import { useState } from 'react'
import GraficoBarras from './GraficoBarras'
import GraficoLinea from './GraficoLinea'
import type { TopItem, TopCliente, VentaPorDia } from '@/types'
import styles from './dashboard.module.css'

interface Props { ventasPorDia: VentaPorDia[]; topItems: TopItem[]; topClientes: TopCliente[] }

export default function DashboardGraficos({ ventasPorDia, topItems, topClientes }: Props) {
  const [metrica, setMetrica] = useState<'monto' | 'cantidad'>('monto')

  return (
    <div className={styles.graficosGrid}>
      <div className={styles.graficoCard}>
        <h2 className={styles.sectionTitle}>Ventas por día</h2>
        <GraficoLinea puntos={ventasPorDia} />
      </div>
      <div className={styles.graficoCard}>
        <h2 className={styles.sectionTitle}>Ítems más vendidos</h2>
        <GraficoBarras
          filas={topItems.map(t => ({ nombre: t.nombre, monto: t.monto, cantidad: t.cantidad }))}
          metrica={metrica}
          onMetrica={setMetrica}
        />
      </div>
      <div className={styles.graficoCard}>
        <h2 className={styles.sectionTitle}>Mejores clientes</h2>
        <GraficoBarras
          filas={topClientes.map(c => ({ nombre: c.nombre, monto: c.monto, cantidad: c.num_compras, href: `/admin/cuentas-por-cobrar/cliente/${c.cliente_id}` }))}
          metrica={metrica}
          onMetrica={setMetrica}
        />
      </div>
    </div>
  )
}
```

> Ajuste de archivos: agregar `app/admin/DashboardGraficos.tsx` a la lista de Files de esta tarea.

- [ ] **Step 3: Extender `app/admin/dashboard.module.css`**

Agregar al final:

```css
/* P6: filtro de fechas */
.filtro { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.presets { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.presetBtn {
  border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted);
  border-radius: var(--radius-input); padding: 0.3rem 0.8rem; font-size: 0.8rem; font-weight: 600; cursor: pointer;
}
.presetOn { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
.rangoLibre { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
.rangoLibre input { border: 1px solid var(--border); border-radius: var(--radius-input); padding: 0.25rem 0.5rem; }
.filtroEtiqueta { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-left: auto; }

/* P6: títulos de fila de KPIs */
.filaTitulo { font-size: 0.78rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin: 0.5rem 0; }
.kpiBadge { color: var(--info); font-weight: 700; }

/* P6: grid de gráficos */
.graficosGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.graficoCard { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 1.25rem; }
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build OK (la página es dinámica por `searchParams`; en runtime necesitará la migración aplicada, pero el build no la ejecuta).

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx app/admin/DashboardGraficos.tsx app/admin/dashboard.module.css
git commit -m "feat(dashboard): tablero reconstruido con filtro, KPIs (rango/snapshot) y graficos"
```

---

## Task 7: Sacar el overlay del layout POS (recuperar el menú en Documentos)

**Contexto:** `app/admin/pos/layout.tsx` envuelve **todo** `/admin/pos/*` (incluidos `documentos` y `documento/[id]`) en `.overlay { position: fixed; inset: 0; z-index: 100 }`, que cubre el `Sidebar`. Por eso Documentos no muestra el menú. Fix: mover el overlay del layout a la **propia pantalla POS**, para que solo `/admin/pos` sea fullscreen y las rutas de documentos hereden el shell del admin (con menú). Sin mover rutas ni tocar referencias.

**Files:**
- Modify: `app/admin/pos/layout.tsx`
- Modify: `app/admin/pos/page.tsx`

**Interfaces:**
- Consumes: `pos.module.css` (`.overlay`, ya existente, con su `@media print`).
- Produces: nada nuevo (cambio estructural).

- [ ] **Step 1: Hacer el layout POS un passthrough**

`app/admin/pos/layout.tsx` — reemplazar el cuerpo por:

```tsx
// El overlay fullscreen se aplica ahora en la propia pantalla POS
// (app/admin/pos/page.tsx), NO aquí: así las rutas hermanas bajo /admin/pos
// (documentos, documento/[id]) heredan el shell del admin CON el Sidebar
// visible, en vez de quedar cubiertas por el overlay `fixed`.
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 2: Envolver la pantalla POS en el overlay**

`app/admin/pos/page.tsx` — importar el CSS module y envolver el `<PosClient .../>` del `return`:

```tsx
import styles from './pos.module.css'
// ...
  return (
    <div className={styles.overlay}>
      <PosClient
        cajas={cajas ?? []}
        /* ...resto de props sin cambios... */
        cotizacionPrefill={cotizacionPrefill}
      />
    </div>
  )
```

- [ ] **Step 3: Verificación visual (dev server + preview)**

Levantar el dev server y comprobar con las herramientas de browser:
- `/admin/pos` sigue fullscreen (overlay cubre el sidebar).
- `/admin/pos/documentos` ahora muestra el **Sidebar** a la izquierda.
- `/admin/pos/documento/<id>` muestra el Sidebar + su toolbar "← Documentos".
- Imprimir un documento (`window.print()` / preview de impresión) sigue paginando bien (el `@media print` de `.overlay` ya no aplica al documento porque ya no está bajo el overlay; el Sidebar se oculta por su propio `@media print { display:none }`).

Read console/network para descartar errores.

- [ ] **Step 4: Typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

```bash
git add app/admin/pos/layout.tsx app/admin/pos/page.tsx
git commit -m "fix(pos): overlay fullscreen en la pantalla POS, no en el layout — Documentos recupera el menu"
```

---

## Task 8: Regla Merlin de iconos dorados + set SVG

**Files:**
- Modify: `app/merlin.css`
- Create: `components/admin/icons.tsx`

**Interfaces:**
- Produces: componentes de icono SVG que heredan `currentColor`, un por ítem del menú + Inicio/Config/Salir. Firma: `(props: { className?: string }) => JSX.Element`. Export nombrado por icono y un mapa `ICONOS` para el sidebar.

- [ ] **Step 1: Codificar la regla en `app/merlin.css`**

Agregar (después del bloque `:root`), documentando la convención:

```css
/* Convención de iconos (POS P6): todos los iconos del app van en DORADO y
   SIN FONDO. Los iconos son SVG que heredan `currentColor`; aplicar esta clase
   (o setear color: var(--brand)) en el contenedor. Barrido app-wide en el P de
   diseño; P6 lo aplica al Sidebar. */
.iconoMerlin {
  color: var(--brand);
  background: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.iconoMerlin svg { width: 1em; height: 1em; fill: none; stroke: currentColor; }
```

- [ ] **Step 2: Crear el set de iconos SVG**

`components/admin/icons.tsx` — un componente por icono (trazos simples, `stroke="currentColor"`, `fill="none"`). Incluir: inicio, tienda, productos, categorias, banners, cupones, envios, pos, documentos, cotizaciones, pedidos, cxc, compras, cxp, inventario, movimientos, clientes, config, salir. Ejemplo de dos y el mapa (el implementador completa el resto con paths simples de un set libre estilo "feather"):

```tsx
import type { JSX } from 'react'

type IconProps = { className?: string }
const base = (path: JSX.Element, className?: string) => (
  <span className={className}>
    <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  </span>
)

export const IconInicio = ({ className }: IconProps) => base(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>, className)
export const IconClientes = ({ className }: IconProps) => base(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 6a3 3 0 010 6" /><path d="M15 20a6 6 0 019-5" /></>, className)
// … resto de iconos con el mismo patrón (paths simples) …

export const ICONOS = {
  inicio: IconInicio,
  clientes: IconClientes,
  // … clave por ítem del menú → componente …
} as const

export type IconoKey = keyof typeof ICONOS
```

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

```bash
git add app/merlin.css components/admin/icons.tsx
git commit -m "feat(merlin): regla de iconos dorados sin fondo + set SVG para el admin"
```

---

## Task 9: Rediseño del `Sidebar` (5 grupos + Inicio + colapso reversible + iconos)

**Files:**
- Modify: `components/admin/Sidebar.tsx`
- Modify: `components/admin/Sidebar.module.css`

**Interfaces:**
- Consumes: `ICONOS`/`IconoKey` (Task 8).
- Produces: sidebar con estructura final; `Inicio` como ítem suelto; iconos SVG dorados; colapso reversible.

- [ ] **Step 1: Reescribir `NAV_GROUPS` + Inicio en `Sidebar.tsx`**

Reemplazar la constante y el render de iconos. Estructura (usar claves de `ICONOS`):

```tsx
import { ICONOS, type IconoKey } from './icons'

const INICIO = { href: '/admin', icon: 'inicio' as IconoKey, label: 'Inicio' }

const NAV_GROUPS = [
  { label: 'TIENDA', items: [
    { href: '/admin/productos', icon: 'productos', label: 'Productos' },
    { href: '/admin/categorias', icon: 'categorias', label: 'Categorías' },
    { href: '/admin/banners', icon: 'banners', label: 'Banners' },
    { href: '/admin/cupones', icon: 'cupones', label: 'Cupones' },
    { href: '/admin/envios', icon: 'envios', label: 'Envíos' },
  ] },
  { label: 'INGRESOS', items: [
    { href: '/admin/pos', icon: 'pos', label: 'POS' },
    { href: '/admin/pos/documentos', icon: 'documentos', label: 'Documentos' },
    { href: '/admin/cotizaciones', icon: 'cotizaciones', label: 'Cotizaciones' },
    { href: '/admin/pedidos', icon: 'pedidos', label: 'Pedidos', badge: true },
    { href: '/admin/cuentas-por-cobrar', icon: 'cxc', label: 'Cuentas por cobrar' },
  ] },
  { label: 'EGRESOS', items: [
    { href: '/admin/compras', icon: 'compras', label: 'Compras' },
    { href: '/admin/cuentas-por-pagar', icon: 'cxp', label: 'Cuentas por pagar' },
  ] },
  { label: 'INVENTARIO', items: [
    { href: '/admin/inventario', icon: 'inventario', label: 'Inventario físico' },
    { href: '/admin/movimientos', icon: 'movimientos', label: 'Movimientos' },
  ] },
  { label: 'CLIENTES', items: [
    { href: '/admin/clientes', icon: 'clientes', label: 'Clientes y proveedores' },
  ] },
] as const satisfies ReadonlyArray<{ label: string; items: ReadonlyArray<{ href: string; icon: IconoKey; label: string; badge?: boolean }> }>
```

> El ítem "Libro de ventas (SAR)" del grupo INGRESOS lo agrega **P7** junto con su pantalla (`/admin/reportes/libro-ventas`), para no dejar un enlace roto en P6.

En el render, renderizar el icono con el componente del mapa y la clase dorada:

```tsx
const Icono = ICONOS[item.icon]
// ...
<span className={styles.icon}><Icono className="iconoMerlin" /></span>
```

Renderizar `INICIO` como un `<Link>` suelto arriba del primer grupo (fuera de `.group`), con el mismo markup de ítem y su `isActive`. Incluir `INICIO.href` en `ALL_HREFS` para que el match de activo lo considere.

- [ ] **Step 2: Arreglar el colapso reversible**

El toggle `setCollapsed(c => !c)` ya es correcto; el problema es que en modo colapsado el botón queda inaccesible. En `Sidebar.module.css`, garantizar que `.collapseBtn` sea siempre visible y clickeable en colapsado: cuando `.collapsed`, el `.header` debe seguir mostrando el botón (reducir/ocultar `.brand` y `.logo` si hace falta, pero nunca el botón). Ejemplo:

```css
.collapsed .brand { display: none; }
.collapsed .header { justify-content: center; padding: 0.85rem 0.3rem; }
.collapseBtn { flex-shrink: 0; } /* nunca se colapsa a 0 */
```

Ajustar el ancho colapsado (`--sidebar-col: 52px`) para que el botón quepa. Verificar en el navegador que colapsar y volver a expandir funciona con el mismo botón.

- [ ] **Step 3: Estilo de iconos dorados en el sidebar**

En `Sidebar.module.css`, el `.icon` ahora contiene un SVG. Asegurar tamaño y que el color dorado gane siempre (los iconos van dorados incluso en ítems no activos):

```css
.icon { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.05rem; flex-shrink: 0; color: var(--brand); }
.icon svg { width: 18px; height: 18px; }
```

- [ ] **Step 4: Verificación visual (preview)**

- 5 grupos en el orden Tienda/Ingresos/Egresos/Inventario/Clientes; Inicio arriba; Config/Salir abajo.
- Iconos dorados sin fondo.
- Colapsar → solo iconos; volver a expandir con el mismo botón.
- El ítem activo resalta (uno solo, incluso en `/admin/pos/documentos`).
- Badge de pedidos sin procesar visible.

- [ ] **Step 5: Typecheck, lint, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

```bash
git add components/admin/Sidebar.tsx components/admin/Sidebar.module.css
git commit -m "feat(admin): sidebar en 5 grupos con Inicio, iconos dorados y colapso reversible"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Capa de datos (SQL + `lib/dashboard/`) → Tasks 1–3. ✅
- Ventas = documento POS neto → definido en el SQL de Task 2 y en constraints. ✅
- Menú 5 grupos + Inicio + Config abajo → Task 9. ✅
- Fix colapso reversible → Task 9 Step 2. ✅
- Fix documento sin menú → Task 7 (mover overlay). ✅
- Iconos dorados en Merlin + sidebar → Tasks 8–9. ✅
- Filtro de fechas (semana default + presets + rango) → Tasks 1 (rango) + 5 (UI) + 6 (page). ✅
- KPIs rango vs snapshot → Task 6. ✅
- Gráficos (ventas/día, top ítems, top clientes con toggle) → Tasks 4 + 6. ✅
- Últimos documentos → Task 6. ✅
- "Libro de ventas" fuera de P6 (lo agrega P7) → nota en Task 9. ✅
- Stock bajo en server con `stockEfectivo` → Task 3. ✅

**2. Placeholder scan:** el único "completar el resto" es el set de iconos SVG (Task 8 Step 2), acotado a "paths simples estilo feather por ítem"; es trabajo mecánico con patrón dado, no un placeholder de lógica. Sin TBD/TODO de comportamiento.

**3. Type consistency:** `PresetRango`, `RangoFechas`, `DashboardResumen`, `VentaPorDia`, `TopItem`, `TopCliente`, `DashboardData`, `DashboardUltimoDocumento` se definen en Task 1 y se usan con los mismos nombres/campos en Tasks 3–6. Las firmas SQL de Task 2 coinciden con los campos que Task 3 lee. `ordenarPorMetrica`/`maxValor`/`ticketPromedio` se usan con la firma declarada. ✅

## Notas de entrega (para el controlador SDD)

- Antes del push: el usuario aplica `supabase/migrations/2026-08-10-pos-p6-dashboard.sql` y corre `supabase/smoke-p6-dashboard.sql` (espera `Success: dashboard P6 OK`). El dashboard y sus gráficos solo tienen datos reales tras aplicar la migración.
- Verificación visual final tras aplicar: menú, colapso, documento con menú, dashboard en semana en curso, presets/rango, toggles de los gráficos.
