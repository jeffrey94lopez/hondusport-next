# POS P6.1 — Dashboard segmentado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segmentar los KPIs del dashboard en cards por tema (Ventas/Costo/Utilidad, Documentos, Cotizaciones, CxC, CxP, Ítems), extender la capa de agregación de P6 con las métricas nuevas, y arreglar dos bugs de layout (cards que no se adaptan al ancho; "Últimos documentos" desalineada y demasiado ancha).

**Architecture:** Se extiende la función SQL `dashboard_resumen` (DROP+CREATE porque cambia el `returns table`) con las columnas nuevas; se agregan dos puras a `lib/dashboard/metricas.ts` (utilidad, margen); el server helper castea los campos nuevos; la página `/admin` pasa de dos filas planas de KPIs a un grid fluido de cards de segmento (nuevo `KpiSegmento`), y "Últimos documentos" pasa a CSS grid con `max-width`. Todo solo lectura.

**Tech Stack:** Next.js 16 (Server Components), Supabase (RPC vía cliente de servidor), TypeScript, Vitest, CSS Modules con tokens Merlin.

## Global Constraints

- Idioma español; moneda en Lempiras con `formatPrice()` (de `@/lib/store/format`).
- **Solo lectura:** ninguna escritura a documentos/movimientos/stock/caja/cobros/pagos. Las funciones SQL solo agregan (`select`).
- **Ventas sin ISV** para la utilidad: `Utilidad Neta = Ventas (sin ISV) − Costo de Ventas`. La etiqueta del KPI dice explícitamente "sin ISV".
- **Costo al momento de la venta:** del kardex (`movimientos_inventario.costo_resultante` de `venta_pos`), consistente con la regla de ventas (documentos POS no anulados; NC restan).
- **Rango vs snapshot:** métricas de flujo siguen el filtro de fechas global; los acumulados de CxC/CxP y el stock bajo son snapshot.
- **Fechas ancladas a Honduras (UTC-6, sin DST):** los bordes `p_desde`/`p_hasta` llegan calculados desde el server (P6, `lib/dashboard/rango.ts`); el SQL recupera el día local con `at time zone 'America/Tegucigalpa'`. Rango semiabierto `>= p_desde and < p_hasta` (o `>= (…)::date and < (…)::date` para columnas `date`).
- Migración idempotente, **aplicada por el usuario antes del push**; smoke con `to_regprocedure`.
- CSS Modules con tokens Merlin; no se tocan los 3 gráficos de P6 ni el filtro de fechas.
- Cliente de Supabase de **servidor** para las RPC. `SUPABASE_SERVICE_ROLE_KEY` nunca al cliente.
- Al terminar cada tarea: `npm test` y, si se tocaron tipos/Server Actions, `npx tsc --noEmit`. Reportar resultados reales.

---

## File Structure

- `types/index.ts` — extender `DashboardResumen` con 11 campos nuevos (Task 1).
- `lib/dashboard/metricas.ts` + `lib/dashboard/tests/metricas.test.ts` — `utilidadNeta`, `margen` (Task 1).
- `supabase/migrations/2026-08-10-pos-p6-1-dashboard-segmentado.sql` + `supabase/smoke-p6-1-dashboard.sql` — DROP+CREATE de `dashboard_resumen` con columnas nuevas (Task 2).
- `app/admin/dashboard-data.ts` — castear los campos nuevos + `RESUMEN_VACIO` (Task 3).
- `app/admin/page.tsx` + `app/admin/KpiSegmento.tsx` + `app/admin/dashboard.module.css` — cards de segmento + fix de "Últimos documentos" (Task 4).

---

## Task 1: Tipos + puras (utilidad, margen)

**Files:**
- Modify: `types/index.ts` (extender `DashboardResumen`)
- Modify: `lib/dashboard/metricas.ts`
- Test: `lib/dashboard/tests/metricas.test.ts` (agregar casos)

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `DashboardResumen` extendido con: `ventas_sin_isv: number; costo_ventas: number; facturas: number; comprobantes: number; cotizaciones_ganadas: number; cotizaciones_perdidas: number; cxc_nuevo: number; cxc_cobrado: number; cxp_nuevo: number; cxp_pagado: number; productos_nuevos: number` (además de los 8 campos actuales de P6).
  - `utilidadNeta(ventasSinIsv: number, costoVentas: number): number`
  - `margen(ventasSinIsv: number, utilidad: number): number`

- [ ] **Step 1: Extender `DashboardResumen` en `types/index.ts`**

Localizar la interfaz existente (P6) y agregar los campos nuevos al final de la interfaz:

```typescript
export interface DashboardResumen {
  ventas_netas: number
  num_documentos: number
  pedidos_web: number
  pedidos_sin_procesar: number
  cxc_pendiente: number
  cxp_pendiente: number
  cotizaciones_abiertas: number
  cotizaciones_monto: number
  // P6.1
  ventas_sin_isv: number
  costo_ventas: number
  facturas: number
  comprobantes: number
  cotizaciones_ganadas: number
  cotizaciones_perdidas: number
  cxc_nuevo: number
  cxc_cobrado: number
  cxp_nuevo: number
  cxp_pagado: number
  productos_nuevos: number
}
```

- [ ] **Step 2: Escribir el test de las puras (falla)**

Agregar a `lib/dashboard/tests/metricas.test.ts`:

```typescript
import { utilidadNeta, margen } from '../metricas'

describe('utilidadNeta', () => {
  it('ventas menos costo, redondeado a 2', () => {
    expect(utilidadNeta(1000, 600)).toBe(400)
  })
  it('puede ser negativa', () => {
    expect(utilidadNeta(500, 800)).toBe(-300)
  })
})

describe('margen', () => {
  it('utilidad sobre ventas en %, redondeado a 2', () => {
    expect(margen(1000, 400)).toBe(40)
  })
  it('ventas 0 → 0 (sin división por cero)', () => {
    expect(margen(0, 0)).toBe(0)
  })
})
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `npm test -- lib/dashboard/tests/metricas.test.ts`
Expected: FAIL (`utilidadNeta`/`margen` no existen).

- [ ] **Step 4: Implementar las puras en `lib/dashboard/metricas.ts`**

Agregar al final (reusa el `round2` ya existente en el archivo):

```typescript
export function utilidadNeta(ventasSinIsv: number, costoVentas: number): number {
  return round2(ventasSinIsv - costoVentas)
}

export function margen(ventasSinIsv: number, utilidad: number): number {
  return ventasSinIsv > 0 ? round2((utilidad / ventasSinIsv) * 100) : 0
}
```

- [ ] **Step 5: Correr los tests (pasan)**

Run: `npm test -- lib/dashboard/tests/metricas.test.ts`
Expected: PASS (nuevos + existentes).

- [ ] **Step 6: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add types/index.ts lib/dashboard/metricas.ts lib/dashboard/tests/metricas.test.ts
git commit -m "feat(dashboard): tipos extendidos + utilidadNeta/margen (P6.1)"
```

---

## Task 2: Migración SQL — `dashboard_resumen` extendida

**Files:**
- Create: `supabase/migrations/2026-08-10-pos-p6-1-dashboard-segmentado.sql`
- Create: `supabase/smoke-p6-1-dashboard.sql`

**Interfaces:**
- Produces: `dashboard_resumen(p_desde timestamptz, p_hasta timestamptz)` con el `returns table` de P6 **más** 11 columnas nuevas (ver Step 1). Las otras 3 funciones de P6 (`dashboard_ventas_por_dia`, `dashboard_top_items`, `dashboard_top_clientes`) **no se tocan**.

**Notas de esquema (verificadas):** `documento_items(documento_id, base)`; `movimientos_inventario(tipo, cantidad, costo_resultante, referencia, created_at)` — `venta_pos` con `referencia='documento:'||uuid` y `cantidad` negativa; devolución de venta con `referencia='nota_credito:'||uuid`; `cobros(fecha date, monto)`; `pagos_proveedor(fecha date, monto)`; `documento_saldos(fecha date, credito_total, saldo)`; `compras(condicion_pago, estado, total, created_at)`; `productos(created_at)`; `producto_variantes(created_at)`; `cotizaciones(created_at, etapa_id)` + `cotizacion_etapas(tipo in ('abierta','ganada','perdida'))`. **Verificar antes de escribir que `cotizaciones` tenga `created_at`; si no, ajustar y anotarlo.**

- [ ] **Step 1: Escribir la migración (DROP + CREATE)**

Cambiar el `returns table` obliga a **`drop function` antes de `create`** (Postgres no permite cambiar el tipo de retorno con `create or replace`).

`supabase/migrations/2026-08-10-pos-p6-1-dashboard-segmentado.sql`:

```sql
-- POS P6.1 — dashboard_resumen extendida (SOLO LECTURA). Se recrea con columnas
-- nuevas: cambiar el returns table exige DROP + CREATE (create or replace no
-- puede cambiar el tipo de retorno). Las otras 3 funciones de P6 no se tocan.
drop function if exists dashboard_resumen(timestamptz, timestamptz);

create function dashboard_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table (
  ventas_netas numeric,
  num_documentos integer,
  pedidos_web integer,
  pedidos_sin_procesar integer,
  cxc_pendiente numeric,
  cxp_pendiente numeric,
  cotizaciones_abiertas integer,
  cotizaciones_monto numeric,
  ventas_sin_isv numeric,
  costo_ventas numeric,
  facturas integer,
  comprobantes integer,
  cotizaciones_ganadas integer,
  cotizaciones_perdidas integer,
  cxc_nuevo numeric,
  cxc_cobrado numeric,
  cxp_nuevo numeric,
  cxp_pagado numeric,
  productos_nuevos integer
)
language sql
security invoker
set search_path = public
as $$
  select
    -- === P6 (se conservan) ===
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then d.total else -d.total end)
      from documentos d
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as ventas_netas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as num_documentos,
    coalesce((select count(*) from pedidos p where p.created_at >= p_desde and p.created_at < p_hasta), 0)::integer as pedidos_web,
    coalesce((select count(*) from pedidos p where p.estado = 'recibido'), 0)::integer as pedidos_sin_procesar,
    coalesce((select sum(s.saldo) from documento_saldos s where s.saldo > 0), 0)::numeric as cxc_pendiente,
    coalesce((select sum(s.saldo) from compra_saldos s where s.saldo > 0), 0)::numeric as cxp_pendiente,
    -- cotizaciones_abiertas: AHORA por creadas en el rango (antes era snapshot en P6)
    coalesce((
      select count(*) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::integer as cotizaciones_abiertas,
    coalesce((
      select sum(c.total) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'abierta' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::numeric as cotizaciones_monto,
    -- === P6.1 nuevas ===
    -- Ventas SIN ISV: base por línea (neto: venta − NC/devolución).
    coalesce((
      select sum(case when d.tipo in ('factura','comprobante') then di.base else -di.base end)
      from documento_items di join documentos d on d.id = di.documento_id
      where d.estado <> 'anulado' and d.tipo in ('factura','comprobante','nota_credito','devolucion')
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::numeric as ventas_sin_isv,
    -- Costo de ventas: kardex venta_pos (doc no anulado) menos devoluciones de venta (NC).
    -- Consistente con ventas: excluye ventas cuyo documento está anulado (join por referencia).
    (
      coalesce((
        select sum(m.costo_resultante * (-m.cantidad))
        from movimientos_inventario m
        join documentos d on d.id = split_part(m.referencia, ':', 2)::uuid
        where m.tipo = 'venta_pos' and m.referencia like 'documento:%'
          and d.estado <> 'anulado'
          and m.created_at >= p_desde and m.created_at < p_hasta
      ), 0)
      -
      coalesce((
        select sum(m.costo_resultante * m.cantidad)
        from movimientos_inventario m
        where m.tipo = 'devolucion' and m.referencia like 'nota_credito:%'
          and m.created_at >= p_desde and m.created_at < p_hasta
      ), 0)
    )::numeric as costo_ventas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo = 'factura'
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as facturas,
    coalesce((
      select count(*) from documentos d
      where d.estado <> 'anulado' and d.tipo = 'comprobante'
        and d.created_at >= p_desde and d.created_at < p_hasta
    ), 0)::integer as comprobantes,
    coalesce((
      select count(*) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'ganada' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::integer as cotizaciones_ganadas,
    coalesce((
      select count(*) from cotizaciones c join cotizacion_etapas e on e.id = c.etapa_id
      where e.tipo = 'perdida' and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::integer as cotizaciones_perdidas,
    -- CxC nuevo: crédito otorgado en el rango (por día local del documento).
    coalesce((
      select sum(s.credito_total) from documento_saldos s
      where s.fecha >= (p_desde at time zone 'America/Tegucigalpa')::date
        and s.fecha <  (p_hasta at time zone 'America/Tegucigalpa')::date
    ), 0)::numeric as cxc_nuevo,
    coalesce((
      select sum(co.monto) from cobros co
      where co.fecha >= (p_desde at time zone 'America/Tegucigalpa')::date
        and co.fecha <  (p_hasta at time zone 'America/Tegucigalpa')::date
    ), 0)::numeric as cxc_cobrado,
    coalesce((
      select sum(c.total) from compras c
      where c.condicion_pago = 'credito' and c.estado <> 'anulada'
        and c.created_at >= p_desde and c.created_at < p_hasta
    ), 0)::numeric as cxp_nuevo,
    coalesce((
      select sum(pp.monto) from pagos_proveedor pp
      where pp.fecha >= (p_desde at time zone 'America/Tegucigalpa')::date
        and pp.fecha <  (p_hasta at time zone 'America/Tegucigalpa')::date
    ), 0)::numeric as cxp_pagado,
    (
      coalesce((select count(*) from productos p where p.created_at >= p_desde and p.created_at < p_hasta), 0)
      + coalesce((select count(*) from producto_variantes v where v.created_at >= p_desde and v.created_at < p_hasta), 0)
    )::integer as productos_nuevos;
$$;

revoke execute on function dashboard_resumen(timestamptz, timestamptz) from public, anon;
grant execute on function dashboard_resumen(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Escribir el smoke**

`supabase/smoke-p6-1-dashboard.sql`:

```sql
do $$
begin
  if to_regprocedure('public.dashboard_resumen(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta dashboard_resumen'; end if;
  -- La firma nueva debe devolver las columnas P6.1 sin error:
  perform ventas_sin_isv, costo_ventas, facturas, comprobantes,
          cotizaciones_ganadas, cotizaciones_perdidas, cxc_nuevo, cxc_cobrado,
          cxp_nuevo, cxp_pagado, productos_nuevos
  from dashboard_resumen(now() - interval '7 days', now());
  raise notice 'Smoke P6.1 dashboard: dashboard_resumen extendida OK';
end $$;
select 'Success: dashboard P6.1 OK' as resultado;
```

- [ ] **Step 3: Typecheck del repo (no aplica la migración)**

Run: `npx tsc --noEmit`
Expected: sin errores (la migración es SQL; la aplica el usuario antes del push).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-10-pos-p6-1-dashboard-segmentado.sql supabase/smoke-p6-1-dashboard.sql
git commit -m "feat(dashboard): dashboard_resumen extendida con costo/utilidad, docs por tipo, cotizaciones por estado, CxC/CxP por rango e items nuevos (P6.1)"
```

---

## Task 3: Server helper — castear los campos nuevos

**Files:**
- Modify: `app/admin/dashboard-data.ts`

**Interfaces:**
- Consumes: `DashboardResumen` extendido (Task 1); `dashboard_resumen` extendida (Task 2).
- Produces: `obtenerDashboardData` devuelve `resumen` con los 11 campos nuevos ya casteados a `Number`.

- [ ] **Step 1: Actualizar `RESUMEN_VACIO` y el casteo en `dashboard-data.ts`**

Agregar los campos nuevos a `RESUMEN_VACIO` (todos 0):

```typescript
const RESUMEN_VACIO: DashboardResumen = {
  ventas_netas: 0, num_documentos: 0, pedidos_web: 0, pedidos_sin_procesar: 0,
  cxc_pendiente: 0, cxp_pendiente: 0, cotizaciones_abiertas: 0, cotizaciones_monto: 0,
  ventas_sin_isv: 0, costo_ventas: 0, facturas: 0, comprobantes: 0,
  cotizaciones_ganadas: 0, cotizaciones_perdidas: 0, cxc_nuevo: 0, cxc_cobrado: 0,
  cxp_nuevo: 0, cxp_pagado: 0, productos_nuevos: 0,
}
```

Extender el bloque de casteo `const resumen: DashboardResumen = { ...resumenCrudo, ... }` para incluir los campos numéricos nuevos (los `numeric` de PostgREST pueden llegar como string):

```typescript
  const resumen: DashboardResumen = {
    ...resumenCrudo,
    ventas_netas: Number(resumenCrudo.ventas_netas),
    cxc_pendiente: Number(resumenCrudo.cxc_pendiente),
    cxp_pendiente: Number(resumenCrudo.cxp_pendiente),
    cotizaciones_monto: Number(resumenCrudo.cotizaciones_monto),
    ventas_sin_isv: Number(resumenCrudo.ventas_sin_isv),
    costo_ventas: Number(resumenCrudo.costo_ventas),
    cxc_nuevo: Number(resumenCrudo.cxc_nuevo),
    cxc_cobrado: Number(resumenCrudo.cxc_cobrado),
    cxp_nuevo: Number(resumenCrudo.cxp_nuevo),
    cxp_pagado: Number(resumenCrudo.cxp_pagado),
    // conteos (integer) ya llegan como number; Number() defensivo por si acaso:
    facturas: Number(resumenCrudo.facturas),
    comprobantes: Number(resumenCrudo.comprobantes),
    cotizaciones_ganadas: Number(resumenCrudo.cotizaciones_ganadas),
    cotizaciones_perdidas: Number(resumenCrudo.cotizaciones_perdidas),
    productos_nuevos: Number(resumenCrudo.productos_nuevos),
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/admin/dashboard-data.ts
git commit -m "feat(dashboard): castear campos numericos nuevos del resumen (P6.1)"
```

---

## Task 4: UI — cards de segmento + fix de "Últimos documentos"

**Files:**
- Create: `app/admin/KpiSegmento.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/dashboard.module.css`

**Interfaces:**
- Consumes: `obtenerDashboardData` (Task 3); `utilidadNeta`, `margen`, `ticketPromedio` de `lib/dashboard/metricas`; `formatPrice`; `etiquetaRango`; `FiltroFechas`, `DashboardGraficos` (P6, sin cambios).
- Produces: `KpiSegmento` (Server Component simple, presentacional).

- [ ] **Step 1: Crear `app/admin/KpiSegmento.tsx`**

```tsx
import styles from './dashboard.module.css'

interface Metrica {
  label: string
  valor: string
  alerta?: boolean
}

interface Props {
  icon: string
  titulo: string
  metricas: Metrica[]
}

export default function KpiSegmento({ icon, titulo, metricas }: Props) {
  return (
    <div className={styles.segmento}>
      <div className={styles.segmentoHead}>
        <span className={styles.segmentoIcon}>{icon}</span>
        {titulo}
      </div>
      <div className={styles.segmentoMetricas}>
        {metricas.map(m => (
          <div key={m.label} className={`${styles.segMetrica} ${m.alerta ? styles.segAlerta : ''}`}>
            <div className={styles.segValor}>{m.valor}</div>
            <div className={styles.segLabel}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Reescribir la sección de KPIs en `app/admin/page.tsx`**

Reemplazar los imports de `ticketPromedio` y el bloque de las dos filas planas (`<h2>En el rango</h2> … <h2>Ahora mismo</h2> …`, incluida la función `Kpi` al final del archivo) por cards de segmento. Nuevos imports arriba:

```tsx
import { ticketPromedio, utilidadNeta, margen } from '@/lib/dashboard/metricas'
import KpiSegmento from './KpiSegmento'
```

Cálculos tras `const { resumen, stockBajo } = data`:

```tsx
  const ticket = ticketPromedio(resumen.ventas_sin_isv, resumen.num_documentos)
  const utilidad = utilidadNeta(resumen.ventas_sin_isv, resumen.costo_ventas)
  const pctMargen = margen(resumen.ventas_sin_isv, utilidad)
```

Reemplazar las dos `<div className={styles.stats}>` (y sus `<h2 className={styles.filaTitulo}>`) por un grid de segmentos:

```tsx
      <div className={styles.segmentos}>
        <KpiSegmento icon="💵" titulo="Ventas" metricas={[
          { label: 'Ventas (sin ISV)', valor: formatPrice(resumen.ventas_sin_isv) },
          { label: 'Costo de ventas', valor: formatPrice(resumen.costo_ventas) },
          { label: `Utilidad neta (${pctMargen}%)`, valor: formatPrice(utilidad), alerta: utilidad < 0 },
        ]} />
        <KpiSegmento icon="📄" titulo="Documentos" metricas={[
          { label: 'Total', valor: String(resumen.num_documentos) },
          { label: 'Facturas', valor: String(resumen.facturas) },
          { label: 'Comprobantes', valor: String(resumen.comprobantes) },
        ]} />
        <KpiSegmento icon="📝" titulo="Cotizaciones" metricas={[
          { label: 'Abiertas', valor: String(resumen.cotizaciones_abiertas) },
          { label: 'Ganadas', valor: String(resumen.cotizaciones_ganadas) },
          { label: 'Perdidas', valor: String(resumen.cotizaciones_perdidas) },
        ]} />
        <KpiSegmento icon="📈" titulo="Cuentas por cobrar" metricas={[
          { label: 'Crédito nuevo', valor: formatPrice(resumen.cxc_nuevo) },
          { label: 'Cobrado', valor: formatPrice(resumen.cxc_cobrado) },
          { label: 'Acumulado', valor: formatPrice(resumen.cxc_pendiente) },
        ]} />
        <KpiSegmento icon="🧾" titulo="Cuentas por pagar" metricas={[
          { label: 'Crédito nuevo', valor: formatPrice(resumen.cxp_nuevo) },
          { label: 'Pagado', valor: formatPrice(resumen.cxp_pagado) },
          { label: 'Acumulado', valor: formatPrice(resumen.cxp_pendiente) },
        ]} />
        <KpiSegmento icon="📦" titulo="Ítems" metricas={[
          { label: 'Stock bajo (<5)', valor: String(stockBajo), alerta: stockBajo > 0 },
          { label: 'Ítems nuevos', valor: String(resumen.productos_nuevos) },
        ]} />
      </div>
```

Además, agregar el ticket promedio dentro del segmento Ventas si se desea (opcional: se puede añadir como 4ª métrica `{ label: 'Ticket promedio', valor: formatPrice(ticket) }`). Dejarlo incluido en Ventas.

Eliminar la función `Kpi` del final del archivo (ya no se usa) y el import de `ticketPromedio` viejo (ahora viene del import combinado). El bloque de pedidos web sin procesar se representa ahora en el segmento Documentos-vecino: agregar un segmento o métrica "Pedidos web" si se quiere conservar — **incluir "Pedidos web" como métrica extra en el segmento Documentos**: `{ label: 'Pedidos web', valor: String(resumen.pedidos_web) }` y, si `pedidos_sin_procesar > 0`, una métrica con alerta `{ label: 'Sin procesar', valor: String(resumen.pedidos_sin_procesar), alerta: true }`.

- [ ] **Step 3: Arreglar "Últimos documentos" (grid + max-width) en `page.tsx`**

La lista sigue igual salvo que la card recibe una clase extra para acotar el ancho. Cambiar el contenedor:

```tsx
      <div className={`${styles.section} ${styles.ultimos}`}>
        <h2 className={styles.sectionTitle}>Últimos documentos</h2>
        <div className={styles.pedidosList}>
          {/* … filas sin cambios … */}
        </div>
      </div>
```

- [ ] **Step 4: CSS en `app/admin/dashboard.module.css`**

Agregar el grid de segmentos y el fix de la lista. Al final del archivo:

```css
/* P6.1: cards de segmento */
.segmentos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.segmento {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 1rem 1.1rem;
}
.segmentoHead {
  font-size: 0.8rem; font-weight: 700; color: var(--text);
  margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.4rem;
}
.segmentoIcon { font-size: 0.95rem; }
.segmentoMetricas { display: flex; gap: 0.9rem; flex-wrap: wrap; }
.segMetrica { flex: 1 1 auto; min-width: 72px; }
.segValor { font-size: 1.1rem; font-weight: 800; color: var(--accent); white-space: nowrap; }
.segLabel { font-size: 0.68rem; color: var(--text-muted); font-weight: 600; margin-top: 0.15rem; }
.segAlerta .segValor { color: var(--warning); }

/* P6.1: "Últimos documentos" — grid con columnas fijas + card angosta */
.ultimos { max-width: 600px; }
.pedidoRow {
  display: grid;
  grid-template-columns: 130px 1fr auto 92px 48px;
  align-items: center;
  gap: 0.75rem;
}
.pedidoNum { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pedidoCliente { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pedidoTotal { text-align: right; }
.pedidoEstado { text-align: right; }
.pedidoFecha { text-align: right; }
```

> Nota: `.pedidoRow` ya existe en el CSS (P6) como flex — esta regla lo redefine a grid. Revisar el bloque existente de `.pedidoRow`/`.pedidoNum`/etc. y **reemplazar** las propiedades de layout viejas (los `width`/`flex` por columna) por las de grid de arriba, conservando color/tamaño de fuente. No duplicar selectores contradictorios: editar el bloque existente en lugar de añadir uno nuevo que colisione.

- [ ] **Step 5: Verificación**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores en los archivos tocados (el repo tiene errores de lint preexistentes ajenos); build OK (`/admin` dinámica).

Visual (si el dev server es viable): cards de segmento llenan el ancho en pantalla ancha y se apilan en angosta; Ventas muestra "sin ISV" y Ventas − Costo = Utilidad; "Últimos documentos" con columnas alineadas y card angosta (~600px). Si el browser no es viable, razonar la correctitud y anotarlo.

- [ ] **Step 6: Commit**

```bash
git add app/admin/KpiSegmento.tsx app/admin/page.tsx app/admin/dashboard.module.css
git commit -m "feat(dashboard): KPIs en cards de segmento + Ultimos documentos en grid angosto (P6.1)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Ventas/Costo/Utilidad → Task 2 (SQL costo_ventas, ventas_sin_isv) + Task 1 (utilidadNeta) + Task 4 (card). ✅
- Documentos (facturas/comprobantes) → Task 2 + Task 4. ✅
- Cotizaciones abiertas/ganadas/perdidas (por creadas en rango) → Task 2 + Task 4. ✅
- CxC/CxP (crédito nuevo/cobrado-pagado/acumulado) → Task 2 + Task 4. ✅
- Ítems (stock bajo snapshot + nuevos) → Task 2 (productos_nuevos) + server helper stockBajo (ya existe) + Task 4. ✅
- Ventas SIN ISV con etiqueta explícita → Task 4 (label "Ventas (sin ISV)"). ✅
- Cards adaptables al ancho → Task 4 (grid `auto-fit minmax`). ✅
- "Últimos documentos" alineada + angosta → Task 4 (grid + max-width). ✅
- Solo lectura, fechas Honduras, grants/revoke, smoke → Task 2. ✅

**2. Placeholder scan:** sin TBD/TODO de lógica. Los "verificar `cotizaciones.created_at`" / columna de crédito de compras son verificaciones de esquema concretas (nombres dados), no placeholders.

**3. Type consistency:** `DashboardResumen` extendido en Task 1 con los mismos nombres que el SQL de Task 2 (`ventas_sin_isv, costo_ventas, facturas, comprobantes, cotizaciones_ganadas, cotizaciones_perdidas, cxc_nuevo, cxc_cobrado, cxp_nuevo, cxp_pagado, productos_nuevos`) y que consume Task 3 (casteo) y Task 4 (render). `utilidadNeta(ventasSinIsv, costoVentas)` / `margen(ventasSinIsv, utilidad)` coherentes entre Task 1 y Task 4. ✅

## Notas de entrega (para el controlador SDD)

- Antes del push: el usuario aplica `supabase/migrations/2026-08-10-pos-p6-1-dashboard-segmentado.sql` y corre `supabase/smoke-p6-1-dashboard.sql` (espera `Success: dashboard P6.1 OK`). Como es un DROP+CREATE de `dashboard_resumen`, entre el DROP y el CREATE la función no existe unos milisegundos — correr en bajo tráfico.
- Verificación visual final tras aplicar: segmentos, ventas sin ISV, utilidad, CxC/CxP por rango, ítems, y "Últimos documentos" alineada/angosta.
