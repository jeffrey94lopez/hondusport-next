# Variantes padre/hijo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** productos con variantes hijas (nombre libre) con stock y precio propios; el checkout valida y descuenta stock atómicamente; admin y las dos herramientas Excel gestionan variantes.

**Architecture:** tabla hija `producto_variantes` (FK a `productos`); RPC `crear_pedido` v2 valida/descuenta stock en la misma transacción; toda regla nueva es función pura en `lib/store/` con tests; las variantes son opt-in (productos sin hijas siguen igual). Spec: `docs/superpowers/specs/2026-08-04-variantes-padre-hijo-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + RPC plpgsql), Zod, Vitest, xlsx.

## Global Constraints

- UI, dominio y commits en **español**; formato convencional (`feat(store): …`).
- Moneda con `formatPrice()` (Lempiras `L.`).
- Lógica con peso (dinero, stock, integridad) = función pura en `lib/store/` con test en `lib/store/tests/`.
- El checkout es frontera de confianza: releer BD, nunca confiar en precios/`custom`/variante del cliente.
- `npm test` tras tocar `lib/store`; `npx tsc --noEmit` tras tocar Server Actions/tipos.
- **La migración SQL se aplica en el SQL Editor de Supabase ANTES del push/merge a `main`** (el push auto-deploya a producción; confirmar con el usuario antes de fusionar).
- Trabajar en rama `feature/variantes-padre-hijo`.
- Carritos viejos en `localStorage`: normalizar al leer (`normalizeStoredCart`), nunca romper.
- Convención de este plan: "variantes activas" = `activo = true`; solo esas se venden/suman.

---

## Fase 1 — BD, tipos, lógica pura y checkout

### Task 1: Migración SQL (tabla, RLS, pedido_items, RPC v2, función de import)

**Files:**
- Create: `supabase/migrations/2026-08-04-producto-variantes.sql`
- Modify: `supabase/schema.sql` (reflejar tabla/columnas nuevas al final de la sección de tablas y de RLS)

**Interfaces:**
- Consumes: tablas `productos`, `pedidos`, `pedido_items`, función `update_updated_at()` (ya existen; ver `supabase/schema.sql`).
- Produces: tabla `producto_variantes`; columnas `pedido_items.variante_id/variante_nombre`; `crear_pedido` v2 (misma firma, items aceptan `variante_id`/`variante_nombre`; errores `HS_*`); función `importar_productos_variantes(p_productos jsonb, p_variantes jsonb)` usada por las rutas de import (Tasks 15 y 18).

- [ ] **Step 1: Escribir la migración**

```sql
-- Variantes padre/hijo: tabla hija, columnas en pedido_items, crear_pedido v2
-- (valida y descuenta stock) y función transaccional para los imports.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

create table if not exists producto_variantes (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  nombre      text not null,
  sku         text,
  precio      numeric check (precio is null or precio > 0),
  stock       integer check (stock is null or stock >= 0),
  activo      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (producto_id, nombre)
);

create index if not exists producto_variantes_producto_id_idx
  on producto_variantes (producto_id);
create unique index if not exists producto_variantes_sku_unico
  on producto_variantes (sku) where sku is not null;

create trigger producto_variantes_updated_at
  before update on producto_variantes
  for each row execute function update_updated_at();

alter table producto_variantes enable row level security;

create policy "public_read_variantes" on producto_variantes for select
  using (
    activo = true
    and exists (select 1 from productos p where p.id = producto_id and p.activo = true)
  );
create policy "admin_all_variantes" on producto_variantes for all
  using (auth.role() = 'authenticated');

alter table pedido_items
  add column if not exists variante_id uuid references producto_variantes(id) on delete set null;
alter table pedido_items
  add column if not exists variante_nombre text;

-- ── crear_pedido v2: valida y descuenta stock (variantes y productos planos) ──
create or replace function crear_pedido(
  p_nombre_cliente text,
  p_telefono text,
  p_ciudad text,
  p_envio_id uuid,
  p_envio_nombre text,
  p_cupon_codigo text,
  p_subtotal numeric,
  p_descuento_cupon numeric,
  p_costo_envio numeric,
  p_total numeric,
  p_notas text,
  p_items jsonb
)
returns table (id uuid, numero integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero integer;
  v_item jsonb;
  v_producto_id uuid;
  v_variante_id uuid;
  v_cantidad integer;
  v_stock integer;
  v_nombre_prod text;
  v_nombre_var text;
  v_activo boolean;
  v_tiene_variantes boolean;
begin
  -- Validación y descuento de stock ANTES de insertar (misma transacción:
  -- cualquier raise revierte todo). FOR UPDATE evita carreras entre pedidos.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_variante_id := nullif(v_item->>'variante_id', '')::uuid;
    v_cantidad    := (v_item->>'cantidad')::integer;

    select p.activo, p.nombre into v_activo, v_nombre_prod
      from productos p where p.id = v_producto_id;
    if not found or not v_activo then
      raise exception using message = 'HS_INACTIVO|' || coalesce(v_nombre_prod, 'producto');
    end if;

    if v_variante_id is not null then
      select pv.stock, pv.nombre into v_stock, v_nombre_var
        from producto_variantes pv
        where pv.id = v_variante_id and pv.producto_id = v_producto_id and pv.activo = true
        for update;
      if not found then
        raise exception using message = 'HS_VARIANTE|' || v_nombre_prod;
      end if;
      if v_stock is not null then
        if v_stock < v_cantidad then
          raise exception using message =
            'HS_STOCK|' || v_nombre_prod || ' (' || v_nombre_var || ')|' || v_stock;
        end if;
        update producto_variantes set stock = stock - v_cantidad where producto_variantes.id = v_variante_id;
      end if;
    else
      select exists(
        select 1 from producto_variantes pv
        where pv.producto_id = v_producto_id and pv.activo = true
      ) into v_tiene_variantes;
      if v_tiene_variantes then
        raise exception using message = 'HS_REQUIERE_VARIANTE|' || v_nombre_prod;
      end if;
      select p.stock into v_stock from productos p where p.id = v_producto_id for update;
      if v_stock is not null then
        if v_stock < v_cantidad then
          raise exception using message = 'HS_STOCK|' || v_nombre_prod || '|' || v_stock;
        end if;
        update productos set stock = stock - v_cantidad where productos.id = v_producto_id;
      end if;
    end if;
  end loop;

  insert into pedidos (
    nombre_cliente, telefono, ciudad, envio_id, envio_nombre, cupon_codigo,
    subtotal, descuento_cupon, costo_envio, total, estado, notas
  )
  values (
    p_nombre_cliente, p_telefono, p_ciudad, p_envio_id, p_envio_nombre, p_cupon_codigo,
    p_subtotal, p_descuento_cupon, p_costo_envio, p_total, 'recibido', p_notas
  )
  returning pedidos.id, pedidos.numero into v_id, v_numero;

  insert into pedido_items (
    pedido_id, producto_id, nombre_producto, precio, cantidad, talla,
    personalizado_nombre, imagen_url, variante_id, variante_nombre
  )
  select
    v_id,
    (item->>'producto_id')::uuid,
    item->>'nombre_producto',
    (item->>'precio')::numeric,
    (item->>'cantidad')::integer,
    nullif(item->>'talla', ''),
    item->>'personalizado_nombre',
    item->>'imagen_url',
    nullif(item->>'variante_id', '')::uuid,
    nullif(item->>'variante_nombre', '')
  from jsonb_array_elements(p_items) as item;

  return query select v_id, v_numero;
end;
$$;

grant execute on function crear_pedido(
  text, text, text, uuid, text, text, numeric, numeric, numeric, numeric, text, jsonb
) to anon, authenticated;

-- ── Import atómico de productos + variantes (rutas de inventario, admin) ──
-- SECURITY INVOKER: corre con la sesión autenticada del admin y respeta RLS.
create or replace function importar_productos_variantes(p_productos jsonb, p_variantes jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into productos (
    id, nombre, slug, descripcion, precio, precio_original, categoria_id,
    subcategoria_id, stock, genero, badge, tallas, colores, marca, sku,
    personalizable, activo
  )
  select
    (x->>'id')::uuid,
    x->>'nombre',
    x->>'slug',
    x->>'descripcion',
    (x->>'precio')::numeric,
    (x->>'precio_original')::numeric,
    (x->>'categoria_id')::uuid,
    (x->>'subcategoria_id')::uuid,
    (x->>'stock')::integer,
    x->>'genero',
    x->>'badge',
    case when jsonb_typeof(x->'tallas') = 'array'
      then array(select jsonb_array_elements_text(x->'tallas')) end,
    case when jsonb_typeof(x->'colores') = 'array'
      then array(select jsonb_array_elements_text(x->'colores')) end,
    x->>'marca',
    x->>'sku',
    coalesce((x->>'personalizable')::boolean, false),
    coalesce((x->>'activo')::boolean, true)
  from jsonb_array_elements(coalesce(p_productos, '[]'::jsonb)) x
  on conflict (id) do update set
    nombre = excluded.nombre, slug = excluded.slug, descripcion = excluded.descripcion,
    precio = excluded.precio, precio_original = excluded.precio_original,
    categoria_id = excluded.categoria_id, subcategoria_id = excluded.subcategoria_id,
    stock = excluded.stock, genero = excluded.genero, badge = excluded.badge,
    tallas = excluded.tallas, colores = excluded.colores, marca = excluded.marca,
    sku = excluded.sku, personalizable = excluded.personalizable, activo = excluded.activo;

  update producto_variantes v set
    nombre = x->>'nombre',
    sku    = nullif(x->>'sku', ''),
    precio = (x->>'precio')::numeric,
    stock  = (x->>'stock')::integer,
    activo = coalesce((x->>'activo')::boolean, true)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  where x->>'id' is not null and v.id = (x->>'id')::uuid;

  insert into producto_variantes (producto_id, nombre, sku, precio, stock, activo, orden)
  select
    (x->>'producto_id')::uuid,
    x->>'nombre',
    nullif(x->>'sku', ''),
    (x->>'precio')::numeric,
    (x->>'stock')::integer,
    coalesce((x->>'activo')::boolean, true),
    coalesce((x->>'orden')::integer, 0)
  from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
  where x->>'id' is null;
end;
$$;

grant execute on function importar_productos_variantes(jsonb, jsonb) to authenticated;
```

- [ ] **Step 2: Reflejar en `supabase/schema.sql`**

Añadir (con la misma sintaxis del archivo): la tabla `producto_variantes` después de `productos`; las 2 columnas en la definición de `pedido_items` (`variante_id uuid references producto_variantes(id) on delete set null`, `variante_nombre text`); `alter table producto_variantes enable row level security;` y las 2 policies en la sección RLS; el trigger `producto_variantes_updated_at` junto a los otros triggers. **Nota:** `pedido_items` referencia a `producto_variantes`, así que la tabla nueva va antes de `pedido_items` en el archivo.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-08-04-producto-variantes.sql supabase/schema.sql
git commit -m "feat(bd): tabla producto_variantes, crear_pedido v2 con descuento de stock e importar_productos_variantes"
```

**Verificación:** solo revisión de sintaxis (la migración se aplica en el SQL Editor en la Task 19, antes del push). No hay tests automatizados de SQL.

---

### Task 2: Tipos y helpers puros de variantes

**Files:**
- Modify: `types/index.ts` (añadir `ProductoVariante`, extender `Producto` y `ProductoForm`)
- Modify: `types/store.ts` (añadir `StoreVariante`, extender `StoreProducto` y `CartItem`)
- Create: `lib/store/variantes.ts`
- Modify: `lib/store/adapters.ts` (mapear variantes en `toStoreProducto`)
- Test: `lib/store/tests/variantes.test.ts` (crear)

**Interfaces:**
- Consumes: `Producto` de `types/index.ts`, `StoreProducto` de `types/store.ts`.
- Produces (usados por Tasks 3–18):

```ts
// types/index.ts
export interface ProductoVariante {
  id: string
  producto_id: string
  nombre: string
  sku: string | null
  precio: number | null   // null = hereda productos.precio
  stock: number | null    // null = ilimitado
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}
// Producto gana:  producto_variantes?: ProductoVariante[]
// (join de Supabase; opcional porque no todas las queries lo piden)

export interface VarianteForm {
  id?: string
  nombre: string
  sku: string
  precio: number | null
  stock: number | null
  activo: boolean
}
// ProductoForm gana:  variantes: VarianteForm[]

// types/store.ts
export interface StoreVariante {
  id: string
  nombre: string
  precio: number | null      // propio (null = heredado)
  precioEfectivo: number
  stock: number | null
  agotada: boolean
}
// StoreProducto gana:  variantes: StoreVariante[]   (siempre presente, [] si no hay)
// CartItem gana:  varianteId?: string; variante?: string; stockDisponible?: number | null

// lib/store/variantes.ts
export function precioEfectivo(precioPadre: number, precioVariante: number | null): number
export function toStoreVariantes(precioPadre: number, hijas: ProductoVariante[]): StoreVariante[]
// solo activas, ordenadas por (orden, nombre)
export function stockEfectivo(stockPadre: number | null, variantes: { stock: number | null }[]): number | null
// [] => stockPadre; alguna con stock null => null (ilimitado); si no, suma
export function estaAgotado(stockPadre: number | null, variantes: { stock: number | null }[]): boolean
// stockEfectivo === 0
export function precioDesde(precioPadre: number, variantes: { precioEfectivo: number }[]): { min: number; varia: boolean }
// sin variantes => { min: precioPadre, varia: false }; varia = min !== max
```

- [ ] **Step 1: Escribir tests que fallan** en `lib/store/tests/variantes.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { precioEfectivo, toStoreVariantes, stockEfectivo, estaAgotado, precioDesde } from '../variantes'
import type { ProductoVariante } from '@/types'

function variante(over: Partial<ProductoVariante>): ProductoVariante {
  return {
    id: 'v1', producto_id: 'p1', nombre: 'M', sku: null, precio: null,
    stock: null, activo: true, orden: 0, created_at: '', updated_at: '', ...over,
  }
}

describe('precioEfectivo', () => {
  it('usa el precio propio si existe', () => expect(precioEfectivo(100, 150)).toBe(150))
  it('hereda el del padre si es null', () => expect(precioEfectivo(100, null)).toBe(100))
})

describe('toStoreVariantes', () => {
  it('excluye inactivas y ordena por orden y nombre', () => {
    const out = toStoreVariantes(100, [
      variante({ id: 'b', nombre: 'B', orden: 1 }),
      variante({ id: 'x', nombre: 'X', activo: false }),
      variante({ id: 'a', nombre: 'A', orden: 0 }),
      variante({ id: 'a2', nombre: 'A2', orden: 1 }),
    ])
    expect(out.map(v => v.id)).toEqual(['a', 'b', 'a2'])
  })
  it('calcula precioEfectivo y agotada', () => {
    const out = toStoreVariantes(100, [
      variante({ id: 'v1', precio: 150, stock: 0 }),
      variante({ id: 'v2', precio: null, stock: null }),
    ])
    expect(out[0]).toMatchObject({ precioEfectivo: 150, agotada: true })
    expect(out[1]).toMatchObject({ precioEfectivo: 100, agotada: false })
  })
})

describe('stockEfectivo', () => {
  it('sin variantes devuelve el stock del padre', () => {
    expect(stockEfectivo(7, [])).toBe(7)
    expect(stockEfectivo(null, [])).toBeNull()
  })
  it('suma las variantes e ignora el stock del padre', () => {
    expect(stockEfectivo(99, [{ stock: 2 }, { stock: 3 }])).toBe(5)
  })
  it('una variante ilimitada hace ilimitado el total', () => {
    expect(stockEfectivo(0, [{ stock: 2 }, { stock: null }])).toBeNull()
  })
})

describe('estaAgotado', () => {
  it('true solo cuando el stock efectivo es 0', () => {
    expect(estaAgotado(0, [])).toBe(true)
    expect(estaAgotado(null, [])).toBe(false)
    expect(estaAgotado(9, [{ stock: 0 }, { stock: 0 }])).toBe(true)
  })
})

describe('precioDesde', () => {
  it('sin variantes: precio del padre, no varía', () =>
    expect(precioDesde(100, [])).toEqual({ min: 100, varia: false }))
  it('con precios distintos: mínimo y varia=true', () =>
    expect(precioDesde(100, [{ precioEfectivo: 90 }, { precioEfectivo: 120 }])).toEqual({ min: 90, varia: true }))
  it('con precios iguales: varia=false', () =>
    expect(precioDesde(100, [{ precioEfectivo: 100 }, { precioEfectivo: 100 }])).toEqual({ min: 100, varia: false }))
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/store/tests/variantes.test.ts` — Expected: FAIL (módulo `../variantes` no existe).

- [ ] **Step 3: Implementar** `lib/store/variantes.ts`

```ts
import type { ProductoVariante } from '@/types'
import type { StoreVariante } from '@/types/store'

export function precioEfectivo(precioPadre: number, precioVariante: number | null): number {
  return precioVariante ?? precioPadre
}

export function toStoreVariantes(precioPadre: number, hijas: ProductoVariante[]): StoreVariante[] {
  return hijas
    .filter(v => v.activo)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map(v => ({
      id: v.id,
      nombre: v.nombre,
      precio: v.precio != null ? Number(v.precio) : null,
      precioEfectivo: precioEfectivo(precioPadre, v.precio != null ? Number(v.precio) : null),
      stock: v.stock,
      agotada: v.stock === 0,
    }))
}

export function stockEfectivo(stockPadre: number | null, variantes: { stock: number | null }[]): number | null {
  if (variantes.length === 0) return stockPadre
  if (variantes.some(v => v.stock == null)) return null
  return variantes.reduce((sum, v) => sum + (v.stock as number), 0)
}

export function estaAgotado(stockPadre: number | null, variantes: { stock: number | null }[]): boolean {
  return stockEfectivo(stockPadre, variantes) === 0
}

export function precioDesde(precioPadre: number, variantes: { precioEfectivo: number }[]): { min: number; varia: boolean } {
  if (variantes.length === 0) return { min: precioPadre, varia: false }
  const precios = variantes.map(v => v.precioEfectivo)
  const min = Math.min(...precios)
  return { min, varia: min !== Math.max(...precios) }
}
```

Añadir los tipos del bloque **Interfaces** a `types/index.ts` y `types/store.ts` (en `ProductoForm`, `variantes: VarianteForm[]`; en `StoreProducto`, `variantes: StoreVariante[]`; en `CartItem`, los 3 campos opcionales). En `lib/store/adapters.ts`, `toStoreProducto` añade:

```ts
import { toStoreVariantes } from './variantes'
// dentro del objeto retornado:
    variantes: toStoreVariantes(Number(p.precio), p.producto_variantes ?? []),
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npx vitest run lib/store/tests/variantes.test.ts` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: sin errores. Si `ProductoForm.variantes` rompe a los consumidores actuales del form (`ProductoFields.tsx`, `ProductosClient.tsx`, `CarruselClient.tsx`, `app/admin/productos/actions.ts`), corregir la construcción del form inicial con `variantes: []` (el uso real llega en Fase 2).

- [ ] **Step 5: Commit**

```bash
git add types/ lib/store/variantes.ts lib/store/adapters.ts lib/store/tests/variantes.test.ts
git commit -m "feat(store): tipos y helpers puros de variantes (precio efectivo, stock efectivo, adaptador)"
```

---

### Task 3: `validarCompra` y `traducirErrorPedido` (puros)

**Files:**
- Modify: `lib/store/variantes.ts`
- Test: `lib/store/tests/variantes.test.ts` (ampliar)

**Interfaces:**
- Consumes: `ProductoVariante` (Task 2).
- Produces (usados por el checkout, Task 6):

```ts
export type ValidacionCompra =
  | { ok: true; variante: ProductoVariante | null }
  | { ok: false; motivo: string }
export function validarCompra(
  producto: { id: string; nombre: string; activo: boolean },
  variantesActivas: ProductoVariante[],   // SOLO activas del producto (ya filtradas)
  varianteId: string | undefined,
): ValidacionCompra
export function traducirErrorPedido(message: string | null | undefined): string | null
// null = error no reconocido (el caller usa su mensaje genérico)
```

- [ ] **Step 1: Tests que fallan** (añadir a `lib/store/tests/variantes.test.ts`)

```ts
import { validarCompra, traducirErrorPedido } from '../variantes'

describe('validarCompra', () => {
  const prod = { id: 'p1', nombre: 'Camisa', activo: true }
  it('producto inactivo se rechaza', () => {
    const r = validarCompra({ ...prod, activo: false }, [], undefined)
    expect(r.ok).toBe(false)
  })
  it('plano sin variante pasa con variante null', () => {
    expect(validarCompra(prod, [], undefined)).toEqual({ ok: true, variante: null })
  })
  it('producto con variantes exige varianteId', () => {
    const r = validarCompra(prod, [variante({ id: 'v1' })], undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('Camisa')
  })
  it('varianteId ajeno o inexistente se rechaza', () => {
    const ajena = variante({ id: 'v9', producto_id: 'OTRO' })
    expect(validarCompra(prod, [ajena], 'v9').ok).toBe(false)
    expect(validarCompra(prod, [variante({ id: 'v1' })], 'no-existe').ok).toBe(false)
  })
  it('variante válida se devuelve', () => {
    const v = variante({ id: 'v1', producto_id: 'p1' })
    expect(validarCompra(prod, [v], 'v1')).toEqual({ ok: true, variante: v })
  })
})

describe('traducirErrorPedido', () => {
  it('stock insuficiente con unidades', () =>
    expect(traducirErrorPedido('HS_STOCK|Camisa (M)|3')).toBe('Solo quedan 3 unidades de "Camisa (M)"'))
  it('stock cero = agotado', () =>
    expect(traducirErrorPedido('HS_STOCK|Camisa|0')).toBe('"Camisa" está agotado'))
  it('requiere variante', () =>
    expect(traducirErrorPedido('HS_REQUIERE_VARIANTE|Camisa')).toBe('Elige una variante de "Camisa"'))
  it('variante inválida', () =>
    expect(traducirErrorPedido('HS_VARIANTE|Camisa')).toBe('La variante seleccionada de "Camisa" ya no está disponible'))
  it('producto inactivo', () =>
    expect(traducirErrorPedido('HS_INACTIVO|Camisa')).toBe('"Camisa" ya no está disponible'))
  it('desconocido devuelve null', () => {
    expect(traducirErrorPedido('otra cosa')).toBeNull()
    expect(traducirErrorPedido(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/store/tests/variantes.test.ts` — Expected: FAIL (funciones no exportadas).

- [ ] **Step 3: Implementar** en `lib/store/variantes.ts`

```ts
export type ValidacionCompra =
  | { ok: true; variante: ProductoVariante | null }
  | { ok: false; motivo: string }

// Frontera de confianza: decide si un item del carrito puede comprarse.
// `variantesActivas` deben venir ya filtradas a activas del producto.
export function validarCompra(
  producto: { id: string; nombre: string; activo: boolean },
  variantesActivas: ProductoVariante[],
  varianteId: string | undefined,
): ValidacionCompra {
  if (!producto.activo) return { ok: false, motivo: `"${producto.nombre}" ya no está disponible` }
  if (!varianteId) {
    if (variantesActivas.length > 0) {
      return { ok: false, motivo: `Elige una variante de "${producto.nombre}"` }
    }
    return { ok: true, variante: null }
  }
  const v = variantesActivas.find(v => v.id === varianteId && v.producto_id === producto.id)
  if (!v) {
    return { ok: false, motivo: `La variante seleccionada de "${producto.nombre}" ya no está disponible` }
  }
  return { ok: true, variante: v }
}

// Traduce los errores HS_* que lanza la RPC crear_pedido (ver migración
// 2026-08-04-producto-variantes.sql). null = no reconocido.
export function traducirErrorPedido(message: string | null | undefined): string | null {
  if (!message) return null
  const [codigo, nombre, dato] = message.split('|')
  switch (codigo) {
    case 'HS_STOCK':
      return dato === '0' ? `"${nombre}" está agotado` : `Solo quedan ${dato} unidades de "${nombre}"`
    case 'HS_REQUIERE_VARIANTE':
      return `Elige una variante de "${nombre}"`
    case 'HS_VARIANTE':
      return `La variante seleccionada de "${nombre}" ya no está disponible`
    case 'HS_INACTIVO':
      return `"${nombre}" ya no está disponible`
    default:
      return null
  }
}
```

- [ ] **Step 4: Correr tests**

Run: `npx vitest run lib/store/tests/variantes.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/variantes.ts lib/store/tests/variantes.test.ts
git commit -m "feat(store): validarCompra y traducirErrorPedido para el checkout con variantes"
```

---

### Task 4: Carrito — clave de línea con variante y tope de stock

**Files:**
- Modify: `lib/store/cart.ts`
- Test: `lib/store/tests/cart.test.ts` (ampliar; si no existe con ese nombre, ubicar el test actual de carrito en `lib/store/tests/` y ampliarlo, o crearlo)

**Interfaces:**
- Consumes: `CartItem` con `varianteId?/variante?/stockDisponible?` (Task 2).
- Produces: `addToCart` distingue líneas por variante; `changeQty` respeta `stockDisponible`. Firmas sin cambios: `addToCart(cart, item: Omit<CartItem, 'qty'>)`, `changeQty(cart, idx, delta)`.

- [ ] **Step 1: Tests que fallan**

```ts
import { addToCart, changeQty, normalizeStoredCart } from '../cart'
import type { CartItem } from '@/types/store'

const base: Omit<CartItem, 'qty'> = {
  id: 'p1', nombre: 'Camisa', precio: 100, imagen: '',
  size: '', custom: 'Sin personalización', personalizable: false,
}

describe('addToCart con variantes', () => {
  it('distinta variante = líneas separadas', () => {
    let cart = addToCart([], { ...base, varianteId: 'v1', variante: 'M' })
    cart = addToCart(cart, { ...base, varianteId: 'v2', variante: 'L' })
    expect(cart).toHaveLength(2)
  })
  it('misma variante suma cantidad', () => {
    let cart = addToCart([], { ...base, varianteId: 'v1', variante: 'M' })
    cart = addToCart(cart, { ...base, varianteId: 'v1', variante: 'M' })
    expect(cart).toHaveLength(1)
    expect(cart[0].qty).toBe(2)
  })
  it('item plano guardado sin varianteId sigue combinando por talla', () => {
    let cart = addToCart([], { ...base, size: 'M' })
    cart = addToCart(cart, { ...base, size: 'M' })
    expect(cart).toHaveLength(1)
  })
})

describe('changeQty con stockDisponible', () => {
  it('no supera el stock conocido', () => {
    const cart: CartItem[] = [{ ...base, qty: 3, varianteId: 'v1', stockDisponible: 3 }]
    expect(changeQty(cart, 0, +1)[0].qty).toBe(3)
  })
  it('sin stockDisponible no hay tope', () => {
    const cart: CartItem[] = [{ ...base, qty: 3 }]
    expect(changeQty(cart, 0, +1)[0].qty).toBe(4)
  })
  it('bajar y eliminar en 0 sigue funcionando', () => {
    const cart: CartItem[] = [{ ...base, qty: 1, stockDisponible: 5 }]
    expect(changeQty(cart, 0, -1)).toHaveLength(0)
  })
})

describe('normalizeStoredCart con carritos viejos', () => {
  it('items sin campos de variante quedan como planos', () => {
    const viejo = [{ id: 'p1', nombre: 'X', precio: 1, imagen: '', size: 'M', custom: '', qty: 1 }] as CartItem[]
    const [item] = normalizeStoredCart(viejo)
    expect(item.varianteId).toBeUndefined()
    expect(item.personalizable).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/store/tests/cart.test.ts` — Expected: FAIL (líneas de distinta variante se combinan; `changeQty` supera el tope).

- [ ] **Step 3: Implementar** en `lib/store/cart.ts`

```ts
export function addToCart(cart: CartItem[], item: Omit<CartItem, 'qty'>): CartItem[] {
  const idx = cart.findIndex(
    i =>
      i.id === item.id &&
      (i.varianteId ?? '') === (item.varianteId ?? '') &&
      i.size === item.size &&
      i.custom === item.custom
  )
  if (idx === -1) return [...cart, { ...item, qty: 1 }]
  return cart.map((i, index) => (index === idx ? { ...i, qty: i.qty + 1 } : i))
}

export function changeQty(cart: CartItem[], idx: number, delta: number): CartItem[] {
  return cart
    .map((item, i) => {
      if (i !== idx) return item
      const tope = item.stockDisponible ?? Infinity
      return { ...item, qty: Math.min(item.qty + delta, tope) }
    })
    .filter(item => item.qty > 0)
}
```

`normalizeStoredCart` no necesita cambios de código (los campos nuevos son opcionales), pero el test lo fija como contrato.

- [ ] **Step 4: Correr toda la suite**

Run: `npm test` — Expected: PASS (incluye los tests previos de carrito).

- [ ] **Step 5: Commit**

```bash
git add lib/store/cart.ts lib/store/tests/cart.test.ts
git commit -m "feat(store): clave de línea de carrito por variante y tope por stock conocido"
```

---

### Task 5: `orderTotals` — items de pedido con variante

**Files:**
- Modify: `lib/store/orderTotals.ts`
- Test: `lib/store/tests/orderTotals.test.ts` (ampliar o crear)

**Interfaces:**
- Consumes: `CartItem` con variante (Task 2).
- Produces (usado por checkout Task 6 y RPC Task 1):

```ts
export interface PedidoItemInsert {
  producto_id: string
  nombre_producto: string
  precio: number
  cantidad: number
  talla: string | null            // null en items con variante
  variante_id: string | null
  variante_nombre: string | null
  personalizado_nombre: string | null
  imagen_url: string
}
```

- [ ] **Step 1: Tests que fallan**

```ts
import { cartItemsToPedidoItems } from '../orderTotals'
import type { CartItem } from '@/types/store'

describe('cartItemsToPedidoItems con variantes', () => {
  it('item con variante lleva variante_id/nombre y talla null', () => {
    const cart: CartItem[] = [{
      id: 'p1', nombre: 'Camisa', precio: 150, imagen: 'img', size: '',
      custom: 'Sin personalización', qty: 2, personalizable: false,
      varianteId: 'v1', variante: 'Edición retro',
    }]
    expect(cartItemsToPedidoItems(cart)[0]).toMatchObject({
      producto_id: 'p1', precio: 150, cantidad: 2,
      talla: null, variante_id: 'v1', variante_nombre: 'Edición retro',
    })
  })
  it('item plano lleva talla y variante_* null', () => {
    const cart: CartItem[] = [{
      id: 'p1', nombre: 'Camisa', precio: 100, imagen: '', size: 'M',
      custom: '', qty: 1, personalizable: false,
    }]
    expect(cartItemsToPedidoItems(cart)[0]).toMatchObject({
      talla: 'M', variante_id: null, variante_nombre: null,
    })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/store/tests/orderTotals.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar** — en `orderTotals.ts` actualizar `PedidoItemInsert` (bloque Interfaces) y:

```ts
export function cartItemsToPedidoItems(cart: CartItem[]): PedidoItemInsert[] {
  return cart.map(item => ({
    producto_id: item.id,
    nombre_producto: item.nombre,
    precio: item.precio,
    cantidad: item.qty,
    talla: item.varianteId ? null : item.size,
    variante_id: item.varianteId ?? null,
    variante_nombre: item.variante ?? null,
    personalizado_nombre: item.custom === SIN_PERSONALIZACION || item.custom === '' ? null : item.custom,
    imagen_url: item.imagen,
  }))
}
```

- [ ] **Step 4: Correr suite y typecheck** — Run: `npm test` y `npx tsc --noEmit` — Expected: PASS / sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/store/orderTotals.ts lib/store/tests/orderTotals.test.ts
git commit -m "feat(store): pedido_items con variante_id y variante_nombre"
```

---

### Task 6: Checkout — releer variantes, validar y traducir errores de la RPC

**Files:**
- Modify: `app/(store)/checkout/actions.ts`
- Modify: `components/store/CheckoutModal.tsx` (el payload del carrito, hoy en la línea ~113, agrega `varianteId`)
- Modify: `types/index.ts` (`PedidoItem` gana `variante_id: string | null` y `variante_nombre: string | null`)

**Interfaces:**
- Consumes: `validarCompra`, `precioEfectivo`, `traducirErrorPedido` (Tasks 2–3); `cartItemsToPedidoItems` (Task 5); RPC v2 (Task 1).
- Produces: `crearPedido` acepta items `{ id, size, custom, qty, varianteId? }`; `CrearPedidoInput` cambia acorde.

- [ ] **Step 1: Actualizar el schema Zod** en `app/(store)/checkout/actions.ts`

```ts
const cartItemSchema = z.object({
  id: z.string().uuid(),
  size: z.string(),                       // '' en items con variante
  custom: z.string(),
  qty: z.number().int().positive().max(99),
  varianteId: z.string().uuid().optional(),
})
```

- [ ] **Step 2: Releer variantes y construir el carrito confiable** — reemplazar el bloque de relectura (líneas ~47–74) por:

```ts
import { validarCompra, precioEfectivo, traducirErrorPedido } from '@/lib/store/variantes'
import type { ProductoVariante } from '@/types'

const productIds = [...new Set(cart.map(item => item.id))]
const [{ data: productos, error: productosError }, { data: variantesRows, error: variantesError }] =
  await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, precio, imagenes, activo, personalizable')
      .in('id', productIds),
    supabase
      .from('producto_variantes')
      .select('*')
      .in('producto_id', productIds)
      .eq('activo', true),
  ])

if (productosError || !productos || variantesError) {
  return { error: GENERIC_ERROR }
}

const productosById = new Map(productos.map(p => [p.id, p]))
const variantesPorProducto = new Map<string, ProductoVariante[]>()
for (const v of (variantesRows ?? []) as ProductoVariante[]) {
  const lista = variantesPorProducto.get(v.producto_id) ?? []
  lista.push(v)
  variantesPorProducto.set(v.producto_id, lista)
}

const trustedCart: CartItem[] = []
for (const item of cart) {
  const producto = productosById.get(item.id)
  if (!producto) {
    return { error: 'Uno o más productos del carrito ya no están disponibles' }
  }
  const resultado = validarCompra(producto, variantesPorProducto.get(item.id) ?? [], item.varianteId)
  if (!resultado.ok) return { error: resultado.motivo }
  const variante = resultado.variante
  trustedCart.push({
    id: producto.id,
    nombre: producto.nombre,
    precio: variante
      ? precioEfectivo(Number(producto.precio), variante.precio != null ? Number(variante.precio) : null)
      : Number(producto.precio),
    imagen: producto.imagenes?.[0] ?? '',
    size: variante ? '' : item.size,
    custom: resolveTrustedCustom(producto.personalizable, item.custom),
    qty: item.qty,
    personalizable: producto.personalizable,
    varianteId: variante?.id,
    variante: variante?.nombre,
  })
}
```

(Nota: `validarCompra` ya cubre el caso `!producto.activo`; el `if (!producto)` de arriba cubre el id inexistente.)

- [ ] **Step 3: Traducir el error de la RPC** — reemplazar el manejo final:

```ts
if (error || !data) {
  console.error('crear_pedido RPC error:', error)
  return { error: traducirErrorPedido(error?.message) ?? GENERIC_ERROR }
}
```

- [ ] **Step 4: `CheckoutModal.tsx`** — donde arma el payload del carrito, incluir la variante:

```ts
cart: cart.map(item => ({
  id: item.id,
  size: item.size,
  custom: item.custom,
  qty: item.qty,
  ...(item.varianteId ? { varianteId: item.varianteId } : {}),
})),
```

Ojo: si el mapeo actual usa `size: item.size` con `min(1)` implícito, ya no hay mínimo — los items con variante mandan `size: ''`.

- [ ] **Step 5: `PedidoItem` en `types/index.ts`** — añadir `variante_id: string | null` y `variante_nombre: string | null` tras `color`.

- [ ] **Step 6: Verificar**

Run: `npm test` — Expected: PASS. Run: `npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/(store)/checkout/actions.ts components/store/CheckoutModal.tsx types/index.ts
git commit -m "feat(checkout): validar variantes, precio efectivo del servidor y errores de stock traducidos"
```

---

## Fase 2 — Admin

### Task 7: Server actions de producto con variantes

**Files:**
- Modify: `app/admin/productos/actions.ts`
- Modify: las páginas/fetch del admin que cargan productos para el form: `app/admin/productos/page.tsx` y la página del carrusel (`app/admin/productos/carrusel/page.tsx` o donde viva el fetch de `CarruselClient`) — el select agrega `producto_variantes(*)`.

**Interfaces:**
- Consumes: `VarianteForm`, `ProductoForm.variantes` (Task 2).
- Produces: `createProducto(form)` y `updateProducto(id, form)` sincronizan las hijas (upsert enviados + delete de las que ya no vienen). Firmas sin cambios.

- [ ] **Step 1: Implementar `syncVariantes`** en `app/admin/productos/actions.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VarianteForm } from '@/types'

// Sincroniza las hijas de un producto con lo enviado por el form:
// upsert de las presentes (orden = posición) y delete de las ausentes.
async function syncVariantes(
  supabase: SupabaseClient,
  productoId: string,
  variantes: VarianteForm[],
): Promise<string | null> {
  const { data: actuales, error: readError } = await supabase
    .from('producto_variantes')
    .select('id')
    .eq('producto_id', productoId)
  if (readError) return readError.message

  const enviados = new Set(variantes.map(v => v.id).filter(Boolean))
  const aBorrar = (actuales ?? []).map(r => r.id as string).filter(id => !enviados.has(id))
  if (aBorrar.length) {
    const { error } = await supabase.from('producto_variantes').delete().in('id', aBorrar)
    if (error) return error.message
  }

  if (variantes.length) {
    const payload = variantes.map((v, i) => ({
      ...(v.id ? { id: v.id } : {}),
      producto_id: productoId,
      nombre: v.nombre.trim(),
      sku: v.sku.trim() || null,
      precio: v.precio ?? null,
      stock: v.stock ?? null,
      activo: v.activo,
      orden: i,
    }))
    const { error } = await supabase
      .from('producto_variantes')
      .upsert(payload, { onConflict: 'id' })
    if (error) return error.message
  }
  return null
}
```

- [ ] **Step 2: Usarla en create/update**

En `createProducto`: el `insert` actual agrega `.select('id').single()` para obtener el id, luego `const syncError = await syncVariantes(supabase, data.id, form.variantes); if (syncError) return { error: syncError }`.
En `updateProducto`: tras el `update` exitoso, mismo sync con el `id` recibido.
Validación previa en ambos: nombres de variante vacíos o repetidos dentro del form → `return { error: 'Cada variante necesita un nombre único' }`.

- [ ] **Step 3: Fetch con variantes** — en las páginas admin que alimentan `ProductosClient` y `CarruselClient`, el select de productos pasa a incluir `producto_variantes(*)` (mantener el resto igual). Ordenar en el cliente con `toStoreVariantes`/`orden` no aplica aquí: el form las ordena por `orden` al cargar (`[...(p.producto_variantes ?? [])].sort((a, b) => a.orden - b.orden)`).

- [ ] **Step 4: Verificar** — Run: `npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/productos/
git commit -m "feat(admin): sincronizar variantes hijas al crear/actualizar producto"
```

---

### Task 8: Formulario admin — sección "Variantes"

**Files:**
- Modify: `components/admin/ProductoFields.tsx` (y su CSS module si existe; si los estilos viven en un module compartido del admin, usarlo)

**Interfaces:**
- Consumes: `ProductoForm.variantes: VarianteForm[]` (Task 2); `productoAForm` (helper existente en el mismo archivo, línea ~9) gana `variantes` desde `p.producto_variantes`.
- Produces: UI que edita `form.variantes` vía el mismo `onChange` del form que usan los demás campos.

- [ ] **Step 1: `productoAForm` carga variantes**

```ts
variantes: [...(p.producto_variantes ?? [])]
  .sort((a, b) => a.orden - b.orden)
  .map(v => ({
    id: v.id,
    nombre: v.nombre,
    sku: v.sku ?? '',
    precio: v.precio != null ? Number(v.precio) : null,
    stock: v.stock,
    activo: v.activo,
  })),
```

(y el form vacío inicial usa `variantes: []`).

- [ ] **Step 2: Sección de variantes** (solo `modo='completo'`), después del bloque de tallas/colores:

```tsx
<div className={styles.variantesSection}>
  <label>Variantes (opcional) — si agregas variantes, el producto se vende por variante</label>
  {form.variantes.map((v, i) => (
    <div key={v.id ?? `nueva-${i}`} className={styles.varianteRow}>
      <input placeholder="Nombre (ej. M, Edición retro)" value={v.nombre}
        onChange={e => setVariante(i, { nombre: e.target.value })} />
      <input placeholder="SKU" value={v.sku}
        onChange={e => setVariante(i, { sku: e.target.value })} />
      <input type="number" placeholder="Precio (vacío = hereda)" value={v.precio ?? ''}
        onChange={e => setVariante(i, { precio: e.target.value === '' ? null : Number(e.target.value) })} />
      <input type="number" placeholder="Stock (vacío = ilimitado)" value={v.stock ?? ''}
        onChange={e => setVariante(i, { stock: e.target.value === '' ? null : Number(e.target.value) })} />
      <label><input type="checkbox" checked={v.activo}
        onChange={e => setVariante(i, { activo: e.target.checked })} /> Activa</label>
      <button type="button" onClick={() => moverVariante(i, -1)} disabled={i === 0}>↑</button>
      <button type="button" onClick={() => moverVariante(i, +1)} disabled={i === form.variantes.length - 1}>↓</button>
      <button type="button" onClick={() => quitarVariante(i)}>Quitar</button>
    </div>
  ))}
  <button type="button" onClick={agregarVariante}>+ Agregar variante</button>
</div>
```

con helpers locales que llaman al `onChange`/setter del form existente:

```ts
const setVariante = (i: number, patch: Partial<VarianteForm>) =>
  set('variantes', form.variantes.map((v, idx) => (idx === i ? { ...v, ...patch } : v)))
const agregarVariante = () =>
  set('variantes', [...form.variantes, { nombre: '', sku: '', precio: null, stock: null, activo: true }])
const quitarVariante = (i: number) =>
  set('variantes', form.variantes.filter((_, idx) => idx !== i))
const moverVariante = (i: number, delta: number) => {
  const j = i + delta
  const copia = [...form.variantes]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  set('variantes', copia)
}
```

(`set` = el mecanismo de actualización de campo que ya usa el componente; adaptar al patrón real del archivo.)

- [ ] **Step 3: Atenuar stock/tallas del padre** — cuando `form.variantes.length > 0`, los inputs de **Stock** (~línea 153) y **Tallas** (~línea 191) se deshabilitan (`disabled`) con el hint "Este producto vende por variantes; el stock y las tallas del padre no se usan".

- [ ] **Step 4: Verificación manual** — `npm run dev`, abrir `/admin/productos`, crear un producto con 2 variantes (una con precio propio, otra heredando), guardar, recargar y confirmar que persisten con su orden; quitar una y confirmar que se borra. Run: `npx tsc --noEmit` — sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/admin/
git commit -m "feat(admin): sección de variantes en el formulario de producto"
```

---

### Task 9: Stock efectivo en admin (listado, carrusel, KPI, pedidos)

**Files:**
- Modify: `lib/store/inventoryFilters.ts`
- Modify: `app/admin/productos/ProductosClient.tsx` (columna stock, ~línea 205)
- Modify: `app/admin/page.tsx` (KPI stock bajo, ~líneas 32 y 69)
- Modify: `app/admin/pedidos/PedidosClient.tsx` (~línea 109)
- Test: `lib/store/tests/inventoryFilters.test.ts` (ampliar)

**Interfaces:**
- Consumes: `stockEfectivo` (Task 2); `Producto.producto_variantes` (Task 2); fetch con `producto_variantes(*)` (Task 7).
- Produces: `pasaStock` (interno de `filtrarInventario`) evalúa el stock efectivo; sin cambios de firma pública.

- [ ] **Step 1: Tests que fallan** (añadir a `lib/store/tests/inventoryFilters.test.ts`)

```ts
it('sinStock detecta producto cuyas variantes suman 0', () => {
  const p = producto({ stock: 99, producto_variantes: [
    variante({ stock: 0 }), variante({ stock: 0 }),
  ]})
  expect(filtrarInventario([p], { sinStock: true })).toHaveLength(1)
})
it('stockBajo usa la suma de variantes', () => {
  const p = producto({ stock: null, producto_variantes: [
    variante({ stock: 1 }), variante({ stock: 2 }),
  ]})
  expect(filtrarInventario([p], { stockBajo: true })).toHaveLength(1)
})
it('variante ilimitada = no cuenta como bajo ni sin stock', () => {
  const p = producto({ stock: 0, producto_variantes: [variante({ stock: null })] })
  expect(filtrarInventario([p], { sinStock: true })).toHaveLength(0)
})
it('variantes inactivas no suman', () => {
  const p = producto({ stock: null, producto_variantes: [
    variante({ stock: 50, activo: false }), variante({ stock: 0 }),
  ]})
  expect(filtrarInventario([p], { sinStock: true })).toHaveLength(1)
})
```

(usar/crear los helpers `producto()`/`variante()` de fábrica del archivo de test.)

- [ ] **Step 2: Correr y verificar que falla** — Run: `npx vitest run lib/store/tests/inventoryFilters.test.ts`.

- [ ] **Step 3: Implementar** en `inventoryFilters.ts`:

```ts
import { stockEfectivo } from './variantes'

function stockDe(p: Producto): number | null {
  return stockEfectivo(p.stock, (p.producto_variantes ?? []).filter(v => v.activo))
}

function pasaStock(p: Producto, c: CriteriosInventario): boolean {
  if (!c.stockBajo && !c.sinStock) return true
  const stock = stockDe(p)
  const bajo = c.stockBajo === true && stock != null && stock > 0 && stock < UMBRAL_STOCK_BAJO
  const sin = c.sinStock === true && stock === 0
  return bajo || sin
}
```

- [ ] **Step 4: UI admin**

- `ProductosClient.tsx` (columna stock): mostrar el stock efectivo y el conteo de variantes:
  `const stock = stockEfectivo(p.stock, (p.producto_variantes ?? []).filter(v => v.activo))` → `{stock ?? '∞'}` + sufijo `· N var.` cuando `p.producto_variantes?.length`.
- `app/admin/page.tsx` (KPI "Stock bajo"): reemplazar la query de conteo por un fetch ligero `productos.select('id, stock, activo, producto_variantes(stock, activo)')` y contar en código con `stockEfectivo` (`stock != null && stock > 0 && stock < 5`; mantener la semántica actual del KPI).
- `PedidosClient.tsx`: donde muestra `item.talla`, mostrar `item.variante_nombre ?? item.talla`.

- [ ] **Step 5: Verificar** — Run: `npm test` y `npx tsc --noEmit` — Expected: PASS / sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/store/inventoryFilters.ts lib/store/tests/ app/admin/
git commit -m "feat(admin): stock efectivo con variantes en filtros, listado, KPI y pedidos"
```

---

## Fase 3 — Tienda pública

### Task 10: Fetch con variantes y dropdown en la página de producto

**Files:**
- Modify: `app/(store)/page.tsx` (~línea 32: `PRODUCTO_SELECT`) y `app/(store)/producto/[slug]/page.tsx` (~líneas 57–58)
- Modify: `components/store/ProductDetail.tsx` + `components/store/ProductDetail.module.css`

**Interfaces:**
- Consumes: `StoreProducto.variantes` (adaptador de Task 2 — el join llena `producto_variantes` y `toStoreProducto` lo convierte).
- Produces: `addToCart` recibe `varianteId/variante/stockDisponible` en items con variante.

- [ ] **Step 1: Ampliar los selects** — donde se define `PRODUCTO_SELECT` (mismo string en ambas páginas), añadir el join:

```ts
const PRODUCTO_SELECT =
  '*, categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor), producto_variantes(*)'
```

(usar los alias exactos que ya tenga el string actual; solo se agrega `, producto_variantes(*)`). La RLS pública ya limita a variantes activas de padres activos, pero el adaptador filtra `activo` igualmente.

- [ ] **Step 2: Dropdown en `ProductDetail.tsx`** — junto al estado actual (~línea 51):

```tsx
const variantes = producto.variantes
const conVariantes = variantes.length > 0
const [selectedVarianteId, setSelectedVarianteId] = useState(
  () => variantes.find(v => !v.agotada)?.id ?? ''
)
const selectedVariante = variantes.find(v => v.id === selectedVarianteId) ?? null
const precioActual = selectedVariante?.precioEfectivo ?? producto.precio
const todasAgotadas = conVariantes && variantes.every(v => v.agotada)
```

El bloque de precio (~línea 140) usa `precioActual` en vez de `producto.precio`. El selector de talla (~líneas 149–169) queda dentro de `{!conVariantes && tallas.length > 0 && (...)}`, y antes se agrega:

```tsx
{conVariantes && (
  <div className={styles.section}>
    <label className={styles.label} htmlFor="variante-select">ELIGE UNA OPCIÓN</label>
    <select
      id="variante-select"
      className={styles.varianteSelect}
      value={selectedVarianteId}
      onChange={e => setSelectedVarianteId(e.target.value)}
    >
      {selectedVarianteId === '' && <option value="">Selecciona…</option>}
      {variantes.map(v => (
        <option key={v.id} value={v.id} disabled={v.agotada}>
          {v.nombre}
          {v.precioEfectivo !== producto.precio ? ` — ${formatPrice(v.precioEfectivo)}` : ''}
          {v.agotada ? ' (Agotada)' : ''}
        </option>
      ))}
    </select>
  </div>
)}
```

`handleAddToCart` (~línea 72):

```ts
function handleAddToCart() {
  if (conVariantes && (!selectedVariante || selectedVariante.agotada)) return
  addToCart({
    id: producto.id,
    nombre: producto.nombre,
    precio: precioActual,
    imagen: producto.imagenes[0] ?? '',
    size: conVariantes ? '' : selectedTalla || 'Única',
    custom: custom.trim() || 'Sin personalización',
    personalizable: producto.personalizable,
    ...(selectedVariante
      ? { varianteId: selectedVariante.id, variante: selectedVariante.nombre, stockDisponible: selectedVariante.stock }
      : {}),
  })
}
```

Botón AGREGAR AL CARRITO: `disabled={todasAgotadas || (conVariantes && !selectedVariante)}`; si `todasAgotadas`, el texto cambia a "AGOTADO". Estilo `.varianteSelect` en el module CSS acorde al look de `.tallaBtn` (borde, padding, tipografía de la tienda).

- [ ] **Step 3: Verificación manual** — `npm run dev`: producto con variantes muestra dropdown, precio cambia al elegir, agotada deshabilitada, agregar al carrito respeta la variante; producto plano intacto (botonera de tallas). Run: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add app/(store)/ components/store/ProductDetail.tsx components/store/ProductDetail.module.css
git commit -m "feat(store): dropdown de variantes con precio efectivo en la página de producto"
```

---

### Task 11: Tarjetas ("Desde", AGOTADO) y quick-add

**Files:**
- Modify: `components/store/ProductCard.tsx` (badge ~líneas 94–96, precio)
- Modify: `app/(store)/StoreClient.tsx` (quick-add ~líneas 76–89)
- Modify: `components/store/WishlistDrawer.tsx` (quick-add ~líneas 27–38)

**Interfaces:**
- Consumes: `precioDesde`, `stockEfectivo`, `estaAgotado` (Task 2); `StoreProducto.variantes`.
- Produces: nada nuevo para otras tasks.

- [ ] **Step 1: `ProductCard.tsx`**

```ts
import { precioDesde, stockEfectivo, estaAgotado } from '@/lib/store/variantes'

const desde = precioDesde(producto.precio, producto.variantes)
const stock = stockEfectivo(producto.stock, producto.variantes)
const agotado = estaAgotado(producto.stock, producto.variantes)
```

- Precio: si `desde.varia`, renderizar `Desde {formatPrice(desde.min)}`; si no, `formatPrice(producto.precio)` como hoy.
- Badge "ÚLTIMAS N UNIDADES" (STOCK_LIMITE=5): usar `stock` efectivo en lugar de `producto.stock`.
- Badge nuevo "AGOTADO" cuando `agotado` (prioridad sobre "últimas unidades"); estilo en el module CSS de la tarjeta.

- [ ] **Step 2: Quick-add navega si hay variantes** — en `StoreClient.tsx` y `WishlistDrawer.tsx`, al inicio del handler de quick-add:

```ts
if (p.variantes.length > 0) {
  router.push(`/producto/${p.slug}`)   // en WishlistDrawer: cerrar el drawer antes
  return
}
```

(`useRouter` de `next/navigation`; si el componente ya usa `Link`/router, seguir su patrón). Los planos siguen el flujo actual con `tallas[0]`.

- [ ] **Step 3: Verificación manual** — tarjeta de producto con variantes de precios distintos muestra "Desde"; con todas las variantes en 0 muestra AGOTADO; el `+` navega al detalle. Producto plano: sin cambios. Run: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add components/store/ app/(store)/StoreClient.tsx
git commit -m "feat(store): precio desde, badge agotado y quick-add consciente de variantes"
```

---

### Task 12: CartDrawer con variante

**Files:**
- Modify: `components/store/CartDrawer.tsx` (etiqueta talla ~línea 116, key de render ~línea 105)

**Interfaces:**
- Consumes: `CartItem.variante/varianteId/stockDisponible` (Task 2); `changeQty` con tope (Task 4 — sin cambios aquí, ya lo aplica el provider).

- [ ] **Step 1: Mostrar la variante** — donde renderiza `TALLA: {item.size}`:

```tsx
{item.variante
  ? <>OPCIÓN: {item.variante}</>
  : <>TALLA: {item.size}</>}
```

Key de render: incluir la variante — `` `${item.id}-${item.varianteId ?? ''}-${item.size}-${item.custom}-${idx}` ``.

- [ ] **Step 2: Feedback del tope** — el botón `+` se deshabilita cuando `item.stockDisponible != null && item.qty >= item.stockDisponible` (el clamp real ya vive en `changeQty`).

- [ ] **Step 3: Verificación manual** — agregar 2 variantes distintas del mismo producto → 2 líneas con su nombre; `+` se detiene en el stock. Run: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add components/store/CartDrawer.tsx
git commit -m "feat(store): carrito muestra la variante y respeta su stock"
```

**Checkpoint Fase 1–3:** `npm test`, `npx tsc --noEmit`, `npm run build` — todo verde antes de seguir.

---

## Fase 4 — Round-trip Excel (herramienta B)

### Task 13: Export con pestaña "Variantes"

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts` (`buildExportData`, `INSTRUCCIONES`, nueva const `VARIANTES_COLUMNAS`)
- Test: `lib/store/tests/inventoryRoundtrip.test.ts` (ampliar)

**Interfaces:**
- Consumes: `ProductoVariante` (Task 2).
- Produces (usado por la ruta de export, Task 15):

```ts
export const VARIANTES_COLUMNAS = [
  'producto_id', 'producto', 'variante_id', 'variante', 'sku', 'precio', 'stock', 'activo',
] as const
export const NOTA_VENDE_POR_VARIANTES = 'vende por variantes'
export function buildExportData(
  productos: Producto[],
  categorias: CategoriaRef[],
  subcategorias: CategoriaRef[],
  variantes: ProductoVariante[],
): { actualizar: Record<string, string | number>[]; variantes: Record<string, string | number>[] }
```

- [ ] **Step 1: Tests que fallan**

```ts
it('exporta la pestaña Variantes con una fila por variante', () => {
  const { variantes } = buildExportData([prod], [], [], [
    varianteBD({ id: 'v1', producto_id: prod.id, nombre: 'M', sku: 'SKU-M', precio: 150, stock: 3, orden: 0 }),
    varianteBD({ id: 'v2', producto_id: prod.id, nombre: 'L', sku: null, precio: null, stock: null, orden: 1 }),
  ])
  expect(variantes).toEqual([
    { producto_id: prod.id, producto: prod.nombre, variante_id: 'v1', variante: 'M', sku: 'SKU-M', precio: 150, stock: 3, activo: 'VERDADERO' },
    { producto_id: prod.id, producto: prod.nombre, variante_id: 'v2', variante: 'L', sku: '', precio: '', stock: '', activo: 'VERDADERO' },
  ])
})
it('un producto con variantes exporta stock y tallas con la nota', () => {
  const { actualizar } = buildExportData([prod], [], [], [varianteBD({ producto_id: prod.id })])
  expect(actualizar[0].stock).toBe('vende por variantes')
  expect(actualizar[0].tallas).toBe('vende por variantes')
})
it('un producto sin variantes exporta stock y tallas normales', () => {
  const { actualizar } = buildExportData([{ ...prod, stock: 4 }], [], [], [])
  expect(actualizar[0].stock).toBe(4)
})
```

- [ ] **Step 2: Correr y verificar que falla** — `npx vitest run lib/store/tests/inventoryRoundtrip.test.ts`.

- [ ] **Step 3: Implementar** — `buildExportData` recibe `variantes`, arma `conVariantes = new Set(variantes.map(v => v.producto_id))`; en el map de `actualizar`, `stock`/`tallas` = `NOTA_VENDE_POR_VARIANTES` si el id está en el set; construir `variantes` ordenadas por producto y `orden` (fila: `sku: v.sku ?? ''`, `precio: v.precio ?? ''`, `stock: v.stock ?? ''`, `activo: v.activo ? 'VERDADERO' : 'FALSO'`). Añadir a `INSTRUCCIONES`:

```
'Pestaña "Variantes": variantes de productos (stock y precio por variante).',
'- NO modifiques producto_id ni variante_id: son las llaves.',
'- Para crear una variante: fila nueva con producto_id y variante (nombre), variante_id vacío.',
'- variante (nombre): obligatorio y único dentro del producto.',
'- precio: vacío = hereda el precio del producto padre.',
'- stock: vacío = no cambia (en filas nuevas = ilimitado); 0 = agotada.',
'- Si un producto tiene variantes, su stock y tallas en "Actualizar" se ignoran.',
```

- [ ] **Step 4: Correr tests** — Expected: PASS. (El typecheck fallará en la ruta de export hasta la Task 15 si llama a `buildExportData` con 3 args: actualizar la llamada allí mismo si `tsc` lo exige; la ruta completa se termina en la Task 15.)

- [ ] **Step 5: Commit**

```bash
git add lib/store/inventoryRoundtrip.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(inventario): export round-trip con pestaña Variantes"
```

---

### Task 14: Parse de la pestaña "Variantes" (import atómico)

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts`
- Test: `lib/store/tests/inventoryRoundtrip.test.ts` (ampliar)

**Interfaces:**
- Consumes: tipos de la Task 13.
- Produces (usado por la ruta de import Task 15 y por externalImport Tasks 16–17):

```ts
export interface VarianteRow {
  producto_id?: string; producto?: string; variante_id?: string; variante?: string
  sku?: string | number; precio?: string | number; stock?: string | number
  activo?: string | boolean | number
}
export interface VarianteData {
  nombre: string; sku: string | null; precio: number | null
  stock: number | null; activo: boolean
}
export type VarianteUpdate = VarianteData & { id: string; producto_id: string }
export type VarianteCreate = VarianteData & { producto_id: string; orden: number }
// ImportError.pestaña ahora es 'Actualizar' | 'Nuevos' | 'Variantes'
// ParseContext gana:  variantesExistentes: ProductoVariante[]
// ParseResult gana:   variantes: { updates: VarianteUpdate[]; creates: VarianteCreate[] }
// parseInventoryUpload input gana:  variantes: VarianteRow[]
```

- [ ] **Step 1: Tests que fallan** (casos mínimos)

```ts
const ctxV = { ...ctx, variantesExistentes: [varianteBD({ id: 'v1', producto_id: prod.id, nombre: 'M', sku: 'SKU-M', stock: 3 })] }
const vacio = { actualizar: [], nuevos: [] }

it('actualiza una variante existente por variante_id', () => {
  const r = parseInventoryUpload({ ...vacio, variantes: [
    { producto_id: prod.id, variante_id: 'v1', variante: 'M', stock: '10' },
  ]}, ctxV)
  expect(r.errors).toEqual([])
  expect(r.variantes.updates[0]).toMatchObject({ id: 'v1', stock: 10, nombre: 'M' })
})
it('celda vacía = no cambia (stock/precio/sku conservan el valor de BD)', () => {
  const r = parseInventoryUpload({ ...vacio, variantes: [
    { producto_id: prod.id, variante_id: 'v1', variante: 'M' },
  ]}, ctxV)
  expect(r.variantes.updates[0]).toMatchObject({ stock: 3, sku: 'SKU-M' })
})
it('fila sin variante_id crea la variante', () => {
  const r = parseInventoryUpload({ ...vacio, variantes: [
    { producto_id: prod.id, variante: 'L', stock: '5' },
  ]}, ctxV)
  expect(r.variantes.creates[0]).toMatchObject({ producto_id: prod.id, nombre: 'L', stock: 5 })
})
it('errores: producto_id desconocido, variante_id ajeno, nombre duplicado, sku repetido', () => {
  const r = parseInventoryUpload({ ...vacio, variantes: [
    { producto_id: 'no-existe', variante: 'M' },
    { producto_id: prod.id, variante_id: 'v-ajeno', variante: 'M' },
    { producto_id: prod.id, variante: 'M' },                    // ya existe 'M' en BD
    { producto_id: prod.id, variante: 'XL', sku: 'SKU-M' },     // sku de otra variante
  ]}, ctxV)
  expect(r.errors).toHaveLength(4)
  expect(r.errors.every(e => e.pestaña === 'Variantes')).toBe(true)
})
it('los productos con variantes ignoran stock y tallas en Actualizar', () => {
  const r = parseInventoryUpload({
    actualizar: [{ id: prod.id, nombre: prod.nombre, precio: prod.precio, stock: '99', tallas: 'S, M' }],
    nuevos: [], variantes: [],
  }, ctxV)
  expect(r.updates[0].stock).toBe(prod.stock)
  expect(r.updates[0].tallas).toEqual(prod.tallas)
})
```

- [ ] **Step 2: Correr y verificar que falla.**

- [ ] **Step 3: Implementar** en `parseInventoryUpload`:

- Índices al inicio: `const varPorId = new Map(ctx.variantesExistentes.map(v => [v.id, v]))`; `varsPorProducto: Map<string, ProductoVariante[]>`; `skuVarEnBD: Map<sku, varianteId>`; sets de vistos en archivo (`(producto_id, nombre)` y `sku`).
- Pestaña Actualizar: `const tieneVariantes = (varsPorProducto.get(id) ?? []).length > 0`; si `tieneVariantes`, forzar `stock: prod.stock` y `tallas: prod.tallas` (ignorar celdas, incluida la nota exportada).
- Pestaña Variantes, por fila (`fila = i + 2`, saltar filas totalmente vacías):
  - `producto_id` obligatorio y existente en `porId` → si no, error.
  - Con `variante_id`: debe existir y pertenecer a ese `producto_id`; base = la variante de BD (vacío = no cambia). Nombre final = celda `variante` o el de BD.
  - Sin `variante_id`: es alta; `variante` (nombre) obligatorio; `stock` vacío = null (ilimitada); `precio` vacío = null (hereda); `orden` = máximo `orden` del producto en BD + posición relativa en el archivo.
  - Validaciones: nombre único por producto (contra BD — excluyendo la propia variante en updates — y contra el archivo); `sku` único global (contra `skuVarEnBD` — excluyendo la propia — y el archivo); `precio` numérico > 0 si viene; `stock` entero ≥ 0 si viene; `activo` con `cellBool`.
  - Reusar `parseNum/cellText/cellBool`; empujar errores con `pestaña: 'Variantes'`.

- [ ] **Step 4: Correr suite completa** — `npm test` — Expected: PASS (incluye los casos previos de B).

- [ ] **Step 5: Commit**

```bash
git add lib/store/inventoryRoundtrip.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(inventario): parse de pestaña Variantes con validación atómica"
```

---

### Task 15: Rutas de export/import con variantes

**Files:**
- Modify: `app/api/inventario/export/route.ts`
- Modify: `app/api/inventario/import/route.ts`
- Modify: `app/admin/productos/ProductosClient.tsx` (si muestra resumen del import: añadir conteo de variantes)

**Interfaces:**
- Consumes: `buildExportData` 4-args y `parseInventoryUpload` con variantes (Tasks 13–14); RPC `importar_productos_variantes` (Task 1).
- Produces: `.xlsx` con 4 pestañas (Instrucciones, Actualizar, Nuevos, Variantes); import aplica productos + variantes en una transacción.

- [ ] **Step 1: Export** — fetch adicional `producto_variantes` (lectura paginada igual que productos si aplica el patrón existente), pasar a `buildExportData`, añadir la hoja:

```ts
const wsVariantes = XLSX.utils.json_to_sheet(data.variantes, { header: [...VARIANTES_COLUMNAS] })
XLSX.utils.book_append_sheet(wb, wsVariantes, 'Variantes')
```

- [ ] **Step 2: Import** — leer la hoja `Variantes` (`sheet_to_json` con `defval: ''` como las otras; si no existe, `[]` — archivos viejos siguen funcionando); fetch de `producto_variantes` para el `ParseContext`. Si `errors.length` → 422 con la lista (igual que hoy). Si no, aplicar **todo** con la RPC en lugar del upsert directo:

```ts
import { randomUUID } from 'crypto'

const productosPayload = [
  ...result.updates,
  ...result.creates.map(c => ({ ...c, id: randomUUID() })),
]
const variantesPayload = [
  ...result.variantes.updates,
  ...result.variantes.creates,   // sin id → insert en la RPC
]
const { error } = await supabase.rpc('importar_productos_variantes', {
  p_productos: productosPayload,
  p_variantes: variantesPayload,
})
```

Respuesta gana `variantesActualizadas`/`variantesCreadas` para el resumen del cliente.

- [ ] **Step 3: Verificación manual** — descargar el inventario (aparece la pestaña Variantes), editar un stock de variante y re-subir; confirmar en el admin que cambió. Subir un archivo con error (sku duplicado) → 422 y nada se escribe. Run: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add app/api/inventario/ app/admin/productos/ProductosClient.tsx
git commit -m "feat(inventario): rutas export/import round-trip con variantes (aplicación atómica por RPC)"
```

---

## Fase 5 — Import de plantilla externa (herramienta C)

### Task 16: Agrupar con variantes y campo "SKU de variante"

**Files:**
- Modify: `lib/store/externalImport.ts` (`CampoPlataforma`, `CAMPOS_PLATAFORMA`, `ALIAS`, `GrupoProducto`, `agruparPorSku`)
- Test: `lib/store/tests/externalImport.test.ts` (ampliar)

**Interfaces:**
- Consumes: helpers de `inventoryRoundtrip` (ya importados en el archivo).
- Produces (usado por Task 17):

```ts
// CampoPlataforma gana 'sku_variante'
// CAMPOS_PLATAFORMA gana { campo: 'sku_variante', label: 'SKU de variante', obligatorio: false }
// ALIAS.sku_variante = ['skuvariante', 'codigovariante', 'skuhijo', 'variantsku']
export interface VarianteExterna {
  fila: number
  nombre: string          // "M / Azul" | "M" | "Azul" | sku_variante si no hay talla/color
  sku: string | null      // sku_variante de la fila
  precio?: string
  stock?: string
}
// GrupoProducto gana:  variantes: VarianteExterna[]
// Regla: el grupo es "con variantes" si tiene >1 fila con datos o si alguna fila
// trae talla/color/sku_variante. Grupo de 1 fila sin esos campos = plano (variantes: []).
// En grupos con variantes, g.stock NO se suma (queda undefined); el stock va por variante.
```

- [ ] **Step 1: Tests que fallan**

```ts
it('filas con talla/color se vuelven variantes con su stock y precio', () => {
  const { grupos } = agruparPorSku([
    { SKU: 'A1', Nombre: 'Camisa', Precio: '100', Talla: 'M', Color: 'Azul', Stock: '3' },
    { SKU: 'A1', Nombre: 'Camisa', Precio: '120', Talla: 'L', Color: '', Stock: '2' },
  ], { sku: 'SKU', nombre: 'Nombre', precio: 'Precio', talla: 'Talla', color: 'Color', stock: 'Stock' })
  expect(grupos[0].variantes).toEqual([
    { fila: 2, nombre: 'M / Azul', sku: null, precio: '100', stock: '3' },
    { fila: 3, nombre: 'L', sku: null, precio: '120', stock: '2' },
  ])
  expect(grupos[0].stock).toBeUndefined()
})
it('una fila sin talla/color/sku_variante = producto plano', () => {
  const { grupos } = agruparPorSku(
    [{ SKU: 'A1', Nombre: 'Balón', Precio: '100', Stock: '7' }],
    { sku: 'SKU', nombre: 'Nombre', precio: 'Precio', stock: 'Stock' },
  )
  expect(grupos[0].variantes).toEqual([])
  expect(grupos[0].stock).toBe('7')
})
it('sku_variante nombra la variante si no hay talla/color', () => {
  const { grupos } = agruparPorSku([
    { SKU: 'A1', Nombre: 'X', Precio: '1', VarSku: 'A1-M' },
    { SKU: 'A1', Nombre: 'X', Precio: '1', VarSku: 'A1-L' },
  ], { sku: 'SKU', nombre: 'Nombre', precio: 'Precio', sku_variante: 'VarSku' })
  expect(grupos[0].variantes.map(v => v.nombre)).toEqual(['A1-M', 'A1-L'])
  expect(grupos[0].variantes[0].sku).toBe('A1-M')
})
it('fila indistinguible en grupo múltiple queda sin nombre y se reporta en parse', () => {
  const { grupos } = agruparPorSku([
    { SKU: 'A1', Nombre: 'X', Precio: '1', Talla: 'M' },
    { SKU: 'A1', Nombre: 'X', Precio: '1' },
  ], { sku: 'SKU', nombre: 'Nombre', precio: 'Precio', talla: 'Talla' })
  expect(grupos[0].variantes[1].nombre).toBe('')
})
it('sugerirMapeo reconoce columnas de sku de variante', () => {
  expect(sugerirMapeo(['SKU', 'SKU Variante', 'Nombre']).sku_variante).toBe('SKU Variante')
})
```

- [ ] **Step 2: Correr y verificar que falla.**

- [ ] **Step 3: Implementar** — en `agruparPorSku`, tras armar los grupos como hoy (dos pasadas o post-proceso):

- Por fila registrar `{ fila, talla: cel(row,'talla'), color: cel(row,'color'), skuVar: cel(row,'sku_variante'), precio: cel(row,'precio'), stock: cel(row,'stock') }` en el grupo.
- Al final, por grupo: `esConVariantes = filasDatos.length > 1 || filasDatos.some(f => f.talla || f.color || f.skuVar)`.
  - Con variantes: `variantes = filasDatos.map(f => ({ fila: f.fila, nombre: [f.talla, f.color].filter(Boolean).join(' / ') || f.skuVar || '', sku: f.skuVar ?? null, ...(f.precio !== undefined ? { precio: f.precio } : {}), ...(f.stock !== undefined ? { stock: f.stock } : {}) }))`; `g.stock = undefined`; `g.tallas`/`g.colores` se siguen llenando (informativos del padre).
  - Plano: `variantes = []`; el resto igual que hoy (stock sumado — con 1 fila es su propio stock).
- Escalares del padre: sin cambios (primer valor no vacío). El `precio` del padre = primer precio no vacío (las variantes con otro precio lo llevan propio en la Task 17).

- [ ] **Step 4: Correr suite** — `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/externalImport.ts lib/store/tests/externalImport.test.ts
git commit -m "feat(inventario): agrupar plantilla externa por variantes y mapeo de SKU de variante"
```

---

### Task 17: `parseExternalImport` crea/actualiza variantes

**Files:**
- Modify: `lib/store/externalImport.ts`
- Test: `lib/store/tests/externalImport.test.ts` (ampliar)

**Interfaces:**
- Consumes: `GrupoProducto.variantes` (Task 16); `VarianteData/VarianteUpdate` (Task 14); `ParseContext.variantesExistentes` (Task 14).
- Produces (usado por la ruta, Task 18):

```ts
export interface VarianteCreateExterna extends VarianteData {
  productoSku: string      // liga con el padre (existente o por crear); la ruta resuelve el producto_id
  orden: number
}
// ExternalParseResult gana:
//   variantes: { updates: VarianteUpdate[]; creates: VarianteCreateExterna[] }
// resumen gana:  variantesCrear: number; variantesActualizar: number
```

- [ ] **Step 1: Tests que fallan**

```ts
it('grupo con variantes: crea variantes con precio propio solo si difiere del padre', () => {
  const g = grupo({ sku: 'A1', nombre: 'Camisa', precio: '100', variantes: [
    { fila: 2, nombre: 'M', sku: null, precio: '100', stock: '3' },
    { fila: 3, nombre: 'L', sku: null, precio: '150', stock: '2' },
  ]})
  const r = parseExternalImport([g], ctxSinExistentes)
  expect(r.variantes.creates).toEqual([
    { productoSku: 'A1', orden: 0, nombre: 'M', sku: null, precio: null, stock: 3, activo: true },
    { productoSku: 'A1', orden: 1, nombre: 'L', sku: null, precio: 150, stock: 2, activo: true },
  ])
  expect(r.creates[0].stock).toBeNull()   // el padre no lleva stock propio
})
it('variante existente casa por sku de variante y se actualiza', () => {
  const ctx2 = { ...ctxConProductoA1, variantesExistentes: [
    varianteBD({ id: 'v1', producto_id: 'prod-a1', nombre: 'vieja', sku: 'A1-M' }),
  ]}
  const g = grupo({ sku: 'A1', variantes: [{ fila: 2, nombre: 'M', sku: 'A1-M', stock: '9' }] })
  const r = parseExternalImport([g], ctx2)
  expect(r.variantes.updates[0]).toMatchObject({ id: 'v1', nombre: 'M', stock: 9 })
})
it('sin sku de variante casa por nombre dentro del producto', () => {
  const ctx2 = { ...ctxConProductoA1, variantesExistentes: [
    varianteBD({ id: 'v1', producto_id: 'prod-a1', nombre: 'M', stock: 1 }),
  ]}
  const g = grupo({ sku: 'A1', variantes: [{ fila: 2, nombre: 'M', sku: null, stock: '9' }] })
  const r = parseExternalImport([g], ctx2)
  expect(r.variantes.updates[0]).toMatchObject({ id: 'v1', stock: 9 })
})
it('variante sin nombre = error del grupo', () => {
  const g = grupo({ sku: 'A1', variantes: [{ fila: 3, nombre: '', sku: null }] })
  const r = parseExternalImport([g], ctxSinExistentes)
  expect(r.errors.some(e => e.motivo.includes('fila 3'))).toBe(true)
})
it('grupo plano sigue funcionando igual que antes', () => {
  const g = grupo({ sku: 'B1', nombre: 'Balón', precio: '100', stock: '7', variantes: [] })
  const r = parseExternalImport([g], ctxSinExistentes)
  expect(r.creates[0].stock).toBe(7)
  expect(r.variantes.creates).toEqual([])
})
```

- [ ] **Step 2: Correr y verificar que falla.**

- [ ] **Step 3: Implementar** en `parseExternalImport`:

- Índices nuevos: `varPorSku` (sku de variante → variante BD), `varsPorProducto` (producto_id → variantes BD).
- Por grupo con `g.variantes.length > 0`:
  - Cada variante sin `nombre` → error `la fila N no se puede distinguir como variante (falta talla/color/sku de variante)` y el grupo cuenta como `conError` (atómico a nivel de grupo, como hoy).
  - `precioVariante`: si la celda viene y difiere del `precio` del padre → propio; si es igual o va vacía → `null` (hereda). `stock` de la variante: vacío = no cambia si casa con existente, `null` (ilimitada) en altas.
  - Casar: `sku` de variante en `varPorSku` → update (validar que pertenezca al producto del grupo; si pertenece a otro producto → error); si no, por `nombre` dentro de `varsPorProducto` del producto existente → update; si no → create con `productoSku: g.sku` y `orden` = posición.
  - El **padre** en grupos con variantes lleva `stock: null` en creates; en updates conserva `existente.stock` (el plano deja de usarse para venta) — nunca la suma.
  - Duplicados dentro del archivo: nombre repetido en el mismo grupo o sku de variante repetido → error.
- El caso plano (`g.variantes.length === 0`) queda exactamente como hoy.
- `resumen` incluye los conteos nuevos.

- [ ] **Step 4: Correr suite** — `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store/externalImport.ts lib/store/tests/externalImport.test.ts
git commit -m "feat(inventario): parseExternalImport crea y actualiza variantes reales"
```

---

### Task 18: Ruta del wizard y preview con variantes

**Files:**
- Modify: `app/api/inventario/plantilla/importar/route.ts`
- Modify: `components/admin/ImportarPlantilla.tsx` (preview ~líneas 136–141)

**Interfaces:**
- Consumes: `parseExternalImport` con variantes (Task 17); RPC `importar_productos_variantes` (Task 1).
- Produces: preview con variantes agrupadas; commit atómico.

- [ ] **Step 1: Ruta** — añadir el fetch de `producto_variantes` al `ParseContext`; en el commit, resolver `productoSku → producto_id`:

```ts
import { randomUUID } from 'crypto'

const idPorSku = new Map<string, string>()
for (const u of result.updates) if (u.sku) idPorSku.set(u.sku, u.id)
const creates = result.creates.map(c => {
  const id = randomUUID()
  if (c.sku) idPorSku.set(c.sku, id)
  return { ...c, id }
})
const variantesPayload = [
  ...result.variantes.updates,
  ...result.variantes.creates.map(({ productoSku, ...v }) => ({
    ...v,
    producto_id: idPorSku.get(productoSku)!,
  })),
]
const { error } = await supabase.rpc('importar_productos_variantes', {
  p_productos: [...result.updates, ...creates],
  p_variantes: variantesPayload,
})
```

El preview (`confirmar=false`) agrega a cada grupo de la muestra sus variantes (`nombre`, `precio` o "hereda", `stock` o "∞") y el resumen agrega `variantesCrear/variantesActualizar`.

- [ ] **Step 2: UI del preview** — en `ImportarPlantilla.tsx`, bajo cada producto de la muestra, listar sus variantes con el formato `M / Azul — stock 3 — L. 150` (o "hereda"); mostrar los conteos nuevos en el resumen.

- [ ] **Step 3: Verificación manual** — subir una plantilla con filas por talla/color de un mismo SKU: el preview agrupa variantes; confirmar crea el padre + hijas (verificar en el form del admin). Run: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add app/api/inventario/plantilla/ components/admin/ImportarPlantilla.tsx
git commit -m "feat(inventario): wizard de plantilla externa importa variantes con preview agrupado"
```

---

## Cierre

### Task 19: Verificación integral y entrega

**Files:**
- Modify: `CLAUDE.md` (una línea en Convenciones clave: el modelo de variantes y la regla "con hijas activas se vende por variante; crear_pedido valida y descuenta stock")

- [ ] **Step 1: Suite completa** — Run: `npm test` → PASS; `npx tsc --noEmit` → sin errores; `npm run lint` → sin errores; `npm run build` → OK. Reportar resultados reales.

- [ ] **Step 2: Revisión final whole-branch** — según el flujo del proyecto (revisión de la rama completa contra el spec antes de fusionar).

- [ ] **Step 3: Migración y deploy (requiere al usuario)** —
  1. El usuario aplica `supabase/migrations/2026-08-04-producto-variantes.sql` en el SQL Editor de Supabase (ANTES del push).
  2. Prueba de humo de la RPC en el SQL Editor: crear un pedido de prueba vía `select * from crear_pedido(...)` con una variante con stock 1 y cantidad 2 → debe fallar con `HS_STOCK|…`; con cantidad 1 → debe crear y descontar.
  3. **Confirmar con el usuario** la fusión a `main` (push = deploy a producción).
  4. Tras el push, verificar deployment `READY` en Vercel por SHA del merge.

- [ ] **Step 4: Commit final de docs**

```bash
git add CLAUDE.md
git commit -m "docs: modelo de variantes padre/hijo en convenciones"
```
