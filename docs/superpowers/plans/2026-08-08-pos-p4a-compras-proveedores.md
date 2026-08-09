# POS P4a — Compras y Proveedores — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar compras a proveedores (orden formal y/o compra directa al recibir) que alimentan el kardex y el costeo existentes, con moneda L./USD, gestión de proveedores y reorden por stock mínimo.

**Architecture:** Una compra es un documento con estados (`borrador`/`ordenada`/`parcial`/`recibida`/`anulada`). La **recepción** es lo único que toca el kardex: la RPC `recibir_compra` postea movimientos `compra` reutilizando la función de costeo existente `aplicar_costeo`. Anular postea un movimiento compensatorio `devolucion` sin recalcular costeo (kardex append-only). La lógica con peso vive en `lib/compras/` con tests; los totales se recalculan en el servidor.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español** (UI, dominio, commits). Moneda en **Lempiras** con `formatPrice()` (`lib/store/format`); el kardex/costeo siempre en L.
- **Reusar `aplicar_costeo`** (SQL, promedio/último) para el costo; **no reimplementar** la matemática de costeo. **Las compras cambian el costo; las ventas no.** El stock/costo **nunca** se escribe directo fuera de las RPC (`recibir_compra`/`anular_compra`).
- **Frontera de confianza:** `total` y la conversión USD→L se recalculan **en el servidor** (nunca se confía en los importes del cliente).
- **Lógica de negocio con peso en `lib/compras/`** como funciones puras con test (`lib/compras/tests/`).
- **Cantidades enteras** (unidades): `cantidad_ordenada`/`cantidad_recibida` son `integer` (el stock y el kardex son enteros). `costo_unitario` es `numeric(12,4)`. (Refinamiento sobre el spec, que decía numeric; entero es más correcto porque `aplicar_costeo` y `movimientos_inventario.cantidad` son integer.)
- **Migración idempotente** (`if not exists`, `add column if not exists`), **aplicada por el usuario** antes del push. Sigue el estilo de `supabase/migrations/2026-08-07-pos-p2-tablas.sql` (RLS `do $$ ... exception when duplicate_object`, triggers con `update_updated_at`).
- **CSS Modules con tokens Merlin**; botones `btnMerlinPrimary/Secondary/Tertiary` **sin caja propia** → componer con una clase de módulo (o usar `btnMerlinChip`/`btnMerlinIcon`). Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado` de `app/admin/pos/pos-helpers`.
- **Orden imprimible = HTML + CSS de impresión** (sin librería de PDF), patrón `app/admin/pos/documento/[id]/DocumentoHoja.tsx`.
- **Cliente de Supabase de servidor** (`lib/supabase-server`) en Server Components/Actions. Tipo de resultado: `type ComprasResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.
- Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`. Los Server Actions/Components no llevan tests de unidad (se verifican con tsc/build + navegador); la verificación visual se defiere a un checkpoint tras aplicar la migración.

---

### Task 1: Migración P4a (tablas, secuencia, RPC de recepción/anulación, RLS) + smoke

**Files:**
- Create: `supabase/migrations/2026-08-08-pos-p4a-compras.sql`
- Create: `supabase/smoke-pos-p4a.sql`

**Interfaces:**
- Produces: extensión de `clientes` (`es_cliente`, `es_proveedor`, `contacto`, `dias_credito` + check `clientes_rol_chk`); tablas nuevas `compras`, `compra_items` (columnas en el spec).
- Produces (funciones): `nextval_compra() → bigint`, `recibir_compra(p jsonb) → void`, `anular_compra(p_compra_id uuid, p_motivo text) → void`.
- Consumes (ya existen): `aplicar_costeo(integer, numeric, integer, numeric) → numeric`, `update_updated_at()`, tablas `productos`/`producto_variantes`/`movimientos_inventario` (tipo `compra` y `devolucion` ya en el check).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-08-pos-p4a-compras.sql`:

```sql
-- POS P4a: compras y contacto unificado cliente/proveedor. Reusa aplicar_costeo;
-- las compras cambian el costo. NO hay tabla proveedores: se extiende clientes
-- con flags de rol; un proveedor es un clientes con es_proveedor = true.

alter table clientes add column if not exists es_cliente   boolean not null default true;
alter table clientes add column if not exists es_proveedor boolean not null default false;
alter table clientes add column if not exists contacto     text;
alter table clientes add column if not exists dias_credito int not null default 0;
-- Al menos un rol. Se agrega el check solo si no existe (idempotente).
do $$ begin
  alter table clientes add constraint clientes_rol_chk check (es_cliente or es_proveedor);
  exception when duplicate_object then null; end $$;

create sequence if not exists compra_numero_seq;
create or replace function nextval_compra()
returns bigint language sql security definer set search_path = public as $$
  select nextval('compra_numero_seq');
$$;
revoke all on function nextval_compra() from public, anon;
grant execute on function nextval_compra() to authenticated;

create table if not exists compras (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  proveedor_id      uuid not null references clientes(id) on delete restrict,
  estado            text not null default 'ordenada'
                      check (estado in ('borrador','ordenada','parcial','recibida','anulada')),
  moneda            text not null default 'L' check (moneda in ('L','USD')),
  tasa_cambio       numeric(12,4) check (tasa_cambio is null or tasa_cambio > 0),
  factura_proveedor text,
  condicion_pago    text not null default 'contado' check (condicion_pago in ('contado','credito')),
  dias_credito      int not null default 0 check (dias_credito >= 0),
  fecha             date not null default current_date,
  fecha_vencimiento date,
  notas             text,
  total             numeric(12,2) not null default 0,
  anulado_motivo    text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint compras_usd_tasa_chk check (moneda <> 'USD' or tasa_cambio is not null)
);
create index if not exists compras_proveedor_idx on compras (proveedor_id);
create index if not exists compras_estado_idx on compras (estado);

create table if not exists compra_items (
  id                uuid primary key default gen_random_uuid(),
  compra_id         uuid not null references compras(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete restrict,
  variante_id       uuid references producto_variantes(id) on delete restrict,
  descripcion       text not null,
  cantidad_ordenada integer not null check (cantidad_ordenada > 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0),
  costo_unitario    numeric(12,4) not null check (costo_unitario >= 0),
  orden             int not null default 0
);
create index if not exists compra_items_compra_idx on compra_items (compra_id);

-- Recepción atómica: alimenta el kardex reusando aplicar_costeo; postea tipo 'compra'.
create or replace function recibir_compra(p jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_compra_id uuid := (p->>'compra_id')::uuid;
  v_usuario   text := p->>'usuario';
  v_estado text; v_moneda text; v_tasa numeric; v_numero text;
  r jsonb;
  v_item uuid; v_cant integer;
  v_prod uuid; v_var uuid; v_costo_unit numeric; v_ord integer; v_rec integer;
  v_costo_l numeric; v_stock integer; v_costo numeric; v_nuevo numeric;
  v_falta boolean;
begin
  select estado, moneda, tasa_cambio, numero into v_estado, v_moneda, v_tasa, v_numero
    from compras where id = v_compra_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if v_estado in ('recibida','anulada') then
    raise exception 'La compra no admite recepciones (estado %)', v_estado;
  end if;

  for r in select value from jsonb_array_elements(p->'recepciones') loop
    v_item := (r->>'compra_item_id')::uuid;
    v_cant := (r->>'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad de recepción invalida'; end if;

    select producto_id, variante_id, costo_unitario, cantidad_ordenada, cantidad_recibida
      into v_prod, v_var, v_costo_unit, v_ord, v_rec
      from compra_items where id = v_item and compra_id = v_compra_id for update;
    if not found then raise exception 'Linea de compra no encontrada'; end if;
    if v_cant > v_ord - v_rec then raise exception 'La recepcion excede lo pendiente de la linea'; end if;

    v_costo_l := round(v_costo_unit * (case when v_moneda = 'USD' then v_tasa else 1 end), 4);

    if v_var is not null then
      select stock, costo into v_stock, v_costo from producto_variantes where id = v_var for update;
    else
      select stock, costo into v_stock, v_costo from productos where id = v_prod for update;
    end if;

    v_nuevo := aplicar_costeo(v_stock, v_costo, v_cant, v_costo_l);

    if v_var is not null then
      update producto_variantes set stock = coalesce(stock,0) + v_cant, costo = v_nuevo where id = v_var;
    else
      update productos set stock = coalesce(stock,0) + v_cant, costo = v_nuevo where id = v_prod;
    end if;

    insert into movimientos_inventario
      (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario)
    values (v_prod, v_var, 'compra', v_cant, v_costo_l, v_nuevo, v_numero, v_usuario);

    update compra_items set cantidad_recibida = cantidad_recibida + v_cant where id = v_item;
  end loop;

  select bool_or(cantidad_recibida < cantidad_ordenada) into v_falta
    from compra_items where compra_id = v_compra_id;
  update compras set estado = case when coalesce(v_falta, false) then 'parcial' else 'recibida' end
    where id = v_compra_id;
end; $$;
revoke all on function recibir_compra(jsonb) from public, anon;
grant execute on function recibir_compra(jsonb) to authenticated;

-- Anular: revierte stock con movimiento compensatorio; NO recalcula costeo (append-only).
create or replace function anular_compra(p_compra_id uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_estado text; v_numero text; rec record;
begin
  select estado, numero into v_estado, v_numero from compras where id = p_compra_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if v_estado = 'anulada' then raise exception 'La compra ya esta anulada'; end if;

  if v_estado in ('parcial','recibida') then
    for rec in select producto_id, variante_id, cantidad_recibida
               from compra_items where compra_id = p_compra_id and cantidad_recibida > 0 loop
      if rec.variante_id is not null then
        update producto_variantes set stock = coalesce(stock,0) - rec.cantidad_recibida where id = rec.variante_id;
      else
        update productos set stock = coalesce(stock,0) - rec.cantidad_recibida where id = rec.producto_id;
      end if;
      insert into movimientos_inventario
        (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario, notas)
      values (rec.producto_id, rec.variante_id, 'devolucion', -rec.cantidad_recibida, null, null,
              v_numero || ' (anulacion)', null, p_motivo);
    end loop;
  end if;

  update compras set estado = 'anulada', anulado_motivo = p_motivo where id = p_compra_id;
end; $$;
revoke all on function anular_compra(uuid, text) from public, anon;
grant execute on function anular_compra(uuid, text) to authenticated;

-- RLS admin (patrón P1-P3). clientes ya tiene RLS; solo las 2 tablas nuevas.
alter table compras enable row level security;
alter table compra_items enable row level security;
do $$ begin
  create policy compras_admin on compras for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy compra_items_admin on compra_items for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

drop trigger if exists compras_updated_at on compras;
create trigger compras_updated_at before update on compras
  for each row execute function update_updated_at();
```

- [ ] **Step 2: Escribir el smoke SQL**

Crear `supabase/smoke-pos-p4a.sql` (modelar sobre `supabase/smoke-pos-p3.sql`; no crea ni borra datos):

```sql
-- Smoke POS P4a — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_name = 'clientes' and column_name = 'es_proveedor') then
    raise exception 'FALLO: falta clientes.es_proveedor'; end if;
  if to_regclass('public.compras') is null then raise exception 'FALLO: falta compras'; end if;
  if to_regclass('public.compra_items') is null then raise exception 'FALLO: falta compra_items'; end if;
  if to_regclass('public.compra_numero_seq') is null then raise exception 'FALLO: falta compra_numero_seq'; end if;
  if to_regproc('public.recibir_compra(jsonb)') is null then raise exception 'FALLO: falta recibir_compra'; end if;
  if to_regproc('public.anular_compra(uuid, text)') is null then raise exception 'FALLO: falta anular_compra'; end if;
  if to_regproc('public.nextval_compra()') is null then raise exception 'FALLO: falta nextval_compra'; end if;
  raise notice 'Smoke POS P4a: estructura OK';
end $$;
select 'Success: migracion POS P4a OK' as resultado,
       (select count(*) from clientes where es_proveedor) as proveedores;
```

- [ ] **Step 3: Revisar consistencia**

Verificar: `aplicar_costeo` recibe `(v_stock, v_costo, v_cant integer, v_costo_l)` — coincide con su firma; `movimientos_inventario` acepta `tipo in ('compra','devolucion')` (ya en el check del schema); `cantidad <> 0` (la anulación usa negativos, OK); `costo_unitario`/`costo_resultante` aceptan null (anulación). No hay forma de correr SQL localmente — el reviewer valida.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-08-pos-p4a-compras.sql supabase/smoke-pos-p4a.sql
git commit -m "feat(compras): migracion P4a (clientes con rol proveedor, compras, recepcion)"
```

---

### Task 2: Tipos + lógica pura `lib/compras/` con tests

**Files:**
- Modify: `types/index.ts` (agregar al final)
- Create: `lib/compras/compras.ts`
- Create: `lib/compras/tests/compras.test.ts`

**Interfaces:**
- Produces (tipos): `CompraEstado`, `CompraMoneda`, `CondicionPago`, `Compra`, `CompraItem`, `CompraConDatos`, `ReordenLinea`; y **extiende** `Cliente` con `es_cliente`/`es_proveedor`/`contacto`/`dias_credito` (el proveedor NO es un tipo nuevo, es un `Cliente` con `es_proveedor=true`).
- Produces (puras): `numeroCompra(seq: number): string`, `costoEnLempiras(costo: number, moneda: CompraMoneda, tasa: number | null): number`, `totalCompra(items: { cantidad_ordenada: number; costo_unitario: number }[], moneda: CompraMoneda, tasa: number | null): number`, `estadoCompra(items: { cantidad_ordenada: number; cantidad_recibida: number }[]): CompraEstado`, `cantidadSugeridaReorden(stock: number, stockMinimo: number): number`.

- [ ] **Step 1: Escribir los tipos en `types/index.ts`**

Primero, **extender el tipo `Cliente` existente** en `types/index.ts` (agregar 4 campos a la interfaz que ya existe; no crear un tipo nuevo). Buscar `export interface Cliente {` y agregar, junto a los demás campos:

```typescript
  es_cliente: boolean
  es_proveedor: boolean
  contacto: string | null
  dias_credito: number
```

Si existe un tipo `ClienteForm` (usado al crear/editar), agregarle también `es_cliente`, `es_proveedor`, `contacto`, `dias_credito`.

Luego, los tipos nuevos de compras (al final del archivo):

```typescript
export type CompraEstado = 'borrador' | 'ordenada' | 'parcial' | 'recibida' | 'anulada'
export type CompraMoneda = 'L' | 'USD'
export type CondicionPago = 'contado' | 'credito'

export interface CompraItem {
  id: string
  compra_id: string
  producto_id: string
  variante_id: string | null
  descripcion: string
  cantidad_ordenada: number
  cantidad_recibida: number
  costo_unitario: number
  orden: number
}

export interface Compra {
  id: string
  numero: string
  proveedor_id: string
  estado: CompraEstado
  moneda: CompraMoneda
  tasa_cambio: number | null
  factura_proveedor: string | null
  condicion_pago: CondicionPago
  dias_credito: number
  fecha: string
  fecha_vencimiento: string | null
  notas: string | null
  total: number
  anulado_motivo: string | null
  created_at: string
  updated_at: string
}

export interface CompraConDatos extends Compra {
  items: CompraItem[]
  proveedor: Cliente | null   // el proveedor es un Cliente con es_proveedor=true
}

// Línea sugerida de reorden (producto o variante bajo mínimo)
export interface ReordenLinea {
  producto_id: string
  variante_id: string | null
  descripcion: string
  stock: number
  stock_minimo: number
  cantidad_sugerida: number
  costo: number | null
}
```

- [ ] **Step 2: Escribir los tests (que fallan)**

Crear `lib/compras/tests/compras.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { numeroCompra, costoEnLempiras, totalCompra, estadoCompra, cantidadSugeridaReorden } from '../compras'

describe('numeroCompra', () => {
  it('formatea con prefijo COMP- y 8 dígitos', () => {
    expect(numeroCompra(1)).toBe('COMP-00000001')
    expect(numeroCompra(12345678)).toBe('COMP-12345678')
  })
})

describe('costoEnLempiras', () => {
  it('en L. devuelve el costo tal cual', () => {
    expect(costoEnLempiras(100, 'L', null)).toBe(100)
  })
  it('en USD multiplica por la tasa y redondea a 2', () => {
    expect(costoEnLempiras(10, 'USD', 26.3)).toBe(263)
    expect(costoEnLempiras(9.99, 'USD', 26.3)).toBe(262.74) // 262.737 -> 262.74
  })
})

describe('totalCompra', () => {
  it('suma cantidad × costo en Lempiras', () => {
    const items = [
      { cantidad_ordenada: 2, costo_unitario: 100 },
      { cantidad_ordenada: 3, costo_unitario: 50 },
    ]
    expect(totalCompra(items, 'L', null)).toBe(350)
  })
  it('convierte USD con la tasa', () => {
    const items = [{ cantidad_ordenada: 2, costo_unitario: 10 }]
    expect(totalCompra(items, 'USD', 26.3)).toBe(526)
  })
})

describe('estadoCompra', () => {
  it('sin líneas es borrador', () => {
    expect(estadoCompra([])).toBe('borrador')
  })
  it('nada recibido es ordenada', () => {
    expect(estadoCompra([{ cantidad_ordenada: 5, cantidad_recibida: 0 }])).toBe('ordenada')
  })
  it('algo recibido pero no todo es parcial', () => {
    expect(estadoCompra([
      { cantidad_ordenada: 5, cantidad_recibida: 2 },
      { cantidad_ordenada: 3, cantidad_recibida: 0 },
    ])).toBe('parcial')
  })
  it('todo recibido es recibida', () => {
    expect(estadoCompra([
      { cantidad_ordenada: 5, cantidad_recibida: 5 },
      { cantidad_ordenada: 3, cantidad_recibida: 3 },
    ])).toBe('recibida')
  })
})

describe('cantidadSugeridaReorden', () => {
  it('sugiere lo que falta para llegar al mínimo', () => {
    expect(cantidadSugeridaReorden(2, 10)).toBe(8)
  })
  it('no sugiere nada si ya está en o sobre el mínimo', () => {
    expect(cantidadSugeridaReorden(10, 10)).toBe(0)
    expect(cantidadSugeridaReorden(15, 10)).toBe(0)
  })
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/compras --exclude "**/.claude/**"`
Expected: FAIL (módulo `../compras` no existe).

- [ ] **Step 4: Escribir la implementación**

Crear `lib/compras/compras.ts`:

```typescript
import type { CompraEstado, CompraMoneda } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export function numeroCompra(seq: number): string {
  return `COMP-${String(seq).padStart(8, '0')}`
}

export function costoEnLempiras(costo: number, moneda: CompraMoneda, tasa: number | null): number {
  return round2(moneda === 'USD' ? costo * (tasa ?? 0) : costo)
}

export function totalCompra(
  items: { cantidad_ordenada: number; costo_unitario: number }[],
  moneda: CompraMoneda,
  tasa: number | null,
): number {
  const factor = moneda === 'USD' ? (tasa ?? 0) : 1
  return round2(items.reduce((s, i) => s + i.cantidad_ordenada * i.costo_unitario * factor, 0))
}

// Deriva el estado a partir de las cantidades. Sin líneas = borrador. Todo
// recibido = recibida. Algo recibido pero no todo = parcial. Nada recibido y
// con líneas = ordenada. (borrador/ordenada no se distinguen por cantidades,
// pero sin líneas siempre es borrador.)
export function estadoCompra(
  items: { cantidad_ordenada: number; cantidad_recibida: number }[],
): CompraEstado {
  if (items.length === 0) return 'borrador'
  const algo = items.some(i => i.cantidad_recibida > 0)
  const todo = items.every(i => i.cantidad_recibida >= i.cantidad_ordenada)
  if (todo) return 'recibida'
  if (algo) return 'parcial'
  return 'ordenada'
}

export function cantidadSugeridaReorden(stock: number, stockMinimo: number): number {
  return Math.max(0, stockMinimo - stock)
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/compras --exclude "**/.claude/**"` → PASS. Luego `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/compras/
git commit -m "feat(compras): tipos y logica pura (numero, costo, total, estado, reorden)"
```

---

### Task 3: Contacto unificado cliente/proveedor (extender el panel de clientes)

No hay panel de proveedores separado: se **modifica el módulo `clientes` existente** para que un contacto pueda ser cliente, proveedor o ambos, con filtro y checkboxes de rol.

**Files:**
- Modify: `app/admin/clientes/actions.ts` (roles + guard de proveedor)
- Modify: `app/admin/clientes/ClientesClient.tsx` (filtro + checkboxes de rol + campos de proveedor)
- Modify: `app/admin/clientes/page.tsx` (si hace falta cargar los nuevos campos — `select('*')` ya los trae)

**Interfaces:**
- Consumes: el tipo `Cliente` ya extendido (Task 2) con `es_cliente`/`es_proveedor`/`contacto`/`dias_credito`. Patrón: los propios archivos de `clientes` (léelos completos primero).
- Produces: el panel `/admin/clientes` unificado; las acciones de clientes persisten los flags de rol.

- [ ] **Step 1: `actions.ts` — roles y guard**

Leer `app/admin/clientes/actions.ts` completo. En las acciones de crear/actualizar cliente, incluir en el `insert`/`update` los nuevos campos `es_cliente`, `es_proveedor`, `contacto`, `dias_credito` (tomados del form). Validar que **al menos un rol** esté activo: si `!es_cliente && !es_proveedor` → devolver error `'El contacto debe ser cliente, proveedor o ambos.'`.

En la acción de **eliminar cliente**, agregar (además de los guards que ya tenga por pedidos/documentos) un guard por compras como proveedor:

```typescript
const { count: compras } = await supabase.from('compras').select('id', { count: 'exact', head: true }).eq('proveedor_id', id)
if ((compras ?? 0) > 0) return { ok: false, error: 'El contacto tiene compras como proveedor. No se puede eliminar.' }
```

(Respeta el tipo de resultado que ya usan las acciones de clientes; no lo cambies.)

**Compatibilidad hacia atrás:** el alta rápida de cliente en POS y cotizaciones (`ClienteNuevoModal`) NO manda los flags de rol. La acción de crear debe **asumir `es_cliente=true`, `es_proveedor=false` cuando el form no trae esos campos** (o apoyarse en los defaults de la columna), para que esos llamadores sigan funcionando sin cambios y sin disparar la validación de "al menos un rol".

- [ ] **Step 2: `ClientesClient.tsx` — filtro, rol y campos de proveedor**

Leer `ClientesClient.tsx` completo. Cambios:
- **Filtro** de rol: un control (chips o `<select>`) con Todos / Clientes / Proveedores que filtra la lista por `es_cliente`/`es_proveedor`. El título del panel pasa a "Clientes y proveedores".
- **Columna/etiqueta de rol** en la tabla (p.ej. badges "Cliente" / "Proveedor" según los flags).
- **Formulario crear/editar:** dos checkboxes "Es cliente" / "Es proveedor" (ambos marcables; al menos uno, validado en la UI y en la acción). Cuando `es_proveedor` está marcado, mostrar los campos de proveedor `contacto` (persona de contacto) y `dias_credito`. Los campos fiscales de cliente (tipo_cliente, exonerado, etc.) que ya existen se muestran cuando `es_cliente`. Al crear, `es_cliente` viene marcado por defecto.
- Estilo Merlin, reusando `clientes.module.css` (agregar clases solo si hace falta).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint app/admin/clientes/actions.ts app/admin/clientes/ClientesClient.tsx` sin errores nuevos. (La migración no está aplicada aún — no levantes el dev server; visual deferido.)

- [ ] **Step 4: Commit**

```bash
git add app/admin/clientes/
git commit -m "feat(compras): contacto unificado cliente/proveedor con roles y filtro"
```

Nota: el `ComprasResult` lo define la Task 4 en `app/admin/compras/actions.ts`; esta tarea usa el tipo de resultado que ya tienen las acciones de clientes.

---

### Task 4: Server Actions de compras

**Files:**
- Create: `app/admin/compras/actions.ts`

**Interfaces:**
- Consumes: `numeroCompra`, `costoEnLempiras`, `totalCompra`, `estadoCompra`, `cantidadSugeridaReorden` de `@/lib/compras/compras`; tipos `Compra`, `CompraItem`, `CompraConDatos`, `CompraMoneda`, `CondicionPago`, `ReordenLinea`. Patrón: `app/admin/cotizaciones/actions.ts`.
- Produces:
  - `guardarCompra(input: GuardarCompraInput): Promise<ComprasResult<{ id: string }>>`
  - `obtenerCompra(id: string): Promise<ComprasResult<CompraConDatos>>`
  - `recibirCompra(compraId: string, recepciones: { compraItemId: string; cantidad: number }[]): Promise<ComprasResult>`
  - `anularCompra(compraId: string, motivo: string): Promise<ComprasResult>`
  - `obtenerReorden(): Promise<ComprasResult<ReordenLinea[]>>`
  - `crearOrdenDesdeReorden(lineas: LineaCompraInput[], proveedorId: string): Promise<ComprasResult<{ id: string }>>`
  - Tipos `GuardarCompraInput`, `LineaCompraInput` (exportados para el editor y el reorden).

- [ ] **Step 1: Tipos de entrada + `guardarCompra`**

```typescript
export interface LineaCompraInput {
  producto_id: string
  variante_id: string | null
  descripcion: string
  cantidad_ordenada: number
  costo_unitario: number
}

export interface GuardarCompraInput {
  id: string | null
  proveedorId: string
  moneda: CompraMoneda
  tasaCambio: number | null
  facturaProveedor: string | null
  condicionPago: CondicionPago
  diasCredito: number
  fecha: string            // 'YYYY-MM-DD'
  notas: string | null
  lineas: LineaCompraInput[]
}
```

`guardarCompra`: solo permitido si la compra es nueva o está en `borrador`/`ordenada` (relee `estado`; si `parcial`/`recibida`/`anulada` → error "La compra ya no se puede editar"). Recalcula `total` con `totalCompra(lineas, moneda, tasa)` (frontera de confianza). Calcula `fecha_vencimiento = fecha + diasCredito` si `condicion_pago='credito'` (en JS, `'YYYY-MM-DD'`). Estado inicial: `lineas.length ? 'ordenada' : 'borrador'`. Al crear, `numero = numeroCompra(Number(await supabase.rpc('nextval_compra')))`. Upsert secuencial de items (borrar previos + insertar), igual que `guardarCotizacion`. Valida `moneda='USD' ⇒ tasa > 0`.

- [ ] **Step 2: `obtenerCompra`, `recibirCompra`, `anularCompra`**

```typescript
export async function obtenerCompra(id: string): Promise<ComprasResult<CompraConDatos>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compras')
    .select('*, compra_items(*), proveedor:clientes(*)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'No se encontró la compra.' }
  const items = ((data as { compra_items: CompraItem[] }).compra_items ?? []).slice().sort((a, b) => a.orden - b.orden)
  const { compra_items, ...rest } = data as never
  return { ok: true, data: { ...(rest as object), items, proveedor: (data as never).proveedor } as CompraConDatos }
}

export async function recibirCompra(compraId: string, recepciones: { compraItemId: string; cantidad: number }[]): Promise<ComprasResult> {
  if (recepciones.length === 0) return { ok: false, error: 'No hay líneas para recibir.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.rpc('recibir_compra', {
    p: { compra_id: compraId, usuario: user?.email ?? null,
         recepciones: recepciones.map(r => ({ compra_item_id: r.compraItemId, cantidad: r.cantidad })) },
  })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/compras')
  return { ok: true }
}

export async function anularCompra(compraId: string, motivo: string): Promise<ComprasResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('anular_compra', { p_compra_id: compraId, p_motivo: motivo })
  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath('/admin/compras')
  return { ok: true }
}
```

`traducirError(msg)`: si el mensaje del error de Postgres contiene el texto de las excepciones de la RPC (p.ej. 'excede lo pendiente', 'no admite recepciones', 'ya esta anulada'), devuélvelo tal cual (son mensajes en español legibles); si no, devuelve el genérico. Función local simple.

- [ ] **Step 3: `obtenerReorden` y `crearOrdenDesdeReorden`**

`obtenerReorden`: lee productos activos con `stock_minimo` no null y sus variantes; para cada producto/variante con `stock_minimo` definido y `stock <= stock_minimo`, arma una `ReordenLinea` con `cantidad_sugerida = cantidadSugeridaReorden(stock, stock_minimo)` (solo incluye las que sugieren > 0). Para un producto con variantes activas, evalúa por variante (el stock vive por variante); para producto plano, por el producto. `descripcion` = nombre (+ variante). `costo` = costo actual (para mostrar).

`crearOrdenDesdeReorden(lineas, proveedorId)`: arma un `GuardarCompraInput` con `id: null`, `proveedorId`, `moneda:'L'`, `condicionPago:'contado'`, `fecha` de hoy, y las líneas (`costo_unitario` = el costo actual o 0), y llama `guardarCompra`.

- [ ] **Step 4: Verificar tipos**

`npx tsc --noEmit` limpio; `npx eslint app/admin/compras/actions.ts` sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/compras/actions.ts
git commit -m "feat(compras): server actions (guardar, recibir, anular, reorden)"
```

---

### Task 5: Compras — listado, editor y modal de recepción

**Files:**
- Create: `app/admin/compras/page.tsx`
- Create: `app/admin/compras/ComprasClient.tsx`
- Create: `app/admin/compras/[id]/page.tsx`
- Create: `app/admin/compras/[id]/CompraEditor.tsx`
- Create: `app/admin/compras/[id]/RecepcionModal.tsx`
- Create: `app/admin/compras/compras.module.css`
- Modify: `components/admin/Sidebar.tsx` (link "Compras")

**Interfaces:**
- Consumes: `guardarCompra`, `obtenerCompra`, `recibirCompra`, `anularCompra`, `GuardarCompraInput`, `LineaCompraInput` de `../actions`; tipos `Compra`, `CompraConDatos`, `Cliente`, `Producto`, `ProductoVariante`, `ConfigMap`; `variantesActivasDe` de `@/app/admin/pos/pos-helpers`; `parseMoneyInput`/`valorMostrado`/`round2` de `pos-helpers`; `totalCompra`/`estadoCompra` de `@/lib/compras/compras`; `formatPrice`; `toConfigMap`. Modal compartido `@/components/admin/Modal`.
- Produces: rutas `/admin/compras` y `/admin/compras/[id]`.

- [ ] **Step 1: `/admin/compras/page.tsx` + `ComprasClient.tsx` + css**

`page.tsx` (server) carga compras con proveedor: `supabase.from('compras').select('*, proveedor:clientes(nombre)').order('created_at', { ascending: false })` + los proveedores (`clientes` con `es_proveedor=true and activo`) para el filtro. `ComprasClient`: tabla con número, proveedor, estado (badge por color: borrador/ordenada gris, parcial ámbar, recibida verde, anulada rojo — tokens Merlin), total (`formatPrice`), fecha; filtro por estado y proveedor; botón *Nueva compra* → `router.push('/admin/compras/nueva')`; clic en fila → `/admin/compras/<id>`.

- [ ] **Step 2: `/admin/compras/[id]/page.tsx` + `CompraEditor.tsx`**

`page.tsx` (server) carga productos activos (`select('*, producto_variantes(*)')`), los proveedores (`clientes` con `es_proveedor=true and activo`, `order('nombre')`), config (`toConfigMap`); si `id !== 'nueva'`, `obtenerCompra(id)` (si falla, `notFound()`). Pasa a `CompraEditor`.

`CompraEditor` (client): campos de encabezado (proveedor = **select de los contactos con `es_proveedor=true`** que llegan como prop; con alta rápida opcional: un botón "＋" que abre un modal para crear un contacto nuevo ya marcado como proveedor — reusa la acción de crear cliente de `app/admin/clientes/actions.ts` con `es_proveedor:true`), moneda L./USD (toggle) + tasa (default `config.tasa_cambio_usd`, editable, visible solo si USD), factura del proveedor, condición contado/crédito (+ días de crédito si crédito), fecha, notas. Líneas: buscador de productos/variantes (reusa `variantesActivasDe`; al elegir producto sin variantes agrega línea, con variantes abre un mini-selector), cada línea con cantidad ordenada (entero) y costo unitario; **total en vivo** con `totalCompra`. Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado`.
- Habilitación: si `compra.estado ∈ {parcial, recibida, anulada}` el encabezado y las líneas quedan **solo lectura**; se muestran las acciones que correspondan.
- Acciones: *Guardar* (si editable → `guardarCompra`; si nueva, `router.replace('/admin/compras/'+id)`); *Recibir* (si `ordenada`/`parcial` → abre `RecepcionModal`); *Anular* (si no anulada → pide motivo con `window.prompt` o un modal simple → `anularCompra`); *Imprimir orden* (→ abre `/admin/compras/<id>/orden` en pestaña nueva; solo si guardada); *Volver*.

- [ ] **Step 3: `RecepcionModal.tsx`**

Recibe la lista de líneas con `pendiente = cantidad_ordenada - cantidad_recibida`. Muestra cada línea con su pendiente y un input de cantidad a recibir (default = pendiente, máx = pendiente, entero ≥ 0). Botón confirmar arma `recepciones` (solo líneas con cantidad > 0) y llama `recibirCompra`; al `ok`, cierra y `router.refresh()`. Usa el `Modal` compartido.

- [ ] **Step 4: Link "Compras" en el Sidebar**

```tsx
{ href: '/admin/compras', icon: '📦', label: 'Compras' },
```

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los archivos nuevos sin errores. (Visual deferido — migración no aplicada.)

- [ ] **Step 6: Commit**

```bash
git add app/admin/compras/page.tsx app/admin/compras/ComprasClient.tsx app/admin/compras/\[id\]/ app/admin/compras/compras.module.css components/admin/Sidebar.tsx
git commit -m "feat(compras): listado, editor y modal de recepcion"
```

---

### Task 6: Reorden

**Files:**
- Create: `app/admin/compras/reorden/page.tsx`
- Create: `app/admin/compras/reorden/ReordenPanel.tsx`

**Interfaces:**
- Consumes: `obtenerReorden`, `crearOrdenDesdeReorden`, `LineaCompraInput` de `../actions`; tipos `ReordenLinea`, `Cliente`; `formatPrice`.
- Produces: la ruta `/admin/compras/reorden`.

- [ ] **Step 1: `page.tsx` (server)**

Llama `obtenerReorden()` y carga los proveedores (`clientes` con `es_proveedor=true and activo`); pasa a `ReordenPanel`. (Enlaza a esta ruta desde `ComprasClient` con un botón "Reorden".)

- [ ] **Step 2: `ReordenPanel.tsx` (client)**

Tabla de `ReordenLinea` con: descripción, stock actual, stock mínimo, cantidad sugerida (editable), costo, y un checkbox por fila. Selector de proveedor + botón *Crear orden de compra* que, con las filas marcadas, arma `LineaCompraInput[]` (`producto_id`, `variante_id`, `descripcion`, `cantidad_ordenada` = cantidad sugerida editada, `costo_unitario` = costo actual ?? 0) y llama `crearOrdenDesdeReorden(lineas, proveedorId)`; al `ok`, `router.push('/admin/compras/'+id)`. Si no hay filas bajo mínimo, muestra un vacío amable. Estilo Merlin (puede reusar `compras.module.css`).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/admin/compras/reorden/
git commit -m "feat(compras): panel de reorden por stock minimo"
```

---

### Task 7: Orden de compra imprimible

**Files:**
- Create: `app/admin/compras/[id]/orden/page.tsx`
- Create: `app/admin/compras/[id]/orden/CompraOrdenView.tsx`
- Create: `app/admin/compras/[id]/orden/HojaOrdenCompra.tsx`
- Create: `app/admin/compras/[id]/orden/orden.module.css`

**Interfaces:**
- Consumes: `obtenerCompra`; tipos `CompraConDatos`; `formatPrice`; `toConfigMap` (datos de empresa). Patrón: `app/admin/pos/documento/[id]/{page.tsx,DocumentoHoja.tsx}` y `documento.module.css` (`.btnToolbar`, `@media print`).
- Produces: la ruta `/admin/compras/[id]/orden`.

- [ ] **Step 1: `page.tsx` (server)**

`obtenerCompra(id)` + config de empresa (mira `app/admin/pos/documento/[id]/page.tsx` para qué claves de empresa/logo se leen). Pasa a `CompraOrdenView`.

- [ ] **Step 2: `CompraOrdenView.tsx` (client) + `HojaOrdenCompra.tsx` + css**

`CompraOrdenView`: barra (no imprime) con botón *Imprimir* (`window.print()`) usando `.btnToolbar` (no `btnMerlinPrimary` suelto). `@media print` oculta la barra. `HojaOrdenCompra`: hoja carta con datos de empresa y proveedor, número de orden, fecha, tabla de líneas (descripción, cantidad, costo unitario, importe), y total (en la moneda de la compra, con nota de la tasa si USD). Fondo blanco/tinta fija (no tema oscuro), como `.hojaCarta`. Dinero con `formatPrice` para L.; para USD mostrar el símbolo y el monto (importe = cantidad × costo_unitario en la moneda de la compra; el total en L. es `compra.total`). Copia a `orden.module.css` lo que necesites de `documento.module.css` (no importes ese módulo).

- [ ] **Step 3: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint sin errores (el warning de `<img>` del logo es aceptable con `// eslint-disable-next-line @next/next/no-img-element`).

- [ ] **Step 4: Commit**

```bash
git add app/admin/compras/\[id\]/orden/
git commit -m "feat(compras): orden de compra imprimible"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/compras`).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados (los de `coverage/` son ruido preexistente gitignored).
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar la migración): panel unificado de clientes/proveedores (filtro + roles + campos de proveedor); un contacto marcado como proveedor aparece en el select de compras; compra directa (crear + recibir) que sube stock y actualiza costo; orden → recepción parcial → recibida; anular (revierte stock); reorden → crear orden; orden imprimible.

## Entrega

- El usuario aplica `supabase/migrations/2026-08-08-pos-p4a-compras.sql` en el SQL Editor y corre `supabase/smoke-pos-p4a.sql` (espera "Success: migracion POS P4a OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P4a desplegado (y la descomposición P4a-P4d).
