# POS P5b — Gasto del saldo a favor — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gastar el saldo a favor del cliente como método de pago 'saldo_favor' en el POS (descuento atómico en `emitir_documento`) y como abono a CxC (`aplicar_saldo_favor_cxc`), con el balance validado bajo lock y nunca negativo.

**Architecture:** `saldo_favor_movimientos` se abre a movimientos con signo (`venta`/`cobro` negativos). El pago 'saldo_favor' se descuenta dentro de `emitir_documento` (re-creada completa con un bloque nuevo, bajo `for update` del cliente); el abono a CxC es una RPC nueva `aplicar_saldo_favor_cxc` que reusa `cobros`/`cobro_aplicaciones` (P4c) y descuenta el saldo. La lógica de topes es pura y testeada.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC + vista), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español** (UI, dominio, commits). Moneda en **Lempiras** con `formatPrice()`.
- **Ledger con signo**: `saldo_favor_movimientos.monto` pasa a `check (monto <> 0)`; `tipo in ('devolucion','venta','cobro')`. Balance = `Σ monto` (vista `saldo_favor_clientes` sin cambios). **Nunca negativo**: todo gasto se valida contra el balance real bajo `for update` del cliente.
- **`emitir_documento` se re-crea COMPLETA** (copiando su cuerpo vigente de `2026-08-07-pos-p2-rpcs.sql`) agregando SOLO el bloque de descuento del saldo, después de insertar `documento_pagos` y antes de `return v_doc_id`. NO se cambia la lógica fiscal (correlativo, stock, kardex, totales, validación de pagos). NO se toca `emitir_nota_credito` ni `anular_comprobante`.
- **El pago/abono con saldo a favor NO es efectivo**: no da vuelto en el POS; el abono a CxC va con `sesion_id = null` (no toca caja/arqueo). `MetodoPagoTipo` gana `'saldo_favor'` — el arqueo lo trata como no-efectivo.
- **Frontera de confianza**: el balance y los topes se validan en las RPC bajo lock; el navegador no decide montos. Append-only (no update/delete del ledger).
- **Migración idempotente** (`if not exists`, `create or replace`, drop/recreate de checks por lookup), aplicada por el usuario antes del push. Smoke con **`to_regprocedure`**. Estilo P4c/P5a.
- **CSS Modules con tokens Merlin**; botones `btnMerlin*` con clase de módulo. Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado`. Cliente de Supabase de servidor.
- Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

### Task 1: `MetodoPagoTipo` gana 'saldo_favor' + lógica pura `lib/pos/saldo-favor.ts` + fixups

**Files:**
- Modify: `types/index.ts` (`MetodoPagoTipo` + `'saldo_favor'`; tipo `SaldoFavorMovimiento` gana `'venta'|'cobro'` y `cobro_id`)
- Create: `lib/pos/saldo-favor.ts`
- Create: `lib/pos/tests/saldo-favor.test.ts`
- Modify: los archivos que tsc marque por el nuevo `'saldo_favor'` en `Record<MetodoPagoTipo, number>` (al menos `lib/pos/emision.ts` `esperadoCaja.porMetodo`, y mapas de etiquetas de método)

**Interfaces:**
- Produces (puras): `saldoAplicable(saldoDisponible, restante)`, `validarGastoSaldo(saldoDisponible, monto)`.
- Produces (tipos): `MetodoPagoTipo` con `'saldo_favor'`; `SaldoFavorMovimiento.tipo` = `'devolucion'|'venta'|'cobro'`, `+ cobro_id: string | null`.

- [ ] **Step 1: Tipos en `types/index.ts`**

Agregar `'saldo_favor'` a `MetodoPagoTipo` (`... | 'credito' | 'saldo_favor'`). En `SaldoFavorMovimiento` (de P5a), cambiar `tipo: 'devolucion'` por `tipo: 'devolucion' | 'venta' | 'cobro'` y agregar `cobro_id: string | null`.

- [ ] **Step 2: Test de la lógica pura (que falla)**

Crear `lib/pos/tests/saldo-favor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { saldoAplicable, validarGastoSaldo } from '../saldo-favor'

describe('saldoAplicable', () => {
  it('el mínimo entre saldo y restante', () => expect(saldoAplicable(500, 300)).toBe(300))
  it('topea al saldo si el restante es mayor', () => expect(saldoAplicable(120, 300)).toBe(120))
  it('nunca negativo', () => expect(saldoAplicable(0, 300)).toBe(0))
  it('restante 0 → 0', () => expect(saldoAplicable(500, 0)).toBe(0))
})

describe('validarGastoSaldo', () => {
  it('ok si monto ≤ saldo', () => expect(validarGastoSaldo(500, 300)).toBeNull())
  it('error si monto > saldo', () => expect(validarGastoSaldo(200, 300)).toMatch(/saldo/i))
  it('error si monto ≤ 0', () => expect(validarGastoSaldo(500, 0)).toMatch(/mayor a 0|inválido/i))
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run lib/pos/tests/saldo-favor.test.ts --exclude "**/.claude/**"` → FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/pos/saldo-favor.ts`**

```typescript
const round2 = (n: number) => Math.round(n * 100) / 100

export function saldoAplicable(saldoDisponible: number, restante: number): number {
  return Math.max(0, round2(Math.min(saldoDisponible, restante)))
}

export function validarGastoSaldo(saldoDisponible: number, monto: number): string | null {
  if (monto <= 0) return 'El monto debe ser mayor a 0.'
  if (monto > round2(saldoDisponible) + 0.01) return 'El monto excede el saldo a favor disponible.'
  return null
}
```

- [ ] **Step 5: Arreglar la compilación por el nuevo `'saldo_favor'`**

Correr `npx tsc --noEmit`. Donde marque `Record<MetodoPagoTipo, number>` incompleto (al menos `lib/pos/emision.ts` en `esperadoCaja`, el inicializador `porMetodo`), agregar `saldo_favor: 0`. En cualquier `switch`/mapa exhaustivo de etiquetas sobre `MetodoPagoTipo`, agregar el caso `saldo_favor` con etiqueta "Saldo a favor". NO cambiar lógica de arqueo (el `saldo_favor` no es efectivo: NO se suma a `efectivoEsperado`, igual que `credito`).

- [ ] **Step 6: Correr tests + tsc**

Run: `npx vitest run lib/pos --exclude "**/.claude/**"` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 7: Commit**

```bash
git add types/index.ts lib/pos/saldo-favor.ts lib/pos/tests/saldo-favor.test.ts lib/pos/emision.ts
git commit -m "feat(saldo-favor): tipos, logica pura de topes y saldo_favor en MetodoPagoTipo"
```

---

### Task 2: Migración P5b (ledger con signo, método, `emitir_documento`, RPC CxC) + smoke

**Files:**
- Create: `supabase/migrations/2026-08-09-pos-p5b-gasto-saldo-favor.sql`
- Create: `supabase/smoke-pos-p5b.sql`

**Interfaces:**
- Produces: `saldo_favor_movimientos` con `monto <> 0` + tipos `venta`/`cobro` + columna `cobro_id`; `metodos_pago` tipo `saldo_favor` + seed; `cobros.metodo` acepta `saldo_favor`; `emitir_documento` re-creada con descuento de saldo; RPC `aplicar_saldo_favor_cxc(jsonb) → uuid`.
- Consumes (ya existen): `saldo_favor_movimientos`/`saldo_favor_clientes` (P5a), `clientes`, `documentos`, `documento_pagos`, `metodos_pago`, `cobros`/`cobro_aplicaciones` (P4c), `nota_credito_reembolsos` (P5a), `cobro_numero_seq`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-09-pos-p5b-gasto-saldo-favor.sql`:

```sql
-- POS P5b: gasto del saldo a favor.

-- 1. Ledger con signo: abrir monto a negativos y agregar tipos venta/cobro.
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid='saldo_favor_movimientos'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%monto%';
  if v_con is not null then execute format('alter table saldo_favor_movimientos drop constraint %I', v_con); end if;
  alter table saldo_favor_movimientos add constraint saldo_favor_movimientos_monto_chk check (monto <> 0);

  select conname into v_con from pg_constraint
   where conrelid='saldo_favor_movimientos'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table saldo_favor_movimientos drop constraint %I', v_con); end if;
  alter table saldo_favor_movimientos add constraint saldo_favor_movimientos_tipo_chk
    check (tipo in ('devolucion','venta','cobro'));
end $$;

alter table saldo_favor_movimientos add column if not exists cobro_id uuid references cobros(id) on delete set null;

-- 2. Metodo de pago 'saldo_favor'.
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint where conrelid='metodos_pago'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table metodos_pago drop constraint %I', v_con); end if;
  alter table metodos_pago add constraint metodos_pago_tipo_chk
    check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro','credito','saldo_favor'));
end $$;
insert into metodos_pago (nombre, tipo, activo, orden)
select 'Saldo a favor', 'saldo_favor', true, 95
where not exists (select 1 from metodos_pago where tipo = 'saldo_favor');

-- 3. cobros.metodo acepta 'saldo_favor' (abono a CxC desde el saldo).
do $$ declare v_con text;
begin
  select conname into v_con from pg_constraint where conrelid='cobros'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%metodo%';
  if v_con is not null then execute format('alter table cobros drop constraint %I', v_con); end if;
  alter table cobros add constraint cobros_metodo_chk
    check (metodo in ('efectivo','transferencia','tarjeta','cheque','otro','saldo_favor'));
end $$;

-- 4. aplicar_saldo_favor_cxc: abona saldo a favor a la deuda, atomico.
create or replace function aplicar_saldo_favor_cxc(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_cli uuid := (p->>'cliente_id')::uuid;
  v_usuario text := p->>'usuario'; v_notas text := p->>'notas';
  r record; v_cli_doc uuid; v_estado text; v_credito numeric; v_cobrado numeric; v_nc_cxc numeric; v_saldo numeric;
  v_suma numeric := 0; v_balance numeric; v_cobro_id uuid; v_numero text;
begin
  if v_cli is null then raise exception 'Falta el cliente'; end if;
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then raise exception 'No hay aplicaciones'; end if;
  perform 1 from clientes where id = v_cli for update;  -- serializa gastos del saldo del cliente

  for r in
    select (e->>'documento_id')::uuid as documento_id, sum((e->>'monto')::numeric) as monto
    from jsonb_array_elements(p->'aplicaciones') e
    group by (e->>'documento_id')::uuid order by (e->>'documento_id')::uuid
  loop
    if r.monto is null or r.monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;
    select cliente_id, estado into v_cli_doc, v_estado from documentos where id = r.documento_id for update;
    if not found then raise exception 'Documento no encontrado'; end if;
    if v_cli_doc <> v_cli then raise exception 'El documento no pertenece al cliente'; end if;
    if v_estado = 'anulado' then raise exception 'El documento esta anulado'; end if;
    select coalesce(sum(dp.monto) filter (where m.tipo = 'credito'),0) into v_credito
      from documento_pagos dp join metodos_pago m on m.id = dp.metodo_id where dp.documento_id = r.documento_id;
    if v_credito <= 0 then raise exception 'El documento no tiene credito por cobrar'; end if;
    select coalesce(sum(monto),0) into v_cobrado from cobro_aplicaciones where documento_id = r.documento_id;
    select coalesce(sum(ncr.monto),0) into v_nc_cxc
      from documentos doc join nota_credito_reembolsos ncr on ncr.documento_id = doc.id
      where doc.documento_origen_id = r.documento_id and doc.estado <> 'anulado' and ncr.tipo = 'cxc';
    v_saldo := v_credito - v_cobrado - v_nc_cxc;
    if r.monto > v_saldo then raise exception 'El cobro excede el saldo del documento'; end if;
    v_suma := v_suma + r.monto;
  end loop;

  select coalesce(sum(monto),0) into v_balance from saldo_favor_movimientos where cliente_id = v_cli;
  if v_suma > v_balance + 0.01 then raise exception using message = 'HS_SALDO|insuficiente'; end if;

  v_numero := 'COBRO-' || lpad(nextval('cobro_numero_seq')::text, 8, '0');
  insert into cobros (numero, cliente_id, fecha, monto, metodo, referencia, notas, sesion_id, usuario)
  values (v_numero, v_cli, current_date, v_suma, 'saldo_favor', null, v_notas, null, v_usuario)
  returning id into v_cobro_id;

  insert into cobro_aplicaciones (cobro_id, documento_id, monto)
  select v_cobro_id, (e->>'documento_id')::uuid, sum((e->>'monto')::numeric)
  from jsonb_array_elements(p->'aplicaciones') e group by (e->>'documento_id')::uuid;

  insert into saldo_favor_movimientos (cliente_id, monto, tipo, cobro_id, usuario)
  values (v_cli, -v_suma, 'cobro', v_cobro_id, v_usuario);

  return v_cobro_id;
end; $$;
revoke all on function aplicar_saldo_favor_cxc(jsonb) from public, anon;
grant execute on function aplicar_saldo_favor_cxc(jsonb) to authenticated;

-- 5. emitir_documento: re-crear COMPLETA con el descuento del saldo a favor.
-- Nota para el implementador: copiar el cuerpo VIGENTE de emitir_documento de
-- supabase/migrations/2026-08-07-pos-p2-rpcs.sql y agregar (a) en el bloque
-- declare del tope, tres variables: v_saldo_favor numeric; v_balance_sf numeric;
-- v_cli_sf uuid; y (b) justo ANTES de `return v_doc_id;`, este bloque:
--
--   -- [P5b] Descuento del saldo a favor pagado en esta venta.
--   v_cli_sf := nullif(p->>'cliente_id','')::uuid;
--   select coalesce(sum((pg->>'monto')::numeric),0) into v_saldo_favor
--     from jsonb_array_elements(coalesce(p->'pagos','[]'::jsonb)) pg
--     join metodos_pago m on m.id = (pg->>'metodo_id')::uuid
--     where m.tipo = 'saldo_favor';
--   if v_saldo_favor > 0 then
--     if v_cli_sf is null then raise exception using message = 'HS_SALDO|requiere cliente'; end if;
--     perform 1 from clientes where id = v_cli_sf for update;
--     select coalesce(sum(monto),0) into v_balance_sf from saldo_favor_movimientos where cliente_id = v_cli_sf;
--     if v_saldo_favor > v_balance_sf + 0.01 then raise exception using message = 'HS_SALDO|insuficiente'; end if;
--     insert into saldo_favor_movimientos (cliente_id, monto, tipo, documento_id, usuario)
--     values (v_cli_sf, -v_saldo_favor, 'venta', v_doc_id, nullif(p->>'usuario',''));
--   end if;
--
-- NO cambiar nada más del cuerpo (correlativo, stock, kardex, documento_pagos,
-- validación de pagos, grants). Mantener grant/revoke a authenticated.
```

**Importante (paso 5):** re-creá `emitir_documento(jsonb)` COMPLETA copiando su cuerpo vigente de `supabase/migrations/2026-08-07-pos-p2-rpcs.sql`, agregando las 3 variables al `declare` y el bloque de descuento antes de `return v_doc_id`. No pierdas nada del cuerpo. El pago `saldo_favor` ya cuenta para cubrir el total (la validación `v_suma_pagos < v_total` existente lo suma como cualquier `documento_pagos`).

- [ ] **Step 2: Escribir el smoke**

Crear `supabase/smoke-pos-p5b.sql` (usa `to_regprocedure`, no crea/borra datos):

```sql
do $$
begin
  if to_regprocedure('public.aplicar_saldo_favor_cxc(jsonb)') is null then raise exception 'FALLO: falta aplicar_saldo_favor_cxc'; end if;
  if not exists (select 1 from information_schema.columns where table_name='saldo_favor_movimientos' and column_name='cobro_id') then raise exception 'FALLO: falta saldo_favor_movimientos.cobro_id'; end if;
  if not exists (select 1 from metodos_pago where tipo = 'saldo_favor') then raise exception 'FALLO: falta el metodo Saldo a favor'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='saldo_favor_movimientos'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%venta%' and pg_get_constraintdef(oid) like '%cobro%'
  ) then raise exception 'FALLO: el tipo del ledger no incluye venta/cobro'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='cobros'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%saldo_favor%'
  ) then raise exception 'FALLO: cobros.metodo no acepta saldo_favor'; end if;
  raise notice 'Smoke POS P5b: estructura OK';
end $$;
select 'Success: migracion POS P5b OK' as resultado,
       (select count(*) from saldo_favor_movimientos where tipo <> 'devolucion') as gastos;
```

- [ ] **Step 3: Revisar consistencia**

Verificar: el ledger admite `monto <> 0` y tipos venta/cobro; `emitir_documento` re-creada conserva TODO su cuerpo vigente + el bloque de saldo (bloquea el cliente con `for update`, valida balance, inserta movimiento `'venta'` negativo); `aplicar_saldo_favor_cxc` bloquea el cliente, valida balance y saldo por documento (con `nc_cxc`), inserta cobro `metodo='saldo_favor'` + `cobro_aplicaciones` + movimiento `'cobro'` negativo, `sesion_id=null`; `metodos_pago`/`cobros` con los checks recreados. El reviewer valida (no hay BD local).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-09-pos-p5b-gasto-saldo-favor.sql supabase/smoke-pos-p5b.sql
git commit -m "feat(saldo-favor): migracion P5b (ledger con signo, emitir_documento, RPC CxC)"
```

---

### Task 3: Server Actions del gasto del saldo a favor

**Files:**
- Modify: `app/admin/pos/actions.ts` (`emitirVenta`: cliente requerido si hay pago saldo_favor)
- Create: `app/admin/cuentas-por-cobrar/saldo-favor-actions.ts` (o extender `app/admin/cuentas-por-cobrar/actions.ts`): `aplicarSaldoFavorCxc`, `obtenerSaldoFavorCliente`, `obtenerHistorialSaldoFavor`

**Interfaces:**
- Consumes: `validarGastoSaldo` de `@/lib/pos/saldo-favor`; RPC `aplicar_saldo_favor_cxc`; tipos `SaldoFavorMovimiento`; el patrón de `registrarCobro` de `app/admin/cuentas-por-cobrar/actions.ts`.
- Produces:
  - `obtenerSaldoFavorCliente(clienteId: string): Promise<number>` (balance de `saldo_favor_clientes`; 0 si no hay fila).
  - `aplicarSaldoFavorCxc(input: { clienteId: string; aplicaciones: { documentoId: string; monto: number }[]; notas?: string }): Promise<CxcResult<{ id: string }>>`.
  - `obtenerHistorialSaldoFavor(clienteId: string): Promise<CxcResult<SaldoFavorMovimiento[]>>`.

- [ ] **Step 1: `emitirVenta` — cliente requerido con saldo_favor**

En `app/admin/pos/actions.ts`, en `emitirVenta`: tras releer los pagos, si hay algún pago cuyo método es tipo `'saldo_favor'` (releé `metodos_pago.tipo` por `metodo_id`, frontera de confianza), exigir `cliente.id` no null → si no, error `Un pago con saldo a favor requiere un cliente registrado.` El descuento del balance lo hace la RPC `emitir_documento` bajo lock; la Server Action solo valida el cliente y arma el payload (NO descuenta ni valida el balance en JS). El resto de `emitirVenta` no cambia.

- [ ] **Step 2: Acciones de CxC**

Espejá `registrarCobro`/`obtenerEstadoCuentaCliente` de `app/admin/cuentas-por-cobrar/actions.ts`:
- `obtenerSaldoFavorCliente(clienteId)`: `select saldo from saldo_favor_clientes where cliente_id = clienteId` (0 si no hay).
- `aplicarSaldoFavorCxc(input)`: valida `input.aplicaciones` no vacío; llama `supabase.rpc('aplicar_saldo_favor_cxc', { p: { cliente_id, aplicaciones:[{documento_id, monto}], usuario, notas } })`. `traducirError` cubre `HS_SALDO|insuficiente` ("El cliente no tiene saldo a favor suficiente.") + los mensajes de `registrar_cobro` reusados (`no pertenece al cliente`, `esta anulado`, `excede el saldo`, etc.). `revalidatePath`.
- `obtenerHistorialSaldoFavor(clienteId)`: `select * from saldo_favor_movimientos where cliente_id = clienteId order by created_at desc`.

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npx eslint` de los archivos tocados sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/pos/actions.ts app/admin/cuentas-por-cobrar/
git commit -m "feat(saldo-favor): server actions (emitirVenta con saldo, aplicar a CxC, historial)"
```

---

### Task 4: Chip 'Saldo a favor' en el CobroModal del POS

**Files:**
- Modify: `app/admin/pos/components/CobroModal.tsx`
- Modify: `app/admin/pos/PosClient.tsx` (o donde se cargue el saldo del cliente) si hace falta pasar el saldo disponible

**Interfaces:**
- Consumes: `saldoAplicable` de `@/lib/pos/saldo-favor`; `obtenerSaldoFavorCliente` de `@/app/admin/cuentas-por-cobrar/actions` (o de donde quede en Task 3); el método `saldo_favor` de `metodos_pago` (ya seedeado). `MetodoPagoTipo` ya tiene `saldo_favor`.
- Produces: el pago con saldo a favor funcional en el POS.

- [ ] **Step 1: `CobroModal` — chip de saldo a favor**

Leé `CobroModal.tsx` completo. El método "Saldo a favor" llega en la lista de `metodos` (tipo `saldo_favor`). Cambios:
- Cuando hay un **cliente registrado** seleccionado (no CONSUMIDOR FINAL), cargar su **saldo disponible** (`obtenerSaldoFavorCliente(clienteActual.id)`, en un efecto al abrir/cambiar cliente) y mostrarlo junto al chip: "Saldo a favor (disp. L. X)".
- El chip "Saldo a favor" agrega un pago del método `saldo_favor` por **`saldoAplicable(saldoDisponible, restante)`** (topeado; sin vuelto). Si no hay cliente registrado o el saldo es 0, el chip se deshabilita con un aviso ("Elegí un cliente con saldo a favor").
- Un pago de tipo `saldo_favor` cuenta para cubrir el total (ya lo hace `sumaPagos`). No permitir que el pago de saldo_favor exceda `min(saldo, restante)` (validación en vivo con `validarGastoSaldo`).
- El resto del flujo de emisión no cambia (el descuento lo hace la RPC).

- [ ] **Step 2: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los tocados sin errores. (Migración no aplicada — NO levantar el dev server.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/pos/components/CobroModal.tsx app/admin/pos/PosClient.tsx
git commit -m "feat(saldo-favor): pago con saldo a favor en el POS"
```

---

### Task 5: Aplicar saldo a favor a CxC + historial en el estado de cuenta

**Files:**
- Create: `app/admin/cuentas-por-cobrar/SaldoFavorModal.tsx`
- Modify: `app/admin/cuentas-por-cobrar/CuentasPorCobrarClient.tsx` (botón "Aplicar saldo a favor")
- Modify: `app/admin/cuentas-por-cobrar/cliente/[id]/EstadoCuentaClienteView.tsx` (botón + historial de saldo a favor) + `page.tsx` (traer saldo + historial)

**Interfaces:**
- Consumes: `aplicarSaldoFavorCxc`, `obtenerSaldoFavorCliente`, `obtenerHistorialSaldoFavor` de Task 3; `distribuirPago` de `@/lib/cxp/cxp`; `saldoAplicable`; `formatPrice`; `parseMoneyInput`/`valorMostrado`; Modal compartido; tipos `CxcFila`, `SaldoFavorMovimiento`.
- Produces: el abono a CxC desde el saldo + la trazabilidad.

- [ ] **Step 1: `SaldoFavorModal`**

Mini-modal (patrón `CobroModal` de CxC / `PagoModal`): muestra el **saldo disponible** del cliente y su **deuda pendiente**; el monto a aplicar topeado a **`min(saldo disponible, deuda pendiente)`** (`type="text" inputMode="decimal"` + `parseMoneyInput`). Distribuye por vencimiento (más-antigua-primero) con `distribuirPago`, o manual por documento. Arma `aplicaciones:[{documentoId, monto}]` y llama `aplicarSaldoFavorCxc`; al `ok`, `router.refresh()`. Rechaza montos negativos y > saldo.

- [ ] **Step 2: Botón en el tablero de CxC + estado de cuenta**

En `CuentasPorCobrarClient.tsx`: por cliente con `saldo a favor > 0` y deuda, un botón **"Aplicar saldo a favor"** que abre el `SaldoFavorModal`. En `EstadoCuentaClienteView.tsx`: el mismo botón + una sección **"Movimientos de saldo a favor"** (historial de `obtenerHistorialSaldoFavor`: acreditaciones por devolución +, gastos por venta/cobro −, con fecha y referencia). `page.tsx` trae el saldo y el historial.

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos/tocados sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/cuentas-por-cobrar/
git commit -m "feat(saldo-favor): aplicar saldo a favor a CxC + historial en estado de cuenta"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/pos/saldo-favor`).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados.
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar la migración): pagar una venta con "Saldo a favor" (mixto con efectivo; sin vuelto; el balance baja; movimiento `'venta'`); intentar gastar más que el saldo → bloqueado; aplicar saldo a favor a una deuda de CxC (la deuda baja, el balance baja, movimiento `'cobro'`, no toca caja); el saldo en `/admin/clientes` refleja los gastos; historial de movimientos por cliente; el arqueo no cuenta el saldo a favor como efectivo.

## Entrega

- El usuario aplica `supabase/migrations/2026-08-09-pos-p5b-gasto-saldo-favor.sql` y corre `supabase/smoke-pos-p5b.sql` (espera "Success: migracion POS P5b OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P5b desplegado (P5 completo).
