# POS P4d — Inventario físico + kardex completo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conteo físico auditable (toma con snapshot, modos tabla/carrusel, a ciegas, aplicación atómica de ajustes, imprimibles) y cierre de las escrituras directas de stock para que TODA variación de unidades quede en el kardex.

**Architecture:** Una toma física (`conteos_fisicos` + `conteo_lineas`) guarda el snapshot del stock al contar; `aplicar_conteo(uuid)` aplica atómicamente `ajuste = contado − snapshot` como movimiento `'conteo'` (seguro ante ventas concurrentes). En paralelo, una RPC `fijar_stock(...)` unifica el alta inicial y el cambio de modalidad para que generen movimiento (`'inicial'`/`'ajuste'`), y el parser de import emite el movimiento de modalidad — cerrando las escrituras directas.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español** (UI, dominio, commits). Moneda en **Lempiras** con `formatPrice()`.
- **El kardex es el registro completo**: el stock nunca se escribe directo sin un movimiento que lo acompañe. Toda variación de unidades pasa por una RPC (`fijar_stock`, `registrar_entrada`, `aplicar_conteo`, `sync_producto_variantes`, `importar_productos_variantes`) que inserta en `movimientos_inventario`.
- **Nuevos tipos de movimiento**: `'inicial'` (asiento de apertura) y `'conteo'` (ajuste de inventario físico). El check de `movimientos_inventario.tipo` se recrea idempotente incluyendo los existentes (`entrada, ajuste, venta_web, reposicion_cancelacion, venta_pos, devolucion, compra`) + los dos nuevos.
- **`aplicar_conteo`**: `ajuste = contado − stock_snapshot` (NO contra el stock actual); bloquea la fila con `for update`; `stock_final = stock_actual + ajuste` (preserva ventas concurrentes); marca `aviso_movimiento` si `stock_actual ≠ snapshot`. Los ajustes de conteo NO cambian el costo.
- **Frontera de confianza**: `aplicar_conteo` solo recibe `conteo_id` (snapshots/contados ya en BD). `fijar_stock` es `security invoker` y relee la fila con `for update`.
- **Conteo a ciegas por defecto** (config `inventario_conteo_ciego = 'true'`): no se muestra el stock del sistema al contar; la diferencia se revela en "Revisar y aplicar".
- **Ítems `stock = null` (ilimitado): excluidos** del conteo (no se materializan como línea).
- **Estados de toma**: `en_conteo` (editable) → `aplicada` (inmutable) | `anulada` (solo desde `en_conteo`).
- **Migración idempotente** (`if not exists`, `create or replace`), aplicada por el usuario antes del push. Smoke con **`to_regprocedure`**. Estilo `supabase/migrations/2026-08-09-pos-p4c-cuentas-por-cobrar.sql`.
- **CSS Modules con tokens Merlin**; botones `btnMerlin*` compuestos con clase de módulo (bug recurrente si se usan solos). Dinero con `type="text" inputMode="decimal"`. Imprimibles = HTML + CSS impresión (`.btnToolbar`, tinta fija, `@media print`).
- Cliente de Supabase de servidor. Tipo `type InvResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.
- Verificación: `npm test` (incluye `lib/inventario`, `lib/store` costeo/inventoryRoundtrip) + `npx tsc --noEmit` + `npm run lint` + `npm run build`. Server Actions/Components sin tests unitarios; visual diferido al checkpoint tras aplicar la migración.

---

### Task 1: Tipos + lógica pura de conteo (`lib/inventario/conteo.ts`)

**Files:**
- Modify: `types/index.ts` (tipos de conteo + `'inicial'`/`'conteo'` donde el tipo de movimiento esté enumerado)
- Create: `lib/inventario/conteo.ts`
- Create: `lib/inventario/tests/conteo.test.ts`

**Interfaces:**
- Produces (tipos): `EstadoConteo`, `AlcanceTipo`, `ConteoFisico`, `ConteoLinea`, `ClaseLinea`.
- Produces (puras): `numeroConteo(n)`, `diferenciaLinea(snapshot, contado)`, `clasificarLinea(snapshot, contado)`, `valorDiferencia(diferencia, costo)`, `resumenConteo(lineas)`.

- [ ] **Step 1: Tipos en `types/index.ts`**

Al final del archivo, agregar:

```typescript
export type EstadoConteo = 'en_conteo' | 'aplicada' | 'anulada'
export type AlcanceTipo = 'todo' | 'categoria' | 'subcategoria' | 'seleccion'

export interface ConteoFisico {
  id: string
  numero: string
  estado: EstadoConteo
  alcance_tipo: AlcanceTipo
  alcance_ref: string | null
  descripcion: string | null
  notas: string | null
  usuario: string | null
  created_at: string
  aplicada_at: string | null
}

export interface ConteoLinea {
  id: string
  conteo_id: string
  producto_id: string
  variante_id: string | null
  sku: string | null
  nombre: string
  stock_snapshot: number
  contado: number | null
  stock_al_aplicar: number | null
  ajuste: number | null
  aplicada: boolean
  aviso_movimiento: boolean
}
```

Buscar en `types/index.ts` cualquier unión de tipos de movimiento de inventario (p.ej. `'entrada' | 'ajuste' | ...`); si existe, agregar `'inicial'` y `'conteo'`. Si no existe tal unión, no crear una nueva.

- [ ] **Step 2: Test de la lógica pura (que falla)**

Crear `lib/inventario/tests/conteo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { numeroConteo, diferenciaLinea, clasificarLinea, valorDiferencia, resumenConteo } from '../conteo'

describe('numeroConteo', () => {
  it('formatea con 8 dígitos', () => expect(numeroConteo(7)).toBe('CONTEO-00000007'))
})

describe('diferenciaLinea', () => {
  it('null si no se contó', () => expect(diferenciaLinea(10, null)).toBeNull())
  it('sobrante', () => expect(diferenciaLinea(10, 12)).toBe(2))
  it('faltante', () => expect(diferenciaLinea(10, 8)).toBe(-2))
})

describe('clasificarLinea', () => {
  it('pendiente', () => expect(clasificarLinea(10, null)).toBe('pendiente'))
  it('cuadra', () => expect(clasificarLinea(10, 10)).toBe('cuadra'))
  it('sobrante', () => expect(clasificarLinea(10, 12)).toBe('sobrante'))
  it('faltante', () => expect(clasificarLinea(10, 8)).toBe('faltante'))
})

describe('valorDiferencia', () => {
  it('diferencia por costo', () => expect(valorDiferencia(-2, 50)).toBe(-100))
  it('sin costo es 0', () => expect(valorDiferencia(-2, null)).toBe(0))
})

describe('resumenConteo', () => {
  it('agrega contadas/pendientes/sobrantes/faltantes/valorNeto', () => {
    const r = resumenConteo([
      { stock_snapshot: 10, contado: 12, costo: 50 },
      { stock_snapshot: 5, contado: 3, costo: 20 },
      { stock_snapshot: 8, contado: null, costo: 10 },
    ])
    expect(r).toEqual({ contadas: 2, pendientes: 1, sobrantes: 1, faltantes: 1, valorNeto: 60 })
  })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run lib/inventario --exclude "**/.claude/**"` → FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/inventario/conteo.ts`**

```typescript
export type ClaseLinea = 'pendiente' | 'cuadra' | 'sobrante' | 'faltante'

export function numeroConteo(n: number): string {
  return `CONTEO-${String(n).padStart(8, '0')}`
}

export function diferenciaLinea(snapshot: number, contado: number | null): number | null {
  return contado == null ? null : contado - snapshot
}

export function clasificarLinea(snapshot: number, contado: number | null): ClaseLinea {
  if (contado == null) return 'pendiente'
  const d = contado - snapshot
  if (d === 0) return 'cuadra'
  return d > 0 ? 'sobrante' : 'faltante'
}

export function valorDiferencia(diferencia: number, costo: number | null): number {
  return costo == null ? 0 : Math.round(diferencia * costo * 100) / 100
}

export function resumenConteo(
  lineas: { stock_snapshot: number; contado: number | null; costo: number | null }[],
): { contadas: number; pendientes: number; sobrantes: number; faltantes: number; valorNeto: number } {
  let contadas = 0, pendientes = 0, sobrantes = 0, faltantes = 0, valorNeto = 0
  for (const l of lineas) {
    if (l.contado == null) { pendientes++; continue }
    contadas++
    const d = l.contado - l.stock_snapshot
    if (d > 0) sobrantes++
    else if (d < 0) faltantes++
    valorNeto += valorDiferencia(d, l.costo)
  }
  return { contadas, pendientes, sobrantes, faltantes, valorNeto: Math.round(valorNeto * 100) / 100 }
}
```

- [ ] **Step 5: Correr tests + tsc**

Run: `npx vitest run lib/inventario --exclude "**/.claude/**"` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/inventario/
git commit -m "feat(inventario): tipos y logica pura de conteo fisico"
```

---

### Task 2: Kardex completo en el parser de import (modalidad → movimiento)

**Files:**
- Modify: `lib/store/inventoryRoundtrip.ts` (`MovimientoImport`/`MovimientoParcial` tipo + `calcularMovimientoStock`)
- Modify: `lib/store/costeo.ts` (solo actualizar el comentario obsoleto de `CambioStock`)
- Modify: `lib/store/tests/inventoryRoundtrip.test.ts` (invertir el caso de modalidad)

**Interfaces:**
- Consumes: `calcularCambioStock` de `@/lib/store/costeo` (sin cambio de forma; sigue devolviendo `modalidad`/`delta`/`sin_cambio`).
- Produces: `calcularMovimientoStock` ahora emite movimiento para la modalidad — `'inicial'` (`null → N`, cantidad `+N`) y `'ajuste'` (`N → null`, cantidad `−N`). El union `tipo` de `MovimientoImport`/`MovimientoParcial` gana `'inicial'`.

- [ ] **Step 1: Actualizar el comentario de `CambioStock` en `costeo.ts`**

En `lib/store/costeo.ts`, reemplazar el comentario de la variante `modalidad` (líneas ~38-40) para que ya no diga que no es kardexable:

```typescript
  // null <-> número: cambio de modalidad (ilimitado a limitado o viceversa).
  // Desde P4d SÍ es kardexable: null->N genera apertura ('inicial' +N),
  // N->null genera cierre ('ajuste' -N). Ver calcularMovimientoStock y fijar_stock.
  | { tipo: 'modalidad'; valor: number | null }
```

(No cambiar la lógica de `calcularCambioStock`.)

- [ ] **Step 2: Ajustar el test de modalidad (que ahora falla)**

En `lib/store/tests/inventoryRoundtrip.test.ts`, reemplazar el test `'cambio de modalidad (ilimitado <-> número) no genera movimiento'` (≈línea 497) por dos casos:

```typescript
  it('modalidad ilimitado -> número genera apertura inicial', () => {
    const c = ctxBase()
    c.existentes[0].stock = null
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: 20 }],
      nuevos: [], variantes: [],
    }, c)
    expect(res.errors).toEqual([])
    expect(res.movimientos).toEqual([
      { producto_id: 'p1', variante_id: null, tipo: 'inicial', cantidad: 20, costo_unitario: null, stock_anterior: null, referencia: expect.any(String) },
    ])
  })

  it('modalidad número -> ilimitado genera cierre ajuste', () => {
    const c = ctxBase()
    c.existentes[0].stock = 12
    const res = parseInventoryUpload({
      actualizar: [{ id: 'p1', nombre: 'Camiseta', precio: 250, stock: null }],
      nuevos: [], variantes: [],
    }, c)
    expect(res.errors).toEqual([])
    expect(res.movimientos).toEqual([
      { producto_id: 'p1', variante_id: null, tipo: 'ajuste', cantidad: -12, costo_unitario: null, stock_anterior: 12, referencia: expect.any(String) },
    ])
  })
```

(Verificá en el archivo el nombre exacto del campo del stock objetivo en `actualizar`; el ejemplo usa `stock`. Si `parseInventoryUpload` no acepta `stock: null` directo para forzar modalidad, replicá el patrón que ya use el test existente para setear el stock objetivo a null.)

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run lib/store/tests/inventoryRoundtrip.test.ts --exclude "**/.claude/**"` → FAIL.

- [ ] **Step 4: Extender `calcularMovimientoStock` y el union `tipo`**

En `lib/store/inventoryRoundtrip.ts`:
- Cambiar el union en `MovimientoImport` (≈línea 236) y `MovimientoParcial` (≈línea 286) de `'entrada' | 'ajuste'` a `'entrada' | 'ajuste' | 'inicial'`.
- Reemplazar el cuerpo de `calcularMovimientoStock` (≈líneas 303-314):

```typescript
): MovimientoParcial | null {
  const cambio = calcularCambioStock(stockAnterior, stockNuevo)
  if (cambio.tipo === 'sin_cambio') {
    if (costoEntrada != null) rowErrors.push('el costo_entrada solo aplica si el stock aumenta')
    return null
  }
  if (cambio.tipo === 'modalidad') {
    if (cambio.valor === null) {
      // N -> ilimitado: cierre. stockAnterior es un número.
      if (costoEntrada != null) rowErrors.push('el costo_entrada solo aplica si el stock aumenta')
      return { tipo: 'ajuste', cantidad: -(stockAnterior as number), costo_unitario: null, stock_anterior: stockAnterior }
    }
    // ilimitado -> N: apertura.
    return { tipo: 'inicial', cantidad: cambio.valor, costo_unitario: costoEntrada ?? null, stock_anterior: stockAnterior }
  }
  // delta número -> número
  if (cambio.delta > 0) {
    return { tipo: costoEntrada != null ? 'entrada' : 'ajuste', cantidad: cambio.delta, costo_unitario: costoEntrada ?? null, stock_anterior: stockAnterior }
  }
  if (costoEntrada != null) rowErrors.push('el costo_entrada solo aplica si el stock aumenta')
  return { tipo: 'ajuste', cantidad: cambio.delta, costo_unitario: null, stock_anterior: stockAnterior }
}
```

- [ ] **Step 5: Correr toda la suite de store**

Run: `npx vitest run lib/store --exclude "**/.claude/**"` → PASS (incluye `costeo.test.ts`, `inventoryRoundtrip.test.ts`, `externalImport.test.ts`). Si `externalImport.test.ts` falla por un caso de modalidad, aplicá el mismo criterio (modalidad emite movimiento) — `externalImport.ts` usa `calcularMovimientoStock`, así que debería propagarse solo. `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add lib/store/inventoryRoundtrip.ts lib/store/costeo.ts lib/store/tests/inventoryRoundtrip.test.ts
git commit -m "feat(inventario): el import registra la modalidad en el kardex (apertura/cierre)"
```

---

### Task 3: Migración P4d (conteo + `fijar_stock` + aperturas) + smoke

**Files:**
- Create: `supabase/migrations/2026-08-09-pos-p4d-inventario-fisico.sql`
- Create: `supabase/smoke-pos-p4d.sql`

**Interfaces:**
- Produces: tablas `conteos_fisicos`, `conteo_lineas`; `conteo_numero_seq`; funciones `nextval_conteo() → bigint`, `aplicar_conteo(uuid) → void`, `fijar_stock(uuid, uuid, integer, boolean, numeric, text, text) → void`; check de `movimientos_inventario.tipo` con `'inicial'`/`'conteo'`; `sync_producto_variantes` e `importar_productos_variantes` con asiento de apertura; config `inventario_conteo_ciego`.
- Consumes (ya existen): `productos`/`producto_variantes` (`stock`, `costo`), `movimientos_inventario`, `aplicar_costeo(integer, numeric, integer, numeric)`, `categorias`, `configuracion`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-09-pos-p4d-inventario-fisico.sql`:

```sql
-- POS P4d: inventario fisico + kardex completo.

-- 1. Nuevos tipos de movimiento (recrear el check idempotente).
do $$
declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid = 'movimientos_inventario'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table movimientos_inventario drop constraint %I', v_con); end if;
  alter table movimientos_inventario add constraint movimientos_inventario_tipo_chk
    check (tipo in ('entrada','ajuste','venta_web','reposicion_cancelacion','venta_pos','devolucion','compra','inicial','conteo'));
end $$;

insert into configuracion (key, value) values ('inventario_conteo_ciego', 'true')
on conflict (key) do nothing;

-- 2. fijar_stock: unifica alta inicial y cambio de modalidad como movimiento.
--   p_es_ilimitado=true  -> deja stock null (cierre -N como 'ajuste' si habia N).
--   p_es_ilimitado=false -> stock = p_stock_nuevo; el delta contra el actual
--     genera 'inicial' (si venia de null), 'entrada' (delta>0 con costo) o 'ajuste'.
create or replace function fijar_stock(
  p_producto_id uuid, p_variante_id uuid,
  p_stock_nuevo integer, p_es_ilimitado boolean,
  p_costo numeric, p_referencia text, p_usuario text
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_stock integer; v_costo numeric; v_delta integer; v_tipo text; v_nuevo_costo numeric;
begin
  if p_variante_id is not null then
    select stock, costo into v_stock, v_costo from producto_variantes
      where id = p_variante_id and producto_id = p_producto_id for update;
    if not found then raise exception 'Variante no encontrada'; end if;
  else
    select stock, costo into v_stock, v_costo from productos where id = p_producto_id for update;
    if not found then raise exception 'Producto no encontrado'; end if;
  end if;

  if p_es_ilimitado then
    if v_stock is null then return; end if;                 -- ya ilimitado
    if v_stock <> 0 then
      insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
      values (p_producto_id, p_variante_id, 'ajuste', -v_stock, v_costo, coalesce(p_referencia, 'modalidad'), p_usuario);
    end if;
    if p_variante_id is not null then update producto_variantes set stock = null where id = p_variante_id;
    else update productos set stock = null where id = p_producto_id; end if;
    return;
  end if;

  v_delta := p_stock_nuevo - coalesce(v_stock, 0);
  if v_delta = 0 and v_stock is not null then return; end if; -- sin cambio real
  v_tipo := case when v_stock is null then 'inicial'
                 when p_costo is not null and v_delta > 0 then 'entrada'
                 else 'ajuste' end;
  v_nuevo_costo := case when v_tipo in ('inicial','entrada') and p_costo is not null
                       then aplicar_costeo(coalesce(v_stock, 0), v_costo, v_delta, p_costo)
                       else v_costo end;
  if v_delta <> 0 then
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario)
    values (p_producto_id, p_variante_id, v_tipo, v_delta,
            case when v_tipo in ('inicial','entrada') then p_costo else null end, v_nuevo_costo, p_referencia, p_usuario);
  end if;
  if p_variante_id is not null then
    update producto_variantes set stock = p_stock_nuevo, costo = v_nuevo_costo where id = p_variante_id;
  else
    update productos set stock = p_stock_nuevo, costo = v_nuevo_costo where id = p_producto_id;
  end if;
end; $$;
revoke all on function fijar_stock(uuid, uuid, integer, boolean, numeric, text, text) from public, anon;
grant execute on function fijar_stock(uuid, uuid, integer, boolean, numeric, text, text) to authenticated;

-- 3. Tablas de conteo.
create sequence if not exists conteo_numero_seq;
create or replace function nextval_conteo()
returns bigint language sql security definer set search_path = public as $$
  select nextval('conteo_numero_seq');
$$;
revoke all on function nextval_conteo() from public, anon;
grant execute on function nextval_conteo() to authenticated;

create table if not exists conteos_fisicos (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  estado       text not null default 'en_conteo' check (estado in ('en_conteo','aplicada','anulada')),
  alcance_tipo text not null check (alcance_tipo in ('todo','categoria','subcategoria','seleccion')),
  alcance_ref  uuid,
  descripcion  text,
  notas        text,
  usuario      text,
  created_at   timestamptz default now(),
  aplicada_at  timestamptz
);

create table if not exists conteo_lineas (
  id               uuid primary key default gen_random_uuid(),
  conteo_id        uuid not null references conteos_fisicos(id) on delete cascade,
  producto_id      uuid not null references productos(id) on delete restrict,
  variante_id      uuid references producto_variantes(id) on delete restrict,
  sku              text,
  nombre           text not null,
  stock_snapshot   integer not null,
  contado          integer,
  stock_al_aplicar integer,
  ajuste           integer,
  aplicada         boolean not null default false,
  aviso_movimiento boolean not null default false
);
create index if not exists conteo_lineas_conteo_idx on conteo_lineas (conteo_id);
create index if not exists conteo_lineas_producto_idx on conteo_lineas (producto_id);
create unique index if not exists conteo_lineas_unica on conteo_lineas (conteo_id, producto_id, coalesce(variante_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4. aplicar_conteo: ajuste = contado - snapshot, atomico, preserva concurrentes.
create or replace function aplicar_conteo(p_conteo_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_estado text; v_numero text; r record; v_stock integer; v_costo numeric; v_ajuste integer; v_ok boolean;
begin
  select estado, numero into v_estado, v_numero from conteos_fisicos where id = p_conteo_id for update;
  if not found then raise exception 'Toma no encontrada'; end if;
  if v_estado <> 'en_conteo' then raise exception 'La toma no esta en conteo'; end if;

  for r in select * from conteo_lineas
           where conteo_id = p_conteo_id and contado is not null and not aplicada
           order by producto_id, variante_id
  loop
    if r.variante_id is not null then
      select stock, costo into v_stock, v_costo from producto_variantes where id = r.variante_id for update;
    else
      select stock, costo into v_stock, v_costo from productos where id = r.producto_id for update;
    end if;
    v_ok := found;

    if not v_ok or v_stock is null then
      update conteo_lineas set aplicada = true, stock_al_aplicar = v_stock, ajuste = null, aviso_movimiento = true
        where id = r.id;
      continue;
    end if;

    v_ajuste := r.contado - r.stock_snapshot;
    if v_ajuste <> 0 then
      insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
      values (r.producto_id, r.variante_id, 'conteo', v_ajuste, v_costo, 'conteo:' || v_numero);
      if r.variante_id is not null then update producto_variantes set stock = v_stock + v_ajuste where id = r.variante_id;
      else update productos set stock = v_stock + v_ajuste where id = r.producto_id; end if;
    end if;
    update conteo_lineas set aplicada = true, stock_al_aplicar = v_stock, ajuste = v_ajuste,
      aviso_movimiento = (v_stock <> r.stock_snapshot) where id = r.id;
  end loop;

  update conteos_fisicos set estado = 'aplicada', aplicada_at = now() where id = p_conteo_id;
end; $$;
revoke all on function aplicar_conteo(uuid) from public, anon;
grant execute on function aplicar_conteo(uuid) to authenticated;

-- 5. Asiento de apertura para variantes nuevas dentro de sync_producto_variantes.
--   Se agrega DESPUES del insert masivo de variantes nuevas: por cada variante
--   recien insertada con stock no nulo (>0) inserta un movimiento 'inicial'.
--   (Editar la funcion existente: mantener su cuerpo y AGREGAR este bloque al
--   final, antes del end. Reusa el patron; el stock ya lo escribio el insert.)
-- Nota para el implementador: abrir la definicion vigente de
--   sync_producto_variantes (2026-08-07-pos-p1-kardex-rpcs.sql) y re-crearla
--   COMPLETA aqui con el bloque nuevo agregado, para no perder su logica.

-- 6. importar_productos_variantes: aceptar tipo 'inicial' en el kardex.
--   La funcion ya inserta p_movimientos con su tipo; el nuevo check ya admite
--   'inicial'. Verificar que la rama de costeo trate 'inicial' como 'entrada'
--   (aplica costeo si trae costo). Si el `if (v_mov->>'tipo') = 'entrada'` no
--   cubre 'inicial', cambiarlo a `in ('entrada','inicial')`.
--   Nota para el implementador: re-crear la funcion COMPLETA con ese ajuste.

-- 7. RLS.
alter table conteos_fisicos enable row level security;
alter table conteo_lineas enable row level security;
do $$ begin
  create policy conteos_admin on conteos_fisicos for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy conteo_lineas_admin on conteo_lineas for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
```

**Importante (pasos 5 y 6):** re-creá `sync_producto_variantes` e `importar_productos_variantes` COMPLETAS (copiando su cuerpo vigente de `supabase/migrations/2026-08-07-pos-p1-kardex-rpcs.sql`) con los cambios indicados. Para `sync_producto_variantes`, tras el `insert into producto_variantes (...) select ... where x->>'id' is null`, agregá:

```sql
  -- [P4d] Asiento de apertura de las variantes nuevas con stock rastreado.
  insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia)
  select p_producto_id, v.id, 'inicial', v.stock, v.costo, v.costo, 'alta'
  from producto_variantes v
  join jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) x
    on x->>'id' is null and v.producto_id = p_producto_id
   and v.nombre = x->>'nombre' and coalesce(v.orden,0) = coalesce((x->>'orden')::integer, 0)
  where v.stock is not null and v.stock <> 0;
```

(Si el emparejamiento por `nombre`+`orden` resulta ambiguo, usá el mismo patrón `tmp_variantes_nuevas` con `returning` que ya usa `importar_productos_variantes`.)

Para `importar_productos_variantes`, cambiar `if (v_mov->>'tipo') = 'entrada' then` por `if (v_mov->>'tipo') in ('entrada','inicial') then`.

- [ ] **Step 2: Escribir el smoke**

Crear `supabase/smoke-pos-p4d.sql` (usa `to_regprocedure`, no crea/borra datos):

```sql
do $$
begin
  if to_regclass('public.conteos_fisicos') is null then raise exception 'FALLO: falta conteos_fisicos'; end if;
  if to_regclass('public.conteo_lineas') is null then raise exception 'FALLO: falta conteo_lineas'; end if;
  if to_regclass('public.conteo_numero_seq') is null then raise exception 'FALLO: falta conteo_numero_seq'; end if;
  if to_regprocedure('public.aplicar_conteo(uuid)') is null then raise exception 'FALLO: falta aplicar_conteo'; end if;
  if to_regprocedure('public.nextval_conteo()') is null then raise exception 'FALLO: falta nextval_conteo'; end if;
  if to_regprocedure('public.fijar_stock(uuid, uuid, integer, boolean, numeric, text, text)') is null then raise exception 'FALLO: falta fijar_stock'; end if;
  if not exists (select 1 from information_schema.columns where table_name='conteo_lineas' and column_name='stock_snapshot') then raise exception 'FALLO: falta conteo_lineas.stock_snapshot'; end if;
  if not exists (select 1 from configuracion where key='inventario_conteo_ciego') then raise exception 'FALLO: falta config inventario_conteo_ciego'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='movimientos_inventario'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%conteo%' and pg_get_constraintdef(oid) like '%inicial%'
  ) then raise exception 'FALLO: el check de tipo no incluye inicial/conteo'; end if;
  raise notice 'Smoke POS P4d: estructura OK';
end $$;
select 'Success: migracion POS P4d OK' as resultado,
       (select count(*) from conteos_fisicos) as tomas;
```

- [ ] **Step 3: Revisar consistencia**

Verificar: el check de `tipo` conserva los 7 tipos previos + `inicial`/`conteo`; `fijar_stock` bloquea la fila con `for update` y sus firmas de `aplicar_costeo` coinciden (`integer, numeric, integer, numeric`); `aplicar_conteo` usa `contado − stock_snapshot` y `stock_actual + ajuste`; `conteo_lineas` FK `on delete restrict` a productos/variantes y `on delete cascade` a la toma; `sync_producto_variantes`/`importar_productos_variantes` re-creadas completas sin perder su cuerpo. El reviewer valida (no hay BD local).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-09-pos-p4d-inventario-fisico.sql supabase/smoke-pos-p4d.sql
git commit -m "feat(inventario): migracion P4d (conteo, fijar_stock, aperturas, tipos)"
```

---

### Task 4: Cierre de escrituras directas en el editor de productos (`fijar_stock`)

**Files:**
- Modify: `app/admin/productos/actions.ts` (`aplicarCambioStock`, `createProducto`, `syncVariantes`)

**Interfaces:**
- Consumes: RPC `fijar_stock(p_producto_id, p_variante_id, p_stock_nuevo, p_es_ilimitado, p_costo, p_referencia, p_usuario)` (Task 3).
- Produces: alta y cambios de stock/modalidad SIEMPRE generan movimiento.

- [ ] **Step 1: Reescribir `aplicarCambioStock` para enrutar por `fijar_stock`**

En `app/admin/productos/actions.ts`, reemplazar el cuerpo de `aplicarCambioStock` (que hoy escribe directo la modalidad y usa `registrar_entrada` para el delta) por una sola llamada a `fijar_stock`. Mantener la firma y el retorno (`Promise<string | null>`):

```typescript
async function aplicarCambioStock(
  supabase: SupabaseServerClient,
  opts: { productoId: string; varianteId: string | null; stockActual: number | null; stockForm: number | null; costoEntrada: number | null; usuario: string | null },
): Promise<string | null> {
  const cambio = calcularCambioStock(opts.stockActual, opts.stockForm)
  if (cambio.tipo === 'sin_cambio') return null
  const esIlimitado = opts.stockForm == null
  const { error } = await supabase.rpc('fijar_stock', {
    p_producto_id: opts.productoId,
    p_variante_id: opts.varianteId,
    p_stock_nuevo: esIlimitado ? 0 : opts.stockForm,
    p_es_ilimitado: esIlimitado,
    p_costo: opts.costoEntrada ?? null,
    p_referencia: 'manual',
    p_usuario: opts.usuario,
  })
  return error ? error.message : null
}
```

(`calcularCambioStock` se sigue usando solo para el corto-circuito `sin_cambio`; `fijar_stock` reclasifica en SQL.)

- [ ] **Step 2: `createProducto` — insertar stock null y abrir por `fijar_stock`**

En `createProducto`, cambiar el insert de `productos` para NO fijar el stock rastreado directo: insertar `stock: null`, y `costo: form.costo ?? null` (para conservar el costo del ilimitado). Tras el insert exitoso y ANTES de `syncVariantes`, abrir el stock:

```typescript
  // [P4d] El stock inicial entra por fijar_stock (asiento 'inicial'), nunca directo.
  const esIlimitado = form.stock == null
  if (!esIlimitado) {
    const { error: aperturaError } = await supabase.rpc('fijar_stock', {
      p_producto_id: data.id, p_variante_id: null,
      p_stock_nuevo: form.stock, p_es_ilimitado: false,
      p_costo: form.costo ?? null, p_referencia: 'alta', p_usuario: null,
    })
    if (aperturaError) return { error: `El producto se creó, pero el stock inicial falló: ${aperturaError.message}` }
  }
```

En el objeto del insert, cambiar `stock: form.stock ?? null` por `stock: null` y dejar `costo: form.costo ?? null`.

- [ ] **Step 3: `syncVariantes` — variantes nuevas abren por la RPC**

Las variantes nuevas ahora reciben su asiento de apertura DENTRO de `sync_producto_variantes` (Task 3). En `syncVariantes` (JS), NO cambiar el flujo de variantes nuevas (el stock inicial lo abre la RPC). El loop de variantes existentes sigue llamando `aplicarCambioStock` (ya enrutado a `fijar_stock` en el Step 1). Verificar que no quede ninguna escritura directa de stock en este archivo.

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npx eslint app/admin/productos/actions.ts` sin errores. `npx vitest run --exclude "**/.claude/**"` verde (no hay tests de estas Server Actions, pero la suite no debe romperse). NO levantar el dev server (migración no aplicada).

- [ ] **Step 5: Commit**

```bash
git add app/admin/productos/actions.ts
git commit -m "feat(inventario): alta y modalidad pasan por fijar_stock (kardex sin excepciones)"
```

---

### Task 5: Server Actions de conteo (`app/admin/inventario/actions.ts`)

**Files:**
- Create: `app/admin/inventario/actions.ts`

**Interfaces:**
- Consumes: `numeroConteo` de `@/lib/inventario/conteo` (para el `numero` no; el número lo da `nextval_conteo`); tipos `ConteoFisico`, `ConteoLinea`, `AlcanceTipo`, `EstadoConteo`. RPCs `aplicar_conteo`.
- Produces:
  - `type InvResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`
  - `crearToma(input: { alcanceTipo: AlcanceTipo; alcanceRef: string | null; descripcion: string | null }): Promise<InvResult<{ id: string }>>`
  - `obtenerTomas(): Promise<InvResult<ConteoFisico[]>>`
  - `obtenerToma(id: string): Promise<InvResult<{ toma: ConteoFisico; lineas: (ConteoLinea & { costo: number | null })[] }>>`
  - `guardarConteoLinea(lineaId: string, contado: number | null): Promise<InvResult>`
  - `agregarLineaPorSku(conteoId: string, sku: string): Promise<InvResult<{ linea: ConteoLinea } | { noRastreado: true } | { noEncontrado: true }>>`
  - `quitarLinea(lineaId: string): Promise<InvResult>`
  - `aplicarToma(id: string): Promise<InvResult>`
  - `anularToma(id: string): Promise<InvResult>`

- [ ] **Step 1: Escribir `actions.ts`**

Patrón: `app/admin/cuentas-por-cobrar/actions.ts` (server, `'use server'`, cliente de servidor, `InvResult`, `revalidatePath`). Puntos concretos:

- **`crearToma`**: inserta en `conteos_fisicos` (`numero` = `'CONTEO-' + String(await nextval).padStart(8,'0')`; obtené el número con `supabase.rpc('nextval_conteo')`). Luego **materializa las líneas** según el alcance: leé `productos` (con `producto_variantes`) filtrando por alcance (categoría/subcategoría) o todos; por cada producto **plano con `stock` no null** → una línea (`variante_id` null, `stock_snapshot = stock`, `nombre`, `sku`); por cada **variante activa con `stock` no null** → una línea por variante. **Excluir `stock = null`.** Inserta las líneas en `conteo_lineas`. `alcance_tipo='seleccion'` materializa vacío (se agrega por escaneo).
- **`obtenerToma`**: trae la toma + `conteo_lineas` ordenadas por `nombre`; para el costo por línea (reporte/valor), traé `productos.costo`/`producto_variantes.costo` y mapeá por id (PostgREST no embebe sobre `conteo_lineas` cómodamente; hacé una segunda consulta y map). Devolvé `lineas` con `costo`.
- **`guardarConteoLinea`**: `update conteo_lineas set contado = ...` solo si la toma está `en_conteo` (leé el estado por join o consulta previa; si `aplicada`/`anulada` → error `La toma ya no es editable.`). `contado` entero ≥ 0 o null (rechazar negativos: `Los montos no pueden ser negativos.`).
- **`agregarLineaPorSku`**: busca el `sku` en `productos` y `producto_variantes`. Si no existe → `{ noEncontrado: true }`. Si su `stock` es null → `{ noRastreado: true }`. Si ya hay línea en la toma → devolver esa. Si no, insertar línea con snapshot del stock actual y devolverla. Solo si la toma está `en_conteo`.
- **`quitarLinea`**: `delete from conteo_lineas` solo si la toma está `en_conteo`.
- **`aplicarToma`**: `supabase.rpc('aplicar_conteo', { p_conteo_id: id })`; `traducirError` para `Toma no encontrada`/`no esta en conteo`. `revalidatePath`.
- **`anularToma`**: solo desde `en_conteo` → `update conteos_fisicos set estado='anulada'`. (No borra líneas; queda el registro.)
- **`obtenerTomas`**: lista ordenada por `created_at desc`.

- [ ] **Step 2: Verificar**

`npx tsc --noEmit` limpio; `npx eslint app/admin/inventario/actions.ts` sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/admin/inventario/actions.ts
git commit -m "feat(inventario): server actions de conteo fisico"
```

---

### Task 6: Listado de tomas + Sidebar + toggle de config

**Files:**
- Create: `app/admin/inventario/page.tsx`
- Create: `app/admin/inventario/InventarioClient.tsx`
- Create: `app/admin/inventario/inventario.module.css`
- Modify: `components/admin/Sidebar.tsx` (link "Inventario físico")
- Modify: `app/admin/configuracion/PosSection.tsx` (toggle `inventario_conteo_ciego`)

**Interfaces:**
- Consumes: `obtenerTomas`, `crearToma` de `./actions`; `numeroConteo` no hace falta (el número viene de la BD); `formatPrice`; tipos `ConteoFisico`, `AlcanceTipo`.
- Produces: la ruta `/admin/inventario` (listado + alta de toma).

- [ ] **Step 1: `page.tsx` (server)**

`obtenerTomas()` + categorías/subcategorías activas (para el selector de alcance de la nueva toma). Pasa a `InventarioClient`.

- [ ] **Step 2: `InventarioClient` + `inventario.module.css`**

Tabla de tomas: número, fecha (`created_at`), alcance (etiqueta legible), estado (badge En conteo/Aplicada/Anulada), y acción "Abrir" → `router.push('/admin/inventario/'+id)`. Botón "Nueva toma" → modal (usar `@/components/admin/Modal`) con: selector de alcance (Todo / Categoría / Subcategoría / Selección), select de categoría/subcategoría cuando aplica, descripción; al confirmar `crearToma(...)` → `router.push` al editor. Botones `btnMerlin*` compuestos con clase de módulo; tokens Merlin.

- [ ] **Step 3: Link en el Sidebar**

En `components/admin/Sidebar.tsx`, agregar en el grupo apropiado (p.ej. junto a inventario/productos):

```tsx
{ href: '/admin/inventario', icon: '📦', label: 'Inventario físico' },
```

- [ ] **Step 4: Toggle `inventario_conteo_ciego` en configuración**

En `app/admin/configuracion/PosSection.tsx`, agregar un toggle **"Conteo físico a ciegas"** que lee/escribe la clave `inventario_conteo_ciego` (`'true'`/`'false'`), mismo patrón que el toggle `pos_documento_modal` / `cxc_bloquear_limite` existentes (incluida la prop en `ConfigClient.tsx` si ese es el patrón).

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los nuevos + Sidebar/PosSection sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/admin/inventario/page.tsx app/admin/inventario/InventarioClient.tsx app/admin/inventario/inventario.module.css components/admin/Sidebar.tsx app/admin/configuracion/PosSection.tsx app/admin/configuracion/ConfigClient.tsx
git commit -m "feat(inventario): listado de tomas, alta, sidebar y toggle a ciegas"
```

---

### Task 7: Editor de toma — modos tabla/carrusel + escaneo + revisar y aplicar

**Files:**
- Create: `app/admin/inventario/[id]/page.tsx`
- Create: `app/admin/inventario/[id]/TomaEditor.tsx`
- Create: `app/admin/inventario/[id]/ModoTabla.tsx`
- Create: `app/admin/inventario/[id]/ModoCarrusel.tsx`
- Create: `app/admin/inventario/[id]/RevisarAplicarModal.tsx`
- Modify: `app/admin/inventario/inventario.module.css` (estilos del editor/carrusel)

**Interfaces:**
- Consumes: `obtenerToma`, `guardarConteoLinea`, `agregarLineaPorSku`, `quitarLinea`, `aplicarToma`, `anularToma` de `../actions`; puras `diferenciaLinea`, `clasificarLinea`, `valorDiferencia`, `resumenConteo` de `@/lib/inventario/conteo`; `formatPrice`; `toConfigMap` (para leer `inventario_conteo_ciego`). Referencia de carrusel: `app/admin/productos/CarruselClient.tsx`.
- Produces: la ruta `/admin/inventario/[id]`.

- [ ] **Step 1: `page.tsx` (server)**

`obtenerToma(id)`; si falla → `notFound()`. Leé `configuracion` (`toConfigMap`) para `inventario_conteo_ciego`. Pasa `toma`, `lineas` (con costo) y `ciego` a `TomaEditor`.

- [ ] **Step 2: `TomaEditor` (client) — cabecera, escaneo y selector de modo**

Estado: modo (`'tabla' | 'carrusel'`), líneas locales (con `contado` optimista). Cabecera: número, badge de estado, badge "A ciegas" si `ciego`, avance (contados/total con `resumenConteo`). **Barra de escaneo por SKU** compartida: al Enter, `agregarLineaPorSku(conteoId, sku)`; si `{noRastreado}` → aviso "no rastreado"; si `{noEncontrado}` → aviso; si trae línea → enfocar/saltar a esa fila (tabla) o tarjeta (carrusel) y setear el foco del campo `contado`. Toggle **Tabla ⇄ Carrusel**. Botones: "Hoja de conteo" (imprimible, Task 8), "Revisar y aplicar" (abre `RevisarAplicarModal`), "Anular" (si `en_conteo`, con confirm). Si la toma NO está `en_conteo`, todo es solo lectura.
Guardado por línea: al salir del campo (`onBlur`) o en carrusel al "Guardar y siguiente" → `guardarConteoLinea(lineaId, contado)`.

- [ ] **Step 3: `ModoTabla`**

Tabla del alcance con columnas SKU, Producto/variante, Contado (input `type="text" inputMode="decimal"`, ≥0), Estado (badge por `clasificarLinea` **sin revelar la diferencia si `ciego`**: mostrar solo Contado/Pendiente; si NO `ciego`, puede mostrar la diferencia). Un ref por fila para que el escaneo enfoque.

- [ ] **Step 4: `ModoCarrusel`**

Espejá `CarruselClient.tsx`: un ítem por tarjeta (SKU, nombre, variante), campo `contado` grande centrado, barra de progreso `idx/total`, botones Anterior / Saltar / Guardar y siguiente (guarda y avanza), aviso de cambios sin guardar al navegar. **A ciegas**: no mostrar el stock del sistema. El escaneo salta a la tarjeta del SKU.

- [ ] **Step 5: `RevisarAplicarModal`**

Revela por línea: `snapshot`, `contado`, diferencia (`diferenciaLinea`) con signo, valor al costo (`valorDiferencia`), y marca "hubo movimiento" no aplica aquí (es post-aplicación). Totales con `resumenConteo`. Botón "Aplicar" → `aplicarToma(id)`; al `ok`, `router.refresh()` y cerrar. Advertir que es irreversible.

- [ ] **Step 6: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los nuevos sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/admin/inventario/[id]/ app/admin/inventario/inventario.module.css
git commit -m "feat(inventario): editor de toma con modos tabla/carrusel, escaneo y aplicar"
```

---

### Task 8: Imprimibles — hoja de conteo y reporte de diferencias

**Files:**
- Create: `app/admin/inventario/[id]/HojaConteo.tsx`
- Create: `app/admin/inventario/[id]/ReporteDiferencias.tsx`
- Create: `app/admin/inventario/[id]/impresion.module.css`

**Interfaces:**
- Consumes: tipos `ConteoFisico`, `ConteoLinea`; puras `diferenciaLinea`, `valorDiferencia`, `resumenConteo`; `formatPrice`. Patrón imprimible: `app/admin/cuentas-por-cobrar/cliente/[id]/HojaEstadoCuentaCliente.tsx` (hoja carta, tinta fija, `.btnToolbar`, `@media print`).
- Produces: dos vistas imprimibles montadas desde `TomaEditor`.

- [ ] **Step 1: `HojaConteo` (en blanco)**

Lista de las líneas del alcance: SKU, nombre, variante y un renglón vacío para anotar el conteo a mano — **sin** stock del sistema (contar a ciegas en papel). Cabecera con número de toma, fecha, alcance y espacio para firma. Barra con botón Imprimir (`window.print()`) usando `.btnToolbar` compuesto con `btnMerlin*`; fondo blanco/tinta fija; `@media print` oculta la barra.

- [ ] **Step 2: `ReporteDiferencias`**

Tabla: SKU, nombre, snapshot, contado, diferencia, valor al costo; totales de sobrantes/faltantes y valor neto (`resumenConteo`). Marca el aviso "hubo movimiento" por línea (`aviso_movimiento`) si está aplicada. Mismo formato imprimible (carta, tinta fija, `@media print`, `.btnToolbar`). Espacio para firma.

- [ ] **Step 3: Montaje desde `TomaEditor`**

Botones "Hoja de conteo" (siempre) y "Reporte de diferencias" (habilitado cuando hay conteos / tras aplicar) que muestran cada vista.

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; `npx eslint` de los nuevos sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/inventario/[id]/HojaConteo.tsx app/admin/inventario/[id]/ReporteDiferencias.tsx app/admin/inventario/[id]/impresion.module.css
git commit -m "feat(inventario): hoja de conteo y reporte de diferencias imprimibles"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/inventario` y los cambios de `lib/store` costeo/inventoryRoundtrip/externalImport).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados.
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar la migración): nueva toma por categoría; contar en tabla y en carrusel; escaneo que salta a la fila; a ciegas (sin ver el sistema) y con toggle informado; revisar y aplicar (stock ajustado, kardex con `tipo='conteo'`); aviso "hubo movimiento" si se vende durante el conteo; hoja de conteo y reporte imprimibles; alta de producto con stock inicial (movimiento `'inicial'`); modalidad ilimitado↔número (apertura/cierre); import de plantilla con cambios de stock/modalidad (todos con movimiento).

## Entrega

- El usuario aplica `supabase/migrations/2026-08-09-pos-p4d-inventario-fisico.sql` y corre `supabase/smoke-pos-p4d.sql` (espera "Success: migracion POS P4d OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria `pos-honduras.md` con P4d desplegado.
