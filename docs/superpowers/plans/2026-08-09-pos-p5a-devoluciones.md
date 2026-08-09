# POS P5a — Devoluciones y Notas de Crédito — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Devolver productos de una factura (NC fiscal CAI '03') o comprobante (devolución interna), reponiendo stock, ajustando la CxC y reembolsando por efectivo/saldo a favor/CxC, con una RPC atómica que no toca la emisión fiscal existente.

**Architecture:** El documento de devolución es un `documentos` nuevo con `documento_origen_id` y líneas con `origen_item_id`; la Server Action recalcula los importes de las líneas devueltas reusando `desglosarLinea` (base por unidad → ISV derivado) y la RPC `emitir_nota_credito` valida atómicamente la cantidad devolvible (`for update` sobre el origen), toma correlativo (CAI '03' o secuencia interna), repone stock (`'devolucion'`), y aplica el reembolso (efectivo/saldo a favor/CxC). La vista `documento_saldos` de P4c se extiende para restar las devoluciones aplicadas a CxC.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC + vista), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español** (UI, dominio, commits). Moneda en **Lempiras** con `formatPrice()`.
- **NO se toca `emitir_documento` ni `anular_comprobante`.** La devolución es una RPC nueva. Documentos inmutables (trigger existente). Kardex append-only (`'devolucion'` ya existe).
- **Frontera de confianza:** la Server Action recalcula los importes con `desglosarLinea` (no confía en el navegador); la RPC revalida la cantidad devolvible con `for update` sobre el documento origen, revalida `Σ importes = total`, valida `Σ reembolsos = total`, `cxc ≤ saldo pendiente`, `saldo_favor` exige cliente registrado, y aplica la regla `devoluciones_sin_efectivo`.
- **ISV de la línea devuelta:** base por unidad (precio − descuento prorrateado por unidad) × cantidad; **ISV = base × tasa** (derivado de la base, no del ISV redondeado original). Reusa `desglosarLinea`.
- **Tipos nuevos de `documentos.tipo`:** `'nota_credito'` (factura → CAI '03', correlativo) y `'devolucion'` (comprobante → `devolucion_numero_seq`). Check recreado idempotente; `documentos_correlativo_chk` extendido.
- **`documento_saldos` (P4c) extendida:** `saldo = credito_total − cobrado − nc_cxc` (Σ reembolsos tipo `cxc` de devoluciones no anuladas del origen).
- **Toggle `devoluciones_sin_efectivo`** (config, default `'false'`): bloquea reembolso efectivo (servidor + UI).
- **Saldo a favor:** solo generación (`saldo_favor_movimientos` `+`); el gasto es P5b.
- **Migración idempotente** (`if not exists`, `create or replace`, drop/recreate de checks por nombre/lookup), aplicada por el usuario antes del push. Smoke con **`to_regprocedure`**. Estilo P4c/P4d.
- **CSS Modules con tokens Merlin**; botones `btnMerlin*` con clase de módulo. Dinero con `type="text" inputMode="decimal"`. Imprimible = HTML + CSS impresión (`.btnToolbar`, tinta fija, `@media print`).
- Cliente de Supabase de servidor. Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

### Task 1: Lógica pura de devoluciones + `esperadoCaja` con devoluciones + tipos

**Files:**
- Create: `lib/pos/devoluciones.ts`
- Create: `lib/pos/tests/devoluciones.test.ts`
- Modify: `lib/pos/emision.ts` (`esperadoCaja` gana parámetro `devoluciones`)
- Modify: `lib/pos/tests/emision.test.ts` (test de `esperadoCaja` con devoluciones)
- Modify: `types/index.ts` (tipos de devolución/reembolso/saldo a favor)

**Interfaces:**
- Consumes: `desglosarLinea` de `@/lib/pos/desglose` (firma `(linea: LineaPos, exonerado: boolean) => LineaConColumna`), `round2` (local).
- Produces (puras): `cantidadDevolvible(cantidadOriginal, yaDevuelto)`, `recalcularLineaDevuelta(original, cantidad)`, `totalNotaCredito(lineas)`, `validarReembolsos(reembolsos, total, opts)`, `numeroDevolucion(n)`.
- Produces (tipos): `ReembolsoTipo`, `ReembolsoDevolucion`, `LineaOriginalDoc`, `SaldoFavorMovimiento`.
- Produces (emision): `esperadoCaja(montoInicial, docs, cobros?, devoluciones?)` → `{ efectivoEsperado, porMetodo, cobrosPorMetodo, devolucionesPorMetodo }`.

- [ ] **Step 1: Tipos en `types/index.ts`**

Al final del archivo:

```typescript
export type ReembolsoTipo = 'efectivo' | 'saldo_favor' | 'cxc'

export interface ReembolsoDevolucion {
  tipo: ReembolsoTipo
  monto: number
  metodo_id?: string | null
}

// Fila de documento_items del documento original (lo que se puede devolver)
export interface LineaOriginalDoc {
  id: string
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  isv: '15' | '18' | 'exento'
  importe: number
  base: number
  isv_monto: number
  ya_devuelto: number
}

export interface SaldoFavorMovimiento {
  id: string
  cliente_id: string
  monto: number
  tipo: 'devolucion'
  documento_id: string | null
  notas: string | null
  usuario: string | null
  created_at: string
}
```

- [ ] **Step 2: Test de la lógica pura (que falla)**

Crear `lib/pos/tests/devoluciones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cantidadDevolvible, recalcularLineaDevuelta, totalNotaCredito, validarReembolsos, numeroDevolucion } from '../devoluciones'

describe('cantidadDevolvible', () => {
  it('original menos ya devuelto', () => expect(cantidadDevolvible(3, 1)).toBe(2))
  it('nunca negativo', () => expect(cantidadDevolvible(2, 2)).toBe(0))
})

describe('numeroDevolucion', () => {
  it('formatea 8 dígitos', () => expect(numeroDevolucion(5)).toBe('DEV-00000005'))
})

describe('recalcularLineaDevuelta', () => {
  const original = { producto_id: 'p1', variante_id: null, descripcion: 'Camiseta', cantidad: 3, precio_unitario: 230, descuento: 0, isv: '15' as const, importe: 690, base: 600, isv_monto: 90 }
  it('devolver 1 de 3 acredita 1/3 con ISV derivado de la base', () => {
    const r = recalcularLineaDevuelta(original, 1)
    expect(r.importe).toBe(230)
    expect(r.base).toBe(200)
    expect(r.isv_monto).toBe(30)
    expect(r.cantidad).toBe(1)
  })
  it('prorratea el descuento de la línea por unidad', () => {
    const conDesc = { ...original, descuento: 30, importe: 660, base: 574 } // bruto 690-30=660
    const r = recalcularLineaDevuelta(conDesc, 1)
    // bruto unidad = (690-30)/3 = 220 ; base = 220/1.15 = 191.30 ; isv = 28.70
    expect(r.importe).toBe(220)
    expect(r.base).toBe(191.3)
    expect(r.isv_monto).toBe(28.7)
  })
})

describe('totalNotaCredito', () => {
  it('suma los importes de las líneas devueltas', () => {
    expect(totalNotaCredito([{ importe: 230 }, { importe: 115 }])).toBe(345)
  })
})

describe('validarReembolsos', () => {
  const base = { saldoCxc: 0, sinEfectivo: false, clienteRegistrado: true }
  it('ok si suma el total', () => {
    expect(validarReembolsos([{ tipo: 'efectivo', monto: 230 }], 230, base)).toBeNull()
  })
  it('error si no suma el total', () => {
    expect(validarReembolsos([{ tipo: 'efectivo', monto: 100 }], 230, base)).toMatch(/no cubre|no coincide/i)
  })
  it('bloquea efectivo si la regla está activa', () => {
    expect(validarReembolsos([{ tipo: 'efectivo', monto: 230 }], 230, { ...base, sinEfectivo: true })).toMatch(/efectivo/i)
  })
  it('saldo a favor exige cliente registrado', () => {
    expect(validarReembolsos([{ tipo: 'saldo_favor', monto: 230 }], 230, { ...base, clienteRegistrado: false })).toMatch(/cliente/i)
  })
  it('cxc no puede exceder el saldo pendiente', () => {
    expect(validarReembolsos([{ tipo: 'cxc', monto: 230 }], 230, { ...base, saldoCxc: 100 })).toMatch(/cuenta por cobrar|saldo/i)
  })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run lib/pos/tests/devoluciones.test.ts --exclude "**/.claude/**"` → FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/pos/devoluciones.ts`**

```typescript
import { desglosarLinea } from './desglose'
import type { LineaOriginalDoc, ReembolsoDevolucion } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export function cantidadDevolvible(cantidadOriginal: number, yaDevuelto: number): number {
  return Math.max(0, cantidadOriginal - yaDevuelto)
}

export function numeroDevolucion(n: number): string {
  return `DEV-${String(n).padStart(8, '0')}`
}

type OriginalLinea = Pick<LineaOriginalDoc, 'producto_id' | 'variante_id' | 'descripcion' | 'cantidad' | 'precio_unitario' | 'descuento' | 'isv' | 'importe' | 'base' | 'isv_monto'>

// Reconstruye la línea devuelta con la misma matemática de la emisión, en reversa:
// prorratea el descuento por unidad y deriva base/ISV vía desglosarLinea.
export function recalcularLineaDevuelta(original: OriginalLinea, cantidad: number) {
  const exonerado = original.isv !== 'exento' && original.isv_monto === 0 && original.importe === original.base
  const descuentoUnit = round2((original.descuento / original.cantidad) * cantidad)
  const linea = {
    producto_id: original.producto_id,
    variante_id: original.variante_id,
    descripcion: original.descripcion,
    cantidad,
    precio_unitario: original.precio_unitario,
    descuento: descuentoUnit,
    isv: original.isv,
  }
  return desglosarLinea(linea as Parameters<typeof desglosarLinea>[0], exonerado)
}

export function totalNotaCredito(lineas: Array<{ importe: number }>): number {
  return round2(lineas.reduce((s, l) => s + l.importe, 0))
}

export function validarReembolsos(
  reembolsos: ReembolsoDevolucion[],
  total: number,
  opts: { saldoCxc: number; sinEfectivo: boolean; clienteRegistrado: boolean },
): string | null {
  const suma = round2(reembolsos.reduce((s, r) => s + r.monto, 0))
  if (Math.abs(suma - total) > 0.01) return 'El reembolso no coincide con el total a acreditar.'
  for (const r of reembolsos) {
    if (r.monto <= 0) return 'Los montos de reembolso no pueden ser negativos.'
    if (r.tipo === 'efectivo' && opts.sinEfectivo) return 'Las devoluciones en efectivo están deshabilitadas.'
    if (r.tipo === 'saldo_favor' && !opts.clienteRegistrado) return 'El saldo a favor requiere un cliente registrado.'
  }
  const cxc = round2(reembolsos.filter(r => r.tipo === 'cxc').reduce((s, r) => s + r.monto, 0))
  if (cxc > opts.saldoCxc + 0.01) return 'El abono a la cuenta por cobrar excede el saldo pendiente.'
  return null
}
```

- [ ] **Step 5: Extender `esperadoCaja` en `lib/pos/emision.ts`**

Agregar un 4º parámetro opcional `devoluciones: Array<{ metodo: CobroMetodo; monto: number }> = []`. El efectivo reembolsado RESTA al `efectivoEsperado`; devolver además `devolucionesPorMetodo: Record<CobroMetodo, number>`. Mantener el comportamiento actual sin devoluciones. Después del loop de `cobros`:

```typescript
  const devolucionesPorMetodo: Record<CobroMetodo, number> = { efectivo: 0, transferencia: 0, tarjeta: 0, cheque: 0, otro: 0 }
  for (const dev of devoluciones) {
    devolucionesPorMetodo[dev.metodo] += dev.monto
    if (dev.metodo === 'efectivo') efectivoEsperado = round2(efectivoEsperado - dev.monto)
  }
```

Agregar `devolucionesPorMetodo` al tipo de retorno y al `return`. Agregar en `lib/pos/tests/emision.test.ts` un caso: montoInicial 100, venta efectivo 500, cobro efectivo 300, **devolución efectivo 200** → efectivoEsperado 700; una devolución transferencia 50 no resta al efectivo pero aparece en `devolucionesPorMetodo`.

- [ ] **Step 6: Correr tests + tsc**

Run: `npx vitest run lib/pos --exclude "**/.claude/**"` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 7: Commit**

```bash
git add lib/pos/devoluciones.ts lib/pos/tests/devoluciones.test.ts lib/pos/emision.ts lib/pos/tests/emision.test.ts types/index.ts
git commit -m "feat(devoluciones): logica pura de NC, esperadoCaja con devoluciones y tipos"
```

---

### Task 2: Migración P5a (columnas, tipos, RPC `emitir_nota_credito`, vistas) + smoke

**Files:**
- Create: `supabase/migrations/2026-08-09-pos-p5a-devoluciones.sql`
- Create: `supabase/smoke-pos-p5a.sql`

**Interfaces:**
- Produces: columnas `documentos.documento_origen_id`, `documento_items.origen_item_id`; tipos `nota_credito`/`devolucion`; `devolucion_numero_seq`; tablas `nota_credito_reembolsos`, `saldo_favor_movimientos`; vistas `saldo_favor_clientes`, `documento_saldos` (extendida); config `devoluciones_sin_efectivo`; RPC `emitir_nota_credito(jsonb) → uuid`.
- Consumes (ya existen): `documentos`, `documento_items`, `documento_pagos`, `cai_autorizaciones` (tipo '03'), `cajas`, `sesiones_caja`, `metodos_pago`, `clientes`, `movimientos_inventario`, `cobro_aplicaciones` (P4c).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-09-pos-p5a-devoluciones.sql`:

```sql
-- POS P5a: devoluciones y notas de credito.

-- 1. Columnas de referencia al origen.
alter table documentos add column if not exists documento_origen_id uuid references documentos(id) on delete restrict;
alter table documento_items add column if not exists origen_item_id uuid references documento_items(id) on delete restrict;

-- 2. Tipos nuevos de documento (recrear el check inline por lookup).
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid='documentos'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%tipo%' and pg_get_constraintdef(oid) like '%factura%'
     and pg_get_constraintdef(oid) not like '%correlativo%';
  if v_con is not null then execute format('alter table documentos drop constraint %I', v_con); end if;
  alter table documentos add constraint documentos_tipo_chk
    check (tipo in ('factura','comprobante','nota_credito','devolucion'));
end $$;

-- 3. Correlativo: nota_credito como factura (cai+correlativo), devolucion como comprobante (numero).
alter table documentos drop constraint if exists documentos_correlativo_chk;
alter table documentos add constraint documentos_correlativo_chk check (
  (tipo in ('factura','nota_credito') and correlativo is not null and cai_id is not null and numero_comprobante is null)
  or (tipo in ('comprobante','devolucion') and correlativo is null and cai_id is null and numero_comprobante is not null)
);

create sequence if not exists devolucion_numero_seq;

insert into configuracion (key, value) values ('devoluciones_sin_efectivo', 'false')
on conflict (key) do nothing;

-- 4. Reembolsos de una devolucion (efectivo/saldo_favor/cxc).
create table if not exists nota_credito_reembolsos (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  tipo         text not null check (tipo in ('efectivo','saldo_favor','cxc')),
  metodo_id    uuid references metodos_pago(id) on delete restrict,
  monto        numeric(12,2) not null check (monto > 0)
);
create index if not exists ncr_documento_idx on nota_credito_reembolsos (documento_id);

-- 5. Saldo a favor (ledger). En P5a solo se acumula (monto > 0, tipo 'devolucion').
create table if not exists saldo_favor_movimientos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete restrict,
  monto        numeric(12,2) not null,
  tipo         text not null check (tipo in ('devolucion')),
  documento_id uuid references documentos(id) on delete set null,
  notas        text,
  usuario      text,
  created_at   timestamptz default now()
);
create index if not exists sfm_cliente_idx on saldo_favor_movimientos (cliente_id);
create or replace view saldo_favor_clientes as
  select cliente_id, sum(monto) as saldo from saldo_favor_movimientos group by cliente_id;
grant select on saldo_favor_clientes to authenticated;

-- 6. documento_saldos (P4c) extendida: resta las devoluciones aplicadas a CxC.
create or replace view documento_saldos as
select
  d.id as documento_id, d.cliente_id, cl.nombre as cliente_nombre,
  d.tipo, d.correlativo, d.numero_comprobante, d.created_at::date as fecha,
  (d.created_at::date + (coalesce(cl.dias_credito,0) || ' days')::interval)::date as fecha_vencimiento,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) as credito_total,
  coalesce(max(ca.cobrado), 0) as cobrado,
  coalesce(max(ncx.nc_cxc), 0) as nc_cxc,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0)
    - coalesce(max(ca.cobrado), 0) - coalesce(max(ncx.nc_cxc), 0) as saldo
from documentos d
join clientes cl on cl.id = d.cliente_id
join documento_pagos dp on dp.documento_id = d.id
join metodos_pago m on m.id = dp.metodo_id
left join (select documento_id, sum(monto) as cobrado from cobro_aplicaciones group by documento_id) ca
  on ca.documento_id = d.id
left join (
  select doc.documento_origen_id, sum(ncr.monto) as nc_cxc
  from documentos doc
  join nota_credito_reembolsos ncr on ncr.documento_id = doc.id
  where doc.estado <> 'anulado' and ncr.tipo = 'cxc'
  group by doc.documento_origen_id
) ncx on ncx.documento_origen_id = d.id
where d.estado <> 'anulado' and d.tipo in ('factura','comprobante')
group by d.id, cl.nombre, cl.dias_credito, ca.cobrado, ncx.nc_cxc
having coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) > 0;
grant select on documento_saldos to authenticated;

-- 7. RPC atomica: emitir nota de credito / devolucion.
create or replace function emitir_nota_credito(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_origen documentos%rowtype;
  v_caja cajas%rowtype;
  v_sesion_id uuid;
  v_tipo text;
  v_cai cai_autorizaciones%rowtype;
  v_correlativo text; v_numero integer;
  v_total numeric := (p->'totales'->>'total')::numeric;
  v_suma_items numeric := 0;
  v_suma_reemb numeric := 0;
  v_doc_id uuid;
  v_item jsonb; v_reemb jsonb;
  v_origen_item documento_items%rowtype;
  v_ya_devuelto integer;
  v_cant integer;
  v_sin_efectivo boolean;
  v_saldo_cxc numeric;
  v_cxc_reemb numeric := 0;
begin
  -- Origen bloqueado: serializa devoluciones concurrentes.
  select * into v_origen from documentos where id = (p->>'documento_origen_id')::uuid for update;
  if not found then raise exception using message = 'HS_DOC|documento origen no encontrado'; end if;
  if v_origen.estado <> 'emitido' then raise exception using message = 'HS_DOC|el documento origen no está emitido'; end if;
  if v_origen.tipo not in ('factura','comprobante') then raise exception using message = 'HS_DOC|el origen no admite devolución'; end if;
  if coalesce(trim(p->>'motivo'),'') = '' then raise exception using message = 'HS_DOC|motivo requerido'; end if;

  select * into v_caja from cajas where id = (p->>'caja_id')::uuid and activo = true;
  if not found then raise exception using message = 'HS_CAJA|caja no encontrada'; end if;
  select s.id into v_sesion_id from sesiones_caja s where s.caja_id = v_caja.id and s.estado = 'abierta';
  if not found then raise exception using message = 'HS_CAJA|' || v_caja.nombre; end if;

  v_tipo := case when v_origen.tipo = 'factura' then 'nota_credito' else 'devolucion' end;

  -- Validar cantidades devolvibles por linea (el origen ya está bloqueado).
  for v_item in select * from jsonb_array_elements(p->'items') loop
    select * into v_origen_item from documento_items where id = (v_item->>'origen_item_id')::uuid;
    if not found or v_origen_item.documento_id <> v_origen.id then
      raise exception using message = 'HS_DOC|línea de origen inválida';
    end if;
    v_cant := (v_item->>'cantidad')::integer;
    if v_cant <= 0 then raise exception using message = 'HS_DOC|cantidad inválida'; end if;
    select coalesce(sum(di.cantidad),0) into v_ya_devuelto
      from documento_items di join documentos dd on dd.id = di.documento_id
      where di.origen_item_id = v_origen_item.id and dd.estado <> 'anulado';
    if v_cant > v_origen_item.cantidad - v_ya_devuelto then
      raise exception using message = 'HS_DEVOLVIBLE|' || v_origen_item.descripcion;
    end if;
    v_suma_items := v_suma_items + (v_item->>'importe')::numeric;
  end loop;

  if abs(v_suma_items - v_total) > 0.01 then raise exception using message = 'HS_TOTAL'; end if;

  -- Correlativo.
  if v_tipo = 'nota_credito' then
    select * into v_cai from cai_autorizaciones c
      where c.activo = true and c.punto_emision = v_caja.punto_emision and c.tipo_documento = '03'
      for update;
    if not found then raise exception using message = 'HS_CAI|sin_cai|' || v_caja.punto_emision; end if;
    if v_cai.fecha_limite < current_date then raise exception using message = 'HS_CAI|vencido|' || v_cai.fecha_limite; end if;
    if v_cai.correlativo_actual >= v_cai.rango_hasta then raise exception using message = 'HS_CAI|agotado|' || v_cai.rango_hasta; end if;
    update cai_autorizaciones set correlativo_actual = correlativo_actual + 1 where id = v_cai.id
      returning correlativo_actual into v_cai.correlativo_actual;
    v_correlativo := v_cai.establecimiento || '-' || v_cai.punto_emision || '-' || v_cai.tipo_documento
      || '-' || lpad(v_cai.correlativo_actual::text, 8, '0');
  else
    v_numero := nextval('devolucion_numero_seq');
  end if;

  -- Documento de devolucion (cliente heredado del origen).
  insert into documentos (
    tipo, correlativo, numero_comprobante, cai_id, caja_id, sesion_id, vendedor_id,
    cliente_id, cliente_nombre, cliente_rtn, cliente_identidad,
    exonerado, orden_compra_exenta, constancia_exonerado, registro_sag,
    documento_origen_id, total_exento, total_exonerado, total_gravado15, total_gravado18,
    isv15, isv18, descuento_total, total, total_letras, tasa_usd, notas, usuario
  ) values (
    v_tipo, v_correlativo, v_numero,
    case when v_tipo = 'nota_credito' then v_cai.id end,
    v_caja.id, v_sesion_id, v_origen.vendedor_id,
    v_origen.cliente_id, v_origen.cliente_nombre, v_origen.cliente_rtn, v_origen.cliente_identidad,
    v_origen.exonerado, v_origen.orden_compra_exenta, v_origen.constancia_exonerado, v_origen.registro_sag,
    v_origen.id,
    (p->'totales'->>'total_exento')::numeric, (p->'totales'->>'total_exonerado')::numeric,
    (p->'totales'->>'total_gravado15')::numeric, (p->'totales'->>'total_gravado18')::numeric,
    (p->'totales'->>'isv15')::numeric, (p->'totales'->>'isv18')::numeric,
    (p->'totales'->>'descuento_total')::numeric, v_total,
    p->'totales'->>'total_letras', v_origen.tasa_usd, nullif(p->>'motivo',''), nullif(p->>'usuario','')
  ) returning id into v_doc_id;

  insert into documento_items (
    documento_id, producto_id, variante_id, descripcion, cantidad,
    precio_unitario, descuento, isv, importe, base, isv_monto, origen_item_id
  )
  select v_doc_id, nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
    it->>'descripcion', (it->>'cantidad')::integer, (it->>'precio_unitario')::numeric,
    coalesce((it->>'descuento')::numeric,0), it->>'isv',
    (it->>'importe')::numeric, (it->>'base')::numeric, coalesce((it->>'isv_monto')::numeric,0),
    (it->>'origen_item_id')::uuid
  from jsonb_array_elements(p->'items') it;

  -- Reponer stock (items con producto y stock finito). Agrupado por producto/variante.
  update producto_variantes pv set stock = pv.stock + agg.cantidad
    from (select nullif(it->>'variante_id','')::uuid as vid, sum((it->>'cantidad')::integer) as cantidad
          from jsonb_array_elements(p->'items') it where nullif(it->>'variante_id','') is not null
          group by nullif(it->>'variante_id','')::uuid) agg
    where agg.vid = pv.id and pv.stock is not null;
  update productos pr set stock = pr.stock + agg.cantidad
    from (select nullif(it->>'producto_id','')::uuid as pid, sum((it->>'cantidad')::integer) as cantidad
          from jsonb_array_elements(p->'items') it
          where nullif(it->>'producto_id','') is not null and nullif(it->>'variante_id','') is null
          group by nullif(it->>'producto_id','')::uuid) agg
    where agg.pid = pr.id and pr.stock is not null;

  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
  select nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
    'devolucion', (it->>'cantidad')::integer,
    coalesce(pv.costo, pr.costo), 'nota_credito:' || v_doc_id, nullif(p->>'usuario','')
  from jsonb_array_elements(p->'items') it
  left join producto_variantes pv on pv.id = nullif(it->>'variante_id','')::uuid
  join productos pr on pr.id = nullif(it->>'producto_id','')::uuid
  where nullif(it->>'producto_id','') is not null
    and (case when nullif(it->>'variante_id','') is not null then pv.stock else pr.stock end) is not null;

  -- Reembolsos.
  select value::boolean into v_sin_efectivo from configuracion where key = 'devoluciones_sin_efectivo';
  v_sin_efectivo := coalesce(v_sin_efectivo, false);
  select coalesce(saldo,0) into v_saldo_cxc from documento_saldos where documento_id = v_origen.id;
  v_saldo_cxc := coalesce(v_saldo_cxc, 0);

  for v_reemb in select * from jsonb_array_elements(coalesce(p->'reembolsos','[]'::jsonb)) loop
    if (v_reemb->>'monto')::numeric <= 0 then raise exception using message = 'HS_REEMB|monto inválido'; end if;
    if (v_reemb->>'tipo') = 'efectivo' and v_sin_efectivo then
      raise exception using message = 'HS_REEMB|efectivo deshabilitado';
    end if;
    if (v_reemb->>'tipo') = 'saldo_favor' and v_origen.cliente_id is null then
      raise exception using message = 'HS_REEMB|saldo a favor requiere cliente';
    end if;
    if (v_reemb->>'tipo') = 'cxc' then
      v_cxc_reemb := v_cxc_reemb + (v_reemb->>'monto')::numeric;
    end if;
    v_suma_reemb := v_suma_reemb + (v_reemb->>'monto')::numeric;

    insert into nota_credito_reembolsos (documento_id, tipo, metodo_id, monto)
    values (v_doc_id, v_reemb->>'tipo', nullif(v_reemb->>'metodo_id','')::uuid, (v_reemb->>'monto')::numeric);

    if (v_reemb->>'tipo') = 'saldo_favor' then
      insert into saldo_favor_movimientos (cliente_id, monto, tipo, documento_id, usuario)
      values (v_origen.cliente_id, (v_reemb->>'monto')::numeric, 'devolucion', v_doc_id, nullif(p->>'usuario',''));
    end if;
  end loop;

  if abs(v_suma_reemb - v_total) > 0.01 then raise exception using message = 'HS_REEMB|no coincide con el total'; end if;
  if v_cxc_reemb > v_saldo_cxc + 0.01 then raise exception using message = 'HS_REEMB|excede el saldo de CxC'; end if;

  return v_doc_id;
end; $$;
revoke all on function emitir_nota_credito(jsonb) from public, anon;
grant execute on function emitir_nota_credito(jsonb) to authenticated;

alter table nota_credito_reembolsos enable row level security;
alter table saldo_favor_movimientos enable row level security;
do $$ begin
  create policy ncr_admin on nota_credito_reembolsos for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy sfm_admin on saldo_favor_movimientos for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Escribir el smoke**

Crear `supabase/smoke-pos-p5a.sql` (usa `to_regprocedure`, no crea/borra datos):

```sql
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='documentos' and column_name='documento_origen_id') then raise exception 'FALLO: falta documentos.documento_origen_id'; end if;
  if not exists (select 1 from information_schema.columns where table_name='documento_items' and column_name='origen_item_id') then raise exception 'FALLO: falta documento_items.origen_item_id'; end if;
  if to_regclass('public.nota_credito_reembolsos') is null then raise exception 'FALLO: falta nota_credito_reembolsos'; end if;
  if to_regclass('public.saldo_favor_movimientos') is null then raise exception 'FALLO: falta saldo_favor_movimientos'; end if;
  if to_regclass('public.saldo_favor_clientes') is null then raise exception 'FALLO: falta la vista saldo_favor_clientes'; end if;
  if to_regclass('public.devolucion_numero_seq') is null then raise exception 'FALLO: falta devolucion_numero_seq'; end if;
  if to_regprocedure('public.emitir_nota_credito(jsonb)') is null then raise exception 'FALLO: falta emitir_nota_credito'; end if;
  if not exists (select 1 from configuracion where key='devoluciones_sin_efectivo') then raise exception 'FALLO: falta config devoluciones_sin_efectivo'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='documentos'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%nota_credito%'
  ) then raise exception 'FALLO: el check de tipo no incluye nota_credito'; end if;
  perform 1 from documento_saldos limit 0; -- la vista compila con la columna nc_cxc
  raise notice 'Smoke POS P5a: estructura OK';
end $$;
select 'Success: migracion POS P5a OK' as resultado,
       (select count(*) from nota_credito_reembolsos) as reembolsos;
```

- [ ] **Step 3: Revisar consistencia**

Verificar: el check de `tipo` conserva `factura`/`comprobante` + agrega `nota_credito`/`devolucion`; `documentos_correlativo_chk` agrupa correctamente; `emitir_nota_credito` bloquea el origen con `for update`, valida devolvible con las devoluciones no anuladas, revalida `Σ importes = total` y `Σ reembolsos = total`, aplica la regla `devoluciones_sin_efectivo` y `cxc ≤ saldo`; repone stock agrupado por producto/variante (evita el bug de UPDATE...FROM con filas múltiples, igual que `anular_comprobante`); `documento_saldos` resta `nc_cxc`. El reviewer valida (no hay BD local).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-09-pos-p5a-devoluciones.sql supabase/smoke-pos-p5a.sql
git commit -m "feat(devoluciones): migracion P5a (NC, reembolsos, saldo a favor, RPC)"
```

---

### Task 3: Server Actions de devolución + cierre con devoluciones

**Files:**
- Modify: `app/admin/pos/actions.ts` (`obtenerDevolvible`, `emitirNotaCredito`; pasar devoluciones al cierre)

**Interfaces:**
- Consumes: `recalcularLineaDevuelta`, `cantidadDevolvible`, `totalNotaCredito`, `validarReembolsos` de `@/lib/pos/devoluciones`; `traducirErrorPos` de `@/lib/pos/emision`; `numeroALetras` de `@/lib/pos/letras`; tipos `LineaOriginalDoc`, `ReembolsoDevolucion`.
- Produces:
  - `obtenerDevolvible(documentoId: string): Promise<{ ok: true; data: { documento: {...}; lineas: LineaOriginalDoc[]; saldoCxc: number; sinEfectivo: boolean } } | { ok: false; error: string }>`
  - `emitirNotaCredito(input: { documentoOrigenId: string; cajaId: string; motivo: string; lineas: { origenItemId: string; cantidad: number }[]; reembolsos: ReembolsoDevolucion[] }): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>`

- [ ] **Step 1: `obtenerDevolvible`**

Leé el documento origen (`documentos` + `documento_items`) y, por cada línea, calculá `ya_devuelto` (Σ cantidad de `documento_items` con `origen_item_id = línea.id` en documentos `estado <> 'anulado'`) → `cantidadDevolvible`. Traé `saldoCxc` de `documento_saldos` (donde `documento_id = origen`; 0 si no hay fila) y la config `devoluciones_sin_efectivo`. Devolvé las líneas como `LineaOriginalDoc[]` con `ya_devuelto`.

- [ ] **Step 2: `emitirNotaCredito`**

Frontera de confianza (releé de BD, no confíes en el navegador):
- Releé el documento origen + sus `documento_items`.
- Por cada línea de `input.lineas`: buscá el `documento_items` original por `origenItemId`; validá `cantidad ≤ cantidadDevolvible(original.cantidad, yaDevuelto)`; construí la línea devuelta con `recalcularLineaDevuelta(original, cantidad)` (esto recalcula base/ISV/importe).
- `total = totalNotaCredito(lineasDevueltas)`; totales agregados por columna fiscal reusando `totalesDocumento` de `@/lib/pos/desglose` (o recomponé `total_exento/…/isv15/isv18` sumando las líneas devueltas por columna, con `total_letras = numeroALetras(total)`).
- `validarReembolsos(input.reembolsos, total, { saldoCxc, sinEfectivo, clienteRegistrado: !!origen.cliente_id })` → si error, `{ ok:false, error }`.
- Armá el payload y llamá `supabase.rpc('emitir_nota_credito', { p: { documento_origen_id, caja_id, motivo, usuario, items:[{origen_item_id, producto_id, variante_id, descripcion, cantidad, precio_unitario, descuento, isv, importe, base, isv_monto}], totales, reembolsos:[{tipo, monto, metodo_id}] } })`.
- `traducirErrorPos` extendido para los códigos nuevos: `HS_DEVOLVIBLE` ("La cantidad supera lo devolvible de …"), `HS_REEMB` ("Problema con el reembolso: …"). `revalidatePath`.

- [ ] **Step 3: Cierre con devoluciones**

En la acción que arma el cierre/arqueo (la que ya pasa `cobros` a `esperadoCaja`, de P4c), traer las devoluciones de la sesión: `nota_credito_reembolsos` de los documentos `nota_credito`/`devolucion` con `sesion_id = <sesión>`, mapeadas a `{ metodo: <CobroMetodo>, monto }` (el `tipo` efectivo → `'efectivo'`; los demás según corresponda). Pasarlas como 4º argumento a `esperadoCaja`. El resto del cálculo fiscal no cambia.

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npx eslint app/admin/pos/actions.ts` sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/pos/actions.ts
git commit -m "feat(devoluciones): server actions (obtenerDevolvible, emitirNotaCredito) + cierre"
```

---

### Task 4: DevolucionModal + botón/badge en documentos

**Files:**
- Create: `app/admin/pos/components/DevolucionModal.tsx`
- Modify: `app/admin/pos/documentos/DocumentosClient.tsx` (botón "Devolver" + badge)
- Modify: `app/admin/pos/documento/[id]/DocumentoView*.tsx` (botón "Devolver") — usar el nombre real del cliente del detalle
- Modify: `app/admin/pos/documentos/documentos.module.css` (o el módulo del detalle) para el modal

**Interfaces:**
- Consumes: `obtenerDevolvible`, `emitirNotaCredito` de `@/app/admin/pos/actions`; `cantidadDevolvible`, `recalcularLineaDevuelta`, `totalNotaCredito`, `validarReembolsos` de `@/lib/pos/devoluciones`; `formatPrice`; `parseMoneyInput`/`valorMostrado`; Modal compartido; tipos `LineaOriginalDoc`, `ReembolsoDevolucion`.
- Produces: el flujo de devolución desde un documento.

- [ ] **Step 1: `DevolucionModal`**

Abrir con `obtenerDevolvible(documentoId)`. Lista los ítems con su **cantidad devolvible**; el cajero marca cantidades (`type="text" inputMode="decimal"`, 0..devolvible). Calcula en vivo el total a acreditar con `recalcularLineaDevuelta`/`totalNotaCredito`. Sección de **reembolso**: chips/inputs por vía — efectivo (oculto/deshabilitado si `sinEfectivo` o sin caja abierta), saldo a favor (si hay cliente registrado), abono a CxC (si `saldoCxc > 0`), validados con `validarReembolsos` en vivo. **Motivo obligatorio**. Al confirmar → `emitirNotaCredito(...)`; al `ok`, muestra la NC (Task 5) y refresca. Botones `btnMerlin*` con clase de módulo con caja.

- [ ] **Step 2: Botón "Devolver / Nota de crédito" + badge**

En `DocumentosClient.tsx` (listado) y el detalle del documento: botón habilitado si el documento es `factura`/`comprobante` `estado='emitido'` y tiene devolvible > 0. Badge "Devuelto (parcial/total)" si el documento tiene devoluciones asociadas (documentos con `documento_origen_id = este.id`). El listado incluye los tipos `nota_credito`/`devolucion` (filtro por tipo).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los tocados sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/pos/components/DevolucionModal.tsx app/admin/pos/documentos/ app/admin/pos/documento/
git commit -m "feat(devoluciones): DevolucionModal y acceso desde documentos"
```

---

### Task 5: Nota de crédito imprimible

**Files:**
- Create: `app/admin/pos/components/NotaCreditoHoja.tsx` (o `app/admin/pos/documento/[id]/` según dónde viva la hoja del documento)
- Modify: el módulo CSS de impresión del documento si hace falta

**Interfaces:**
- Consumes: los datos del documento de devolución (tipo, correlativo/numero, `documento_origen_id`, items con `origen_item_id`, totales); `formatPrice`; `toConfigMap` (datos de empresa). Patrón: la hoja imprimible del documento fiscal existente (`app/admin/pos/documento/[id]`), 80mm/carta, tinta fija, `@media print`, `.btnToolbar`.
- Produces: la NC/devolución imprimible.

- [ ] **Step 1: `NotaCreditoHoja`**

Mismo formato fiscal del documento, con el encabezado **"NOTA DE CRÉDITO"** (o "DEVOLUCIÓN" para comprobante), su CAI '03'/correlativo (o número interno), la **referencia a la factura original** (correlativo del origen), los ítems devueltos con cantidad/base/ISV, el total acreditado, el desglose por columna fiscal y el total en letras. Barra con Imprimir (`window.print()`, `.btnToolbar`), fondo blanco/tinta fija, `@media print` oculta la barra.

- [ ] **Step 2: Montaje**

Mostrar la hoja tras emitir (desde `DevolucionModal`) y accesible desde el detalle del documento de devolución (misma ruta/patrón que el documento de venta).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/pos/components/NotaCreditoHoja.tsx app/admin/pos/documento/
git commit -m "feat(devoluciones): nota de credito / devolucion imprimible"
```

---

### Task 6: Arqueo con devoluciones + toggle + saldo a favor en clientes

**Files:**
- Modify: `app/admin/pos/components/CierreModal.tsx` (sección "Devoluciones / reembolsos")
- Modify: `app/admin/configuracion/PosSection.tsx` (toggle `devoluciones_sin_efectivo`)
- Modify: `app/admin/clientes/ClientesClient.tsx` (mostrar saldo a favor) + `app/admin/clientes/page.tsx` (traer `saldo_favor_clientes`)

**Interfaces:**
- Consumes: `esperadoCaja` (firma con `devolucionesPorMetodo`, Task 1); la vista `saldo_favor_clientes`; config `devoluciones_sin_efectivo`.
- Produces: el arqueo refleja las devoluciones; la regla es configurable; el saldo a favor es visible por cliente.

- [ ] **Step 1: `CierreModal` — sección devoluciones**

Agregar una sección **"Devoluciones / reembolsos"** con `devolucionesPorMetodo` (efectivo/transferencia/tarjeta/cheque/otro); aclarar que el **efectivo reembolsado YA está restado** del efectivo esperado. `formatPrice` en todo. Mantener las secciones de crédito otorgado y cobros de P4c.

- [ ] **Step 2: Toggle `devoluciones_sin_efectivo`**

En `PosSection.tsx`, toggle **"No permitir devoluciones en efectivo"** que lee/escribe `devoluciones_sin_efectivo` (`'true'`/`'false'`), mismo patrón que `cxc_bloquear_limite` (incluida la prop en `ConfigClient.tsx` si aplica).

- [ ] **Step 3: Saldo a favor en clientes**

En `app/admin/clientes/page.tsx`, traer `saldo_favor_clientes` y mapear por `cliente_id`; en `ClientesClient.tsx` mostrar el **saldo a favor** del cliente (columna o en el detalle), con `formatPrice`. Solo lectura (el gasto es P5b).

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los tocados sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/pos/components/CierreModal.tsx app/admin/configuracion/PosSection.tsx app/admin/configuracion/ConfigClient.tsx app/admin/clientes/ClientesClient.tsx app/admin/clientes/page.tsx
git commit -m "feat(devoluciones): arqueo con devoluciones, toggle sin efectivo, saldo a favor en clientes"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/pos/devoluciones` y el test de `esperadoCaja` con devoluciones).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados.
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar la migración): configurar CAI '03'; devolver parcialmente una factura (NC fiscal, stock repuesto, kardex `'devolucion'`); devolver un comprobante (correlativo interno); reembolso efectivo (egreso en arqueo) / saldo a favor (balance del cliente sube) / abono CxC (saldo del origen baja); toggle `devoluciones_sin_efectivo` on → efectivo bloqueado; segunda devolución parcial de la misma factura respeta el devolvible; NC imprimible con referencia a la factura original.

## Entrega

- El usuario configura el **CAI '03'** y aplica `supabase/migrations/2026-08-09-pos-p5a-devoluciones.sql`, luego corre `supabase/smoke-pos-p5a.sql` (espera "Success: migracion POS P5a OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P5a desplegado.
