# POS P4b — Cuentas por Pagar — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar y controlar las deudas con proveedores desde las compras al crédito de P4a: pagos (abono a una compra o pago global distribuido), saldos, estado de cuenta y antigüedad.

**Architecture:** Un pago (`pagos_proveedor`) se aplica a una o varias compras (`pago_aplicaciones`) — un abono es una sola aplicación; un pago global tiene varias (más-antigua-primero o manual). Los saldos se calculan con una vista `compra_saldos` (`total − Σ aplicaciones`), sin cache. La RPC `registrar_pago_proveedor` es atómica y valida cada aplicación contra el saldo real. Los pagos no tocan la caja del POS.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC + vista), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español** (UI, dominio, commits). Moneda en **Lempiras** con `formatPrice()`; el saldo ya vive en L. (`compra.total` está convertido).
- **Saldos calculados, no cacheados:** vista `compra_saldos` (`total − Σ pago_aplicaciones`). No agregar columnas de saldo a `compras`.
- **Frontera de confianza:** la Server Action arma/valida las aplicaciones y la RPC vuelve a validar contra el saldo real releído; nunca se confía en los montos del cliente. `registrar_pago_proveedor` valida cada aplicación ≤ saldo, Σ = monto, compra al crédito y no anulada; atómica.
- **Pagos independientes de la caja** — no tocan `sesiones_caja` ni el arqueo.
- **Lógica de negocio con peso en `lib/cxp/`** como funciones puras con test (`lib/cxp/tests/`). Reutiliza `hoyHonduras` de `lib/cotizaciones/cotizaciones`.
- **Guard de anulación:** `anularCompra` (en `app/admin/compras/actions.ts`) se bloquea si la compra tiene `pago_aplicaciones`.
- **Migración idempotente** (`if not exists`, `create or replace`), **aplicada por el usuario** antes del push. Sigue el estilo de `supabase/migrations/2026-08-08-pos-p4a-compras.sql` (RLS `do $$ ... exception when duplicate_object`).
- **Smoke SQL usa `to_regprocedure`** (no `to_regproc`) para verificar funciones por firma — lección de P4a.
- **CSS Modules con tokens Merlin**; botones `btnMerlin*` compuestos con clase de módulo (o `btnMerlinChip`). Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado` de `app/admin/pos/pos-helpers`. Hoja imprimible = HTML + CSS impresión, patrón `app/admin/pos/documento/[id]/DocumentoHoja.tsx` (`.btnToolbar`, `@media print`).
- **Cliente de Supabase de servidor** en Server Components/Actions. Tipo de resultado `type CxpResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.
- Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`. Server Actions/Components sin tests de unidad (tsc/build + navegador); visual deferido a un checkpoint tras aplicar la migración.

---

### Task 1: Migración P4b (tablas, vista, secuencia, RPC, RLS) + smoke

**Files:**
- Create: `supabase/migrations/2026-08-08-pos-p4b-cuentas-por-pagar.sql`
- Create: `supabase/smoke-pos-p4b.sql`

**Interfaces:**
- Produces: tablas `pagos_proveedor`, `pago_aplicaciones`; vista `compra_saldos`; funciones `nextval_pago() → bigint`, `registrar_pago_proveedor(p jsonb) → uuid`, `eliminar_pago_proveedor(p_pago_id uuid) → void`.
- Consumes (ya existen): tabla `compras` (P4a) con `condicion_pago`/`estado`/`total`/`proveedor_id`/`fecha_vencimiento`; `clientes`; `update_updated_at` (no se usa aquí; los pagos no llevan updated_at).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-08-pos-p4b-cuentas-por-pagar.sql`:

```sql
-- POS P4b: cuentas por pagar. Pagos a proveedores aplicados a compras al credito.

create sequence if not exists pago_numero_seq;
create or replace function nextval_pago()
returns bigint language sql security definer set search_path = public as $$
  select nextval('pago_numero_seq');
$$;
revoke all on function nextval_pago() from public, anon;
grant execute on function nextval_pago() to authenticated;

create table if not exists pagos_proveedor (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  proveedor_id uuid not null references clientes(id) on delete restrict,
  fecha        date not null default current_date,
  monto        numeric(12,2) not null check (monto > 0),
  metodo       text not null check (metodo in ('efectivo','transferencia','cheque','otro')),
  referencia   text,
  notas        text,
  usuario      text,
  created_at   timestamptz default now()
);
create index if not exists pagos_proveedor_proveedor_idx on pagos_proveedor (proveedor_id);

create table if not exists pago_aplicaciones (
  id        uuid primary key default gen_random_uuid(),
  pago_id   uuid not null references pagos_proveedor(id) on delete cascade,
  compra_id uuid not null references compras(id) on delete restrict,
  monto     numeric(12,2) not null check (monto > 0)
);
create index if not exists pago_aplicaciones_compra_idx on pago_aplicaciones (compra_id);
create index if not exists pago_aplicaciones_pago_idx on pago_aplicaciones (pago_id);

-- Saldos calculados (sin cache). dias_vencido se calcula en JS con hoyHonduras.
create or replace view compra_saldos as
select
  c.id                                 as compra_id,
  c.proveedor_id,
  c.numero,
  c.fecha,
  c.fecha_vencimiento,
  c.total,
  coalesce(sum(a.monto), 0)            as pagado,
  c.total - coalesce(sum(a.monto), 0)  as saldo
from compras c
left join pago_aplicaciones a on a.compra_id = c.id
where c.condicion_pago = 'credito' and c.estado <> 'anulada'
group by c.id;

-- Registrar un pago aplicado a una o varias compras, atomico.
create or replace function registrar_pago_proveedor(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_prov uuid := (p->>'proveedor_id')::uuid;
  v_fecha date := coalesce((p->>'fecha')::date, current_date);
  v_metodo text := p->>'metodo';
  v_ref text := p->>'referencia';
  v_notas text := p->>'notas';
  v_usuario text := p->>'usuario';
  r jsonb;
  v_compra uuid; v_monto numeric; v_total numeric; v_estado text; v_cond text; v_prov_compra uuid;
  v_pagado numeric; v_saldo numeric;
  v_suma numeric := 0;
  v_pago_id uuid; v_numero text;
begin
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then
    raise exception 'El pago no tiene aplicaciones';
  end if;

  -- Validar cada aplicacion contra el saldo real (con lock de la compra)
  for r in select value from jsonb_array_elements(p->'aplicaciones') loop
    v_compra := (r->>'compra_id')::uuid;
    v_monto := (r->>'monto')::numeric;
    if v_monto is null or v_monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;

    select proveedor_id, condicion_pago, estado, total
      into v_prov_compra, v_cond, v_estado, v_total
      from compras where id = v_compra for update;
    if not found then raise exception 'Compra no encontrada'; end if;
    if v_prov_compra <> v_prov then raise exception 'La compra no pertenece al proveedor'; end if;
    if v_cond <> 'credito' then raise exception 'La compra no es al credito'; end if;
    if v_estado = 'anulada' then raise exception 'La compra esta anulada'; end if;

    select coalesce(sum(monto),0) into v_pagado from pago_aplicaciones where compra_id = v_compra;
    v_saldo := v_total - v_pagado;
    if v_monto > v_saldo then raise exception 'El abono excede el saldo de la compra'; end if;

    v_suma := v_suma + v_monto;
  end loop;

  v_numero := 'PAGO-' || lpad(nextval('pago_numero_seq')::text, 8, '0');
  insert into pagos_proveedor (numero, proveedor_id, fecha, monto, metodo, referencia, notas, usuario)
  values (v_numero, v_prov, v_fecha, v_suma, v_metodo, v_ref, v_notas, v_usuario)
  returning id into v_pago_id;

  for r in select value from jsonb_array_elements(p->'aplicaciones') loop
    insert into pago_aplicaciones (pago_id, compra_id, monto)
    values (v_pago_id, (r->>'compra_id')::uuid, (r->>'monto')::numeric);
  end loop;

  return v_pago_id;
end; $$;
revoke all on function registrar_pago_proveedor(jsonb) from public, anon;
grant execute on function registrar_pago_proveedor(jsonb) to authenticated;

create or replace function eliminar_pago_proveedor(p_pago_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from pagos_proveedor where id = p_pago_id;
end; $$;
revoke all on function eliminar_pago_proveedor(uuid) from public, anon;
grant execute on function eliminar_pago_proveedor(uuid) to authenticated;

-- RLS admin (patron P1-P4a). La vista hereda de las tablas base; se le da select.
alter table pagos_proveedor enable row level security;
alter table pago_aplicaciones enable row level security;
do $$ begin
  create policy pagos_proveedor_admin on pagos_proveedor for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy pago_aplicaciones_admin on pago_aplicaciones for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
grant select on compra_saldos to authenticated;
```

- [ ] **Step 2: Escribir el smoke SQL**

Crear `supabase/smoke-pos-p4b.sql` (usa `to_regprocedure`, no crea/borra datos):

```sql
-- Smoke POS P4b — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if to_regclass('public.pagos_proveedor') is null then raise exception 'FALLO: falta pagos_proveedor'; end if;
  if to_regclass('public.pago_aplicaciones') is null then raise exception 'FALLO: falta pago_aplicaciones'; end if;
  if to_regclass('public.compra_saldos') is null then raise exception 'FALLO: falta la vista compra_saldos'; end if;
  if to_regclass('public.pago_numero_seq') is null then raise exception 'FALLO: falta pago_numero_seq'; end if;
  if to_regprocedure('public.registrar_pago_proveedor(jsonb)') is null then raise exception 'FALLO: falta registrar_pago_proveedor'; end if;
  if to_regprocedure('public.eliminar_pago_proveedor(uuid)') is null then raise exception 'FALLO: falta eliminar_pago_proveedor'; end if;
  if to_regprocedure('public.nextval_pago()') is null then raise exception 'FALLO: falta nextval_pago'; end if;
  raise notice 'Smoke POS P4b: estructura OK';
end $$;
select 'Success: migracion POS P4b OK' as resultado,
       (select count(*) from pagos_proveedor) as pagos;
```

- [ ] **Step 3: Revisar consistencia**

Verificar: `registrar_pago_proveedor` valida saldo con `for update`; la vista filtra `condicion_pago='credito' and estado <> 'anulada'`; `pago_aplicaciones.compra_id` es `on delete restrict` (una compra con pagos no se borra por cascade) y `pago_id` es `on delete cascade` (borrar el pago borra sus aplicaciones). No hay forma de correr SQL localmente — el reviewer valida.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-08-pos-p4b-cuentas-por-pagar.sql supabase/smoke-pos-p4b.sql
git commit -m "feat(cxp): migracion P4b (pagos, aplicaciones, vista de saldos, RPC)"
```

---

### Task 2: Tipos + lógica pura `lib/cxp/` con tests

**Files:**
- Modify: `types/index.ts` (agregar al final)
- Create: `lib/cxp/cxp.ts`
- Create: `lib/cxp/tests/cxp.test.ts`

**Interfaces:**
- Consumes: `hoyHonduras` de `@/lib/cotizaciones/cotizaciones`.
- Produces (tipos): `PagoMetodo`, `PagoProveedor`, `PagoAplicacion`, `CompraSaldo`, `EstadoPago`, `BucketAntiguedad`, `CxpFila`.
- Produces (puras): `saldoCompra(total, pagado)`, `estadoPago(total, pagado, fechaVencimiento, hoy)`, `bucketAntiguedad(fechaVencimiento, hoy)`, `distribuirPago(monto, comprasConSaldo)`.

- [ ] **Step 1: Escribir los tipos en `types/index.ts`**

```typescript
export type PagoMetodo = 'efectivo' | 'transferencia' | 'cheque' | 'otro'
export type EstadoPago = 'pagada' | 'parcial' | 'pendiente' | 'vencida'
export type BucketAntiguedad = 'por_vencer' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_mas'

export interface PagoProveedor {
  id: string
  numero: string
  proveedor_id: string
  fecha: string
  monto: number
  metodo: PagoMetodo
  referencia: string | null
  notas: string | null
  usuario: string | null
  created_at: string
}

export interface PagoAplicacion {
  id: string
  pago_id: string
  compra_id: string
  monto: number
}

// Fila de la vista compra_saldos
export interface CompraSaldo {
  compra_id: string
  proveedor_id: string
  numero: string
  fecha: string
  fecha_vencimiento: string | null
  total: number
  pagado: number
  saldo: number
}

// Fila del tablero de CxP (saldo + datos derivados + nombre del proveedor)
export interface CxpFila extends CompraSaldo {
  proveedor_nombre: string
  estado: EstadoPago
  bucket: BucketAntiguedad
  dias_vencido: number
}
```

- [ ] **Step 2: Escribir los tests (que fallan)**

Crear `lib/cxp/tests/cxp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { saldoCompra, estadoPago, bucketAntiguedad, distribuirPago } from '../cxp'

describe('saldoCompra', () => {
  it('resta pagado del total, redondeado a 2', () => {
    expect(saldoCompra(1000, 300)).toBe(700)
    expect(saldoCompra(100.005, 0)).toBe(100.01)
  })
})

describe('estadoPago', () => {
  const venc = new Date('2026-08-20')
  it('pagada si el saldo es 0 o menos', () => {
    expect(estadoPago(1000, 1000, venc, new Date('2026-08-10'))).toBe('pagada')
  })
  it('vencida si hay saldo y hoy pasó el vencimiento (gana sobre parcial)', () => {
    expect(estadoPago(1000, 400, venc, new Date('2026-08-21'))).toBe('vencida')
  })
  it('parcial si hay abono pero no vencida', () => {
    expect(estadoPago(1000, 400, venc, new Date('2026-08-10'))).toBe('parcial')
  })
  it('pendiente si no hay abono y no está vencida', () => {
    expect(estadoPago(1000, 0, venc, new Date('2026-08-10'))).toBe('pendiente')
  })
})

describe('bucketAntiguedad', () => {
  const venc = new Date('2026-08-20')
  it('por vencer si no llegó el vencimiento', () => {
    expect(bucketAntiguedad(venc, new Date('2026-08-10'))).toBe('por_vencer')
    expect(bucketAntiguedad(venc, new Date('2026-08-20'))).toBe('por_vencer')
  })
  it('rangos de días vencidos', () => {
    expect(bucketAntiguedad(venc, new Date('2026-09-01'))).toBe('d1_30')   // 12 días
    expect(bucketAntiguedad(venc, new Date('2026-09-25'))).toBe('d31_60')  // 36 días
    expect(bucketAntiguedad(venc, new Date('2026-10-25'))).toBe('d61_90')  // 66 días
    expect(bucketAntiguedad(venc, new Date('2026-12-01'))).toBe('d90_mas') // 103 días
  })
})

describe('distribuirPago', () => {
  it('aplica más-antigua-primero hasta agotar el monto', () => {
    const compras = [
      { compra_id: 'a', saldo: 100 },
      { compra_id: 'b', saldo: 200 },
      { compra_id: 'c', saldo: 50 },
    ]
    const r = distribuirPago(250, compras)
    expect(r.aplicaciones).toEqual([
      { compra_id: 'a', monto: 100 },
      { compra_id: 'b', monto: 150 },
    ])
    expect(r.remanente).toBe(0)
  })
  it('devuelve remanente si el monto supera el total adeudado', () => {
    const compras = [{ compra_id: 'a', saldo: 100 }]
    const r = distribuirPago(300, compras)
    expect(r.aplicaciones).toEqual([{ compra_id: 'a', monto: 100 }])
    expect(r.remanente).toBe(200)
  })
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/cxp --exclude "**/.claude/**"`
Expected: FAIL (módulo `../cxp` no existe).

- [ ] **Step 4: Escribir la implementación**

Crear `lib/cxp/cxp.ts`:

```typescript
import type { EstadoPago, BucketAntiguedad } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

// Días entre dos fechas por calendario UTC (ambas ya normalizadas a día).
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate())
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate())
  return Math.round((b - a) / 86400000)
}

export function saldoCompra(total: number, pagado: number): number {
  return round2(total - pagado)
}

export function estadoPago(total: number, pagado: number, fechaVencimiento: Date, hoy: Date): EstadoPago {
  const saldo = round2(total - pagado)
  if (saldo <= 0) return 'pagada'
  if (diasEntre(fechaVencimiento, hoy) > 0) return 'vencida'  // gana sobre parcial
  if (pagado > 0) return 'parcial'
  return 'pendiente'
}

export function bucketAntiguedad(fechaVencimiento: Date, hoy: Date): BucketAntiguedad {
  const d = diasEntre(fechaVencimiento, hoy)  // días vencidos (negativo/0 = por vencer)
  if (d <= 0) return 'por_vencer'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  if (d <= 90) return 'd61_90'
  return 'd90_mas'
}

// Aplica el monto a las compras en el ORDEN recibido (el llamador ordena por
// vencimiento asc para "más-antigua-primero"), sin exceder el saldo de cada
// una. `remanente` es lo que sobra si el monto supera el total adeudado.
export function distribuirPago(
  monto: number,
  comprasConSaldo: { compra_id: string; saldo: number }[],
): { aplicaciones: { compra_id: string; monto: number }[]; remanente: number } {
  let resto = round2(monto)
  const aplicaciones: { compra_id: string; monto: number }[] = []
  for (const c of comprasConSaldo) {
    if (resto <= 0) break
    const aplicar = round2(Math.min(resto, c.saldo))
    if (aplicar > 0) {
      aplicaciones.push({ compra_id: c.compra_id, monto: aplicar })
      resto = round2(resto - aplicar)
    }
  }
  return { aplicaciones, remanente: resto }
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/cxp --exclude "**/.claude/**"` → PASS. Luego `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/cxp/
git commit -m "feat(cxp): tipos y logica pura (saldo, estado, antiguedad, distribucion)"
```

---

### Task 3: Server Actions de CxP + guard de anulación

**Files:**
- Create: `app/admin/cuentas-por-pagar/actions.ts`
- Modify: `app/admin/compras/actions.ts` (guard en `anularCompra`)

**Interfaces:**
- Consumes: `distribuirPago` de `@/lib/cxp/cxp`; `hoyHonduras` de `@/lib/cotizaciones/cotizaciones`; `estadoPago`/`bucketAntiguedad` de `@/lib/cxp/cxp`; tipos `CompraSaldo`, `CxpFila`, `PagoProveedor`, `PagoAplicacion`, `PagoMetodo`. Patrón: `app/admin/compras/actions.ts`.
- Produces:
  - `type CxpResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`
  - `registrarPago(input: RegistrarPagoInput): Promise<CxpResult<{ id: string }>>`
  - `eliminarPago(pagoId: string): Promise<CxpResult>`
  - `obtenerCxp(): Promise<CxpResult<CxpFila[]>>`
  - `obtenerEstadoCuenta(proveedorId: string): Promise<CxpResult<{ compras: CxpFila[]; pagos: (PagoProveedor & { aplicaciones: PagoAplicacion[] })[]; totalAdeudado: number }>>`
  - `obtenerPagos(): Promise<CxpResult<(PagoProveedor & { proveedor_nombre: string; aplicaciones: PagoAplicacion[] })[]>>`
  - Tipos `RegistrarPagoInput` (exportado).

- [ ] **Step 1: Tipos de entrada + `obtenerCxp`**

```typescript
export interface RegistrarPagoInput {
  proveedorId: string
  fecha: string           // 'YYYY-MM-DD'
  metodo: PagoMetodo
  referencia: string | null
  notas: string | null
  // Modo abono/manual: aplicaciones explícitas. Modo global auto: dejar
  // `aplicaciones` vacío y pasar `montoGlobal` (se distribuye en el servidor).
  aplicaciones: { compraId: string; monto: number }[]
  montoGlobal?: number
}
```

`obtenerCxp`: consulta `compra_saldos` con `saldo > 0`, join a `clientes` para el nombre del proveedor; en JS calcula `dias_vencido` (`diasEntre(new Date(fecha_vencimiento), hoyHonduras(new Date()))` — o 0 si `fecha_vencimiento` null), `estado` (`estadoPago`) y `bucket` (`bucketAntiguedad`), y devuelve `CxpFila[]`. (Para el nombre del proveedor usar `select('*, proveedor:clientes(nombre)')` sobre la vista si PostgREST lo permite; si no, traer proveedores aparte y mapear por `proveedor_id`.)

- [ ] **Step 2: `registrarPago` (abono / global auto / manual)**

```typescript
export async function registrarPago(input: RegistrarPagoInput): Promise<CxpResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let aplicaciones = input.aplicaciones
  // Modo global auto: distribuir montoGlobal entre las compras con saldo del proveedor.
  if (input.montoGlobal != null && aplicaciones.length === 0) {
    const { data: saldos } = await supabase
      .from('compra_saldos')
      .select('compra_id, saldo, fecha_vencimiento')
      .eq('proveedor_id', input.proveedorId)
      .gt('saldo', 0)
    const ordenadas = (saldos ?? [])
      .slice()
      .sort((a, b) => String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? '')))
      .map(s => ({ compra_id: s.compra_id as string, saldo: Number(s.saldo) }))
    const { aplicaciones: apps, remanente } = distribuirPago(input.montoGlobal, ordenadas)
    if (remanente > 0) return { ok: false, error: 'El monto supera el total adeudado del proveedor.' }
    aplicaciones = apps.map(a => ({ compraId: a.compra_id, monto: a.monto }))
  }
  if (aplicaciones.length === 0) return { ok: false, error: 'No hay aplicaciones para el pago.' }

  const { data, error } = await supabase.rpc('registrar_pago_proveedor', {
    p: {
      proveedor_id: input.proveedorId, fecha: input.fecha, metodo: input.metodo,
      referencia: input.referencia, notas: input.notas, usuario: user?.email ?? null,
      aplicaciones: aplicaciones.map(a => ({ compra_id: a.compraId, monto: a.monto })),
    },
  })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/cuentas-por-pagar')
  return { ok: true, data: { id: data as string } }
}
```

`traducirError(msg)`: si contiene los textos de las excepciones de la RPC ('excede el saldo', 'no es al credito', 'esta anulada', 'no pertenece al proveedor', 'sin aplicaciones'), devuélvelo tal cual; si no, genérico. Función local.

- [ ] **Step 3: `eliminarPago`, `obtenerEstadoCuenta`, `obtenerPagos`**

- `eliminarPago(pagoId)` → `supabase.rpc('eliminar_pago_proveedor', { p_pago_id: pagoId })`; `revalidatePath`.
- `obtenerEstadoCuenta(proveedorId)` → las `compra_saldos` del proveedor (mapeadas a `CxpFila` con estado/bucket/dias), sus `pagos_proveedor` (con `pago_aplicaciones`), y `totalAdeudado = Σ saldo`.
- `obtenerPagos()` → `pagos_proveedor` (join `clientes` para nombre) con sus `pago_aplicaciones`.

- [ ] **Step 4: Guard en `anularCompra`**

En `app/admin/compras/actions.ts`, en `anularCompra`, ANTES de llamar la RPC `anular_compra`, agregar:

```typescript
const { count } = await supabase.from('pago_aplicaciones').select('id', { count: 'exact', head: true }).eq('compra_id', compraId)
if ((count ?? 0) > 0) return { ok: false, error: 'La compra tiene pagos registrados. Elimínalos antes de anular.' }
```

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` limpio; `npx eslint app/admin/cuentas-por-pagar/actions.ts app/admin/compras/actions.ts` sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/admin/cuentas-por-pagar/actions.ts app/admin/compras/actions.ts
git commit -m "feat(cxp): server actions (registrar/eliminar pago, cxp, estado de cuenta) + guard de anulacion"
```

---

### Task 4: Tablero de CxP (antigüedad + lista + PagoModal) + sidebar

**Files:**
- Create: `app/admin/cuentas-por-pagar/page.tsx`
- Create: `app/admin/cuentas-por-pagar/CuentasPorPagarClient.tsx`
- Create: `app/admin/cuentas-por-pagar/PagoModal.tsx`
- Create: `app/admin/cuentas-por-pagar/cxp.module.css`
- Modify: `components/admin/Sidebar.tsx` (link "Cuentas por pagar")

**Interfaces:**
- Consumes: `obtenerCxp`, `registrarPago`, `RegistrarPagoInput` de `./actions`; tipos `CxpFila`, `BucketAntiguedad`, `PagoMetodo`, `Cliente`; `formatPrice`; `parseMoneyInput`/`valorMostrado` de `@/app/admin/pos/pos-helpers`. Modal compartido `@/components/admin/Modal`.
- Produces: la ruta `/admin/cuentas-por-pagar`.

- [ ] **Step 1: `page.tsx` (server)**

Llama `obtenerCxp()` y carga los proveedores (`clientes` con `es_proveedor=true and activo`, `order('nombre')`); pasa ambos a `CuentasPorPagarClient`.

- [ ] **Step 2: `CuentasPorPagarClient.tsx` (client)**

- **Resumen de antigüedad:** 5 tarjetas/celdas (Por vencer / 1-30 / 31-60 / 61-90 / +90) con la suma de `saldo` de las filas cuyo `bucket` coincide (`formatPrice`).
- **Lista:** tabla de `CxpFila` (número, proveedor, total, pagado, saldo, vencimiento, estado con badge por color: pendiente gris, parcial ámbar, vencida rojo), filtro por proveedor y por estado.
- **Acción por fila "Abonar":** abre `PagoModal` en modo abono con esa compra (monto default = saldo).
- **Botón "Nuevo pago":** abre `PagoModal` en modo global.
- Enlaza a `/admin/cuentas-por-pagar/pagos` (historial) con un botón.

- [ ] **Step 3: `PagoModal.tsx`**

- Campos comunes: `fecha` (default hoy), `metodo` (select efectivo/transferencia/cheque/otro), `referencia`, `notas`.
- **Modo abono:** recibe la compra (número + saldo). Un input `monto` (default = saldo, máx = saldo). Al confirmar arma `RegistrarPagoInput` con `aplicaciones: [{ compraId, monto }]` y llama `registrarPago`.
- **Modo global:** select de proveedor; input `monto`; toggle *Distribuir automáticamente (más antigua primero)* / *Elegir compras*. En **auto**: manda `montoGlobal` sin aplicaciones. En **manual**: carga las compras con saldo del proveedor (vía una prop o una llamada) y muestra inputs de monto por compra; valida en vivo Σ = monto y cada ≤ saldo, y manda `aplicaciones` explícitas.
- Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado`. Al `ok`, `router.refresh()` y cierra. Usa el `Modal` compartido.

- [ ] **Step 4: Link "Cuentas por pagar" en el Sidebar**

En `components/admin/Sidebar.tsx`, en el grupo de administración (junto a Compras):

```tsx
{ href: '/admin/cuentas-por-pagar', icon: '💰', label: 'Cuentas por pagar' },
```

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los archivos nuevos + Sidebar sin errores. (Migración no aplicada aún — NO levantar el dev server; visual deferido.)

- [ ] **Step 6: Commit**

```bash
git add app/admin/cuentas-por-pagar/page.tsx app/admin/cuentas-por-pagar/CuentasPorPagarClient.tsx app/admin/cuentas-por-pagar/PagoModal.tsx app/admin/cuentas-por-pagar/cxp.module.css components/admin/Sidebar.tsx
git commit -m "feat(cxp): tablero de cuentas por pagar con antiguedad y registro de pagos"
```

---

### Task 5: Historial de pagos + estado de cuenta por proveedor (con hoja imprimible)

**Files:**
- Create: `app/admin/cuentas-por-pagar/pagos/page.tsx`
- Create: `app/admin/cuentas-por-pagar/pagos/PagosClient.tsx`
- Create: `app/admin/cuentas-por-pagar/proveedor/[id]/page.tsx`
- Create: `app/admin/cuentas-por-pagar/proveedor/[id]/EstadoCuentaView.tsx`
- Create: `app/admin/cuentas-por-pagar/proveedor/[id]/HojaEstadoCuenta.tsx`
- Create: `app/admin/cuentas-por-pagar/proveedor/[id]/estado.module.css`

**Interfaces:**
- Consumes: `obtenerPagos`, `eliminarPago`, `obtenerEstadoCuenta` de `../actions` (ajustar path relativo); tipos `PagoProveedor`, `PagoAplicacion`, `CxpFila`, `Cliente`; `formatPrice`; `toConfigMap` (empresa). Patrón imprimible: `app/admin/pos/documento/[id]/{DocumentoHoja.tsx,documento.module.css}` (`.btnToolbar`, `@media print`).
- Produces: rutas `/admin/cuentas-por-pagar/pagos` y `/admin/cuentas-por-pagar/proveedor/[id]`.

- [ ] **Step 1: Historial de pagos**

`pagos/page.tsx` (server) llama `obtenerPagos()`; `PagosClient` (client): tabla con número, proveedor, fecha, monto (`formatPrice`), método, referencia, y las aplicaciones expandibles (compra + monto); acción **Eliminar** con `window.confirm` → `eliminarPago(id)` + `router.refresh()`.

- [ ] **Step 2: Estado de cuenta por proveedor**

`proveedor/[id]/page.tsx` (server) llama `obtenerEstadoCuenta(id)` + config de empresa (`toConfigMap`) + datos del proveedor (`clientes`); si falla, `notFound()`. Pasa a `EstadoCuentaView`.
`EstadoCuentaView` (client): muestra el proveedor, sus compras al crédito con saldo (número, total, pagado, saldo, vencimiento, estado), sus pagos, y el **total adeudado**; botón *Imprimir* que renderiza `HojaEstadoCuenta`.

- [ ] **Step 3: `HojaEstadoCuenta.tsx` + `estado.module.css`**

Hoja imprimible (carta, fondo blanco/tinta fija) con datos de empresa y proveedor, la tabla de compras con saldo, la tabla de pagos, y el total adeudado. Barra con botón *Imprimir* (`window.print()`) usando `.btnToolbar`; `@media print` oculta la barra. Copiá a `estado.module.css` lo necesario de `documento.module.css` (no importes ese módulo).

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cuentas-por-pagar/pagos/ app/admin/cuentas-por-pagar/proveedor/
git commit -m "feat(cxp): historial de pagos y estado de cuenta imprimible por proveedor"
```

---

### Task 6: Bloque de saldo/pagos en el editor de compra

**Files:**
- Create: `app/admin/compras/[id]/CompraCxpBlock.tsx`
- Modify: `app/admin/compras/[id]/CompraEditor.tsx` (montar el bloque cuando la compra es al crédito y está guardada)
- Modify: `app/admin/compras/[id]/page.tsx` (cargar el saldo/pagos de la compra y pasarlos)

**Interfaces:**
- Consumes: la vista `compra_saldos` y `pago_aplicaciones`/`pagos_proveedor` (vía el server component de la página de compra, con una consulta puntual del saldo de esa compra); `formatPrice`; tipos `CompraSaldo`, `PagoProveedor`. Reusa `estadoPago`/`hoyHonduras` para el estado.
- Produces: un bloque de solo lectura en el editor de compra.

- [ ] **Step 1: Cargar el saldo/pagos en `page.tsx`**

En `app/admin/compras/[id]/page.tsx`, cuando la compra existe y es al crédito, consultá `compra_saldos` por `compra_id` y los pagos que la aplican (`pago_aplicaciones` join `pagos_proveedor`) y pasalos como prop opcional `cxp?: { saldo: CompraSaldo; pagos: { numero: string; fecha: string; monto: number }[] } | null` a `CompraEditor`.

- [ ] **Step 2: `CompraCxpBlock.tsx` + montarlo**

`CompraCxpBlock` (presentacional): muestra Total / Pagado / **Saldo** (con `formatPrice`), el estado (`estadoPago` con `hoyHonduras`), y la lista de pagos que la abonaron (número, fecha, monto). Es de **solo lectura** — sin acciones de pago (el pago se hace desde el tablero de CxP). En `CompraEditor`, montá `<CompraCxpBlock cxp={cxp} />` cuando `cxp` no es null (compra al crédito guardada). Estilo Merlin (reusá `compras.module.css` o agregá clases).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/compras/\[id\]/CompraCxpBlock.tsx app/admin/compras/\[id\]/CompraEditor.tsx app/admin/compras/\[id\]/page.tsx
git commit -m "feat(cxp): bloque de saldo y pagos en el editor de compra"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/cxp`).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados (los de `coverage/` son ruido preexistente gitignored).
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar la migración): abonar a una compra al crédito (saldo baja); pago global auto distribuido; antigüedad; estado de cuenta imprimible; eliminar un pago (saldo se restaura); guard de anular una compra con pagos; bloque de saldo en el editor de compra.

## Entrega

- El usuario aplica `supabase/migrations/2026-08-08-pos-p4b-cuentas-por-pagar.sql` y corre `supabase/smoke-pos-p4b.sql` (espera "Success: migracion POS P4b OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P4b desplegado.
