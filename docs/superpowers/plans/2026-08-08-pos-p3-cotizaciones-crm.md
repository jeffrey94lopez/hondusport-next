# POS P3 — Cotizaciones CRM — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo de cotizaciones con tablero kanban de etapas configurables, ítems de catálogo y libres, PDF en 3 estilos, y conversión a venta reutilizando el POS fiscal.

**Architecture:** Cotizaciones = documentos mutables y no fiscales que comparten la matemática del POS (`lib/pos/desglose`, `precioLineaPos`) y no reservan stock. Nuevo módulo `/admin/cotizaciones` (kanban + editor + PDF) que **importa la lógica pura del POS pero no toca sus componentes**. La frontera de confianza (recálculo de totales releyendo precios de BD) vive en las Server Actions, igual que `emitirVenta`. Conversión a venta = navegar al POS con `?cotizacion=<id>`, precargar una pestaña y emitir con `emitir_documento`.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC), TypeScript, Vitest, CSS Modules, tokens Merlin (`app/merlin.css`).

## Global Constraints

- **Idioma:** UI, nombres de dominio y mensajes de commit en **español**. Moneda en **Lempiras**, siempre con `formatPrice()` (`lib/store/format`).
- **Frontera de confianza:** las Server Actions **releen precios de BD y recalculan totales** con `lib/pos/desglose`; nunca se confía en los importes que manda el cliente (patrón `emitirVenta` en `app/admin/pos/actions.ts`).
- **Lógica de negocio con peso va en `lib/` como funciones puras con test** (`lib/cotizaciones/`, tests en `lib/cotizaciones/tests/`). La matemática de totales se **reusa** de `lib/pos` (ya testeada), no se reimplementa.
- **No se tocan los componentes del POS** salvo la Task 8 (integración): se importa solo lógica pura del POS en el resto.
- **CSS Modules por componente**; estilos con **tokens Merlin** (`var(--...)`), nada hardcodeado que ya tenga token. Los botones `btnMerlinPrimary/Secondary/Tertiary` **no traen caja propia** (padding/display): componer siempre con una clase de módulo (lección P2.1). Los chips usan `btnMerlinChip`.
- **PDF = HTML + CSS de impresión**, sin librería de PDF (patrón `DocumentoHoja` del POS).
- **Migraciones idempotentes** (`if not exists`, seeds `on conflict do nothing`), **aplicadas por el usuario** en el SQL Editor **antes** del push.
- **Cliente de Supabase de servidor** (`lib/supabase-server`) en Server Components/Actions.
- **Tipo de resultado de acciones:** `type CotizacionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }` (espejo de `PosResult`).
- Al terminar: `npm test` + `npx tsc --noEmit` + `npm run lint` (los Server Actions/Components no están cubiertos por tests; se verifican con tsc + navegador).

---

### Task 1: Migración P3 (tablas, secuencia, RLS, seeds, config) + smoke SQL

**Files:**
- Create: `supabase/migrations/2026-08-08-pos-p3-cotizaciones.sql`
- Create: `supabase/smoke-pos-p3.sql`

**Interfaces:**
- Produces (tablas): `cotizacion_etapas(id, nombre, tipo, color, orden, activo, created_at, updated_at)`, `cotizaciones(id, numero, etapa_id, cliente_id, cliente_nombre, cliente_rtn, vendedor_id, descuento_global, validez_dias, valido_hasta, condiciones, notas, total, documento_id, created_at, updated_at)`, `cotizacion_items(id, cotizacion_id, producto_id, variante_id, descripcion, cantidad, precio_unitario, descuento, isv, orden)`.
- Produces (secuencia): `cotizacion_numero_seq`.
- Produces (config): claves `cotizacion_validez_dias`, `cotizacion_formato_default`, `cotizacion_condiciones_default`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-08-pos-p3-cotizaciones.sql`. Sigue el estilo de `2026-08-07-pos-p2-tablas.sql` (RLS con `do $$ ... exception when duplicate_object`, triggers `updated_at` con la función existente `update_updated_at`).

```sql
-- POS P3: cotizaciones CRM (kanban configurable, no fiscal, no reserva stock).

create table if not exists cotizacion_etapas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       text not null check (tipo in ('abierta','ganada','perdida')),
  color      text not null default '#c9a84c',
  orden      int not null default 0,
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create sequence if not exists cotizacion_numero_seq;

-- PostgREST no expone nextval directo; se envuelve en una función security definer
-- (la acción guardarCotizacion la llama vía rpc para asignar el número al crear).
create or replace function nextval_cotizacion()
returns bigint language sql security definer set search_path = public as $$
  select nextval('cotizacion_numero_seq');
$$;
revoke all on function nextval_cotizacion() from public, anon;
grant execute on function nextval_cotizacion() to authenticated;

create table if not exists cotizaciones (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  etapa_id         uuid not null references cotizacion_etapas(id) on delete restrict,
  cliente_id       uuid references clientes(id) on delete set null,
  cliente_nombre   text,
  cliente_rtn      text,
  vendedor_id      uuid references vendedores(id) on delete set null,
  descuento_global numeric(12,2) not null default 0 check (descuento_global >= 0),
  validez_dias     int not null default 15 check (validez_dias >= 0),
  valido_hasta     date not null,
  condiciones      text,
  notas            text,
  total            numeric(12,2) not null default 0,
  documento_id     uuid references documentos(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists cotizaciones_etapa_idx on cotizaciones (etapa_id);

create table if not exists cotizacion_items (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references cotizaciones(id) on delete cascade,
  producto_id    uuid references productos(id) on delete set null,
  variante_id    uuid references producto_variantes(id) on delete set null,
  descripcion    text not null,
  cantidad       numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  descuento      numeric(12,2) not null default 0 check (descuento >= 0),
  isv            text not null check (isv in ('15','18','exento')),
  orden          int not null default 0
);
create index if not exists cotizacion_items_cotizacion_idx on cotizacion_items (cotizacion_id);

-- RLS: todo es dato del admin (patrón de P1/P2)
alter table cotizacion_etapas enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
do $$ begin
  create policy cotizacion_etapas_admin on cotizacion_etapas for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy cotizaciones_admin on cotizaciones for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy cotizacion_items_admin on cotizacion_items for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

-- Triggers updated_at (update_updated_at ya existe en la BD)
drop trigger if exists cotizacion_etapas_updated_at on cotizacion_etapas;
create trigger cotizacion_etapas_updated_at before update on cotizacion_etapas
  for each row execute function update_updated_at();
drop trigger if exists cotizaciones_updated_at on cotizaciones;
create trigger cotizaciones_updated_at before update on cotizaciones
  for each row execute function update_updated_at();

-- Seeds de etapas (idempotentes por nombre)
insert into cotizacion_etapas (nombre, tipo, color, orden)
select v.nombre, v.tipo, v.color, v.orden
from (values
  ('Borrador','abierta','#8a8a8a',0),
  ('Enviada','abierta','#c9a84c',1),
  ('En negociación','abierta','#2f6fed',2),
  ('Aceptada','ganada','#1b8959',3),
  ('Rechazada','perdida','#910022',4)
) as v(nombre,tipo,color,orden)
where not exists (select 1 from cotizacion_etapas e where e.nombre = v.nombre);

-- Config (idempotente)
insert into configuracion (key, value) values
  ('cotizacion_validez_dias','15'),
  ('cotizacion_formato_default','ejecutivo'),
  ('cotizacion_condiciones_default','Precios en Lempiras, ISV incluido. Cotización sujeta a existencias.')
on conflict (key) do nothing;
```

- [ ] **Step 2: Escribir el smoke SQL**

Crear `supabase/smoke-pos-p3.sql` (no crea ni borra datos; verifica estructura). Modelar sobre `supabase/smoke-pos-p2-1.sql`.

```sql
-- Smoke POS P3 — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if to_regclass('public.cotizacion_etapas') is null then raise exception 'FALLÓ: falta cotizacion_etapas'; end if;
  if to_regclass('public.cotizaciones') is null then raise exception 'FALLÓ: falta cotizaciones'; end if;
  if to_regclass('public.cotizacion_items') is null then raise exception 'FALLÓ: falta cotizacion_items'; end if;
  if to_regclass('public.cotizacion_numero_seq') is null then raise exception 'FALLÓ: falta la secuencia cotizacion_numero_seq'; end if;
  if not exists (select 1 from cotizacion_etapas where tipo = 'ganada') then raise exception 'FALLÓ: no hay etapa de tipo ganada'; end if;
  if not exists (select 1 from cotizacion_etapas where tipo = 'perdida') then raise exception 'FALLÓ: no hay etapa de tipo perdida'; end if;
  if not exists (select 1 from configuracion where key = 'cotizacion_validez_dias') then raise exception 'FALLÓ: falta config cotizacion_validez_dias'; end if;
  if not exists (select 1 from configuracion where key = 'cotizacion_formato_default') then raise exception 'FALLÓ: falta config cotizacion_formato_default'; end if;
  raise notice 'Smoke POS P3: estructura OK';
end $$;
select 'Success: migración POS P3 OK' as resultado,
       (select count(*) from cotizacion_etapas) as etapas,
       (select value from configuracion where key = 'cotizacion_formato_default') as formato_default;
```

- [ ] **Step 3: Verificar sintaxis mental y consistencia**

Revisar que: los `check` de `isv` coinciden con `IsvTipo` (`'15'|'18'|'exento'`); `tipo` de etapa coincide con la semántica del spec; los FK usan `on delete set null`/`restrict`/`cascade` según el spec. No hay forma de correr SQL localmente — el reviewer valida.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-08-pos-p3-cotizaciones.sql supabase/smoke-pos-p3.sql
git commit -m "feat(cotizaciones): migracion P3 (tablas, secuencia, RLS, seeds)"
```

---

### Task 2: Tipos + lógica pura `lib/cotizaciones/` con tests

**Files:**
- Modify: `types/index.ts` (agregar al final, antes de cualquier export agrupador)
- Create: `lib/cotizaciones/cotizaciones.ts`
- Create: `lib/cotizaciones/tests/cotizaciones.test.ts`

**Interfaces:**
- Consumes: `LineaPos`, `IsvTipo` de `types`.
- Produces (tipos): `CotizacionEtapaTipo`, `CotizacionEtapa`, `Cotizacion`, `CotizacionItem`, `CotizacionConDatos`, `EtapaForm`.
- Produces (puras): `numeroCotizacion(seq: number): string`, `validoHasta(creada: Date, dias: number): Date`, `estaVencida(validoHasta: Date, hoy: Date): boolean`, `agruparPorEtapa<T extends { etapa_id: string }>(items: T[], etapas: CotizacionEtapa[]): { etapa: CotizacionEtapa; items: T[] }[]`, `etapaGanadaDestino(etapas: CotizacionEtapa[]): CotizacionEtapa | null`.

- [ ] **Step 1: Escribir los tipos en `types/index.ts`**

```typescript
export type CotizacionEtapaTipo = 'abierta' | 'ganada' | 'perdida'

export interface CotizacionEtapa {
  id: string
  nombre: string
  tipo: CotizacionEtapaTipo
  color: string
  orden: number
  activo: boolean
}

export interface CotizacionItem {
  id: string
  cotizacion_id: string
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  isv: IsvTipo
  orden: number
}

export interface Cotizacion {
  id: string
  numero: string
  etapa_id: string
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  vendedor_id: string | null
  descuento_global: number
  validez_dias: number
  valido_hasta: string
  condiciones: string | null
  notas: string | null
  total: number
  documento_id: string | null
  created_at: string
  updated_at: string
}

// Cotización con sus líneas y relaciones resueltas (para editor y PDF)
export interface CotizacionConDatos extends Cotizacion {
  items: CotizacionItem[]
  etapa: CotizacionEtapa | null
}

export interface EtapaForm {
  nombre: string
  tipo: CotizacionEtapaTipo
  color: string
}
```

- [ ] **Step 2: Escribir los tests (que fallan)**

Crear `lib/cotizaciones/tests/cotizaciones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { numeroCotizacion, validoHasta, estaVencida, agruparPorEtapa, etapaGanadaDestino } from '../cotizaciones'
import type { CotizacionEtapa } from '@/types'

const etapa = (id: string, orden: number, tipo: CotizacionEtapa['tipo'] = 'abierta'): CotizacionEtapa =>
  ({ id, nombre: id, tipo, color: '#000', orden, activo: true })

describe('numeroCotizacion', () => {
  it('formatea con prefijo COT- y 8 dígitos', () => {
    expect(numeroCotizacion(1)).toBe('COT-00000001')
    expect(numeroCotizacion(42)).toBe('COT-00000042')
    expect(numeroCotizacion(12345678)).toBe('COT-12345678')
  })
})

describe('validoHasta', () => {
  it('suma los días a la fecha de creación', () => {
    const r = validoHasta(new Date('2026-08-08T10:00:00Z'), 15)
    expect(r.toISOString().slice(0, 10)).toBe('2026-08-23')
  })
  it('con 0 días vence el mismo día', () => {
    const r = validoHasta(new Date('2026-08-08T10:00:00Z'), 0)
    expect(r.toISOString().slice(0, 10)).toBe('2026-08-08')
  })
})

describe('estaVencida', () => {
  it('vencida si hoy es posterior a valido_hasta', () => {
    expect(estaVencida(new Date('2026-08-08'), new Date('2026-08-09'))).toBe(true)
  })
  it('no vencida el mismo día', () => {
    expect(estaVencida(new Date('2026-08-08'), new Date('2026-08-08'))).toBe(false)
  })
  it('no vencida antes', () => {
    expect(estaVencida(new Date('2026-08-10'), new Date('2026-08-08'))).toBe(false)
  })
})

describe('agruparPorEtapa', () => {
  const etapas = [etapa('b', 1), etapa('a', 0), etapa('c', 2)]
  it('ordena por orden e incluye columnas vacías', () => {
    const items = [{ id: '1', etapa_id: 'a' }, { id: '2', etapa_id: 'c' }]
    const r = agruparPorEtapa(items, etapas)
    expect(r.map(g => g.etapa.id)).toEqual(['a', 'b', 'c'])
    expect(r[0].items.map(i => i.id)).toEqual(['1'])
    expect(r[1].items).toEqual([]) // b vacía pero presente
    expect(r[2].items.map(i => i.id)).toEqual(['2'])
  })
  it('ignora etapas inactivas', () => {
    const conInactiva = [...etapas, { ...etapa('z', 3), activo: false }]
    const r = agruparPorEtapa([], conInactiva)
    expect(r.find(g => g.etapa.id === 'z')).toBeUndefined()
  })
})

describe('etapaGanadaDestino', () => {
  it('devuelve la primera etapa activa de tipo ganada por orden', () => {
    const etapas = [etapa('g2', 5, 'ganada'), etapa('g1', 3, 'ganada'), etapa('a', 0)]
    expect(etapaGanadaDestino(etapas)?.id).toBe('g1')
  })
  it('devuelve null si no hay etapa ganada', () => {
    expect(etapaGanadaDestino([etapa('a', 0)])).toBeNull()
  })
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/cotizaciones --exclude "**/.claude/**"`
Expected: FAIL (módulo `../cotizaciones` no existe).

- [ ] **Step 4: Escribir la implementación**

Crear `lib/cotizaciones/cotizaciones.ts`:

```typescript
import type { CotizacionEtapa } from '@/types'

export function numeroCotizacion(seq: number): string {
  return `COT-${String(seq).padStart(8, '0')}`
}

export function validoHasta(creada: Date, dias: number): Date {
  const d = new Date(creada)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

// Vencida si la fecha de hoy (día) es estrictamente posterior a valido_hasta (día).
export function estaVencida(validoHasta: Date, hoy: Date): boolean {
  const vh = Date.UTC(validoHasta.getUTCFullYear(), validoHasta.getUTCMonth(), validoHasta.getUTCDate())
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return h > vh
}

// Agrupa items por etapa para el kanban: solo etapas activas, en su orden,
// incluyendo columnas vacías (para que el tablero muestre todas las etapas).
export function agruparPorEtapa<T extends { etapa_id: string }>(
  items: T[],
  etapas: CotizacionEtapa[],
): { etapa: CotizacionEtapa; items: T[] }[] {
  return etapas
    .filter(e => e.activo)
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map(etapa => ({ etapa, items: items.filter(i => i.etapa_id === etapa.id) }))
}

// Primera etapa activa de tipo 'ganada' por orden (destino al facturar).
export function etapaGanadaDestino(etapas: CotizacionEtapa[]): CotizacionEtapa | null {
  return (
    etapas
      .filter(e => e.activo && e.tipo === 'ganada')
      .sort((a, b) => a.orden - b.orden)[0] ?? null
  )
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/cotizaciones --exclude "**/.claude/**"`
Expected: PASS (todos). Correr también `npx tsc --noEmit` (los tipos nuevos compilan).

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/cotizaciones/
git commit -m "feat(cotizaciones): tipos y logica pura (numero, vigencia, kanban)"
```

---

### Task 3: Server Actions de cotizaciones (CRUD con frontera de confianza, conversión)

**Files:**
- Create: `app/admin/cotizaciones/actions.ts`

**Interfaces:**
- Consumes: `desglosarLinea`, `prorratearDescuentoGlobal`, `totalesDocumento` de `@/lib/pos/desglose`; `precioLineaPos` de `@/lib/pos/emision`; `numeroCotizacion`, `validoHasta`, `etapaGanadaDestino` de `@/lib/cotizaciones/cotizaciones`; tipos de `@/types`. Sigue el patrón de `app/admin/pos/actions.ts` (createClient de `@/lib/supabase-server`, revalidatePath).
- Produces:
  - `type CotizacionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`
  - `guardarCotizacion(input: GuardarCotizacionInput): Promise<CotizacionResult<{ id: string }>>`
  - `moverEtapaCotizacion(cotizacionId: string, etapaId: string): Promise<CotizacionResult>`
  - `eliminarCotizacion(id: string): Promise<CotizacionResult>`
  - `duplicarCotizacion(id: string): Promise<CotizacionResult<{ id: string }>>`
  - `obtenerCotizacion(id: string): Promise<CotizacionResult<CotizacionConDatos>>`
  - `obtenerCotizacionParaPos(id: string): Promise<CotizacionResult<CotizacionPrefillPos>>`
  - `marcarCotizacionFacturada(cotizacionId: string, documentoId: string): Promise<CotizacionResult>`
  - Tipos `GuardarCotizacionInput`, `LineaCotizacionInput`, `CotizacionPrefillPos` (exportados para el editor y el POS).

- [ ] **Step 1: Definir los tipos de entrada/salida y el recálculo**

Crear `app/admin/cotizaciones/actions.ts` con el encabezado `'use server'`. La clave es la **frontera de confianza**: para líneas con `producto_id`, releer el precio de BD según el tipo de cliente (como `emitirVenta`), no confiar en el `precio_unitario` que manda el cliente salvo ítems libres/precio manual.

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '@/lib/pos/desglose'
import { precioLineaPos } from '@/lib/pos/emision'
import { numeroCotizacion, validoHasta, etapaGanadaDestino } from '@/lib/cotizaciones/cotizaciones'
import type { LineaPos, IsvTipo, CotizacionConDatos, CotizacionEtapa } from '@/types'

export type CotizacionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

export interface LineaCotizacionInput {
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number   // usado tal cual solo si producto_id es null (ítem libre) o precioManual
  precioManual: boolean
  descuento: number
  isv: IsvTipo
}

export interface GuardarCotizacionInput {
  id: string | null            // null = crear
  etapaId: string
  clienteId: string | null
  vendedorId: string | null
  descuentoGlobal: number
  validezDias: number
  condiciones: string | null
  notas: string | null
  lineas: LineaCotizacionInput[]
}

export interface CotizacionPrefillPos {
  cotizacionId: string
  clienteId: string | null
  descuentoGlobal: number
  lineas: LineaPos[]
  yaFacturada: boolean
}
```

- [ ] **Step 2: Implementar `guardarCotizacion` (recálculo + upsert atómico)**

El recálculo relee precios (frontera de confianza) y calcula `total` con las puras del POS. El upsert de encabezado + reemplazo de líneas se hace en dos pasos con el cliente de servidor (borrar items previos + insertar nuevos); si el proyecto tuviera una RPC transaccional se usaría, pero para no introducir SQL adicional se hace secuencial y se acepta la ventana (una cotización es mutable y de bajo riesgo, a diferencia de la emisión fiscal).

```typescript
export async function guardarCotizacion(input: GuardarCotizacionInput): Promise<CotizacionResult<{ id: string }>> {
  const supabase = await createClient()

  // Cliente (para tipo/exonerado) — releído de BD
  let tipoCliente: 'final' | 'revendedor' = 'final'
  let exonerado = false
  let clienteNombre: string | null = null
  let clienteRtn: string | null = null
  if (input.clienteId) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('nombre, rtn, tipo_cliente, exonerado')
      .eq('id', input.clienteId)
      .maybeSingle()
    if (cli) {
      tipoCliente = cli.tipo_cliente
      exonerado = cli.exonerado
      clienteNombre = cli.nombre
      clienteRtn = cli.rtn
    }
  }

  // Releer productos de las líneas de catálogo para recalcular precio (frontera de confianza)
  const productoIds = [...new Set(input.lineas.filter(l => l.producto_id).map(l => l.producto_id!))]
  const productosPorId = new Map<string, { precio: number; producto_variantes: unknown[]; isv: IsvTipo }>()
  if (productoIds.length > 0) {
    const { data: prods } = await supabase
      .from('productos')
      .select('id, precio, isv, producto_variantes(*)')
      .in('id', productoIds)
    for (const p of prods ?? []) productosPorId.set(p.id, p as never)
  }

  // Construir LineaPos definitivas: precio releído salvo ítem libre / precio manual
  const lineasPos: LineaPos[] = input.lineas.map(l => {
    let precio = l.precio_unitario
    if (l.producto_id && !l.precioManual) {
      const prod = productosPorId.get(l.producto_id)
      const variante = prod && l.variante_id
        ? (prod.producto_variantes as { id: string }[]).find(v => v.id === l.variante_id) ?? null
        : null
      if (prod) precio = precioLineaPos(tipoCliente, prod as never, variante as never)
    }
    return {
      producto_id: l.producto_id,
      variante_id: l.variante_id,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: precio,
      descuento: l.descuento,
      isv: l.isv,
    }
  })

  // Total con las puras del POS
  const prorrateadas = prorratearDescuentoGlobal(lineasPos, input.descuentoGlobal)
  const desglosadas = prorrateadas.map(l => desglosarLinea(l, exonerado))
  const totales = totalesDocumento(desglosadas, input.descuentoGlobal, '')

  // valido_hasta = hoy + validezDias (se calcula en JS; la BD guarda date)
  const vh = validoHasta(new Date(), input.validezDias).toISOString().slice(0, 10)

  try {
    let cotizacionId = input.id
    if (!cotizacionId) {
      // numero de la secuencia
      const { data: seqRow, error: seqErr } = await supabase.rpc('nextval_cotizacion')  // ver Step 3
      if (seqErr || seqRow == null) return { ok: false, error: ERROR_GENERICO }
      const numero = numeroCotizacion(Number(seqRow))
      const { data: nueva, error: insErr } = await supabase
        .from('cotizaciones')
        .insert({
          numero, etapa_id: input.etapaId, cliente_id: input.clienteId,
          cliente_nombre: clienteNombre, cliente_rtn: clienteRtn, vendedor_id: input.vendedorId,
          descuento_global: input.descuentoGlobal, validez_dias: input.validezDias, valido_hasta: vh,
          condiciones: input.condiciones, notas: input.notas, total: totales.total,
        })
        .select('id')
        .single()
      if (insErr || !nueva) return { ok: false, error: ERROR_GENERICO }
      cotizacionId = nueva.id
    } else {
      const { error: updErr } = await supabase
        .from('cotizaciones')
        .update({
          etapa_id: input.etapaId, cliente_id: input.clienteId,
          cliente_nombre: clienteNombre, cliente_rtn: clienteRtn, vendedor_id: input.vendedorId,
          descuento_global: input.descuentoGlobal, validez_dias: input.validezDias, valido_hasta: vh,
          condiciones: input.condiciones, notas: input.notas, total: totales.total,
        })
        .eq('id', cotizacionId)
      if (updErr) return { ok: false, error: ERROR_GENERICO }
      await supabase.from('cotizacion_items').delete().eq('cotizacion_id', cotizacionId)
    }

    if (lineasPos.length > 0) {
      const { error: itemsErr } = await supabase.from('cotizacion_items').insert(
        lineasPos.map((l, i) => ({
          cotizacion_id: cotizacionId, producto_id: l.producto_id, variante_id: l.variante_id,
          descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario,
          descuento: l.descuento, isv: l.isv, orden: i,
        })),
      )
      if (itemsErr) return { ok: false, error: ERROR_GENERICO }
    }

    revalidatePath('/admin/cotizaciones')
    return { ok: true, data: { id: cotizacionId } }
  } catch {
    return { ok: false, error: ERROR_GENERICO }
  }
}
```

- [ ] **Step 3: Implementar las acciones restantes**

```typescript
export async function moverEtapaCotizacion(cotizacionId: string, etapaId: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotizaciones').update({ etapa_id: etapaId }).eq('id', cotizacionId)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function eliminarCotizacion(id: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotizaciones').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function obtenerCotizacion(id: string): Promise<CotizacionResult<CotizacionConDatos>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, cotizacion_items(*), etapa:cotizacion_etapas(*)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'No se encontró la cotización.' }
  const items = ((data as { cotizacion_items: CotizacionConDatos['items'] }).cotizacion_items ?? [])
    .slice().sort((a, b) => a.orden - b.orden)
  const { cotizacion_items, ...rest } = data as never
  return { ok: true, data: { ...(rest as object), items, etapa: (data as never).etapa } as CotizacionConDatos }
}

export async function duplicarCotizacion(id: string): Promise<CotizacionResult<{ id: string }>> {
  const original = await obtenerCotizacion(id)
  if (!original.ok || !original.data) return { ok: false, error: 'No se pudo duplicar.' }
  const c = original.data
  return guardarCotizacion({
    id: null, etapaId: c.etapa_id, clienteId: c.cliente_id, vendedorId: c.vendedor_id,
    descuentoGlobal: c.descuento_global, validezDias: c.validez_dias,
    condiciones: c.condiciones, notas: c.notas,
    lineas: c.items.map(i => ({
      producto_id: i.producto_id, variante_id: i.variante_id, descripcion: i.descripcion,
      cantidad: i.cantidad, precio_unitario: i.precio_unitario, precioManual: i.producto_id === null,
      descuento: i.descuento, isv: i.isv,
    })),
  })
}

export async function obtenerCotizacionParaPos(id: string): Promise<CotizacionResult<CotizacionPrefillPos>> {
  const r = await obtenerCotizacion(id)
  if (!r.ok || !r.data) return { ok: false, error: 'No se encontró la cotización.' }
  const c = r.data
  return {
    ok: true,
    data: {
      cotizacionId: c.id,
      clienteId: c.cliente_id,
      descuentoGlobal: c.descuento_global,
      yaFacturada: c.documento_id !== null,
      lineas: c.items.map(i => ({
        producto_id: i.producto_id, variante_id: i.variante_id, descripcion: i.descripcion,
        cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento: i.descuento, isv: i.isv,
      })),
    },
  }
}

export async function marcarCotizacionFacturada(cotizacionId: string, documentoId: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  // Idempotente: no re-emitir si ya tiene documento
  const { data: actual } = await supabase.from('cotizaciones').select('documento_id').eq('id', cotizacionId).maybeSingle()
  if (actual?.documento_id) return { ok: true }
  const { data: etapas } = await supabase.from('cotizacion_etapas').select('*')
  const ganada = etapaGanadaDestino((etapas ?? []) as CotizacionEtapa[])
  const patch: { documento_id: string; etapa_id?: string } = { documento_id: documentoId }
  if (ganada) patch.etapa_id = ganada.id
  const { error } = await supabase.from('cotizaciones').update(patch).eq('id', cotizacionId)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/cotizaciones')
  return { ok: true }
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. (Los `as never` puntuales son para las relaciones anidadas de PostgREST; mantenerlos acotados.)

- [ ] **Step 5: Commit**

```bash
git add app/admin/cotizaciones/actions.ts
git commit -m "feat(cotizaciones): server actions con frontera de confianza y conversion"
```

---

### Task 4: Tablero kanban + link en el sidebar

**Files:**
- Create: `app/admin/cotizaciones/page.tsx`
- Create: `app/admin/cotizaciones/KanbanBoard.tsx`
- Create: `app/admin/cotizaciones/cotizaciones.module.css`
- Modify: `components/admin/Sidebar.tsx` (agregar item de nav)

**Interfaces:**
- Consumes: `agruparPorEtapa`, `estaVencida` de `@/lib/cotizaciones/cotizaciones`; `moverEtapaCotizacion`, `eliminarCotizacion` de `../actions`; `formatPrice` de `@/lib/store/format`; tipos `Cotizacion`, `CotizacionEtapa`, `Vendedor`.
- Produces: la ruta `/admin/cotizaciones`.

- [ ] **Step 1: Server Component `page.tsx`**

Carga etapas + cotizaciones (con nombre de cliente/vendedor resueltos) y pasa a `KanbanBoard`.

```tsx
import { createClient } from '@/lib/supabase-server'
import KanbanBoard from './KanbanBoard'
import type { Cotizacion, CotizacionEtapa, Vendedor } from '@/types'

export const dynamic = 'force-dynamic'

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const [{ data: etapas }, { data: cotizaciones }, { data: vendedores }] = await Promise.all([
    supabase.from('cotizacion_etapas').select('*').order('orden'),
    supabase.from('cotizaciones').select('*, cliente:clientes(nombre), vendedor:vendedores(nombre)').order('updated_at', { ascending: false }),
    supabase.from('vendedores').select('*').eq('activo', true),
  ])
  return (
    <KanbanBoard
      etapas={(etapas ?? []) as CotizacionEtapa[]}
      cotizaciones={(cotizaciones ?? []) as never}
      vendedores={(vendedores ?? []) as Vendedor[]}
    />
  )
}
```

- [ ] **Step 2: Client `KanbanBoard.tsx` con DnD nativo + menú "Mover a…"**

Columnas por etapa (`agruparPorEtapa`); tarjetas con `draggable`, `onDragStart` guarda el id, `onDrop` en la columna llama `moverEtapaCotizacion` (optimista + `router.refresh()`). Cada tarjeta: número, cliente, total (`formatPrice`), badge *Vencida* si `estaVencida(new Date(valido_hasta), new Date())`, vendedor, y un menú `⋮` con "Mover a…" (lista de etapas) + "Eliminar" (con `window.confirm`). Botón *Nueva cotización* → `router.push('/admin/cotizaciones/nueva')`. Clic en tarjeta → `router.push('/admin/cotizaciones/' + id)`.

Puntos clave a implementar:
- Estado local `cotizacionesLocal` inicializado de la prop (con `useMemo` derivado o `useState` + efecto de sync al cambiar la prop) para el movimiento optimista.
- `onDragOver={e => e.preventDefault()}` en la columna (necesario para permitir drop).
- El menú "Mover a…" es la alternativa accesible: `<select>` o botones; al elegir etapa llama `moverEtapaCotizacion`.
- La columna muestra su `color` (borde superior) y el conteo de tarjetas.

- [ ] **Step 3: CSS `cotizaciones.module.css`**

Tablero con scroll horizontal de columnas (`display:flex; gap; overflow-x:auto`), columnas de ancho fijo (`min-width: 300px`) con su propio scroll vertical, tarjetas estilo Merlin (`var(--bg-card)`, `var(--radius-card)`, `var(--shadow-card)`). Badge *Vencida* con `var(--error-bg)`/`var(--error-deep)`. Botones con clases Merlin + su caja de módulo. Responsivo: en móvil las columnas se apilan o mantienen scroll-x.

- [ ] **Step 4: Agregar el link al Sidebar**

En `components/admin/Sidebar.tsx`, en el grupo que contiene POS/Documentos/Clientes, agregar tras `Documentos`:

```tsx
{ href: '/admin/cotizaciones', icon: '📝', label: 'Cotizaciones' },
```

- [ ] **Step 5: Verificar en el navegador**

`npx tsc --noEmit` limpio. Levantar el dev server (`preview_start`), entrar a `/admin/cotizaciones`, confirmar: columnas por etapa, tarjeta de prueba (crear una desde el editor de la Task 5 más tarde), arrastre entre columnas persiste, badge *Vencida*, link en el sidebar. (Si aún no hay cotizaciones, verificar que las columnas vacías se muestran.)

- [ ] **Step 6: Commit**

```bash
git add app/admin/cotizaciones/page.tsx app/admin/cotizaciones/KanbanBoard.tsx app/admin/cotizaciones/cotizaciones.module.css components/admin/Sidebar.tsx
git commit -m "feat(cotizaciones): tablero kanban con arrastre nativo y link en sidebar"
```

---

### Task 5: Editor de cotización

**Files:**
- Create: `app/admin/cotizaciones/[id]/page.tsx`
- Create: `app/admin/cotizaciones/[id]/CotizacionEditor.tsx`
- Create: `app/admin/cotizaciones/[id]/editor.module.css`

**Interfaces:**
- Consumes: `obtenerCotizacion`, `guardarCotizacion`, `GuardarCotizacionInput`, `LineaCotizacionInput` de `../../actions`; `precioLineaPos` de `@/lib/pos/emision`; `desglosarLinea`/`prorratearDescuentoGlobal`/`totalesDocumento` de `@/lib/pos/desglose`; `variantesActivasDe`/`preciosCatalogo` de `@/app/admin/pos/pos-helpers`; `ClienteNuevoModal` de `@/app/admin/pos/components/ClienteNuevoModal`; `formatPrice`.
- Produces: la ruta `/admin/cotizaciones/[id]` (y `/nueva`).

- [ ] **Step 1: Server Component `page.tsx`**

Carga productos (canal mostrador/ambas, activos), clientes, vendedores, etapas, config; si `params.id !== 'nueva'`, carga la cotización con `obtenerCotizacion`. Pasa todo a `CotizacionEditor`. (Mirar `app/admin/pos/page.tsx` para el patrón de carga de productos con variantes.)

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import { obtenerCotizacion } from '../actions'
import CotizacionEditor from './CotizacionEditor'

export const dynamic = 'force-dynamic'

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: productos }, { data: clientes }, { data: vendedores }, { data: etapas }, { data: config }] =
    await Promise.all([
      supabase.from('productos').select('*, producto_variantes(*)').eq('activo', true).in('canal', ['mostrador', 'ambas']),
      supabase.from('clientes').select('*').eq('activo', true),
      supabase.from('vendedores').select('*').eq('activo', true),
      supabase.from('cotizacion_etapas').select('*').eq('activo', true).order('orden'),
      supabase.from('configuracion').select('key, value'),
    ])
  const cot = id === 'nueva' ? null : await obtenerCotizacion(id)
  if (id !== 'nueva' && (!cot || !cot.ok)) notFound()
  return (
    <CotizacionEditor
      cotizacion={cot && cot.ok ? cot.data! : null}
      productos={(productos ?? []) as never}
      clientes={(clientes ?? []) as never}
      vendedores={(vendedores ?? []) as never}
      etapas={(etapas ?? []) as never}
      config={toConfigMap(config ?? [])}
    />
  )
}
```

- [ ] **Step 2: Client `CotizacionEditor.tsx`**

Estado del carrito espejando el POS pero sin caja/pestañas. Reusar la lógica pura del POS y `pos-helpers`. Estructura:
- Estado: `lineas: LineaCotizacionInput[]` (con `key` de UI local para React), `descuentoGlobal`, `clienteId`, `vendedorId`, `etapaId`, `validezDias`, `condiciones`, `notas`. Inicializar de `cotizacion` si viene, o de defaults (`config.cotizacion_validez_dias`, `config.cotizacion_condiciones_default`, primera etapa) si es nueva.
- **Buscador de catálogo** (input + resultados): filtra `productos` por nombre/SKU; al elegir producto sin variantes activas agrega línea, con variantes abre un modal de variante (mirar `CatalogoPanel`/`variantesActivasDe`). Precio inicial con `precioLineaPos(tipoCliente, producto, variante)`.
- **Ítem libre:** botón que agrega una línea con `producto_id: null`, `precioManual: true` (descripción/precio/isv editables).
- **Editar línea:** cantidad con −/+ e input; precio y descuento editables inline o en un modal simple (reusar el criterio de clamps de `lib/pos/carrito`: `clampDescuentoLinea`). Editar precio marca `precioManual: true`.
- **Totales en vivo:** convertir `lineas` → `LineaPos`, `prorratearDescuentoGlobal` → `desglosarLinea` (con `exonerado` del cliente) → `totalesDocumento`. Mostrar exento/exonerado/gravados/ISV/descuento/Total como en `CarritoPanel`.
- **Cliente:** selector con búsqueda (mirar el combo de `CarritoPanel`) + alta rápida con `ClienteNuevoModal`.
- **Cabecera:** etapa (`<select>`), vendedor (`<select>`), validez en días (input), condiciones (textarea), notas (textarea).
- **Acciones:** *Guardar* (arma `GuardarCotizacionInput`, llama `guardarCotizacion`; si era nueva, `router.replace('/admin/cotizaciones/' + id)`), *Ver PDF* (dropdown con los 3 estilos → abre `/admin/cotizaciones/<id>/pdf?estilo=...` en pestaña nueva; deshabilitado si no se ha guardado o no hay líneas), *Facturar* (→ `router.push('/admin/pos?cotizacion=' + id)`; deshabilitado si `cotizacion?.documento_id` o sin líneas), *Volver* al tablero.

Reglas concretas:
- Números de dinero con `type="text" inputMode="decimal"` y `parseMoneyInput`/`valorMostrado` de `pos-helpers` (sin cero forzado — consistencia con P2.1).
- No permitir *Guardar* sin etapa. Se puede guardar sin líneas (borrador), pero *Ver PDF*/*Facturar* quedan deshabilitados sin líneas.
- Al guardar, mapear cada línea de UI a `LineaCotizacionInput` (incluyendo `precioManual`).

- [ ] **Step 3: CSS `editor.module.css`**

Dos zonas: catálogo/buscador y el documento en construcción (líneas + totales + cabecera), estilo Merlin. Puede reusar patrones visuales de `pos.module.css` copiando lo necesario (no importar el módulo del POS). Campos de dinero sin spinner.

- [ ] **Step 4: Verificar en el navegador**

`npx tsc --noEmit` limpio. En el dev server: crear una cotización nueva (`/admin/cotizaciones/nueva`), agregar productos y un ítem libre, ver totales, elegir cliente/vendedor/etapa/validez, *Guardar* → aparece en el kanban con su total. Reabrir y editar. Confirmar que un cliente revendedor recalcula precios.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cotizaciones/\[id\]/page.tsx app/admin/cotizaciones/\[id\]/CotizacionEditor.tsx app/admin/cotizaciones/\[id\]/editor.module.css
git commit -m "feat(cotizaciones): editor con buscador de catalogo, items libres y totales"
```

---

### Task 6: Gestión de etapas en Configuración

**Files:**
- Create: `app/admin/configuracion/etapasActions.ts`
- Create: `app/admin/configuracion/EtapasSection.tsx`
- Modify: `app/admin/configuracion/page.tsx` (montar `EtapasSection`)

**Interfaces:**
- Consumes: `createClient`, `revalidatePath`; tipos `CotizacionEtapa`, `EtapaForm`, `CotizacionEtapaTipo`.
- Produces: `crearEtapa(form: EtapaForm): Promise<CotizacionResult>`, `actualizarEtapa(id: string, form: EtapaForm): Promise<CotizacionResult>`, `reordenarEtapas(ids: string[]): Promise<CotizacionResult>`, `eliminarEtapa(id: string): Promise<CotizacionResult>`.

- [ ] **Step 1: `etapasActions.ts`**

CRUD con el cliente de servidor. `eliminarEtapa` **bloquea** si hay cotizaciones en la etapa (además del FK `restrict`, dar mensaje claro):

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { EtapaForm } from '@/types'

export type CotizacionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }
const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.'

export async function crearEtapa(form: EtapaForm): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { data: max } = await supabase.from('cotizacion_etapas').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle()
  const orden = (max?.orden ?? -1) + 1
  const { error } = await supabase.from('cotizacion_etapas').insert({ ...form, orden })
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/configuracion'); revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function actualizarEtapa(id: string, form: EtapaForm): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotizacion_etapas').update(form).eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/configuracion'); revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function reordenarEtapas(ids: string[]): Promise<CotizacionResult> {
  const supabase = await createClient()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from('cotizacion_etapas').update({ orden: i }).eq('id', ids[i])
    if (error) return { ok: false, error: ERROR_GENERICO }
  }
  revalidatePath('/admin/configuracion'); revalidatePath('/admin/cotizaciones')
  return { ok: true }
}

export async function eliminarEtapa(id: string): Promise<CotizacionResult> {
  const supabase = await createClient()
  const { count } = await supabase.from('cotizaciones').select('id', { count: 'exact', head: true }).eq('etapa_id', id)
  if ((count ?? 0) > 0) return { ok: false, error: 'La etapa tiene cotizaciones. Muévelas a otra etapa antes de eliminarla.' }
  const { error } = await supabase.from('cotizacion_etapas').delete().eq('id', id)
  if (error) return { ok: false, error: ERROR_GENERICO }
  revalidatePath('/admin/configuracion'); revalidatePath('/admin/cotizaciones')
  return { ok: true }
}
```

- [ ] **Step 2: `EtapasSection.tsx` (client)**

Lista de etapas con: nombre (input), tipo (`<select>` abierta/ganada/perdida), color (input `type="color"` o chips de color), orden (botones subir/bajar → `reordenarEtapas`), guardar (`actualizarEtapa`), eliminar (`eliminarEtapa`, con confirm y muestra el error si está bloqueada). Formulario para crear una etapa nueva (`crearEtapa`). Mirar `PosSection.tsx` para el patrón de CRUD inline en configuración. Estilo Merlin.

- [ ] **Step 3: Montar en `page.tsx` de configuración**

Cargar etapas (`supabase.from('cotizacion_etapas').select('*').order('orden')`) en el Server Component y renderizar `<EtapasSection etapas={...} />` junto a las demás secciones (después de `PosSection`).

- [ ] **Step 4: Verificar en el navegador**

`npx tsc --noEmit` limpio. En configuración: crear una etapa, renombrarla, cambiar color/tipo, reordenar, e intentar borrar una con cotizaciones (debe rechazar con el mensaje). Confirmar que los cambios se reflejan en el tablero kanban.

- [ ] **Step 5: Commit**

```bash
git add app/admin/configuracion/etapasActions.ts app/admin/configuracion/EtapasSection.tsx app/admin/configuracion/page.tsx
git commit -m "feat(cotizaciones): gestion de etapas del kanban en configuracion"
```

---

### Task 7: PDF de cotización — 3 estilos + ruta + barra

**Files:**
- Create: `app/admin/cotizaciones/[id]/pdf/page.tsx`
- Create: `app/admin/cotizaciones/[id]/pdf/CotizacionPdfView.tsx`
- Create: `app/admin/cotizaciones/[id]/pdf/HojaEjecutiva.tsx`
- Create: `app/admin/cotizaciones/[id]/pdf/HojaMinimalista.tsx`
- Create: `app/admin/cotizaciones/[id]/pdf/HojaCatalogo.tsx`
- Create: `app/admin/cotizaciones/[id]/pdf/pdf.module.css`

**Interfaces:**
- Consumes: `obtenerCotizacion`; `desglosarLinea`/`prorratearDescuentoGlobal`/`totalesDocumento`; `estaVencida`; `formatPrice`; config (empresa/logo, mirar cómo `DocumentoHoja` lee datos de empresa). Cada hoja recibe los mismos props: `{ cotizacion: CotizacionConDatos; totales: TotalesDocumento; empresa; config; vencida: boolean; productosImagenes?: Record<string,string> }`.
- Produces: la ruta `/admin/cotizaciones/[id]/pdf?estilo=ejecutivo|minimalista|catalogo`.

- [ ] **Step 1: Server Component `page.tsx`**

Carga la cotización (`obtenerCotizacion`), la config de empresa (mirar `app/admin/pos/documento/[id]/page.tsx` para qué datos de empresa/logo se leen), y para el estilo `catalogo` también las imágenes de los productos de las líneas (`productos.imagenes[0]`). Calcula totales con las puras. Pasa todo a `CotizacionPdfView` junto con `estilo` (de `searchParams`, default `config.cotizacion_formato_default`).

- [ ] **Step 2: `CotizacionPdfView.tsx` (client)**

Barra de acciones (no imprime): selector de estilo (3 chips `btnMerlinChip` con `aria-pressed`, que cambian `?estilo=` vía `router.replace`) + botón *Imprimir* (`window.print()`) usando la clase de caja `.btnToolbar` del módulo (no `btnMerlinPrimary` suelto — lección P2.1). Debajo, renderiza la hoja según `estilo`. `@media print` oculta la barra y deja solo la hoja (mirar `documento.module.css`).

- [ ] **Step 3: Las 3 hojas**

Cada una es un componente presentacional con el mismo contrato de props. Patrón "HTML + CSS de impresión" como `DocumentoHoja`:
- **`HojaEjecutiva`** — encabezado con marca/logo, datos de empresa y cliente, tabla de ítems (descripción, cantidad, precio, importe), bloque de totales, condiciones y `válida hasta`. Adaptar la *estructura/aire* de la plantilla de Akuo (`C:\Users\IT\OneDrive\Aplicaciones\Akuo-Cotizaciones\Akuo-Generador de Cotizaciones.json`, nodo "Plantilla Recolección y Calculo de Datos HTML2") a tokens Merlin — no copiar sus colores/fuentes.
- **`HojaMinimalista`** — una página, blanco y negro, logo + tabla limpia + totales. Compacta.
- **`HojaCatalogo`** — cada línea con miniatura del producto (`productosImagenes[producto_id]`, placeholder si no hay) + descripción + precio.
- Todas muestran el sello *Vencida* (marca de agua o badge) si `vencida`.

- [ ] **Step 4: CSS `pdf.module.css`**

Tamaños de hoja (carta), tipografía, tablas; barra que se oculta en `@media print`; hoja con fondo blanco/tinta fija (no seguir tema oscuro), como `.hojaCarta` del POS. `.btnToolbar` con padding+inline-flex para los botones de la barra.

- [ ] **Step 5: Verificar en el navegador**

`npx tsc --noEmit` limpio. Abrir `/admin/cotizaciones/<id>/pdf` de una cotización con varias líneas; alternar los 3 estilos; usar la vista previa de impresión (Ctrl+P) y confirmar que solo sale la hoja (sin la barra) y que pagina bien con muchos ítems. Verificar el sello *Vencida* en una vencida.

- [ ] **Step 6: Commit**

```bash
git add app/admin/cotizaciones/\[id\]/pdf/
git commit -m "feat(cotizaciones): PDF en 3 estilos (ejecutivo, minimalista, catalogo)"
```

---

### Task 8: Integración con el POS (precargar desde cotización + ligar al emitir)

**Files:**
- Modify: `app/admin/pos/page.tsx` (leer `searchParams.cotizacion`)
- Modify: `app/admin/pos/PosClient.tsx` (precargar pestaña + ligar al emitir)

**Interfaces:**
- Consumes: `obtenerCotizacionParaPos`, `marcarCotizacionFacturada`, `CotizacionPrefillPos` de `@/app/admin/cotizaciones/actions`. Reusa `revalidarLineasCatalogo` (ya existe en `PosClient`) y el sistema de pestañas.
- Produces: comportamiento `/admin/pos?cotizacion=<id>`.

- [ ] **Step 1: Pasar el param al cliente**

En `app/admin/pos/page.tsx`, leer `searchParams.cotizacion` (si viene) y, con `obtenerCotizacionParaPos`, cargar el prefill en el server; pasarlo como prop `cotizacionPrefill?: CotizacionPrefillPos | null` a `PosClient`. (Alternativa si el page ya es complejo: pasar solo el id y que PosClient llame la acción en un efecto — pero preferir cargar en el server y pasar el objeto, para no parpadear.)

- [ ] **Step 2: Precargar una pestaña en `PosClient`**

Cuando llega `cotizacionPrefill` (y una sola vez, con un guard tipo `useRef` para no reprocesar en cada render), abrir una **pestaña nueva** con sus líneas revalidadas por `revalidarLineasCatalogo(prefill.lineas, 'Cotización', productosPorId, nuevaKey)`, setear cliente y descuento global, y **guardar `cotizacionId` en la pestaña** (extender `PestanaVenta` con `cotizacionId?: string | null`, o mantener un mapa `pestanaId → cotizacionId` en un ref). Si `prefill.yaFacturada`, mostrar aviso ("Esta cotización ya fue facturada") y no precargar. Nombre de la pestaña: el número de la cotización si se dispone, o "Cotización".

- [ ] **Step 3: Ligar al emitir**

En `handleEmitido(documentoId)` de `PosClient`: si la pestaña activa tiene `cotizacionId`, llamar `marcarCotizacionFacturada(cotizacionId, documentoId)` (sin bloquear la UI; en un `startTransition`). Esto liga el documento y mueve la cotización a `ganada`.

- [ ] **Step 4: Limpiar el query param**

Tras precargar, hacer `router.replace('/admin/pos')` (sin el query) para que un refresh no vuelva a precargar la misma cotización. Hacerlo dentro del mismo efecto de precarga, después de abrir la pestaña.

- [ ] **Step 5: Verificar en el navegador (cuidado: toca el POS estable)**

`npx tsc --noEmit` limpio. Flujo completo: desde una cotización, *Facturar* → abre el POS con una pestaña precargada (cliente + líneas + descuento), emitir factura/comprobante → el documento se liga y la cotización pasa a *Aceptada/ganada* en el kanban, con *Facturar* deshabilitado. Probar con un producto sin stock suficiente para ver el error `HS_*`. Confirmar que las **otras pestañas y el flujo normal del POS siguen intactos** (regresión).

- [ ] **Step 6: Commit**

```bash
git add app/admin/pos/page.tsx app/admin/pos/PosClient.tsx
git commit -m "feat(cotizaciones): facturar desde cotizacion precargando el POS"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/cotizaciones`).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados (los de `coverage/` son ruido preexistente, gitignored).
- `npm run build` — build de producción OK (detener el dev server antes).
- Verificación visual en el navegador de: kanban (arrastre, badge vencida), editor (catálogo, ítem libre, totales, revendedor), 3 PDFs (impresión limpia), gestión de etapas (guard de borrado), y el flujo cotización→POS→documento ligado.

## Entrega

- El usuario aplica `supabase/migrations/2026-08-08-pos-p3-cotizaciones.sql` en el SQL Editor y corre `supabase/smoke-pos-p3.sql` (espera "Success: migración POS P3 OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P3 desplegado.
