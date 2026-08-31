# Orden comercial de la vitrina por bandas (Fase 1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la portada de la tienda ordene los productos por un criterio comercial fijo y determinista, con los agotados al final y los más vendidos reales arriba.

**Architecture:** Una vista de Postgres calcula la posición comercial de cada producto a partir de las ventas reales de los últimos 90 días (mostrador + tienda, restando devoluciones). Una función pura en `lib/store/` reparte los productos en seis bandas excluyentes y ordena dentro de cada una. La página consulta la vista y la pura se aplica en el cliente, después de filtrar.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase/PostgREST, TypeScript, Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-31-agotados-encargos-orden-design.md` (secciones 2.4 y 4)

## Global Constraints

- **Idioma:** UI, nombres de dominio y mensajes de commit en **español**. Moneda en Lempiras (`L.`), formateada con `formatPrice()`.
- **La lógica de negocio va en `lib/store/` como función pura, con test en `lib/store/tests/`.** No embebida en componentes.
- **Migraciones:** el SQL se aplica **a mano en el SQL Editor de Supabase ANTES** de empujar el código. No hay acceso programático a esa base desde este entorno.
- **Commits:** formato convencional (`feat(tienda): …`, `fix: …`), en español.
- **Al terminar cualquier cambio:** `npm test` y, si se tocan Server Actions o tipos, `npx tsc --noEmit`. Reportar resultados reales.
- **Correr los tests excluyendo worktrees:** `npx vitest run --exclude "**/node_modules/**" --exclude "**/.claude/**"`. Sin esos `--exclude`, vitest recoge las copias de `.claude/worktrees/` y los totales salen duplicados.
- **No hardcodear valores que ya tienen token** en `app/merlin.css`.

---

### Task 1: Vista `producto_ventas_rank`

Calcula la posición comercial de cada producto con ventas netas positivas en los últimos 90 días. **Expone solo `producto_id` y `posicion`, nunca las unidades:** el orden de la portada ya es público, los volúmenes de venta no, y esta vista es la única del proyecto que se concede a `anon`.

**Files:**
- Create: `supabase/migrations/2026-08-31-vitrina-ventas-rank.sql`

**Interfaces:**
- Consumes: tablas `documentos`, `documento_items`, `pedidos`, `pedido_items` (ya existen).
- Produces: vista `producto_ventas_rank(producto_id uuid, posicion bigint)`, legible por `anon` y `authenticated`. `posicion = 1` es el más vendido.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/2026-08-31-vitrina-ventas-rank.sql`:

```sql
-- Posicion comercial por producto, ventas netas de los ultimos 90 dias.
--
-- Expone SOLO producto_id y posicion, deliberadamente. El orden de la portada
-- ya es publico (se ve en la propia pagina), pero las cantidades vendidas no, y
-- esta vista se concede a anon para que la tienda publica pueda leerla. Las
-- otras cuatro vistas del proyecto (compra_saldos, documento_saldos,
-- saldo_favor_clientes) son authenticated-only; esta es la excepcion, y por eso
-- no lleva importes ni unidades.
--
-- Las vistas de Postgres 15+ corren con permisos del DUENO por defecto
-- (security_invoker off), asi que puede leer pedidos y documentos aunque anon
-- no tenga politica de SELECT sobre ellos. Eso es lo que se quiere: anon ve el
-- agregado, no las filas.

create or replace view producto_ventas_rank as
with mostrador as (
  -- Facturas y comprobantes suman. Notas de credito y devoluciones RESTAN:
  -- son mercancia que vuelve, y contarlas como venta invertiria el signo justo
  -- en los productos con mas problemas.
  select
    di.producto_id,
    sum(
      case when d.tipo in ('factura', 'comprobante') then di.cantidad
           else -di.cantidad
      end
    ) as unidades
  from documento_items di
  join documentos d on d.id = di.documento_id
  where d.estado = 'emitido'
    and d.created_at >= now() - interval '90 days'
    and di.producto_id is not null
  group by di.producto_id
),
tienda as (
  -- Solo pedidos NO facturados. documentos.pedido_id enlaza la venta web que
  -- luego se factura en el mostrador: si ya tiene documento emitido, sus
  -- unidades estan en `mostrador` y sumarlas aqui las contaria DOS VECES.
  select
    pi.producto_id,
    sum(pi.cantidad) as unidades
  from pedido_items pi
  join pedidos p on p.id = pi.pedido_id
  where p.estado <> 'cancelado'
    and p.created_at >= now() - interval '90 days'
    and pi.producto_id is not null
    and not exists (
      select 1 from documentos d
      where d.pedido_id = p.id and d.estado = 'emitido'
    )
  group by pi.producto_id
),
netas as (
  select producto_id, sum(unidades) as unidades
  from (select * from mostrador union all select * from tienda) t
  group by producto_id
  -- Simplificacion aceptada: una devolucion dentro de la ventana cuya venta
  -- original quedo fuera puede dejar el neto en cero o negativo. Ese producto
  -- se queda sin posicion, o sea tratado como "sin ventas", que es la lectura
  -- conservadora correcta.
  having sum(unidades) > 0
)
select
  producto_id,
  dense_rank() over (order by unidades desc) as posicion
from netas;

grant select on producto_ventas_rank to anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración a mano en Supabase**

Abrir el **SQL Editor** del proyecto Supabase de Hondusport (`nrzkqcrzsqxnjbuyfpaw`) y ejecutar el contenido completo del archivo. Es obligatorio hacerlo **antes** de empujar cualquier código que consulte la vista.

- [ ] **Step 3: Verificar la vista en el SQL Editor**

Ejecutar estas tres comprobaciones y confirmar el resultado de cada una:

```sql
-- 1. Devuelve filas y las posiciones empiezan en 1 sin huecos raros.
select * from producto_ventas_rank order by posicion limit 20;

-- 2. No expone unidades: estas deben ser las UNICAS dos columnas.
select column_name from information_schema.columns
where table_name = 'producto_ventas_rank';
-- Esperado: exactamente producto_id y posicion.

-- 3. anon puede leerla.
set role anon;
select count(*) from producto_ventas_rank;
reset role;
-- Esperado: un numero, no un error de permisos.
```

Si (1) devuelve 0 filas, no es un fallo de la vista: significa que no hay ventas
registradas en 90 días. Comprobar con `select count(*) from documento_items;`
antes de dar por roto el SQL.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-31-vitrina-ventas-rank.sql
git commit -m "feat(tienda): vista de posicion comercial por ventas de 90 dias (Fase 1)"
```

---

### Task 2: `createdAt` en `StoreProducto`

La banda 3 ordena por novedad, y hoy `StoreProducto` no lleva la fecha de creación aunque `productos.created_at` sí existe y el `select` usa `*`.

**Files:**
- Modify: `types/store.ts` (interfaz `StoreProducto`)
- Modify: `lib/store/adapters.ts` (`toStoreProducto`)
- Test: `lib/store/tests/adapters.test.ts`

**Interfaces:**
- Consumes: `Producto.created_at` de `types/index.ts` (ya existe, tipo `string`).
- Produces: `StoreProducto.createdAt: string` — la fecha ISO tal cual la devuelve Postgres. La consume `ordenarVitrina` en Task 3.

- [ ] **Step 1: Escribir el test que falla**

En `lib/store/tests/adapters.test.ts`:

El archivo ya tiene la fixture `BASE_PRODUCTO` (linea 5, un `Producto` completo con `created_at: '2026-01-01T00:00:00Z'`) y un `describe('toStoreProducto', ...)`. Anadir dentro de ese describe:

```ts
  it('mapea created_at a createdAt', () => {
    const fila: Producto = { ...BASE_PRODUCTO, created_at: '2026-08-15T10:00:00.000Z' }
    expect(toStoreProducto(fila).createdAt).toBe('2026-08-15T10:00:00.000Z')
  })
```

`Producto` ya esta importado en la linea 3 del archivo.

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run lib/store/tests/adapters.test.ts --exclude "**/.claude/**"
```

Esperado: FALLA. El error será de tipos (`createdAt` no existe en `StoreProducto`) o `expected undefined to be '2026-08-15T10:00:00.000Z'`.

- [ ] **Step 3: Añadir el campo al tipo**

En `types/store.ts`, dentro de `interface StoreProducto`, después de `personalizable: boolean`:

```ts
  createdAt: string
```

- [ ] **Step 4: Mapearlo en el adaptador**

En `lib/store/adapters.ts`, dentro de `toStoreProducto`, después de la línea `personalizable: p.personalizable,`:

```ts
    createdAt: p.created_at,
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
npx vitest run lib/store/tests/adapters.test.ts --exclude "**/.claude/**"
npx tsc --noEmit
```

Esperado: test PASA. `tsc` puede señalar otros sitios que construyen un `StoreProducto` literal (fixtures de test). Añadirles `createdAt: '2026-01-01T00:00:00.000Z'` hasta que `tsc` quede limpio.

- [ ] **Step 6: Commit**

```bash
git add types/store.ts lib/store/adapters.ts lib/store/tests/
git commit -m "feat(tienda): createdAt en StoreProducto para ordenar por novedad (Fase 1)"
```

---

### Task 3: La pura `ordenarVitrina`

El corazón de la fase. Seis bandas excluyentes; **un producto cae en la primera que lo acepta**, y todo criterio desempata por nombre para que el orden sea una función total.

**Files:**
- Create: `lib/store/vitrina.ts`
- Test: `lib/store/tests/vitrina.test.ts`

**Interfaces:**
- Consumes: `estaAgotado` de `lib/store/variantes`, `getDiscountPercent` de `lib/store/format`, `StoreProducto.createdAt` de Task 2.
- Produces:
  - `type VentasRank = Record<string, number>` — `producto_id` → `posicion` (1 = más vendido). Un producto ausente del mapa no tuvo ventas netas positivas.
  - `ordenarVitrina(productos: StoreProducto[], ventas: VentasRank, ahora?: Date): StoreProducto[]` — no muta la entrada.
  - `DIAS_NUEVO = 30`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/store/tests/vitrina.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ordenarVitrina, DIAS_NUEVO } from '../vitrina'
import type { StoreProducto } from '@/types/store'

const AHORA = new Date('2026-08-31T12:00:00.000Z')

function hace(dias: number): string {
  return new Date(AHORA.getTime() - dias * 86_400_000).toISOString()
}

function prod(over: Partial<StoreProducto> = {}): StoreProducto {
  return {
    id: 'p', nombre: 'Producto', slug: 'producto', descripcion: '',
    precio: 500, precioOriginal: null, cat: 'Camisetas', catId: 'c1',
    subcat: null, subcatId: null, genero: null, badge: null, tallas: [],
    imagenes: [], stock: 10, rating: 5, ofertaFin: null,
    personalizable: false, createdAt: hace(400), variantes: [],
    ...over,
  }
}

const ids = (ps: StoreProducto[]) => ps.map(p => p.id)

describe('ordenarVitrina — reparto en bandas', () => {
  it('los agotados van al final, despues de todo lo disponible', () => {
    const productos = [
      prod({ id: 'agotado', stock: 0 }),
      prod({ id: 'disponible', stock: 3 }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['disponible', 'agotado'])
  })

  it('stock null es ilimitado, no agotado', () => {
    const productos = [
      prod({ id: 'agotado', stock: 0 }),
      prod({ id: 'ilimitado', stock: null }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['ilimitado', 'agotado'])
  })

  it('un producto con todas sus variantes agotadas cuenta como agotado', () => {
    const productos = [
      prod({
        id: 'sinVariantes', stock: null, variantes: [
          { id: 'v1', nombre: 'M', precio: null, precioEfectivo: 500, stock: 0, agotada: true },
        ],
      }),
      prod({ id: 'conStock', stock: null, variantes: [
        { id: 'v2', nombre: 'L', precio: null, precioEfectivo: 500, stock: 4, agotada: false },
      ] }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['conStock', 'sinVariantes'])
  })

  it('respeta el orden de las seis bandas', () => {
    const productos = [
      prod({ id: 'b5_resto' }),
      prod({ id: 'b6_agotado', stock: 0 }),
      prod({ id: 'b3_nuevo', createdAt: hace(5) }),
      prod({ id: 'b1_badge', badge: 'Más Vendido' }),
      prod({ id: 'b4_descuento', precio: 400, precioOriginal: 800 }),
      prod({ id: 'b2_ventas' }),
    ]
    const ventas = { b2_ventas: 1 }
    expect(ids(ordenarVitrina(productos, ventas, AHORA))).toEqual([
      'b1_badge', 'b2_ventas', 'b3_nuevo', 'b4_descuento', 'b5_resto', 'b6_agotado',
    ])
  })

  it('las bandas son excluyentes: gana la primera que acepta', () => {
    // Tiene badge Y ventas Y es nuevo Y tiene descuento: manda la banda 1.
    const todoALaVez = prod({
      id: 'todo', badge: 'Oferta', createdAt: hace(1), precio: 400, precioOriginal: 800,
    })
    const soloVentas = prod({ id: 'ventas' })
    const orden = ids(ordenarVitrina([soloVentas, todoALaVez], { ventas: 1, todo: 99 }, AHORA))
    expect(orden).toEqual(['todo', 'ventas'])
  })
})

describe('ordenarVitrina — orden dentro de cada banda', () => {
  it('banda 2: menor posicion primero (mas vendido arriba)', () => {
    const productos = [prod({ id: 'tercero' }), prod({ id: 'primero' }), prod({ id: 'segundo' })]
    const ventas = { primero: 1, segundo: 2, tercero: 3 }
    expect(ids(ordenarVitrina(productos, ventas, AHORA))).toEqual(['primero', 'segundo', 'tercero'])
  })

  it('banda 3: el mas reciente primero', () => {
    const productos = [
      prod({ id: 'viejo', createdAt: hace(20) }),
      prod({ id: 'recien', createdAt: hace(1) }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['recien', 'viejo'])
  })

  it(`banda 3: a los ${DIAS_NUEVO} dias ya no es nuevo y cae a la banda 5`, () => {
    const productos = [
      prod({ id: 'aunNuevo', nombre: 'Zeta', createdAt: hace(DIAS_NUEVO - 1) }),
      prod({ id: 'yaNo', nombre: 'Alfa', createdAt: hace(DIAS_NUEVO + 1) }),
    ]
    // Si ambos estuvieran en la banda 5, 'Alfa' iria primero por nombre.
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['aunNuevo', 'yaNo'])
  })

  it('banda 4: mayor porcentaje de descuento primero', () => {
    const productos = [
      prod({ id: 'baja', precio: 900, precioOriginal: 1000 }),
      prod({ id: 'alta', precio: 300, precioOriginal: 1000 }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['alta', 'baja'])
  })

  it('banda 5: alfabetico por nombre', () => {
    const productos = [
      prod({ id: 'c', nombre: 'Calceta' }),
      prod({ id: 'a', nombre: 'Abrigo' }),
      prod({ id: 'b', nombre: 'Bermuda' }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['a', 'b', 'c'])
  })

  it('banda 6: el agotado que mas se vendia encabeza su banda', () => {
    const productos = [
      prod({ id: 'pocoVendido', stock: 0 }),
      prod({ id: 'muyVendido', stock: 0 }),
    ]
    expect(ids(ordenarVitrina(productos, { muyVendido: 1, pocoVendido: 8 }, AHORA)))
      .toEqual(['muyVendido', 'pocoVendido'])
  })

  it('sin ventas va al final de su banda, no al principio', () => {
    const productos = [
      prod({ id: 'sinVentas', nombre: 'Aaa', badge: 'Oferta' }),
      prod({ id: 'conVentas', nombre: 'Zzz', badge: 'Oferta' }),
    ]
    expect(ids(ordenarVitrina(productos, { conVentas: 5 }, AHORA)))
      .toEqual(['conVentas', 'sinVentas'])
  })
})

describe('ordenarVitrina — es una funcion total', () => {
  it('desempata por nombre cuando todo lo demas empata', () => {
    const productos = [
      prod({ id: 'z', nombre: 'Zapato' }),
      prod({ id: 'a', nombre: 'Abrigo' }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['a', 'z'])
  })

  it('mismas entradas en otro orden dan el MISMO resultado', () => {
    // Es el defecto que esta fase viene a eliminar: sin desempate, el orden de
    // llegada decidia, y la consulta no lo garantiza.
    const base = [
      prod({ id: '1', nombre: 'Uno' }), prod({ id: '2', nombre: 'Dos' }),
      prod({ id: '3', nombre: 'Tres' }), prod({ id: '4', nombre: 'Cuatro', stock: 0 }),
    ]
    const a = ids(ordenarVitrina(base, {}, AHORA))
    const b = ids(ordenarVitrina([...base].reverse(), {}, AHORA))
    expect(a).toEqual(b)
  })

  it('no muta el arreglo de entrada', () => {
    const productos = [prod({ id: 'b', nombre: 'Bbb' }), prod({ id: 'a', nombre: 'Aaa' })]
    const copia = [...productos]
    ordenarVitrina(productos, {}, AHORA)
    expect(productos).toEqual(copia)
  })

  it('lista vacia devuelve lista vacia', () => {
    expect(ordenarVitrina([], {}, AHORA)).toEqual([])
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run lib/store/tests/vitrina.test.ts --exclude "**/.claude/**"
```

Esperado: FALLA con `Failed to resolve import "../vitrina"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/store/vitrina.ts`:

```ts
import { estaAgotado } from './variantes'
import { getDiscountPercent } from './format'
import type { StoreProducto } from '@/types/store'

/** Cuantos dias cuenta un producto como "nuevo" para la banda 3. */
export const DIAS_NUEVO = 30

/**
 * producto_id -> posicion comercial (1 = mas vendido), de la vista
 * `producto_ventas_rank`. Un producto AUSENTE del mapa no tuvo ventas netas
 * positivas en la ventana; no es lo mismo que tener posicion alta.
 */
export type VentasRank = Record<string, number>

const MS_POR_DIA = 86_400_000

function esNuevo(p: StoreProducto, ahora: Date): boolean {
  const dias = (ahora.getTime() - new Date(p.createdAt).getTime()) / MS_POR_DIA
  return dias < DIAS_NUEVO
}

function descuento(p: StoreProducto): number {
  return getDiscountPercent(p.precio, p.precioOriginal) ?? 0
}

/**
 * Banda comercial del producto. Un producto cae en la PRIMERA que lo acepta,
 * asi que el orden de estas comprobaciones ES la prioridad de negocio:
 * la curacion manual pesa mas que las ventas, y las ventas mas que la novedad.
 */
function banda(p: StoreProducto, ventas: VentasRank, ahora: Date): number {
  if (estaAgotado(p.stock, p.variantes)) return 6
  if (p.badge) return 1
  if (ventas[p.id] != null) return 2
  if (esNuevo(p, ahora)) return 3
  if (descuento(p) > 0) return 4
  return 5
}

function compararEnBanda(
  a: StoreProducto,
  b: StoreProducto,
  numeroBanda: number,
  ventas: VentasRank,
): number {
  if (numeroBanda === 1 || numeroBanda === 2 || numeroBanda === 6) {
    // Sin posicion va al final de su banda, no al principio.
    const pa = ventas[a.id] ?? Number.POSITIVE_INFINITY
    const pb = ventas[b.id] ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
  } else if (numeroBanda === 3) {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    if (ta !== tb) return tb - ta
  } else if (numeroBanda === 4) {
    const da = descuento(a)
    const db = descuento(b)
    if (da !== db) return db - da
  }
  // Desempate final SIEMPRE por nombre: sin el, el orden no seria una funcion
  // total y dos cargas podrian dar resultados distintos.
  return a.nombre.localeCompare(b.nombre)
}

/**
 * Ordena la vitrina por bandas comerciales. No muta la entrada.
 *
 * `ahora` es inyectable para que los tests no dependan del reloj.
 */
export function ordenarVitrina(
  productos: StoreProducto[],
  ventas: VentasRank,
  ahora: Date = new Date(),
): StoreProducto[] {
  return productos
    .map(p => ({ p, b: banda(p, ventas, ahora) }))
    .sort((x, y) => (x.b !== y.b ? x.b - y.b : compararEnBanda(x.p, y.p, x.b, ventas)))
    .map(x => x.p)
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx vitest run lib/store/tests/vitrina.test.ts --exclude "**/.claude/**"
npx tsc --noEmit
```

Esperado: los 16 tests PASAN, `tsc` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/store/vitrina.ts lib/store/tests/vitrina.test.ts
git commit -m "feat(tienda): pura ordenarVitrina con las seis bandas comerciales (Fase 1)"
```

---

### Task 4: Conectar la vitrina en las páginas

**Files:**
- Modify: `app/(store)/page.tsx`
- Modify: `app/(store)/producto/[slug]/page.tsx`
- Modify: `app/(store)/StoreClient.tsx`

**Interfaces:**
- Consumes: `ordenarVitrina` y `VentasRank` de Task 3; vista `producto_ventas_rank` de Task 1.
- Produces: `StoreClient` recibe una prop nueva `ventasRank: VentasRank`.

- [ ] **Step 1: Consultar la vista y dar orden determinista en `page.tsx`**

En `app/(store)/page.tsx`, sustituir el bloque del `Promise.all` (linea 26 en adelante). ANTES:

```ts
  const [{ data: config }, { data: categorias }, { data: banners }, { data: envios }, { data: cupones }, { data: productos }] =
    await Promise.all([
      supabase.from('configuracion').select('key,value'),
      supabase.from('categorias').select('id, tipo, valor, slug, imagen, categorias_padre, orden, activo').eq('activo', true).order('orden'),
      supabase.from('banners').select('id, titulo, subtitulo, btn_texto, btn_link, imagen, orden, activo').eq('activo', true).order('orden'),
      supabase.from('envios').select('id, nombre, descripcion, tipo, costo, descuento, activo').eq('activo', true),
      supabase.from('cupones').select('id, codigo, descuento, tipo, activo, created_at').eq('activo', true),
      supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true).in('canal', ['tienda', 'ambas']),
    ])

  const configMap = toConfigMap(config ?? [])
  const storeProductos = (productos ?? []).map(toStoreProducto)
```

DESPUES:

```ts
  const [{ data: config }, { data: categorias }, { data: banners }, { data: envios }, { data: cupones }, { data: productos }, { data: ventasRankRows }] =
    await Promise.all([
      supabase.from('configuracion').select('key,value'),
      supabase.from('categorias').select('id, tipo, valor, slug, imagen, categorias_padre, orden, activo').eq('activo', true).order('orden'),
      supabase.from('banners').select('id, titulo, subtitulo, btn_texto, btn_link, imagen, orden, activo').eq('activo', true).order('orden'),
      supabase.from('envios').select('id, nombre, descripcion, tipo, costo, descuento, activo').eq('activo', true),
      supabase.from('cupones').select('id, codigo, descuento, tipo, activo, created_at').eq('activo', true),
      // El .order() no fija el orden final -lo hace ordenarVitrina- pero sin el
      // la entrada de la pura es no determinista y los empates dentro de una
      // banda bailarian entre cargas.
      supabase.from('productos').select(PRODUCTO_SELECT).eq('activo', true).in('canal', ['tienda', 'ambas']).order('created_at', { ascending: false }),
      // PostgREST no puede embeber una vista sin FK, asi que va como consulta
      // aparte en el mismo Promise.all: una ida y vuelta mas, con dos columnas.
      supabase.from('producto_ventas_rank').select('producto_id, posicion'),
    ])

  const configMap = toConfigMap(config ?? [])
  const storeProductos = (productos ?? []).map(toStoreProducto)
  const ventasRank: VentasRank = Object.fromEntries(
    (ventasRankRows ?? []).map(v => [String(v.producto_id), Number(v.posicion)]),
  )
```

Anadir el import al principio del archivo:

```ts
import type { VentasRank } from '@/lib/store/vitrina'
```

Y pasar la prop nueva al cliente, junto a las que ya tiene:

```tsx
        ventasRank={ventasRank}
```

- [ ] **Step 2: Aplicar el orden en `StoreClient.tsx`**

Añadir el import:

```ts
import { ordenarVitrina, type VentasRank } from '@/lib/store/vitrina'
```

Añadir `ventasRank: VentasRank` a `StoreClientProps` y al destructuring de props.

Sustituir la línea que calcula `filtered`:

```ts
  const filtered = filterProductos({ productos, ...filters, search: '', tallaFiltros })
```

por:

```ts
  // El orden se aplica DESPUES de filtrar: las bandas se recalculan sobre lo
  // que el visitante esta viendo, no sobre el catalogo completo.
  const filtered = ordenarVitrina(
    filterProductos({ productos, ...filters, search: '', tallaFiltros }),
    ventasRank,
  )
```

Sin `useMemo` a proposito: `filterProductos` ya devuelve un arreglo nuevo en cada render, asi que memorizar sobre esa referencia recalcularia siempre y solo anadiria ruido. Es el mismo criterio que ya sigue la linea que se sustituye.

- [ ] **Step 3: Mismo tratamiento en la ficha de producto**

En `app/(store)/producto/[slug]/page.tsx`, la consulta que lee el catálogo completo (`.select(PRODUCTO_SELECT).eq('activo', true).in('canal', ...)`, sin `.maybeSingle()`) alimenta relacionados y vistos recientemente. Añadirle el mismo `.order('created_at', { ascending: false })` para que esas listas sean deterministas.

No hace falta consultar la vista aquí: `ProductDetail` no usa `ordenarVitrina`.

- [ ] **Step 4: Verificar en el navegador**

```bash
npm run dev
```

Con la Browser pane abierta en `http://localhost:3000`, comprobar midiendo el DOM (no a ojo):

1. En la rejilla "VER TODO", **ningún producto con etiqueta AGOTADO aparece antes de uno sin ella**. Con los datos actuales de producción son 8 agotados y 4 disponibles, así que los 4 primeros deben ser los disponibles.
2. Recargar la página tres veces y confirmar que **la secuencia de nombres es idéntica** las tres veces.
3. La consola no debe traer errores nuevos (los de `<Image src="">` ya se arreglaron en `00f3289`; si aparece alguno, es de este cambio).

- [ ] **Step 5: Correr toda la verificación**

```bash
npx vitest run --exclude "**/node_modules/**" --exclude "**/.claude/**"
npx tsc --noEmit
npm run build
```

Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
git add "app/(store)/page.tsx" "app/(store)/producto/[slug]/page.tsx" "app/(store)/StoreClient.tsx"
git commit -m "feat(tienda): la portada ordena por bandas comerciales (Fase 1)"
```

---

### Task 5: Borrar `sortProductos`, que está muerto

Existe desde antes, no lo usa nadie, y su caso `default` devuelve la lista sin ordenar. Dejarlo junto a `ordenarVitrina` es una trampa para quien lea el código después: dos funciones de orden y solo una conectada.

**Files:**
- Modify: `lib/store/filters.ts` (borrar líneas 5 y 53–69)
- Modify: `lib/store/tests/filters.test.ts` (borrar líneas 191–228 y ajustar el import)

**Interfaces:**
- Consumes: nada.
- Produces: nada. `SortBy` y `sortProductos` dejan de existir.

- [ ] **Step 1: Confirmar que sigue sin usarse**

```bash
grep -rn "sortProductos\|SortBy" --include="*.ts" --include="*.tsx" app components lib types
```

Esperado: solo las apariciones en `lib/store/filters.ts` y `lib/store/tests/filters.test.ts`. **Si aparece en cualquier otro archivo, detenerse y no borrar nada** — significa que algo lo empezó a usar y hay que replantear la tarea.

- [ ] **Step 2: Borrar la función y su tipo**

En `lib/store/filters.ts`:
- Borrar la línea 5: `export type SortBy = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'`
- Borrar el bloque completo `export function sortProductos(...) { ... }` (líneas 53–69, desde `export function sortProductos` hasta su `}` de cierre).

- [ ] **Step 3: Borrar sus tests**

En `lib/store/tests/filters.test.ts`:
- Cambiar la línea 2 de `import { filterProductos, sortProductos } from '../filters'` a `import { filterProductos } from '../filters'`
- Borrar el bloque `describe('sortProductos', () => { ... })` completo (líneas 191 a 228, hasta el final del archivo).

- [ ] **Step 4: Verificar**

```bash
npx vitest run --exclude "**/node_modules/**" --exclude "**/.claude/**"
npx tsc --noEmit
npm run build
```

Esperado: todo verde, con 6 tests menos que antes de esta tarea.

- [ ] **Step 5: Commit**

```bash
git add lib/store/filters.ts lib/store/tests/filters.test.ts
git commit -m "refactor(tienda): borra sortProductos, que estaba muerto (Fase 1)"
```

---

## Notas de entrega

- **Task 1 va primero y su SQL se aplica a mano antes de empujar nada.** Si el código de Task 4 llega a producción sin la vista creada, la consulta falla y la portada se queda sin datos de ventas. `ordenarVitrina` con un mapa vacío sigue funcionando (todo cae en bandas 3/4/5/6), así que el fallo es degradado, no una pantalla en blanco — pero el orden no sería el comercial.
- **Task 5 es independiente** de las otras cuatro; puede ir en cualquier momento o dejarse fuera si se decide conectar `sortProductos` a un selector de orden en la UI. En ese caso, sustituir la tarea por la que añada el selector.
- Al terminar la fase, el spec queda con la Fase 2 pendiente (sección "Por encargo" y la RPC `crear_solicitud_encargo`), que es la única con cambios de esquema.
