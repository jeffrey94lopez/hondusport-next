# Visor de Kardex — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un visor de solo lectura de `movimientos_inventario`: vista por ítem (con saldo corrido y referencia resuelta+enlace) y pantalla global paginada con filtros.

**Architecture:** Lógica pura (`lib/inventario/kardex.ts`) parsea la referencia y el tipo y calcula el saldo corrido. Las Server Actions leen los movimientos, resuelven las referencias por lote (batch-fetch a documentos/pedidos/compras/conteos) y arman etiqueta+enlace. Dos vistas (página por ítem + pantalla global). Única escritura a BD: un índice para el orden global.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), TypeScript, Vitest, CSS Modules, tokens Merlin.

## Global Constraints

- **Idioma español**; moneda en Lempiras con `formatPrice()`.
- **Solo lectura**: el visor NO escribe en `movimientos_inventario` ni en el stock. Única escritura a BD: el índice.
- **Resolución de referencias por lote** (no N+1): un `select ... in (...)` por tabla destino.
- **Saldo corrido** = suma acumulada de `cantidad` del kardex; reconcilia con el stock desde P4d en adelante (ítems con stock previo pueden diferir) — mostrar esa nota en la pantalla por ítem.
- **Migración idempotente** (`create index if not exists`), aplicada por el usuario antes del push. Smoke con `to_regclass`.
- Cliente de Supabase de **servidor**. CSS Modules con tokens Merlin; botones `btnMerlin*` con clase de módulo. Imprimible = HTML + CSS impresión (`.btnToolbar`, tinta fija, `@media print`).
- Tipo `type KardexResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.
- Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

---

### Task 1: Tipos + lógica pura `lib/inventario/kardex.ts`

**Files:**
- Modify: `types/index.ts`
- Create: `lib/inventario/kardex.ts`
- Create: `lib/inventario/tests/kardex.test.ts`

**Interfaces:**
- Produces (tipos): `MovimientoTipo`, `MovimientoInventario`, `MovimientoResuelto`, `FiltrosMovimientos`, `KardexResult`, `ClaseReferencia`, `DireccionMov`.
- Produces (puras): `parseReferencia(ref)`, `etiquetaTipoMovimiento(tipo)`, `saldoCorrido(movimientosAsc)`.

- [ ] **Step 1: Tipos en `types/index.ts`**

Al final del archivo:

```typescript
export type MovimientoTipo =
  | 'entrada' | 'ajuste' | 'venta_web' | 'reposicion_cancelacion'
  | 'venta_pos' | 'devolucion' | 'compra' | 'inicial' | 'conteo'

export interface MovimientoInventario {
  id: string
  producto_id: string
  variante_id: string | null
  tipo: MovimientoTipo
  cantidad: number
  costo_unitario: number | null
  costo_resultante: number | null
  referencia: string | null
  usuario: string | null
  notas: string | null
  created_at: string
}

export interface MovimientoResuelto extends MovimientoInventario {
  producto_nombre: string
  variante_nombre: string | null
  sku: string | null
  ref_etiqueta: string
  ref_href: string | null
  saldo: number | null
}

export interface FiltrosMovimientos {
  tipo: MovimientoTipo | null
  desde: string | null
  hasta: string | null
  producto: string | null
  usuario: string | null
}

export type KardexResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }
```

- [ ] **Step 2: Test de la lógica pura (que falla)**

Crear `lib/inventario/tests/kardex.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseReferencia, etiquetaTipoMovimiento, saldoCorrido } from '../kardex'

describe('parseReferencia', () => {
  it('null → otra', () => expect(parseReferencia(null)).toEqual({ clase: 'otra', valor: null }))
  it('documento:uuid', () => expect(parseReferencia('documento:abc')).toEqual({ clase: 'documento', valor: 'abc' }))
  it('nota_credito:uuid', () => expect(parseReferencia('nota_credito:xyz')).toEqual({ clase: 'nota_credito', valor: 'xyz' }))
  it('pedido:uuid', () => expect(parseReferencia('pedido:p1')).toEqual({ clase: 'pedido', valor: 'p1' }))
  it('conteo:numero', () => expect(parseReferencia('conteo:CONTEO-00000007')).toEqual({ clase: 'conteo', valor: 'CONTEO-00000007' }))
  it('alta/manual/modalidad', () => {
    expect(parseReferencia('alta')).toEqual({ clase: 'alta', valor: null })
    expect(parseReferencia('manual')).toEqual({ clase: 'manual', valor: null })
    expect(parseReferencia('modalidad')).toEqual({ clase: 'modalidad', valor: null })
  })
  it('otro sin prefijo conocido → compra (candidato por número)', () =>
    expect(parseReferencia('COMPRA-00000045')).toEqual({ clase: 'compra', valor: 'COMPRA-00000045' }))
})

describe('etiquetaTipoMovimiento', () => {
  it('venta_pos → salida', () => expect(etiquetaTipoMovimiento('venta_pos')).toEqual({ nombre: 'Venta mostrador', direccion: 'salida' }))
  it('compra → entrada', () => expect(etiquetaTipoMovimiento('compra')).toEqual({ nombre: 'Compra', direccion: 'entrada' }))
  it('conteo → neutro', () => expect(etiquetaTipoMovimiento('conteo')).toEqual({ nombre: 'Conteo físico', direccion: 'neutro' }))
  it('desconocido → tal cual, neutro', () => expect(etiquetaTipoMovimiento('otro')).toEqual({ nombre: 'otro', direccion: 'neutro' }))
})

describe('saldoCorrido', () => {
  it('acumula la cantidad en orden', () => {
    expect(saldoCorrido([{ cantidad: 10 }, { cantidad: -3 }, { cantidad: 5 }]))
      .toEqual([{ cantidad: 10, saldo: 10 }, { cantidad: -3, saldo: 7 }, { cantidad: 5, saldo: 12 }])
  })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npx vitest run lib/inventario/tests/kardex.test.ts --exclude "**/.claude/**"` → FAIL (módulo no existe).

- [ ] **Step 4: Implementar `lib/inventario/kardex.ts`**

```typescript
export type ClaseReferencia =
  | 'documento' | 'nota_credito' | 'pedido' | 'compra' | 'conteo'
  | 'alta' | 'manual' | 'modalidad' | 'otra'

export type DireccionMov = 'entrada' | 'salida' | 'neutro'

// Parsea la referencia cruda del kardex a { clase, valor }. Los prefijos con ':'
// llevan un uuid/numero; 'alta'/'manual'/'modalidad' son etiquetas; cualquier
// otra cadena sin prefijo conocido se trata como candidato a número de compra
// (el server la resuelve contra compras.numero; si no matchea, se muestra cruda).
export function parseReferencia(ref: string | null): { clase: ClaseReferencia; valor: string | null } {
  if (!ref) return { clase: 'otra', valor: null }
  const idx = ref.indexOf(':')
  if (idx >= 0) {
    const prefijo = ref.slice(0, idx)
    const valor = ref.slice(idx + 1) || null
    if (prefijo === 'documento') return { clase: 'documento', valor }
    if (prefijo === 'nota_credito') return { clase: 'nota_credito', valor }
    if (prefijo === 'pedido') return { clase: 'pedido', valor }
    if (prefijo === 'conteo') return { clase: 'conteo', valor }
    return { clase: 'otra', valor: ref }
  }
  if (ref === 'alta') return { clase: 'alta', valor: null }
  if (ref === 'manual') return { clase: 'manual', valor: null }
  if (ref === 'modalidad') return { clase: 'modalidad', valor: null }
  return { clase: 'compra', valor: ref }
}

export function etiquetaTipoMovimiento(tipo: string): { nombre: string; direccion: DireccionMov } {
  switch (tipo) {
    case 'entrada': return { nombre: 'Entrada', direccion: 'entrada' }
    case 'inicial': return { nombre: 'Alta inicial', direccion: 'entrada' }
    case 'compra': return { nombre: 'Compra', direccion: 'entrada' }
    case 'devolucion': return { nombre: 'Devolución', direccion: 'entrada' }
    case 'reposicion_cancelacion': return { nombre: 'Reposición (cancelación)', direccion: 'entrada' }
    case 'venta_pos': return { nombre: 'Venta mostrador', direccion: 'salida' }
    case 'venta_web': return { nombre: 'Venta web', direccion: 'salida' }
    case 'ajuste': return { nombre: 'Ajuste', direccion: 'neutro' }
    case 'conteo': return { nombre: 'Conteo físico', direccion: 'neutro' }
    default: return { nombre: tipo, direccion: 'neutro' }
  }
}

export function saldoCorrido<T extends { cantidad: number }>(movimientosAsc: T[]): (T & { saldo: number })[] {
  let acc = 0
  return movimientosAsc.map(m => {
    acc += m.cantidad
    return { ...m, saldo: acc }
  })
}
```

- [ ] **Step 5: Correr tests + tsc**

Run: `npx vitest run lib/inventario --exclude "**/.claude/**"` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/inventario/kardex.ts lib/inventario/tests/kardex.test.ts
git commit -m "feat(kardex): tipos y logica pura (parseReferencia, etiqueta, saldo corrido)"
```

---

### Task 2: Índice para el orden global + smoke

**Files:**
- Create: `supabase/migrations/2026-08-09-kardex-indice.sql`
- Create: `supabase/smoke-kardex.sql`

**Interfaces:**
- Produces: índice `movimientos_created_idx on movimientos_inventario (created_at desc)`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-09-kardex-indice.sql`:

```sql
-- Visor de kardex: indice para el orden global por fecha (la vista por item ya
-- usa movimientos_producto_idx (producto_id, created_at desc)). Solo lectura;
-- esta es la unica escritura a BD del proyecto.
create index if not exists movimientos_created_idx
  on movimientos_inventario (created_at desc);
```

- [ ] **Step 2: Escribir el smoke**

Crear `supabase/smoke-kardex.sql`:

```sql
do $$
begin
  if to_regclass('public.movimientos_created_idx') is null then raise exception 'FALLO: falta movimientos_created_idx'; end if;
  raise notice 'Smoke kardex: indice OK';
end $$;
select 'Success: indice kardex OK' as resultado;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-08-09-kardex-indice.sql supabase/smoke-kardex.sql
git commit -m "feat(kardex): indice created_at para el listado global de movimientos"
```

---

### Task 3: Server Actions + resolución de referencias por lote

**Files:**
- Create: `app/admin/movimientos/actions.ts`

**Interfaces:**
- Consumes: `parseReferencia`, `etiquetaTipoMovimiento`, `saldoCorrido` de `@/lib/inventario/kardex`; tipos `MovimientoInventario`, `MovimientoResuelto`, `FiltrosMovimientos`, `KardexResult`, `MovimientoTipo`.
- Produces:
  - `obtenerMovimientosItem(productoId: string, varianteId: string | null): Promise<KardexResult<{ producto: { id: string; nombre: string; sku: string | null; stock: number | null; costo: number | null }; variante: { id: string; nombre: string; stock: number | null; costo: number | null } | null; variantes: { id: string; nombre: string }[]; movimientos: MovimientoResuelto[] }>>`
  - `obtenerMovimientosGlobal(filtros: FiltrosMovimientos, pagina: number): Promise<KardexResult<{ movimientos: MovimientoResuelto[]; total: number }>>`
  - `resolverReferencias(supabase, movimientos): Promise<Map<string, { etiqueta: string; href: string | null }>>` (helper interno, exportado para tests de integración si se quiere; clave = `referencia` cruda).

- [ ] **Step 1: `resolverReferencias` (batch)**

Helper: recibe la lista de movimientos, agrupa por `parseReferencia(ref).clase`, y por clase hace UN `select ... in (...)`:
- `documento`/`nota_credito`: `documentos` por id → etiqueta según `tipo` (`factura`→"Factura "+correlativo; `comprobante`→"Comprobante C-"+numero_comprobante; `nota_credito`→"Nota de crédito "+correlativo; `devolucion`→"Devolución D-"+numero_comprobante) precedida de "Venta POS — "/"Nota de crédito — " según la clase; href `/admin/pos/documento/<id>`.
- `pedido`: `pedidos` por id → "Venta web — Pedido #"+numero; href `/admin/pedidos`.
- `compra`: `compras` por `numero in (...)` → "Compra "+numero; href `/admin/compras/<id>` (mapear numero→id). Los que no matcheen → etiqueta = la referencia cruda, sin href.
- `conteo`: etiqueta "Conteo físico "+valor; href `/admin/inventario` (no hace falta lookup; el número está en la referencia).
- `alta`/`manual`/`modalidad`/`otra`: etiquetas "Alta inicial"/"Ajuste manual"/"Cambio de modalidad"/(texto crudo); sin href.
Devuelve un `Map<referenciaCruda, { etiqueta, href }>`.

- [ ] **Step 2: `obtenerMovimientosItem`**

Leé el producto (`productos`: id, nombre, sku, stock, costo) y, si `varianteId`, la variante (`producto_variantes`). Traé las variantes activas del producto (para el selector). Traé los movimientos del ítem: `from('movimientos_inventario').select('*').eq('producto_id', productoId)` y, si `varianteId`, `.eq('variante_id', varianteId)`, si no `.is('variante_id', null)`; `.order('created_at', { ascending: true })`. Calculá `saldoCorrido(movimientos)` (asc). Resolvé referencias por lote. Devolvé `movimientos` como `MovimientoResuelto[]` (con `producto_nombre`, `variante_nombre`, `sku`, `ref_etiqueta`, `ref_href`, `saldo`). (La vista puede invertir el orden para mostrar recientes arriba, manteniendo el `saldo` calculado en asc.)

- [ ] **Step 3: `obtenerMovimientosGlobal`**

Query base `from('movimientos_inventario').select('*, productos(nombre, sku), producto_variantes(nombre)', { count: 'exact' })` con filtros:
- `filtros.tipo` → `.eq('tipo', ...)`.
- `filtros.desde`/`hasta` → `.gte('created_at', desde)` / `.lte('created_at', hasta + 'T23:59:59')`.
- `filtros.usuario` → `.ilike('usuario', '%'+usuario+'%')`.
- `filtros.producto` (nombre/SKU): como PostgREST no filtra fácil por columnas embebidas, resolvé primero los `producto_id` que matchean (`from('productos').select('id').or('nombre.ilike.%x%,sku.ilike.%x%')`) y `.in('producto_id', ids)`.
- `.order('created_at', { ascending: false })`, `.range(pagina*50, pagina*50+49)`.
Resolvé referencias por lote; devolvé `movimientos` + `total` (del `count`). `saldo` = null (no aplica en global).

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npx eslint app/admin/movimientos/actions.ts` sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/movimientos/actions.ts
git commit -m "feat(kardex): server actions con resolucion de referencias por lote"
```

---

### Task 4: Vista por ítem + botón Kardex

**Files:**
- Create: `app/admin/productos/[id]/movimientos/page.tsx`
- Create: `app/admin/productos/[id]/movimientos/MovimientosItemView.tsx`
- Create: `app/admin/productos/[id]/movimientos/HojaKardex.tsx`
- Create: `app/admin/productos/[id]/movimientos/kardex.module.css`
- Modify: `app/admin/productos/ProductosClient.tsx` (botón "Kardex" por fila)

**Interfaces:**
- Consumes: `obtenerMovimientosItem` de `@/app/admin/movimientos/actions`; `etiquetaTipoMovimiento` de `@/lib/inventario/kardex`; `formatPrice`; tipos `MovimientoResuelto`.
- Produces: la ruta `/admin/productos/[id]/movimientos`.

- [ ] **Step 1: `page.tsx` (server)**

`params.id` + `searchParams.variante` (opcional). `obtenerMovimientosItem(id, varianteId ?? null)`; si falla → `notFound()`. Pasa a `MovimientosItemView`.

- [ ] **Step 2: `MovimientosItemView` (client)**

Cabecera: nombre producto/variante, stock actual, costo actual. **Selector de variante** (si hay variantes): cambia `?variante=<id>` (router.push). Tabla: fecha/hora, tipo (con color por **signo de `cantidad`**: >0 verde, <0 rojo, =0 gris; nombre via `etiquetaTipoMovimiento`), cantidad con signo, **saldo corrido**, costo unitario/resultante (`formatPrice`), **referencia** (`ref_etiqueta`; si `ref_href`, link), usuario, notas. Toggle orden reciente↑/antiguo↑ (invirtiendo el array; el `saldo` ya viene calculado en asc). **Nota visible**: "El saldo corrido reconcilia con el stock desde la puesta en marcha del kardex; ítems con stock previo pueden diferir." Botón "Imprimir" → `HojaKardex`.

- [ ] **Step 3: `HojaKardex` (imprimible)**

Hoja carta, fondo blanco/tinta fija, `@media print` oculta la barra (`.btnToolbar`). Cabecera con producto/variante, stock, fecha de impresión; la tabla de movimientos (fecha, tipo, cantidad, saldo, costo, referencia, usuario). `formatPrice`.

- [ ] **Step 4: Botón "Kardex" en `ProductosClient`**

En la fila de cada producto (junto a Editar), un enlace **"Kardex"** → `/admin/productos/<id>/movimientos`. Botones `btnMerlin*` con clase de módulo.

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos + ProductosClient sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/admin/productos/[id]/movimientos/ app/admin/productos/ProductosClient.tsx
git commit -m "feat(kardex): vista de movimientos por item + imprimible + boton en productos"
```

---

### Task 5: Pantalla global + filtros + paginación + Sidebar

**Files:**
- Create: `app/admin/movimientos/page.tsx`
- Create: `app/admin/movimientos/MovimientosGlobalClient.tsx`
- Create: `app/admin/movimientos/movimientos.module.css`
- Modify: `components/admin/Sidebar.tsx` (link "Movimientos de inventario")

**Interfaces:**
- Consumes: `obtenerMovimientosGlobal` de `./actions`; `etiquetaTipoMovimiento`; `formatPrice`; tipos `MovimientoResuelto`, `FiltrosMovimientos`, `MovimientoTipo`.
- Produces: la ruta `/admin/movimientos`.

- [ ] **Step 1: `page.tsx` (server)**

Lee `searchParams` (tipo, desde, hasta, producto, usuario, pagina). Llama `obtenerMovimientosGlobal(filtros, pagina)`. Pasa `movimientos`, `total`, `filtros`, `pagina` a `MovimientosGlobalClient`.

- [ ] **Step 2: `MovimientosGlobalClient`**

Barra de filtros: select de **tipo** (todos los `MovimientoTipo` con su etiqueta), **desde/hasta** (date inputs), **producto** (texto), **usuario** (texto) → al aplicar, `router.push` con los searchParams. Tabla: **producto/variante** (link a `/admin/productos/<producto_id>/movimientos?variante=<variante_id>`), tipo (color por signo de cantidad), cantidad con signo, costo, **referencia** (`ref_etiqueta` + link si `ref_href`), usuario, fecha. **Paginación**: anterior/siguiente + "página X de N" (`Math.ceil(total/50)`), navegando por `?pagina=`. Botones `btnMerlin*` con clase de módulo; dinero con `formatPrice`.

- [ ] **Step 3: Link en el Sidebar**

En `components/admin/Sidebar.tsx`, en el grupo de inventario:

```tsx
{ href: '/admin/movimientos', icon: '📒', label: 'Movimientos de inventario' },
```

- [ ] **Step 4: Verificar**

`npx tsc --noEmit` limpio; `npm run build` OK; eslint de los nuevos + Sidebar sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/admin/movimientos/page.tsx app/admin/movimientos/MovimientosGlobalClient.tsx app/admin/movimientos/movimientos.module.css components/admin/Sidebar.tsx
git commit -m "feat(kardex): pantalla global de movimientos con filtros y paginacion"
```

---

## Verificación final (antes de entrega)

- `npx vitest run --exclude "**/.claude/**"` — toda la suite verde (incluye `lib/inventario/kardex`).
- `npx tsc --noEmit` — sin errores.
- `npm run lint` — sin errores en archivos nuevos/tocados.
- `npm run build` — OK (detener el dev server antes).
- Verificación visual (tras aplicar el índice): vista por ítem de un producto con historial (venta, compra, ajuste, conteo, devolución) — saldo corrido, referencias con enlace, selector de variante, imprimible; pantalla global — filtros por tipo/fecha/producto/usuario, paginación, enlaces a la vista por ítem y a los documentos.

## Entrega

- El usuario aplica `supabase/migrations/2026-08-09-kardex-indice.sql` y corre `supabase/smoke-kardex.sql` (espera "Success: indice kardex OK") **antes** del push.
- Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.
- Actualizar la memoria con el visor de kardex desplegado.
