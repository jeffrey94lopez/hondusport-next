# POS P4c — Cuentas por Cobrar — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vender al crédito desde el POS (método "Crédito") y controlar las deudas por cobrar: cobros, saldos, límite de crédito, antigüedad, estado de cuenta, y crédito/cobros en el arqueo.

**Architecture:** El documento fiscal es la cuenta por cobrar: su monto a cobrar = Σ `documento_pagos` con método tipo `credito`. Los cobros (`cobros` + `cobro_aplicaciones`) lo reducen; los saldos y el vencimiento se calculan con la vista `documento_saldos` (join a `clientes` por `dias_credito`), sin tocar la RPC fiscal `emitir_documento`. La RPC `registrar_cobro` es atómica. Se reutiliza `lib/cxp` para antigüedad/estado/distribución.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC + vista), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español** (UI, dominio, commits). Moneda en **Lempiras** con `formatPrice()`.
- **NO se toca la RPC fiscal `emitir_documento` ni la tabla `documentos`.** El crédito es solo otro `metodo_id` (método tipo `credito`) que fluye por la emisión existente. El vencimiento se calcula en la vista `documento_saldos` como `created_at::date + cliente.dias_credito`.
- **Saldos calculados con la vista `documento_saldos`** (`credito_total − Σ cobro_aplicaciones`), sin cache.
- **`MetodoPagoTipo` gana `'credito'`** en `types/index.ts` — esto rompe la compilación en los inicializadores `Record<MetodoPagoTipo, number>` (p.ej. `esperadoCaja.porMetodo`); hay que agregar `credito: 0` donde tsc lo marque.
- **Frontera de confianza:** `registrar_cobro` agrupa aplicaciones por documento y valida cada documento ≤ saldo real con `for update` (lección de P4b). El check de límite en `emitirVenta` relee el saldo del cliente de la vista.
- **Arqueo aditivo:** el crédito otorgado NO suma al efectivo esperado (no es efectivo); los cobros en efectivo de la sesión SÍ suman; ambos se muestran por método. No alterar el cálculo fiscal existente.
- **Reutilizar `lib/cxp`** (`bucketAntiguedad`, `estadoPago`, `distribuirPago`) para CxC. Nueva pura `excedeLimite` con test.
- **Guards:** un documento con cobros no se anula (`anularDocumento`); un cobro de una sesión de caja **cerrada** no se elimina.
- **Migración idempotente** (`if not exists`, `create or replace`), aplicada por el usuario antes del push. Smoke con **`to_regprocedure`**. Estilo `supabase/migrations/2026-08-08-pos-p4b-cuentas-por-pagar.sql`.
- **CSS Modules con tokens Merlin**; botones `btnMerlin*` con clase de módulo. Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado`. Hoja imprimible = HTML + CSS impresión (`.btnToolbar`, `@media print`).
- Cliente de Supabase de servidor. Tipo `type CxcResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.
- Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`. Server Actions/Components sin tests de unidad; visual deferido a checkpoint tras aplicar la migración.

---

### Task 1: Migración P4c (tablas, vista, tipo credito, límite, RPC, RLS) + smoke

**Files:**
- Create: `supabase/migrations/2026-08-09-pos-p4c-cuentas-por-cobrar.sql`
- Create: `supabase/smoke-pos-p4c.sql`

**Interfaces:**
- Produces: tablas `cobros`, `cobro_aplicaciones`; vista `documento_saldos`; funciones `nextval_cobro() → bigint`, `registrar_cobro(p jsonb) → uuid`, `eliminar_cobro(p_cobro_id uuid) → void`; columna `clientes.limite_credito`; `metodos_pago.tipo` acepta `'credito'` + seed; config `cxc_bloquear_limite`.
- Consumes (ya existen): `documentos` (columnas `estado in ('emitido','anulado')`, `created_at`, `cliente_id`, `sesion_id`, `total`), `documento_pagos` (`documento_id`, `metodo_id`, `monto`), `metodos_pago` (`tipo`, `activo`, `orden`), `clientes` (`dias_credito`), `sesiones_caja`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-09-pos-p4c-cuentas-por-cobrar.sql`:

```sql
-- POS P4c: cuentas por cobrar. El documento fiscal es la cuenta por cobrar.

-- Metodo de pago 'credito' (el check de metodos_pago.tipo es sin nombre; se recrea
-- con drop/add via ALTER, idempotente por nombre de constraint conocido, o se agrega
-- una constraint nueva). Estrategia idempotente: dropear la constraint por su nombre
-- generado si existe y recrearla incluyendo 'credito'.
do $$
declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid = 'metodos_pago'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table metodos_pago drop constraint %I', v_con); end if;
  alter table metodos_pago add constraint metodos_pago_tipo_chk
    check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro','credito'));
end $$;

insert into metodos_pago (nombre, tipo, activo, orden)
select 'Crédito', 'credito', true, 90
where not exists (select 1 from metodos_pago where tipo = 'credito');

alter table clientes add column if not exists limite_credito numeric(12,2);

insert into configuracion (key, value) values ('cxc_bloquear_limite', 'false')
on conflict (key) do nothing;

create sequence if not exists cobro_numero_seq;
create or replace function nextval_cobro()
returns bigint language sql security definer set search_path = public as $$
  select nextval('cobro_numero_seq');
$$;
revoke all on function nextval_cobro() from public, anon;
grant execute on function nextval_cobro() to authenticated;

create table if not exists cobros (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  cliente_id   uuid not null references clientes(id) on delete restrict,
  fecha        date not null default current_date,
  monto        numeric(12,2) not null check (monto > 0),
  metodo       text not null check (metodo in ('efectivo','transferencia','tarjeta','cheque','otro')),
  referencia   text,
  notas        text,
  sesion_id    uuid references sesiones_caja(id) on delete set null,
  usuario      text,
  created_at   timestamptz default now()
);
create index if not exists cobros_cliente_idx on cobros (cliente_id);
create index if not exists cobros_sesion_idx on cobros (sesion_id);

create table if not exists cobro_aplicaciones (
  id          uuid primary key default gen_random_uuid(),
  cobro_id    uuid not null references cobros(id) on delete cascade,
  documento_id uuid not null references documentos(id) on delete restrict,
  monto       numeric(12,2) not null check (monto > 0)
);
create index if not exists cobro_aplicaciones_doc_idx on cobro_aplicaciones (documento_id);
create index if not exists cobro_aplicaciones_cobro_idx on cobro_aplicaciones (cobro_id);

-- Saldos calculados. Vencimiento = created_at + cliente.dias_credito (no se persiste).
create or replace view documento_saldos as
select
  d.id                                              as documento_id,
  d.cliente_id,
  cl.nombre                                         as cliente_nombre,
  d.tipo, d.correlativo, d.numero_comprobante,
  d.created_at::date                                as fecha,
  (d.created_at::date + (coalesce(cl.dias_credito, 0) || ' days')::interval)::date as fecha_vencimiento,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0)                     as credito_total,
  coalesce(max(ca.cobrado), 0)                                                     as cobrado,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) - coalesce(max(ca.cobrado), 0) as saldo
from documentos d
join clientes cl on cl.id = d.cliente_id
join documento_pagos dp on dp.documento_id = d.id
join metodos_pago m on m.id = dp.metodo_id
left join (select documento_id, sum(monto) as cobrado from cobro_aplicaciones group by documento_id) ca
  on ca.documento_id = d.id
where d.estado <> 'anulado'
group by d.id, cl.nombre, cl.dias_credito, ca.cobrado
having coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) > 0;
grant select on documento_saldos to authenticated;

-- Registrar cobro atomico (agrupa aplicaciones por documento antes de validar).
create or replace function registrar_cobro(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_cli uuid := (p->>'cliente_id')::uuid;
  v_fecha date := coalesce((p->>'fecha')::date, current_date);
  v_metodo text := p->>'metodo';
  v_ref text := p->>'referencia';
  v_notas text := p->>'notas';
  v_sesion uuid := nullif(p->>'sesion_id','')::uuid;
  v_usuario text := p->>'usuario';
  r record;
  v_cli_doc uuid; v_estado text; v_credito numeric; v_cobrado numeric; v_saldo numeric;
  v_suma numeric := 0; v_cobro_id uuid; v_numero text;
begin
  if v_cli is null then raise exception 'Falta el cliente'; end if;
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then
    raise exception 'El cobro no tiene aplicaciones';
  end if;

  for r in
    select (e->>'documento_id')::uuid as documento_id, sum((e->>'monto')::numeric) as monto
    from jsonb_array_elements(p->'aplicaciones') e
    group by (e->>'documento_id')::uuid
    order by (e->>'documento_id')::uuid
  loop
    if r.monto is null or r.monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;
    select cliente_id, estado into v_cli_doc, v_estado from documentos where id = r.documento_id for update;
    if not found then raise exception 'Documento no encontrado'; end if;
    if v_cli_doc <> v_cli then raise exception 'El documento no pertenece al cliente'; end if;
    if v_estado = 'anulado' then raise exception 'El documento esta anulado'; end if;

    select coalesce(sum(dp.monto) filter (where m.tipo = 'credito'),0)
      into v_credito
      from documento_pagos dp join metodos_pago m on m.id = dp.metodo_id
      where dp.documento_id = r.documento_id;
    if v_credito <= 0 then raise exception 'El documento no tiene credito por cobrar'; end if;
    select coalesce(sum(monto),0) into v_cobrado from cobro_aplicaciones where documento_id = r.documento_id;
    v_saldo := v_credito - v_cobrado;
    if r.monto > v_saldo then raise exception 'El cobro excede el saldo del documento'; end if;
    v_suma := v_suma + r.monto;
  end loop;

  v_numero := 'COBRO-' || lpad(nextval('cobro_numero_seq')::text, 8, '0');
  insert into cobros (numero, cliente_id, fecha, monto, metodo, referencia, notas, sesion_id, usuario)
  values (v_numero, v_cli, v_fecha, v_suma, v_metodo, v_ref, v_notas, v_sesion, v_usuario)
  returning id into v_cobro_id;

  insert into cobro_aplicaciones (cobro_id, documento_id, monto)
  select v_cobro_id, (e->>'documento_id')::uuid, sum((e->>'monto')::numeric)
  from jsonb_array_elements(p->'aplicaciones') e
  group by (e->>'documento_id')::uuid;

  return v_cobro_id;
end; $$;
revoke all on function registrar_cobro(jsonb) from public, anon;
grant execute on function registrar_cobro(jsonb) to authenticated;

create or replace function eliminar_cobro(p_cobro_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from cobros where id = p_cobro_id;
end; $$;
revoke all on function eliminar_cobro(uuid) from public, anon;
grant execute on function eliminar_cobro(uuid) to authenticated;

alter table cobros enable row level security;
alter table cobro_aplicaciones enable row level security;
do $$ begin
  create policy cobros_admin on cobros for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy cobro_aplicaciones_admin on cobro_aplicaciones for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Escribir el smoke SQL**

Crear `supabase/smoke-pos-p4c.sql` (usa `to_regprocedure`, no crea/borra datos):

```sql
-- Smoke POS P4c — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if to_regclass('public.cobros') is null then raise exception 'FALLO: falta cobros'; end if;
  if to_regclass('public.cobro_aplicaciones') is null then raise exception 'FALLO: falta cobro_aplicaciones'; end if;
  if to_regclass('public.documento_saldos') is null then raise exception 'FALLO: falta la vista documento_saldos'; end if;
  if to_regclass('public.cobro_numero_seq') is null then raise exception 'FALLO: falta cobro_numero_seq'; end if;
  if to_regprocedure('public.registrar_cobro(jsonb)') is null then raise exception 'FALLO: falta registrar_cobro'; end if;
  if to_regprocedure('public.eliminar_cobro(uuid)') is null then raise exception 'FALLO: falta eliminar_cobro'; end if;
  if to_regprocedure('public.nextval_cobro()') is null then raise exception 'FALLO: falta nextval_cobro'; end if;
  if not exists (select 1 from metodos_pago where tipo = 'credito') then raise exception 'FALLO: falta el metodo Credito'; end if;
  if not exists (select 1 from information_schema.columns where table_name='clientes' and column_name='limite_credito') then raise exception 'FALLO: falta clientes.limite_credito'; end if;
  raise notice 'Smoke POS P4c: estructura OK';
end $$;
select 'Success: migracion POS P4c OK' as resultado,
       (select count(*) from cobros) as cobros;
```

- [ ] **Step 3: Revisar consistencia**

Verificar: la recreación del check de `metodos_pago.tipo` no pierde tipos existentes; la vista usa `d.created_at`/`d.estado` (columnas reales); `registrar_cobro` agrupa por documento y valida contra el saldo real con `for update`; `cobros.sesion_id` es `on delete set null`; `cobro_aplicaciones.documento_id` es `on delete restrict`. El reviewer valida (no hay BD local).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-09-pos-p4c-cuentas-por-cobrar.sql supabase/smoke-pos-p4c.sql
git commit -m "feat(cxc): migracion P4c (cobros, vista de saldos, metodo credito, RPC)"
```

---

### Task 2: Tipos + `excedeLimite` en `lib/cxp` con tests + fixes de compilación

**Files:**
- Modify: `types/index.ts` (agregar tipos + `'credito'` a `MetodoPagoTipo`)
- Modify: `lib/cxp/cxp.ts` (agregar `excedeLimite`)
- Modify: `lib/cxp/tests/cxp.test.ts` (tests de `excedeLimite`)
- Modify: los archivos que tsc marque por el nuevo `'credito'` en `Record<MetodoPagoTipo, number>` (al menos `lib/pos/emision.ts` `esperadoCaja`)

**Interfaces:**
- Produces (tipos): `CobroMetodo`, `Cobro`, `CobroAplicacion`, `DocumentoSaldo`, `CxcFila`; `MetodoPagoTipo` gana `'credito'`.
- Produces (pura): `excedeLimite(saldoActual: number, creditoNuevo: number, limite: number | null): { excede: boolean; excedente: number }`.

- [ ] **Step 1: Tipos + enum**

En `types/index.ts`: agregar `'credito'` a `MetodoPagoTipo` (`export type MetodoPagoTipo = 'efectivo_lps' | 'efectivo_usd' | 'tarjeta' | 'transferencia' | 'otro' | 'credito'`). Al final del archivo, agregar:

```typescript
export type CobroMetodo = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro'

export interface Cobro {
  id: string
  numero: string
  cliente_id: string
  fecha: string
  monto: number
  metodo: CobroMetodo
  referencia: string | null
  notas: string | null
  sesion_id: string | null
  usuario: string | null
  created_at: string
}

export interface CobroAplicacion {
  id: string
  cobro_id: string
  documento_id: string
  monto: number
}

// Fila de la vista documento_saldos
export interface DocumentoSaldo {
  documento_id: string
  cliente_id: string
  cliente_nombre: string
  tipo: 'factura' | 'comprobante'
  correlativo: string | null
  numero_comprobante: number | null
  fecha: string
  fecha_vencimiento: string
  credito_total: number
  cobrado: number
  saldo: number
}

// Fila del tablero de CxC (saldo + derivados)
export interface CxcFila extends DocumentoSaldo {
  estado: EstadoPago
  bucket: BucketAntiguedad
  dias_vencido: number
}
```

(`EstadoPago` y `BucketAntiguedad` ya existen de P4b.)

- [ ] **Step 2: Test de `excedeLimite` (que falla)**

Agregar a `lib/cxp/tests/cxp.test.ts`:

```typescript
import { saldoCompra, estadoPago, bucketAntiguedad, distribuirPago, excedeLimite } from '../cxp'

describe('excedeLimite', () => {
  it('sin límite (null) nunca excede', () => {
    expect(excedeLimite(5000, 2000, null)).toEqual({ excede: false, excedente: 0 })
  })
  it('no excede si saldo + nuevo <= límite', () => {
    expect(excedeLimite(3000, 2000, 5000)).toEqual({ excede: false, excedente: 0 })
  })
  it('excede y reporta el excedente', () => {
    expect(excedeLimite(4000, 2000, 5000)).toEqual({ excede: true, excedente: 1000 })
  })
})
```

(Actualizá el import existente de `../cxp` para incluir `excedeLimite`.)

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run lib/cxp --exclude "**/.claude/**"` → FAIL (`excedeLimite` no existe).

- [ ] **Step 4: Implementar `excedeLimite`**

Agregar a `lib/cxp/cxp.ts`:

```typescript
export function excedeLimite(
  saldoActual: number,
  creditoNuevo: number,
  limite: number | null,
): { excede: boolean; excedente: number } {
  if (limite == null) return { excede: false, excedente: 0 }
  const total = round2(saldoActual + creditoNuevo)
  const excedente = round2(Math.max(0, total - limite))
  return { excede: excedente > 0, excedente }
}
```

- [ ] **Step 5: Arreglar la compilación por el nuevo `'credito'`**

Correr `npx tsc --noEmit`. Donde marque `Record<MetodoPagoTipo, number>` incompleto (al menos `lib/pos/emision.ts` en `esperadoCaja`, el inicializador `porMetodo`), agregar `credito: 0`. Buscar también cualquier `switch`/mapa exhaustivo sobre `MetodoPagoTipo` (p.ej. etiquetas de método en el POS/documento) y agregar el caso `credito` con una etiqueta razonable ("Crédito"). NO cambiar lógica de arqueo aquí (eso es Task 5) — solo hacer que compile con una etiqueta y `0` en los records.

- [ ] **Step 6: Correr tests + tsc**

Run: `npx vitest run lib/cxp --exclude "**/.claude/**"` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 7: Commit**

```bash
git add types/index.ts lib/cxp/ lib/pos/emision.ts
git commit -m "feat(cxc): tipos, excedeLimite, y credito en MetodoPagoTipo"
```

---

### Task 3: Server Actions de CxC + guard de anulación

**Files:**
- Create: `app/admin/cuentas-por-cobrar/actions.ts`
- Modify: `app/admin/pos/actions.ts` (guard en `anularDocumento`)

**Interfaces:**
- Consumes: `distribuirPago`, `estadoPago`, `bucketAntiguedad` de `@/lib/cxp/cxp`; `hoyHonduras` de `@/lib/cotizaciones/cotizaciones`; tipos `DocumentoSaldo`, `CxcFila`, `Cobro`, `CobroAplicacion`, `CobroMetodo`. Patrón: `app/admin/cuentas-por-pagar/actions.ts` (CxP — es el espejo casi exacto).
- Produces:
  - `type CxcResult<T = undefined> = ...`
  - `obtenerCxc(): Promise<CxcResult<CxcFila[]>>`
  - `registrarCobro(input: RegistrarCobroInput): Promise<CxcResult<{ id: string }>>`
  - `eliminarCobro(cobroId: string): Promise<CxcResult>`
  - `obtenerEstadoCuentaCliente(clienteId: string): Promise<CxcResult<{ documentos: CxcFila[]; cobros: (Cobro & { aplicaciones: CobroAplicacion[] })[]; totalAdeudado: number }>>`
  - `obtenerCobros(): Promise<CxcResult<(Cobro & { cliente_nombre: string; aplicaciones: CobroAplicacion[] })[]>>`
  - `saldoCxcDeCliente(clienteId): Promise<number>` (helper para el check de límite en Task 4; suma `saldo` de `documento_saldos` del cliente).
  - Tipo `RegistrarCobroInput` (exportado).

- [ ] **Step 1: Escribir `actions.ts` espejando la CxP**

Leé `app/admin/cuentas-por-pagar/actions.ts` completo — la CxC es el espejo casi exacto (documento en vez de compra, cliente en vez de proveedor). Diferencias:
- La vista `documento_saldos` YA trae `cliente_nombre` (join en la vista), así que `obtenerCxc` puede seleccionar de la vista directo (con `.gt('saldo', 0)`) sin traer clientes aparte. Deriva `dias_vencido`/`estado`/`bucket` en JS con `hoyHonduras` (igual que CxP).
- `RegistrarCobroInput`:
  ```typescript
  export interface RegistrarCobroInput {
    clienteId: string
    fecha: string
    metodo: CobroMetodo
    referencia: string | null
    notas: string | null
    sesionId: string | null
    aplicaciones: { documentoId: string; monto: number }[]
    montoGlobal?: number
  }
  ```
- `registrarCobro`: modo abono / global auto (`montoGlobal` → releer `documento_saldos` del cliente con `saldo>0` ordenados por vencimiento, `distribuirPago`; si `remanente>0` → error `El monto supera el total adeudado del cliente.`) / manual. Llama la RPC `registrar_cobro` con `{ cliente_id, fecha, metodo, referencia, notas, sesion_id: input.sesionId, usuario, aplicaciones: [{documento_id, monto}] }`. `traducirError` cubre los mensajes de la RPC: `Falta el cliente`, `El cobro no tiene aplicaciones`, `Monto de aplicacion invalido`, `Documento no encontrado`, `no pertenece al cliente`, `esta anulado`, `no tiene credito por cobrar`, `excede el saldo`.
- `eliminarCobro(cobroId)`: **guard de sesión cerrada** — leé el `sesion_id` del cobro; si no es null, leé el `estado` de esa `sesiones_caja`; si está `'cerrada'`, error `El cobro pertenece a una caja ya cerrada; no se puede eliminar.`; si no, `supabase.rpc('eliminar_cobro', { p_cobro_id: cobroId })`.
- `obtenerEstadoCuentaCliente`/`obtenerCobros`: espejo de las de CxP.
- `saldoCxcDeCliente(clienteId)`: `select saldo from documento_saldos where cliente_id = clienteId` y sumar (o `.gt('saldo',0)`), redondeado. Devuelve number (no CxcResult) — helper interno + exportado para Task 4.

- [ ] **Step 2: Guard en `anularDocumento`**

En `app/admin/pos/actions.ts`, en `anularDocumento` (la acción que anula un comprobante), ANTES de llamar la RPC de anulación, agregar:

```typescript
const { count } = await supabase.from('cobro_aplicaciones').select('id', { count: 'exact', head: true }).eq('documento_id', documentoId)
if ((count ?? 0) > 0) return { ok: false, error: 'El documento tiene cobros registrados. Elimínalos antes de anular.' }
```

(Ajustá el nombre del parámetro del id del documento al real de la función.)

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npx eslint app/admin/cuentas-por-cobrar/actions.ts app/admin/pos/actions.ts` sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/cuentas-por-cobrar/actions.ts app/admin/pos/actions.ts
git commit -m "feat(cxc): server actions (cobros, estado de cuenta) + guard de anulacion"
```

---

### Task 4: Venta al crédito en el POS (CobroModal + emitirVenta + límite)

**Files:**
- Modify: `app/admin/pos/components/CobroModal.tsx` (chip Crédito + "dejar restante a crédito" + validación de cliente + aviso de límite)
- Modify: `app/admin/pos/actions.ts` (`emitirVenta`: cliente requerido si hay crédito + check de límite + aviso)
- Modify: `app/admin/clientes/ClientesClient.tsx` (campo `limite_credito`)
- Modify: `app/admin/configuracion/PosSection.tsx` (toggle `cxc_bloquear_limite`)

**Interfaces:**
- Consumes: `excedeLimite` de `@/lib/cxp/cxp`; `saldoCxcDeCliente` de `@/app/admin/cuentas-por-cobrar/actions`; el método `credito` de `metodos_pago` (ya seedeado). `MetodoPagoTipo` ya tiene `credito`.
- Produces: la venta al crédito funcional end-to-end.

- [ ] **Step 1: `CobroModal` — método Crédito y "dejar restante a crédito"**

Leé `CobroModal.tsx` completo. El método "Crédito" llega en la lista de `metodos` (tipo `credito`). Cambios:
- Mostrar el chip "Crédito" como los demás métodos. Un pago de tipo `credito` cuenta para cubrir el total (ya lo hace la suma de `sumaPagos`).
- Cuando `restante > 0`, mostrar un botón **"Dejar el restante a crédito (L. X)"** que agrega (o setea) un pago con el método `credito` por el `restante`. Requiere `clienteActual` (no CONSUMIDOR FINAL): si no hay cliente, el botón está deshabilitado con un aviso "Elegí un cliente para vender al crédito".
- Validación al emitir: si hay algún pago de tipo `credito`, exigir `clienteActual` — si es CONSUMIDOR FINAL, bloquear con mensaje.
- Tras emitir, si el resultado trae un `aviso` (excedente de límite en modo no-bloqueante), mostrarlo.

- [ ] **Step 2: `emitirVenta` — cliente requerido y check de límite**

En `app/admin/pos/actions.ts`, en `emitirVenta`: tras releer los pagos, calcular `creditoNuevo = Σ pagos cuyo método es tipo 'credito'` (releé `metodos_pago.tipo` por `metodo_id`). Si `creditoNuevo > 0`:
- Exigir `cliente.id` no null (cliente registrado). Si no, error `Una venta al crédito requiere un cliente registrado.`
- Leer el toggle `cxc_bloquear_limite` de `configuracion` y el `limite_credito` del cliente. Calcular `saldoActual = await saldoCxcDeCliente(cliente.id)`; `const { excede, excedente } = excedeLimite(saldoActual, creditoNuevo, limite_credito)`. Si `excede`:
  - Si `cxc_bloquear_limite === 'true'` → devolver error `El cliente supera su límite de crédito por L. {excedente}.`
  - Si no → continuar la emisión y devolver en `data` un `aviso: 'El cliente excede su límite de crédito por L. {excedente}.'` (extender el tipo de retorno de `emitirVenta` con un `aviso?: string` opcional; el CobroModal lo muestra).
- El resto de `emitirVenta` (recálculo de totales, RPC `emitir_documento`, kardex) NO cambia. El pago de crédito se persiste como cualquier pago.

- [ ] **Step 3: Campo `limite_credito` en `ClientesClient`**

En `ClientesClient.tsx`, agregar al formulario de cliente un campo **"Límite de crédito (L.)"** (opcional, `type="text" inputMode="decimal"`, vacío = sin límite → null). Persistirlo en la acción de crear/actualizar cliente (extender `ClienteForm`/`toPayload` en `app/admin/clientes/actions.ts` con `limite_credito`). Mostrarlo en la tabla si querés (opcional).

- [ ] **Step 4: Toggle `cxc_bloquear_limite` en configuración**

En `PosSection.tsx` (o donde vivan los toggles de config del POS), agregar un toggle **"Bloquear ventas que superen el límite de crédito"** que lee/escribe la clave `cxc_bloquear_limite` (`'true'`/`'false'`), mismo patrón que el toggle `pos_documento_modal` existente.

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los archivos tocados sin errores. (Migración no aplicada — NO levantar el dev server.)

- [ ] **Step 6: Commit**

```bash
git add app/admin/pos/components/CobroModal.tsx app/admin/pos/actions.ts app/admin/clientes/ClientesClient.tsx app/admin/clientes/actions.ts app/admin/configuracion/PosSection.tsx
git commit -m "feat(cxc): venta al credito en el POS con limite y dejar restante a credito"
```

---

### Task 5: Arqueo — crédito otorgado y cobros por método

**Files:**
- Modify: `lib/pos/emision.ts` (`esperadoCaja`: cobros efectivo + crédito por método) + su test en `lib/pos/tests/`
- Modify: `app/admin/pos/actions.ts` (`cerrarSesion`/carga del cierre: pasar los cobros de la sesión)
- Modify: `app/admin/pos/components/CierreModal.tsx` (mostrar crédito otorgado + cobros por método)

**Interfaces:**
- Consumes: `esperadoCaja` (firma extendida), tipos de sesión/documento.
- Produces: el arqueo muestra el crédito otorgado (informativo) y los cobros de la sesión por método, con el efectivo cobrado sumado al esperado.

- [ ] **Step 1: Test de `esperadoCaja` con cobros (que falla)**

En `lib/pos/tests/` (donde estén los tests de emision), agregar un caso: `esperadoCaja(montoInicial, docs, cobros)` donde `cobros` es `Array<{ metodo: CobroMetodo; monto: number }>`; el `efectivoEsperado` debe incluir el `montoInicial` + efectivo de ventas + **efectivo de cobros**, y el resultado debe exponer los cobros por método aparte. Escribí el assert concreto (p.ej. montoInicial 100, una venta efectivo 500, un cobro efectivo 300 → efectivoEsperado 900; un cobro transferencia 200 no suma al efectivo pero aparece en el desglose de cobros).

- [ ] **Step 2: Extender `esperadoCaja`**

Agregar un tercer parámetro **opcional** `cobros: Array<{ metodo: CobroMetodo; monto: number }> = []`. Sumar los cobros en efectivo (`metodo === 'efectivo'`) al `efectivoEsperado`. Devolver además `cobrosPorMetodo: Record<CobroMetodo, number>`. Mantener el comportamiento actual cuando no se pasan cobros (las llamadas existentes siguen válidas). El `porMetodo` de ventas ya incluye `credito` (Task 2) — ese es el "crédito otorgado".

- [ ] **Step 3: Cargar los cobros de la sesión en el cierre**

En la acción que arma el cierre/arqueo (`app/admin/pos/actions.ts`), traer los `cobros` con `sesion_id = <sesión>` y pasarlos a `esperadoCaja` (mapeados a `{ metodo, monto }`). El resto del cálculo fiscal no cambia.

- [ ] **Step 4: `CierreModal` — mostrar crédito y cobros**

En `CierreModal.tsx`, agregar al desglose: una línea **"Crédito otorgado"** (= `porMetodo.credito` de las ventas) marcada como informativa (no suma al efectivo), y una sección **"Cobros de CxC"** con `cobrosPorMetodo` (efectivo/transferencia/…); aclarar que el efectivo cobrado ya está en el efectivo esperado. `formatPrice` en todo.

- [ ] **Step 5: Verificar**

`npx vitest run lib/pos --exclude "**/.claude/**"` (incluye el test nuevo de esperadoCaja) → PASS. `npx tsc --noEmit` limpio; `npm run build` OK; eslint sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/pos/emision.ts lib/pos/tests/ app/admin/pos/actions.ts app/admin/pos/components/CierreModal.tsx
git commit -m "feat(cxc): el arqueo muestra el credito otorgado y los cobros por metodo"
```

---

### Task 6: Tablero de CxC + CobroModal + sidebar

**Files:**
- Create: `app/admin/cuentas-por-cobrar/page.tsx`
- Create: `app/admin/cuentas-por-cobrar/CuentasPorCobrarClient.tsx`
- Create: `app/admin/cuentas-por-cobrar/CobroModal.tsx`
- Create: `app/admin/cuentas-por-cobrar/cxc.module.css`
- Modify: `components/admin/Sidebar.tsx` (link "Cuentas por cobrar")

**Interfaces:**
- Consumes: `obtenerCxc`, `registrarCobro`, `RegistrarCobroInput` de `./actions`; tipos `CxcFila`, `CobroMetodo`, `Cliente`, `SesionCaja`; `formatPrice`; `parseMoneyInput`/`valorMostrado`. Modal compartido `@/components/admin/Modal`. Referencia casi idéntica: `app/admin/cuentas-por-pagar/{CuentasPorPagarClient,PagoModal}.tsx` (CxP).
- Produces: la ruta `/admin/cuentas-por-cobrar`.

- [ ] **Step 1: `page.tsx` (server)**

`obtenerCxc()` + clientes (`clientes` activos, `order('nombre')`) + las sesiones de caja abiertas (`sesiones_caja` con `estado='abierta'`, para ligar cobros en efectivo). Pasa a `CuentasPorCobrarClient`.

- [ ] **Step 2: `CuentasPorCobrarClient` + `CobroModal`**

Espejá `CuentasPorPagarClient`/`PagoModal` de CxP (P4b): resumen de antigüedad por bucket, lista con badges de estado (pendiente/parcial/vencida), filtro por cliente y estado, acción "Cobrar" (abono) y "Nuevo cobro" (global auto/manual, rechaza montos negativos — MISMO criterio que el PagoModal ya corregido en P4b). Diferencias: es sobre documentos (número/correlativo, cliente), y el `CobroModal` tiene el campo **método de cobro** (`CobroMetodo`) y, si el método es `efectivo` y hay una sesión de caja abierta, setea `sesionId` (mostrando en qué caja; si hay varias abiertas, un select). Arma `RegistrarCobroInput` y llama `registrarCobro`; al `ok`, `router.refresh()`.

- [ ] **Step 3: Link "Cuentas por cobrar" en el Sidebar**

```tsx
{ href: '/admin/cuentas-por-cobrar', icon: '📈', label: 'Cuentas por cobrar' },
```

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos + Sidebar sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cuentas-por-cobrar/page.tsx app/admin/cuentas-por-cobrar/CuentasPorCobrarClient.tsx app/admin/cuentas-por-cobrar/CobroModal.tsx app/admin/cuentas-por-cobrar/cxc.module.css components/admin/Sidebar.tsx
git commit -m "feat(cxc): tablero de cuentas por cobrar con antiguedad y registro de cobros"
```

---

### Task 7: Historial de cobros + estado de cuenta por cliente (imprimible)

**Files:**
- Create: `app/admin/cuentas-por-cobrar/cobros/{page.tsx,CobrosClient.tsx}`
- Create: `app/admin/cuentas-por-cobrar/cliente/[id]/{page.tsx,EstadoCuentaClienteView.tsx,HojaEstadoCuentaCliente.tsx,estado.module.css}`

**Interfaces:**
- Consumes: `obtenerCobros`, `eliminarCobro`, `obtenerEstadoCuentaCliente` de `../actions`; tipos `Cobro`, `CobroAplicacion`, `CxcFila`, `Cliente`; `formatPrice`; `toConfigMap`. Patrón imprimible: `app/admin/cuentas-por-pagar/proveedor/[id]/{EstadoCuentaView,HojaEstadoCuenta}.tsx` (CxP — espejo).
- Produces: rutas `/admin/cuentas-por-cobrar/cobros` y `/admin/cuentas-por-cobrar/cliente/[id]`.

- [ ] **Step 1: Historial de cobros**

`cobros/page.tsx` (server) → `obtenerCobros()`; `CobrosClient`: tabla con número, cliente, fecha, monto, método, referencia; aplicaciones expandibles (documento + monto); **Eliminar** con `window.confirm` → `eliminarCobro(id)` (muestra el error del guard de sesión cerrada si aplica) + `router.refresh()`.

- [ ] **Step 2: Estado de cuenta por cliente**

`cliente/[id]/page.tsx` (server) → `obtenerEstadoCuentaCliente(id)` + datos del cliente (`clientes`) + config de empresa; si falla, `notFound()`. `EstadoCuentaClienteView`: documentos con saldo + cobros + total adeudado; botón *Imprimir* → `HojaEstadoCuentaCliente` (hoja carta, fondo blanco/tinta fija, `.btnToolbar`, `@media print`; copiá a `estado.module.css` lo necesario de `documento.module.css`).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/cuentas-por-cobrar/cobros/ app/admin/cuentas-por-cobrar/cliente/
git commit -m "feat(cxc): historial de cobros y estado de cuenta imprimible por cliente"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/cxp` y el test de `esperadoCaja`).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados (los de `coverage/` son ruido preexistente gitignored).
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar la migración): venta con "dejar restante a crédito"; límite que bloquea (toggle on) y que avisa (toggle off); el arqueo muestra crédito otorgado + cobros; cobrar un documento (saldo baja); antigüedad; estado de cuenta imprimible; anular un documento con cobros (bloqueado); eliminar un cobro de una caja cerrada (bloqueado).

## Entrega

- El usuario aplica `supabase/migrations/2026-08-09-pos-p4c-cuentas-por-cobrar.sql` y corre `supabase/smoke-pos-p4c.sql` (espera "Success: migracion POS P4c OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P4c desplegado.
