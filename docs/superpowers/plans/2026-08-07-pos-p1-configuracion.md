# POS P1 — Configuración, catálogos, costeo y kardex — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cimientos del POS: perfiles Empresa/Facturador con CAIs, clientes con RTN único, canal/ISV/costo/precio-revendedor en productos y variantes, kardex append-only con costeo promedio/último, y regla de no-eliminación.

**Architecture:** dos migraciones SQL (catálogos y RPCs de kardex); lógica pura nueva en `lib/pos/` (fiscal) y `lib/store/costeo.ts` (dinero de inventario) con tests; el kardex se alimenta desde las RPCs existentes (`crear_pedido`, `cambiar_estado_pedido`), una RPC nueva (`registrar_entrada`) y los imports de Excel (el parse calcula diffs de stock como movimientos y la RPC de import los aplica atómicamente). Spec: `docs/superpowers/specs/2026-08-07-pos-p1-configuracion-catalogos-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (plpgsql/RPC/RLS), Zod no requerido aquí, Vitest, tokens Merlin.

## Global Constraints

- Español en UI/commits; moneda `formatPrice()`; lógica con peso en `lib/` puro con tests.
- Correlativo SAR: `NNN-NNN-NN-NNNNNNNN` (16 dígitos; establecimiento 000 = matriz; tipo 01 = Factura).
- RTN: 14 dígitos numéricos. RTN único en clientes (índice único parcial).
- Costeo: `promedio` (ponderado, redondeo 4 decimales) o `ultimo`; aplica POR VARIANTE (herencia del padre para costo/precio_revendedor igual que el precio). Las VENTAS nunca cambian el costo; solo entradas con costo.
- Kardex `movimientos_inventario` es **append-only** (nunca update/delete).
- Regla de integridad: producto/variante con historial (pedido_items o movimientos) NO se elimina — error claro "desactívalo".
- Alertas CAI: `DIAS_ALERTA_CAI = 30`, `PORCENTAJE_ALERTA_RANGO = 0.10` (constantes exportadas).
- Estilos: tokens Merlin de `app/merlin.css` (no hardcodear valores con token).
- **Ambas migraciones se aplican en el SQL Editor ANTES del push/merge**; smoke SQL en la entrega; confirmar con el usuario antes de fusionar. Rama `feature/pos-p1-configuracion`.

---

## Fase 1 — Base de datos

### Task 1: Migración A — tablas y columnas de catálogos

**Files:**
- Create: `supabase/migrations/2026-08-07-pos-p1-catalogos.sql`
- Modify: `supabase/schema.sql` (reflejar tablas/columnas nuevas)

**Interfaces:**
- Produces: tablas `clientes`, `cai_autorizaciones`, `movimientos_inventario`; columnas nuevas en `productos` (`canal`, `isv`, `costo`, `precio_revendedor`, `stock_minimo`) y `producto_variantes` (`costo`, `precio_revendedor`). Consumidas por todas las tareas siguientes.

- [ ] **Step 1: Escribir la migración** (idempotente, patrón del repo):

```sql
-- POS P1: clientes, CAIs, kardex y campos de catálogo.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

create table if not exists clientes (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  rtn                   text,
  identidad             text,
  tipo_cliente          text not null default 'final' check (tipo_cliente in ('final','revendedor')),
  exonerado             boolean not null default false,
  constancia_exonerado  text,
  registro_sag          text,
  direccion             text,
  telefono              text,
  correo                text,
  notas                 text,
  activo                boolean not null default true,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create unique index if not exists clientes_rtn_unico on clientes (rtn) where rtn is not null;
drop trigger if exists clientes_updated_at on clientes;
create trigger clientes_updated_at before update on clientes
  for each row execute function update_updated_at();
alter table clientes enable row level security;
drop policy if exists "admin_all_clientes" on clientes;
create policy "admin_all_clientes" on clientes for all using (auth.role() = 'authenticated');

create table if not exists cai_autorizaciones (
  id                 uuid primary key default gen_random_uuid(),
  cai                text not null,
  establecimiento    text not null default '000' check (establecimiento ~ '^[0-9]{3}$'),
  punto_emision      text not null default '001' check (punto_emision ~ '^[0-9]{3}$'),
  tipo_documento     text not null default '01' check (tipo_documento ~ '^[0-9]{2}$'),
  rango_desde        integer not null check (rango_desde >= 1),
  rango_hasta        integer not null,
  correlativo_actual integer not null,
  fecha_limite       date not null,
  activo             boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  check (rango_hasta >= rango_desde),
  check (correlativo_actual >= rango_desde - 1 and correlativo_actual <= rango_hasta)
);
create unique index if not exists cai_activo_unico
  on cai_autorizaciones (establecimiento, punto_emision, tipo_documento) where activo = true;
drop trigger if exists cai_autorizaciones_updated_at on cai_autorizaciones;
create trigger cai_autorizaciones_updated_at before update on cai_autorizaciones
  for each row execute function update_updated_at();
alter table cai_autorizaciones enable row level security;
drop policy if exists "admin_all_cai" on cai_autorizaciones;
create policy "admin_all_cai" on cai_autorizaciones for all using (auth.role() = 'authenticated');

create table if not exists movimientos_inventario (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references productos(id) on delete restrict,
  variante_id      uuid references producto_variantes(id) on delete restrict,
  tipo             text not null check (tipo in ('entrada','ajuste','venta_web','reposicion_cancelacion','venta_pos','devolucion','compra')),
  cantidad         integer not null check (cantidad <> 0),
  costo_unitario   numeric check (costo_unitario is null or costo_unitario >= 0),
  costo_resultante numeric,
  referencia       text,
  usuario          text,
  notas            text,
  created_at       timestamptz default now()
);
create index if not exists movimientos_producto_idx on movimientos_inventario (producto_id, created_at desc);
alter table movimientos_inventario enable row level security;
drop policy if exists "admin_select_movimientos" on movimientos_inventario;
create policy "admin_select_movimientos" on movimientos_inventario for select using (auth.role() = 'authenticated');
drop policy if exists "admin_insert_movimientos" on movimientos_inventario;
create policy "admin_insert_movimientos" on movimientos_inventario for insert with check (auth.role() = 'authenticated');
-- Sin políticas de update/delete: el kardex es append-only.

alter table productos add column if not exists canal text not null default 'ambas'
  check (canal in ('tienda','mostrador','ambas'));
alter table productos add column if not exists isv text not null default '15'
  check (isv in ('15','18','exento'));
alter table productos add column if not exists costo numeric check (costo is null or costo >= 0);
alter table productos add column if not exists precio_revendedor numeric
  check (precio_revendedor is null or precio_revendedor > 0);
alter table productos add column if not exists stock_minimo integer
  check (stock_minimo is null or stock_minimo >= 0);
alter table producto_variantes add column if not exists costo numeric
  check (costo is null or costo >= 0);
alter table producto_variantes add column if not exists precio_revendedor numeric
  check (precio_revendedor is null or precio_revendedor > 0);
```

- [ ] **Step 2: Reflejar en `supabase/schema.sql`** las 3 tablas (antes de sus referencias — `movimientos_inventario` va después de `producto_variantes`), las columnas nuevas en `productos`/`producto_variantes`, triggers y políticas, con el estilo del archivo.
- [ ] **Step 3: Verificación por lectura** (DDL ordenado, checks, índices parciales, append-only sin políticas de update/delete).
- [ ] **Step 4: Commit** — `git add supabase/ && git commit -m "feat(pos): tablas de clientes, CAIs y kardex con campos de catalogo"`

---

### Task 2: Migración B — RPCs de kardex y guardas de integridad

**Files:**
- Create: `supabase/migrations/2026-08-07-pos-p1-kardex-rpcs.sql`

**Interfaces:**
- Consumes: tablas de Task 1; funciones existentes `crear_pedido`, `cambiar_estado_pedido`, `sync_producto_variantes`, `importar_productos_variantes` (leer sus versiones vigentes en `supabase/migrations/2026-08-04-producto-variantes.sql` y `2026-08-06-cambiar-estado-pedido.sql` — esta migración las reemplaza con `create or replace` copiando el cuerpo vigente + los bloques nuevos indicados).
- Produces: `registrar_entrada(p_producto_id uuid, p_variante_id uuid, p_cantidad integer, p_costo numeric, p_referencia text, p_usuario text, p_notas text) returns numeric` (devuelve el costo resultante); `importar_productos_variantes(p_productos jsonb, p_variantes jsonb, p_movimientos jsonb)` (firma AMPLIADA — la ruta de Task 10 la usa); `crear_pedido`/`cambiar_estado_pedido` insertando movimientos; `sync_producto_variantes` con guarda de historial. Función interna `aplicar_costeo(...)`.

- [ ] **Step 1: Escribir la migración.** Contenido (las funciones existentes se re-crean con su cuerpo VIGENTE — cópialo del repo — más los bloques marcados `-- [P1]`):

```sql
-- POS P1: kardex en las RPCs. Aplicar DESPUÉS de 2026-08-07-pos-p1-catalogos.sql.

-- Costeo interno: devuelve el nuevo costo según el método configurado.
create or replace function aplicar_costeo(
  p_stock_actual integer, p_costo_actual numeric, p_cantidad integer, p_costo_entrada numeric
) returns numeric language plpgsql as $$
declare v_metodo text;
begin
  select value into v_metodo from configuracion where key = 'metodo_costeo';
  if p_costo_entrada is null then return p_costo_actual; end if;
  if coalesce(v_metodo, 'promedio') = 'ultimo' then return round(p_costo_entrada, 4); end if;
  if p_stock_actual is null or p_stock_actual <= 0 or p_costo_actual is null then
    return round(p_costo_entrada, 4);
  end if;
  return round(((p_stock_actual * p_costo_actual) + (p_cantidad * p_costo_entrada))
               / (p_stock_actual + p_cantidad), 4);
end; $$;

-- Entrada/ajuste manual de stock con costeo, atómica.
create or replace function registrar_entrada(
  p_producto_id uuid, p_variante_id uuid, p_cantidad integer, p_costo numeric,
  p_referencia text, p_usuario text, p_notas text
) returns numeric
language plpgsql security invoker set search_path = public as $$
declare
  v_stock integer; v_costo numeric; v_nuevo_costo numeric; v_tipo text;
begin
  if p_cantidad = 0 then raise exception 'La cantidad no puede ser 0'; end if;
  if p_costo is not null and p_cantidad < 0 then
    raise exception 'Una salida/ajuste negativo no lleva costo';
  end if;
  if p_variante_id is not null then
    select pv.stock, pv.costo into v_stock, v_costo
      from producto_variantes pv
      where pv.id = p_variante_id and pv.producto_id = p_producto_id for update;
    if not found then raise exception 'Variante no encontrada'; end if;
  else
    select p.stock, p.costo into v_stock, v_costo
      from productos p where p.id = p_producto_id for update;
    if not found then raise exception 'Producto no encontrado'; end if;
  end if;

  v_tipo := case when p_costo is not null and p_cantidad > 0 then 'entrada' else 'ajuste' end;
  v_nuevo_costo := case when v_tipo = 'entrada'
    then aplicar_costeo(v_stock, v_costo, p_cantidad, p_costo) else v_costo end;

  if p_variante_id is not null then
    update producto_variantes set
      stock = coalesce(stock, 0) + p_cantidad,
      costo = v_nuevo_costo
      where producto_variantes.id = p_variante_id;
  else
    update productos set
      stock = coalesce(stock, 0) + p_cantidad,
      costo = v_nuevo_costo
      where productos.id = p_producto_id;
  end if;

  insert into movimientos_inventario
    (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario, notas)
  values
    (p_producto_id, p_variante_id, v_tipo, p_cantidad, p_costo, v_nuevo_costo, p_referencia, p_usuario, p_notas);

  return v_nuevo_costo;
end; $$;
grant execute on function registrar_entrada(uuid, uuid, integer, numeric, text, text, text) to authenticated;
revoke execute on function registrar_entrada(uuid, uuid, integer, numeric, text, text, text) from public, anon;
```

Además, en el MISMO archivo:

1. **`crear_pedido`** (copiar cuerpo vigente y añadir al FINAL, tras el insert de `pedido_items`):

```sql
  -- [P1] Kardex: una salida por cada item que descontó stock.
  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
  select (item->>'producto_id')::uuid,
         nullif(item->>'variante_id','')::uuid,
         'venta_web',
         -(item->>'cantidad')::integer,
         coalesce(pv.costo, p.costo),
         'pedido:' || v_id
  from jsonb_array_elements(p_items) as item
  left join producto_variantes pv on pv.id = nullif(item->>'variante_id','')::uuid
  join productos p on p.id = (item->>'producto_id')::uuid
  where (case when nullif(item->>'variante_id','') is not null then pv.stock else p.stock end) is not null;
```

2. **`cambiar_estado_pedido`** (copiar cuerpo vigente; dentro del branch de REPONER, tras el loop, y del branch de RE-DESCONTAR, tras el loop, añadir respectivamente):

```sql
  -- [P1] Kardex reposición (mismos filtros del loop: borrados/ilimitados/huérfanas fuera)
  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
  select pi.producto_id, pi.variante_id, 'reposicion_cancelacion', pi.cantidad,
         coalesce(pv.costo, p.costo), 'pedido:' || p_pedido_id
  from pedido_items pi
  left join producto_variantes pv on pv.id = pi.variante_id
  left join productos p on p.id = pi.producto_id
  where pi.pedido_id = p_pedido_id
    and ((pi.variante_id is not null and pv.stock is not null)
      or (pi.variante_id is null and pi.variante_nombre is null and p.stock is not null));
```

(y el gemelo con `'venta_web'` y `-pi.cantidad` en el branch de re-descuento).

3. **`sync_producto_variantes`** (copiar cuerpo vigente; ANTES del `delete` de ausentes):

```sql
  -- [P1] Guarda de integridad: variantes con historial no se eliminan.
  perform 1
  from producto_variantes v
  where v.producto_id = p_producto_id
    and v.id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p_variantes,'[]'::jsonb)) x where x->>'id' is not null)
    and (exists (select 1 from pedido_items pi where pi.variante_id = v.id)
      or exists (select 1 from movimientos_inventario m where m.variante_id = v.id))
  limit 1;
  if found then
    raise exception 'No se puede eliminar una variante con historial de ventas o inventario; desactívala en su lugar.';
  end if;
```

4. **`importar_productos_variantes`**: re-crear con firma `(p_productos jsonb, p_variantes jsonb, p_movimientos jsonb default '[]'::jsonb)` — cuerpo vigente + al final:

```sql
  -- [P1] Movimientos calculados por el parse (diffs de stock del import).
  declare v_mov jsonb; v_nuevo numeric;
  -- (en plpgsql: mover las declaraciones al bloque declare superior)
  for v_mov in select * from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) loop
    if (v_mov->>'tipo') = 'entrada' then
      v_nuevo := aplicar_costeo(
        (v_mov->>'stock_anterior')::integer,
        (select coalesce(pv.costo, p.costo) from productos p
           left join producto_variantes pv on pv.id = nullif(v_mov->>'variante_id','')::uuid
           where p.id = (v_mov->>'producto_id')::uuid),
        (v_mov->>'cantidad')::integer,
        (v_mov->>'costo_unitario')::numeric);
      if nullif(v_mov->>'variante_id','') is not null then
        update producto_variantes set costo = v_nuevo where id = (v_mov->>'variante_id')::uuid;
      else
        update productos set costo = v_nuevo where id = (v_mov->>'producto_id')::uuid;
      end if;
    else
      v_nuevo := null;
    end if;
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia)
    values ((v_mov->>'producto_id')::uuid, nullif(v_mov->>'variante_id','')::uuid,
            v_mov->>'tipo', (v_mov->>'cantidad')::integer,
            (v_mov->>'costo_unitario')::numeric, v_nuevo, v_mov->>'referencia');
  end loop;
```

y `grant execute` de la firma nueva a `authenticated` (+ `revoke` de public/anon; la firma vieja de 2 args se elimina con `drop function if exists importar_productos_variantes(jsonb, jsonb);`).

- [ ] **Step 2: Verificación por lectura** — variables declaradas en el `declare` correcto, alias en todas las referencias, formatos de mensajes en español plano (estas no usan códigos HS_*), grants/revokes.
- [ ] **Step 3: Commit** — `git commit -m "feat(pos): kardex en RPCs, registrar_entrada y guardas de historial"`

---

## Fase 2 — Lógica pura

### Task 3: Tipos + `lib/pos/fiscal.ts` (RTN, correlativo, estado de CAI)

**Files:**
- Modify: `types/index.ts`
- Create: `lib/pos/fiscal.ts`
- Test: `lib/pos/tests/fiscal.test.ts` (crear; Vitest ya recoge `lib/**` — verificar el include del config y ajustarlo si solo cubre lib/store)

**Interfaces:**
- Produces (tipos):

```ts
export interface Cliente {
  id: string; nombre: string; rtn: string | null; identidad: string | null
  tipo_cliente: 'final' | 'revendedor'; exonerado: boolean
  constancia_exonerado: string | null; registro_sag: string | null
  direccion: string | null; telefono: string | null; correo: string | null
  notas: string | null; activo: boolean; created_at: string; updated_at: string
}
export interface CaiAutorizacion {
  id: string; cai: string; establecimiento: string; punto_emision: string
  tipo_documento: string; rango_desde: number; rango_hasta: number
  correlativo_actual: number; fecha_limite: string; activo: boolean
  created_at: string; updated_at: string
}
// Producto gana: canal: 'tienda'|'mostrador'|'ambas'; isv: '15'|'18'|'exento';
//   costo: number | null; precio_revendedor: number | null; stock_minimo: number | null
// ProductoVariante y VarianteForm ganan: costo/precio_revendedor (number|null; en el form
//   se editan como en precio: vacío = hereda)
// ProductoForm gana: canal, isv, costo (number|null), precio_revendedor, stock_minimo
```

- Produces (funciones):

```ts
export const DIAS_ALERTA_CAI = 30
export const PORCENTAJE_ALERTA_RANGO = 0.10
export function validarRtn(rtn: string): string | null        // null = válido; string = error en español
export function formatearCorrelativo(cai: Pick<CaiAutorizacion,'establecimiento'|'punto_emision'|'tipo_documento'>, numero: number): string
export interface EstadoCai { vigente: boolean; diasParaVencer: number; restantes: number; alerta: string | null }
export function estadoCai(cai: CaiAutorizacion, hoy: Date): EstadoCai
```

- [ ] **Step 1: Tests que fallan** (`lib/pos/tests/fiscal.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { validarRtn, formatearCorrelativo, estadoCai, DIAS_ALERTA_CAI } from '../fiscal'
import type { CaiAutorizacion } from '@/types'

const cai = (over: Partial<CaiAutorizacion> = {}): CaiAutorizacion => ({
  id: 'c1', cai: 'ABC123-XYZ', establecimiento: '000', punto_emision: '001',
  tipo_documento: '01', rango_desde: 1, rango_hasta: 1000, correlativo_actual: 0,
  fecha_limite: '2026-12-31', activo: true, created_at: '', updated_at: '', ...over,
})

describe('validarRtn', () => {
  it('acepta 14 dígitos', () => expect(validarRtn('08011999123456')).toBeNull())
  it('rechaza longitud incorrecta', () => expect(validarRtn('0801')).toMatch(/14 dígitos/))
  it('rechaza no numéricos', () => expect(validarRtn('0801A999123456')).toMatch(/solo números/))
})

describe('formatearCorrelativo', () => {
  it('arma los 16 dígitos con guiones', () =>
    expect(formatearCorrelativo(cai(), 123)).toBe('000-001-01-00000123'))
})

describe('estadoCai', () => {
  const hoy = new Date('2026-08-07T12:00:00')
  it('vigente sin alertas', () => {
    const e = estadoCai(cai({ correlativo_actual: 100 }), hoy)
    expect(e).toMatchObject({ vigente: true, restantes: 900, alerta: null })
  })
  it('alerta por vencer (<= 30 días)', () => {
    const e = estadoCai(cai({ fecha_limite: '2026-08-20' }), hoy)
    expect(e.vigente).toBe(true)
    expect(e.alerta).toMatch(/vence/i)
  })
  it('alerta por rango (<= 10% restante)', () => {
    const e = estadoCai(cai({ correlativo_actual: 950 }), hoy)
    expect(e.alerta).toMatch(/agot/i)
  })
  it('vencido por fecha o rango agotado => no vigente', () => {
    expect(estadoCai(cai({ fecha_limite: '2026-08-01' }), hoy).vigente).toBe(false)
    expect(estadoCai(cai({ correlativo_actual: 1000 }), hoy).vigente).toBe(false)
  })
})
```

- [ ] **Step 2: RED** — `npx vitest run lib/pos/tests/fiscal.test.ts` falla (módulo inexistente).
- [ ] **Step 3: Implementar** `lib/pos/fiscal.ts`:

```ts
import type { CaiAutorizacion } from '@/types'

export const DIAS_ALERTA_CAI = 30
export const PORCENTAJE_ALERTA_RANGO = 0.10

export function validarRtn(rtn: string): string | null {
  const limpio = rtn.trim()
  if (!/^[0-9]+$/.test(limpio)) return 'El RTN debe contener solo números'
  if (limpio.length !== 14) return 'El RTN debe tener 14 dígitos'
  return null
}

export function formatearCorrelativo(
  cai: Pick<CaiAutorizacion, 'establecimiento' | 'punto_emision' | 'tipo_documento'>,
  numero: number,
): string {
  return `${cai.establecimiento}-${cai.punto_emision}-${cai.tipo_documento}-${String(numero).padStart(8, '0')}`
}

export interface EstadoCai {
  vigente: boolean
  diasParaVencer: number
  restantes: number
  alerta: string | null
}

export function estadoCai(cai: CaiAutorizacion, hoy: Date): EstadoCai {
  const limite = new Date(cai.fecha_limite + 'T23:59:59')
  const diasParaVencer = Math.floor((limite.getTime() - hoy.getTime()) / 86_400_000)
  const restantes = cai.rango_hasta - cai.correlativo_actual
  const total = cai.rango_hasta - cai.rango_desde + 1
  const vigente = diasParaVencer >= 0 && restantes > 0 && cai.activo
  let alerta: string | null = null
  if (!vigente) alerta = restantes <= 0 ? 'Rango agotado' : 'CAI vencido'
  else if (diasParaVencer <= DIAS_ALERTA_CAI) alerta = `El CAI vence en ${diasParaVencer} días`
  else if (restantes <= total * PORCENTAJE_ALERTA_RANGO) alerta = `El rango se está agotando: quedan ${restantes} números`
  return { vigente, diasParaVencer, restantes, alerta }
}
```

Añadir los tipos del bloque Interfaces a `types/index.ts` (incluidos los campos nuevos de `Producto`/`ProductoVariante`/`ProductoForm`/`VarianteForm`; los consumidores de `ProductoForm` que construyen forms ganan defaults `canal: 'ambas'`, `isv: '15'`, `costo: null`, `precio_revendedor: null`, `stock_minimo: null` para mantener tsc verde — solo defaults, sin UI).

- [ ] **Step 4: GREEN + suite + tsc** — el focused pasa; `npm test` completo verde; `npx tsc --noEmit` limpio.
- [ ] **Step 5: Commit** — `git commit -m "feat(pos): tipos de clientes/CAI y logica fiscal pura (RTN, correlativo, estado CAI)"`

---

### Task 4: `lib/store/costeo.ts` (costeo, precio por cliente, margen)

**Files:**
- Create: `lib/store/costeo.ts`
- Test: `lib/store/tests/costeo.test.ts`

**Interfaces:**
- Produces:

```ts
export type MetodoCosteo = 'promedio' | 'ultimo'
export function aplicarEntradaCosto(metodo: MetodoCosteo, stockActual: number | null, costoActual: number | null, cantidad: number, costoEntrada: number): number
export function precioParaCliente(tipoCliente: 'final' | 'revendedor', precio: number, precioRevendedor: number | null): number
export function margen(precio: number, costo: number | null): { ganancia: number; porcentaje: number } | null
```

(Espejo TS de `aplicar_costeo` SQL — misma matemática, mismos casos borde, para mostrar previews en UI sin ir a BD.)

- [ ] **Step 1: Tests que fallan**:

```ts
import { describe, it, expect } from 'vitest'
import { aplicarEntradaCosto, precioParaCliente, margen } from '../costeo'

describe('aplicarEntradaCosto', () => {
  it('promedio ponderado', () =>
    expect(aplicarEntradaCosto('promedio', 10, 100, 10, 200)).toBe(150))
  it('promedio redondea a 4 decimales', () =>
    expect(aplicarEntradaCosto('promedio', 3, 10, 1, 11)).toBe(10.25))
  it('promedio sin stock/costo previo toma el costo de entrada', () => {
    expect(aplicarEntradaCosto('promedio', null, null, 5, 80)).toBe(80)
    expect(aplicarEntradaCosto('promedio', 0, 100, 5, 80)).toBe(80)
  })
  it('ultimo siempre toma el costo de entrada', () =>
    expect(aplicarEntradaCosto('ultimo', 10, 100, 1, 75.5)).toBe(75.5))
})

describe('precioParaCliente', () => {
  it('revendedor usa su precio si existe', () =>
    expect(precioParaCliente('revendedor', 100, 80)).toBe(80))
  it('revendedor sin precio propio usa el normal', () =>
    expect(precioParaCliente('revendedor', 100, null)).toBe(100))
  it('final siempre el normal', () =>
    expect(precioParaCliente('final', 100, 80)).toBe(100))
})

describe('margen', () => {
  it('calcula ganancia y porcentaje', () =>
    expect(margen(150, 100)).toEqual({ ganancia: 50, porcentaje: 50 }))
  it('sin costo devuelve null', () => expect(margen(150, null)).toBeNull())
})
```

- [ ] **Step 2: RED.** — `npx vitest run lib/store/tests/costeo.test.ts`
- [ ] **Step 3: Implementar**:

```ts
export type MetodoCosteo = 'promedio' | 'ultimo'

// Espejo exacto de la función SQL aplicar_costeo (misma matemática y casos borde).
export function aplicarEntradaCosto(
  metodo: MetodoCosteo,
  stockActual: number | null,
  costoActual: number | null,
  cantidad: number,
  costoEntrada: number,
): number {
  if (metodo === 'ultimo') return round4(costoEntrada)
  if (stockActual == null || stockActual <= 0 || costoActual == null) return round4(costoEntrada)
  return round4(((stockActual * costoActual) + (cantidad * costoEntrada)) / (stockActual + cantidad))
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

export function precioParaCliente(
  tipoCliente: 'final' | 'revendedor',
  precio: number,
  precioRevendedor: number | null,
): number {
  return tipoCliente === 'revendedor' && precioRevendedor != null ? precioRevendedor : precio
}

export function margen(precio: number, costo: number | null): { ganancia: number; porcentaje: number } | null {
  if (costo == null) return null
  const ganancia = round4(precio - costo)
  const porcentaje = costo === 0 ? 100 : round4((ganancia / costo) * 100)
  return { ganancia, porcentaje }
}
```

- [ ] **Step 4: GREEN + suite.** — `npm test`
- [ ] **Step 5: Commit** — `git commit -m "feat(pos): logica pura de costeo, precio por tipo de cliente y margen"`

---

## Fase 3 — Admin

### Task 5: Módulo de clientes

**Files:**
- Create: `app/admin/clientes/page.tsx`, `app/admin/clientes/ClientesClient.tsx`, `app/admin/clientes/actions.ts`, `app/admin/clientes/clientes.module.css`
- Modify: `components/admin/Sidebar.tsx` (entrada "Clientes")

**Interfaces:**
- Consumes: `Cliente`, `validarRtn` (Task 3).
- Produces: `createCliente(form)/updateCliente(id, form)/toggleClienteActivo(id, activo)/deleteCliente(id)` con `ClienteForm = Omit<Cliente,'id'|'activo'|'created_at'|'updated_at'>`-equivalente (strings del form; rtn vacío → null).

Trabajo: página server que carga clientes (`order('nombre')`), client con búsqueda local por nombre/RTN, tabla (nombre, RTN, tipo con badge Final/Revendedor, exonerado, teléfono, activo), form en el Modal existente (`components/admin/Modal`) con: `validarRtn` en el action ANTES de escribir; error de RTN duplicado detectado por código Postgres `23505` sobre `clientes_rtn_unico` → consultar el nombre del dueño y devolver `` `El RTN ya pertenece a "${nombre}"` ``; `deleteCliente` permite eliminar SOLO si no hay referencias (en P1 no existen aún documentos de venta — dejar el guard listo consultando `movimientos_inventario`? NO: los movimientos no referencian clientes; el guard real llega con P2 — por ahora eliminar permitido con `confirm`, y "Desactivar" como acción primaria en la UI). Estilos con tokens Merlin (patrón de productos.module.css).

- [ ] Step 1: actions con validaciones (código completo en el estilo de `app/admin/productos/actions.ts`). Step 2: página + client + css. Step 3: Sidebar. Step 4: `npm test` + `npx tsc --noEmit` + `npm run lint`. Step 5: Commit — `git commit -m "feat(pos): modulo de clientes con RTN unico"`

---

### Task 6: Configuración — secciones Empresa y Facturador + CRUD de CAIs

**Files:**
- Modify: `app/admin/configuracion/ConfigClient.tsx` (+`config.module.css` si hace falta)
- Create: `app/admin/configuracion/CaisSection.tsx`, `app/admin/configuracion/caiActions.ts`
- Modify: `app/admin/configuracion/page.tsx` (cargar también `cai_autorizaciones`)

**Interfaces:**
- Consumes: `CaiAutorizacion`, `estadoCai`, `formatearCorrelativo`, `validarRtn` (Task 3); el patrón `set(key)`/`upsert configuracion` existente de ConfigClient.
- Produces: claves de configuración del spec (verbatim): `empresa_nombre_comercial`, `empresa_logo_url` (reutiliza `logo_url` existente — NO crear clave duplicada; el spec manda reutilizar), `empresa_icono_url`, `empresa_telefono`, `empresa_correo` (reutiliza `email_contacto`), `empresa_direccion` (reutiliza `direccion`), `empresa_terminos_cotizacion`, `empresa_terminos_factura`, `cotizacion_estilo` (default `ejecutivo`), `moneda_secundaria_activa`, `tasa_cambio_usd`, `fiscal_rtn`, `fiscal_razon_social`, `fiscal_nombre_comercial`, `fiscal_domicilio`, `fiscal_telefono`, `fiscal_leyenda` (default "LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA"), `metodo_costeo` (default `promedio`). Acciones CAI: `createCai/updateCai/toggleCaiActivo` (correlativo_actual se fija a `rango_desde - 1` SOLO al crear; nunca editable).

Trabajo: reorganizar ConfigClient en secciones **Empresa** (nombre comercial, ícono, términos, estilo de cotización [select con solo `ejecutivo` por ahora], USD activa + tasa), **Facturador** (RTN con `validarRtn`, razón social, nombre comercial fiscal, domicilio, teléfono, leyenda, `metodo_costeo` select con nota "el cambio aplica a entradas futuras") y **Tienda** (todo lo existente, intacto). `CaisSection` dentro de Facturador: tabla (CAI, identificador `000-001-01`, rango, correlativo actual formateado con `formatearCorrelativo`, fecha límite, badge de `estadoCai` — Vigente / alerta amarilla / Vencido rojo con la tríada Merlin), alta/edición en Modal con validaciones (solapamiento lo bloquea el índice único → traducir el error 23505 a "Ya existe un CAI activo para ese establecimiento/punto/tipo").

- [ ] Steps: implementar → `npm test` + tsc + lint → commit `feat(pos): perfiles de empresa y facturador con CRUD de CAIs`

---

### Task 7: Formulario de producto — campos nuevos y entrada de stock con costo

**Files:**
- Modify: `components/admin/ProductoFields.tsx`, `app/admin/productos/productos.module.css`, `app/admin/productos/actions.ts`, `app/admin/productos/ProductosClient.tsx`, `app/admin/productos/CarruselClient.tsx` (solo si construyen forms — defaults ya puestos en Task 3)

**Interfaces:**
- Consumes: campos nuevos de `ProductoForm`/`VarianteForm` (Task 3), `margen`/`aplicarEntradaCosto` (Task 4), RPC `registrar_entrada` (Task 2).
- Produces: `createProducto/updateProducto` persisten `canal/isv/precio_revendedor/stock_minimo`; el flujo de stock pasa por `registrar_entrada`.

Trabajo:
1. `ProductoFields` modo completo: select **Canal** (Tienda/Mostrador/Ambas), select **ISV** (15%/18%/Exento), input **Precio revendedor** (vacío = no aplica), input **Stock mínimo**; en variantes: columnas **Costo** y **P. revendedor** (vacío = hereda) en la fila y en los encabezados de la Task 14 de Merlin.
2. **Costo**: mostrar como solo-lectura con el margen calculado (`margen(precio, costo)`) cuando el producto/variante tiene movimientos; editable como "costo inicial" únicamente si no hay historial (el server action lo verifica: si `movimientos_inventario` tiene filas del producto → ignora cambios de costo directo y devuelve aviso).
3. **Cambio de stock desde el form:** `updateProducto` deja de escribir `stock` directo; calcula `delta = form.stock - stockActual` y si `delta ≠ 0` llama `registrar_entrada(producto, null, delta, form.costoEntrada ?? null, 'manual', <email usuario>, null)`. El form gana el campo condicional "Costo de esta entrada (opcional)" visible cuando el usuario aumenta el stock. Variantes: mismo tratamiento vía delta contra la variante en `syncVariantes` (aumentos con costo de entrada opcional por fila — un solo campo de costo de entrada por fila de variante junto a stock).
4. `deleteProducto`: antes de eliminar, verifica `pedido_items`/`movimientos_inventario` → si hay historial devuelve `{ error: 'Este producto tiene historial; desactívalo en su lugar.' }`.
5. Listado ProductosClient: badge de canal y punto rojo cuando `stock efectivo <= stock_minimo` (si definido).

- [ ] Steps: implementar → suite/tsc/lint → commit `feat(pos): canal, ISV, costo y precio revendedor en productos con entradas al kardex`

---

### Task 8: Tienda pública — filtro de canal

**Files:**
- Modify: `app/(store)/page.tsx`, `app/(store)/producto/[slug]/page.tsx`

Trabajo: ambas queries públicas añaden `.in('canal', ['tienda','ambas'])`. La página de producto individual: si el producto es solo-mostrador → `notFound()` (mismo tratamiento que inactivo). Verificación: suite + tsc + arranque dev (los productos existentes tienen default `ambas` → cero cambio visible).

- [ ] Steps: implementar → verificar → commit `feat(pos): la tienda solo muestra productos de canal tienda/ambas`

---

## Fase 4 — Excel

### Task 9: Parsers de Excel — columnas nuevas y movimientos de stock (TDD)

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts`, `lib/store/externalImport.ts`
- Test: `lib/store/tests/inventoryRoundtrip.test.ts`, `lib/store/tests/externalImport.test.ts`

**Interfaces:**
- Produces:

```ts
export interface MovimientoImport {
  producto_id: string | null   // null => se resuelve al crear (creates usan índice en la ruta)
  productoSlugTemp?: string    // liga para creates (round-trip usa posición; externo usa sku — ver ruta)
  variante_id: string | null
  tipo: 'entrada' | 'ajuste'
  cantidad: number             // ≠ 0 (delta de stock)
  costo_unitario: number | null
  stock_anterior: number | null
  referencia: string
}
// ParseResult y ExternalParseResult ganan: movimientos: MovimientoImport[]
```

Reglas: COLUMNAS del round-trip ganan `canal`, `isv`, `precio_revendedor`, `stock_minimo`, `costo_entrada` (Actualizar/Nuevos) y la pestaña Variantes gana `precio_revendedor` y `costo_entrada` (el costo NO se exporta como editable: se exporta col. `costo` solo-lectura informativa que el import IGNORA); todo diff de stock genera un `MovimientoImport`: aumento con `costo_entrada` → `entrada`; sin costo o disminución → `ajuste` (validación: costo_entrada en fila sin aumento de stock = error de fila). Altas (Nuevos/variantes nuevas) con stock inicial > 0 generan `entrada` (con costo si viene) o `ajuste`. Import externo: mapeo opcional `costo` (por fila de variante o grupo plano) con la misma regla. `canal`/`isv` validados contra sus valores permitidos; `precio_revendedor > 0`; vacío = no cambia (updates) / null (altas).

- [ ] Step 1: tests que fallan (siguiendo el estilo de los existentes: diffs → movimientos con stock_anterior correcto; costo sin aumento → error; canal inválido → error; herencia en variantes). Step 2: RED. Step 3: implementar. Step 4: `npm test` completo. Step 5: commit `feat(pos): parsers de Excel con canal/ISV/costos y movimientos de kardex`

---

### Task 10: Rutas de Excel — aplicar movimientos vía RPC ampliada

**Files:**
- Modify: `app/api/inventario/export/route.ts`, `app/api/inventario/import/route.ts`, `app/api/inventario/plantilla/importar/route.ts`, `components/admin/ImportarPlantilla.tsx` (resumen)

Trabajo: export añade las columnas nuevas (con `costo` informativo); imports pasan `p_movimientos` a `importar_productos_variantes` (resolviendo `producto_id` de creates con los uuid generados — mismo mapa sku→id existente; el parse liga los movimientos de creates por la MISMA posición/sku que ya usa para variantes) con `referencia: 'import:<nombreArchivo>'`; INSTRUCCIONES actualizadas (costo_entrada: "solo al aumentar stock; vacío = ajuste sin costo"); resumen del cliente muestra "N movimientos de inventario registrados".

- [ ] Steps: implementar → suite/tsc/lint/build → commit `feat(pos): rutas de Excel aplican movimientos de kardex atomicamente`

---

## Cierre

### Task 11: Verificación integral y entrega

- [ ] **Step 1:** `npm test` + `npx tsc --noEmit` + `npm run lint` (0 errores) + `npm run build` — resultados reales.
- [ ] **Step 2:** Revisión final whole-branch (flujo del proyecto).
- [ ] **Step 3 (usuario):** aplicar AMBAS migraciones en el SQL Editor (catálogos primero, kardex después) + smoke SQL auto-limpiante que el controller entregará: (1) `registrar_entrada` entrada con costo → promedio correcto y movimiento insertado; (2) entrada con `metodo_costeo=ultimo`; (3) ajuste negativo sin costo → costo intacto; (4) `crear_pedido` genera movimiento `venta_web` con costo_resultante; (5) cancelar → `reposicion_cancelacion`; (6) RTN duplicado en clientes → error 23505; (7) variante con historial no se puede eliminar vía `sync_producto_variantes`.
- [ ] **Step 4:** Confirmar con el usuario la fusión a `main` (push = deploy); verificar READY en Vercel; borrar rama.
- [ ] **Step 5:** `CLAUDE.md`: bullet en Convenciones — "**Kardex y costeo:** el stock nunca se escribe directo; toda variación pasa por `registrar_entrada`/RPCs que insertan en `movimientos_inventario` (append-only). Costeo configurable (`metodo_costeo`); las ventas no cambian el costo." — commit `docs: kardex y costeo en convenciones`.
