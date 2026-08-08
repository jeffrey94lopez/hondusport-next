# POS P2.1 — Mejoras de UX del mostrador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer usable la pantalla de venta del POS: catálogo navegable por categorías y anclados, carrito legible con edición en modal, cobro por chips con la tasa a la vista, totales grandes con pie fijo, impresión en modal sin salir del POS, alta rápida de clientes, y botones consistentes con Merlin.

**Architecture:** Primero se parte `app/admin/pos/PosClient.tsx` (1815 líneas, 6 componentes) en `app/admin/pos/components/` y se extrae la lógica pura del carrito a `lib/pos/carrito.ts` con tests — commit de movimiento sin cambio de comportamiento. Sobre esa base van las mejoras, una por tarea. Nada de la matemática fiscal, la emisión, el kardex ni el arqueo se modifica.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), CSS Modules + tokens Merlin (`app/merlin.css`), Vitest.

## Global Constraints

- UI, dominio, mensajes de error y commits en **español**; moneda con `formatPrice()` (`lib/store/format.ts`).
- **Prohibido tocar:** `lib/pos/desglose.ts`, `lib/pos/letras.ts`, `lib/pos/emision.ts` (salvo el añadido explícito de Task 2), `app/admin/pos/actions.ts` en lo relativo a `emitirVenta`/`emitirDesdePedido`/`cerrarSesion`, las migraciones de P1/P2 ya aplicadas, y las RPCs. Este proyecto es presentación + 2 features.
- **Lógica con peso va en `lib/pos/` con test** (convención CLAUDE.md): los clamps del carrito y la regla de autocompletado de pagos.
- Tokens Merlin obligatorios: nunca hardcodear color, radio ni tipografía que ya tengan token. Clases locales solo para posición/tamaño.
- Migración: NO se aplica desde el código; el usuario la corre en el SQL Editor antes del push. `supabase/schema.sql` se mantiene en sync.
- Estado del carrito y sus tipos (`LineaVenta`, `LineaPos`, `DescuentoModo`, `EsperaPayload`) conservan su forma actual: las esperas ya guardadas en BD deben seguir retomándose.
- **Verificación en cada tarea:** `npx vitest run --exclude "**/.claude/**"` (los worktrees bajo `.claude/` duplican la suite), `npx tsc --noEmit`, `npx eslint app components lib types middleware.ts` (0 errores), y `npm run build` en las tareas que tocan rutas (si da `EPERM` sobre `.next`: `rm -rf .next` y reintentar una vez).
- Baseline al iniciar: **368 tests** en 23 archivos.

---

## Estructura de archivos

- `lib/pos/carrito.ts` + `lib/pos/tests/carrito.test.ts` — puras del carrito (Task 1) y de pagos (Task 2)
- `app/admin/pos/PosClient.tsx` — orquestador (Task 3 lo adelgaza)
- `app/admin/pos/components/CatalogoPanel.tsx` — catálogo (Tasks 3, 5, 6)
- `app/admin/pos/components/CarritoPanel.tsx` — carrito y pie (Tasks 3, 7, 8)
- `app/admin/pos/components/LineaEditorModal.tsx` — nuevo (Task 7)
- `app/admin/pos/components/ClienteNuevoModal.tsx` — nuevo (Task 10)
- `app/admin/pos/components/DocumentoModal.tsx` — nuevo (Task 11)
- `app/admin/pos/components/{ItemLibreModal,CobroModal,EsperaModal,CierreModal,HistorialModal}.tsx` — movidos (Task 3), `CobroModal` reescrito en Task 9
- `app/admin/pos/documento/[id]/DocumentoHoja.tsx` — hoja compartida (Task 11)
- `supabase/migrations/2026-08-07-pos-p2-1-favoritos.sql` — columna + clave de config (Task 4)
- `app/merlin.css` — variantes `btnMerlinIcon` / `btnMerlinChip` (Task 12)

---

### Task 1: `lib/pos/carrito.ts` — puras del carrito extraídas (TDD)

**Files:**
- Create: `lib/pos/carrito.ts`
- Test: `lib/pos/tests/carrito.test.ts`
- Modify: `app/admin/pos/PosClient.tsx` (borrar las 4 funciones locales y el tipo, importar de `lib/pos/carrito`)

**Interfaces:**
- Consumes: `LineaPos`, `IsvTipo` de `types/index.ts`.
- Produces (exactos — el resto del plan los usa así):

```ts
export type DescuentoModo = 'monto' | 'porcentaje'
export interface LineaVenta extends LineaPos {
  key: string
  precioManual: boolean
  descuentoModo: DescuentoModo
}
export function brutoLinea(l: Pick<LineaVenta, 'cantidad' | 'precio_unitario'>): number
export function clampDescuentoLinea(l: LineaVenta): LineaVenta
export function brutoTotalLineas(ls: LineaVenta[]): number
export function clampDescuentoGlobal(next: LineaVenta[], descuentoGlobal: number): number
export function descuentoDesdePorcentaje(l: LineaVenta, pct: number): number
export function topeCantidad(stockDisponible: number | null, cantidadActual: number): number
```

- [ ] **Step 1: Leer el código actual antes de mover nada.** Abre `app/admin/pos/PosClient.tsx` líneas 60-200 y copia VERBATIM los cuerpos de `round2`, `brutoLinea`, `clampDescuentoLinea`, `brutoTotalLineas`, `clampDescuentoGlobal` y el tipo `LineaVenta` + `DescuentoModo` con sus comentarios. Este task NO cambia su comportamiento.

- [ ] **Step 2: Escribir los tests**

```ts
import { describe, it, expect } from 'vitest'
import {
  brutoLinea, clampDescuentoLinea, brutoTotalLineas, clampDescuentoGlobal,
  descuentoDesdePorcentaje, topeCantidad, type LineaVenta,
} from '../carrito'

const linea = (over: Partial<LineaVenta> = {}): LineaVenta => ({
  key: 'k1', producto_id: null, variante_id: null, descripcion: 'X',
  cantidad: 2, precio_unitario: 100, descuento: 0, isv: '15',
  precioManual: false, descuentoModo: 'monto', ...over,
})

describe('brutoLinea', () => {
  it('cantidad × precio', () => expect(brutoLinea(linea())).toBe(200))
  it('redondea a 2 decimales', () =>
    expect(brutoLinea(linea({ cantidad: 3, precio_unitario: 33.333 }))).toBe(100))
})

describe('clampDescuentoLinea', () => {
  it('deja pasar un descuento menor al bruto', () =>
    expect(clampDescuentoLinea(linea({ descuento: 50 })).descuento).toBe(50))
  it('recorta el descuento al bruto', () =>
    expect(clampDescuentoLinea(linea({ descuento: 500 })).descuento).toBe(200))
  it('recorta cuando baja la cantidad', () =>
    expect(clampDescuentoLinea(linea({ cantidad: 1, descuento: 150 })).descuento).toBe(100))
  it('nunca deja descuento negativo', () =>
    expect(clampDescuentoLinea(linea({ descuento: -10 })).descuento).toBe(0))
})

describe('brutoTotalLineas', () => {
  it('suma brutos menos descuentos de línea', () =>
    expect(brutoTotalLineas([linea({ descuento: 20 }), linea({ cantidad: 1 })])).toBe(280))
})

describe('clampDescuentoGlobal', () => {
  it('recorta al bruto total disponible', () =>
    expect(clampDescuentoGlobal([linea()], 500)).toBe(200))
  it('respeta un global válido', () =>
    expect(clampDescuentoGlobal([linea()], 30)).toBe(30))
  it('cero cuando no hay líneas', () =>
    expect(clampDescuentoGlobal([], 30)).toBe(0))
})

describe('descuentoDesdePorcentaje', () => {
  it('convierte % a monto sobre el bruto', () =>
    expect(descuentoDesdePorcentaje(linea(), 10)).toBe(20))
  it('tope 100%', () =>
    expect(descuentoDesdePorcentaje(linea(), 150)).toBe(200))
  it('piso 0%', () =>
    expect(descuentoDesdePorcentaje(linea(), -5)).toBe(0))
})

describe('topeCantidad', () => {
  it('stock null = ilimitado devuelve Infinity', () =>
    expect(topeCantidad(null, 3)).toBe(Infinity))
  it('devuelve el stock cuando es mayor que lo actual', () =>
    expect(topeCantidad(5, 2)).toBe(5))
  it('nunca baja de la cantidad ya en el carrito', () =>
    expect(topeCantidad(1, 3)).toBe(3))
})
```

- [ ] **Step 3: Correr los tests y verlos fallar**

Run: `npx vitest run lib/pos/tests/carrito.test.ts`
Expected: FAIL — "Failed to resolve import ... ../carrito".

- [ ] **Step 4: Crear `lib/pos/carrito.ts`** con las funciones movidas VERBATIM (mismos cuerpos, mismos comentarios explicativos) más las dos nuevas:

```ts
export function descuentoDesdePorcentaje(l: LineaVenta, pct: number): number {
  const p = Math.min(Math.max(pct, 0), 100)
  return round2(brutoLinea(l) * (p / 100))
}

// Tope de cantidad de una línea: el stock disponible, salvo que la línea ya
// tenga más (carrito viejo o stock que bajó) — nunca se le baja al cajero una
// cantidad ya capturada; el servidor revalida al emitir.
export function topeCantidad(stockDisponible: number | null, cantidadActual: number): number {
  if (stockDisponible == null) return Infinity
  return Math.max(stockDisponible, cantidadActual)
}
```

- [ ] **Step 5: Tests en verde**

Run: `npx vitest run lib/pos/tests/carrito.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 6: Sustituir en `PosClient.tsx`** — borra las definiciones locales de `round2` (si solo la usaban esas funciones), `brutoLinea`, `clampDescuentoLinea`, `brutoTotalLineas`, `clampDescuentoGlobal`, `LineaVenta`, `DescuentoModo` y añade `import { ... } from '@/lib/pos/carrito'`. El comportamiento de la pantalla no cambia.

- [ ] **Step 7: Verificar y commitear**

Run: `npx vitest run --exclude "**/.claude/**"` (390) · `npx tsc --noEmit` · `npx eslint app components lib types middleware.ts`

```bash
git add lib/pos/carrito.ts lib/pos/tests/carrito.test.ts app/admin/pos/PosClient.tsx
git commit -m "refactor(pos): logica del carrito a lib/pos/carrito con tests"
```

---

### Task 2: `montosPagoAlAgregar` — autocompletado de chips (TDD)

**Files:**
- Modify: `lib/pos/emision.ts` (añadir la función al final, sin tocar las existentes)
- Test: `lib/pos/tests/emision.test.ts` (añadir un describe, sin tocar los existentes)

**Interfaces:**
- Consumes: `PagoPos` de `types/index.ts`; `round2` local de `emision.ts`.
- Produces:

```ts
export function montosPagoAlAgregar(pagos: PagoPos[], total: number): PagoPos[]
```
Recalcula los montos cuando cambia la lista de métodos seleccionados: el ÚLTIMO pago de la lista recibe lo que falta para cubrir el total (mínimo 0); los anteriores conservan su monto. Con un solo pago, ese pago recibe el total completo.

- [ ] **Step 1: Escribir los tests**

```ts
import { montosPagoAlAgregar } from '../emision'
const pago = (id: string, monto = 0): PagoPos =>
  ({ metodo_id: id, tipo: 'efectivo_lps', monto })

describe('montosPagoAlAgregar', () => {
  it('un solo pago toma el total completo', () => {
    expect(montosPagoAlAgregar([pago('m1')], 230)).toEqual([pago('m1', 230)])
  })
  it('el segundo pago toma el restante', () => {
    const r = montosPagoAlAgregar([pago('m1', 100), pago('m2')], 230)
    expect(r.map(p => p.monto)).toEqual([100, 130])
  })
  it('el tercero toma el restante y respeta los anteriores', () => {
    const r = montosPagoAlAgregar([pago('m1', 100), pago('m2', 50), pago('m3')], 230)
    expect(r.map(p => p.monto)).toEqual([100, 50, 80])
  })
  it('sin restante el último queda en 0 (no negativo)', () => {
    const r = montosPagoAlAgregar([pago('m1', 300), pago('m2')], 230)
    expect(r.map(p => p.monto)).toEqual([300, 0])
  })
  it('redondea a 2 decimales', () => {
    const r = montosPagoAlAgregar([pago('m1', 100.005), pago('m2')], 230)
    expect(r[1].monto).toBe(129.99)
  })
  it('lista vacía devuelve lista vacía', () => {
    expect(montosPagoAlAgregar([], 230)).toEqual([])
  })
})
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run lib/pos/tests/emision.test.ts`
Expected: FAIL — `montosPagoAlAgregar is not a function`.

- [ ] **Step 3: Implementar en `lib/pos/emision.ts`**

```ts
// Regla de los chips de pago del POS: al seleccionar un método nuevo, ese
// pago (el último de la lista) se llena con lo que falta para cubrir el
// total; los ya capturados no se tocan. Con un solo método, toma el total.
export function montosPagoAlAgregar(pagos: PagoPos[], total: number): PagoPos[] {
  if (pagos.length === 0) return []
  const previos = pagos.slice(0, -1)
  const cubierto = previos.reduce((s, p) => s + p.monto, 0)
  const restante = Math.max(0, round2(total - cubierto))
  return [...previos, { ...pagos[pagos.length - 1], monto: restante }]
}
```

- [ ] **Step 4: Tests en verde**

Run: `npx vitest run lib/pos/tests/emision.test.ts`
Expected: PASS (25 previos + 6 nuevos = 31).

- [ ] **Step 5: Verificar y commitear**

```bash
git add lib/pos/emision.ts lib/pos/tests/emision.test.ts
git commit -m "feat(pos): regla de autocompletado del restante para chips de pago"
```

---

### Task 3: Separar `PosClient.tsx` en componentes (movimiento puro)

**Files:**
- Create: `app/admin/pos/components/CatalogoPanel.tsx`, `CarritoPanel.tsx`, `ItemLibreModal.tsx`, `CobroModal.tsx`, `EsperaModal.tsx`, `CierreModal.tsx`, `HistorialModal.tsx`
- Modify: `app/admin/pos/PosClient.tsx` (queda como orquestador)

**Interfaces:**
- Consumes: puras de `lib/pos/carrito.ts` (Task 1); tipos de `types/index.ts`; server actions de `app/admin/pos/actions.ts`.
- Produces: los componentes con props explícitas. Contrato mínimo que las tareas siguientes usan:

```ts
// CatalogoPanel
interface CatalogoPanelProps {
  productos: Producto[]
  onAgregar: (producto: Producto, variante: ProductoVariante | null) => void
}
// CarritoPanel
interface CarritoPanelProps {
  lineas: LineaVenta[]
  descuentoGlobal: number
  clientes: Cliente[]
  vendedores: Vendedor[]
  clienteId: string | null
  vendedorId: string | null
  onCantidad: (key: string, delta: number) => void
  onEditarLinea: (key: string) => void
  onQuitarLinea: (key: string) => void
  onDescuentoGlobal: (monto: number) => void
  onCliente: (id: string | null) => void
  onVendedor: (id: string | null) => void
  onItemLibre: () => void
  onCobrar: () => void
}
```

- [ ] **Step 1: Mover los 5 modales existentes** (`ItemLibreModal`, `CobroModal`, `EsperaModal`, `CierreModal`, `HistorialModal`) a `app/admin/pos/components/`, un archivo por componente, con sus interfaces de props tal como ya están declaradas en el archivo grande. Importan `styles from '../pos.module.css'`. `PosClient` los importa.

- [ ] **Step 2: Extraer `CatalogoPanel`** — todo el JSX de la columna izquierda (buscador, grid, selector de variante) con su estado local de búsqueda y de variante abierta. El handler de agregar sube por props (`onAgregar`), porque el carrito vive en `PosClient`.

- [ ] **Step 3: Extraer `CarritoPanel`** — todo el JSX de la columna derecha con las props del contrato de arriba. El ESTADO del carrito (lineas, descuentoGlobal, clienteId, vendedorId) se queda en `PosClient`; el panel solo presenta y avisa.

- [ ] **Step 4: Verificar que nada cambió de comportamiento.** `npx tsc --noEmit`, `npx vitest run --exclude "**/.claude/**"` (390), `npx eslint ...`, `npm run build`. `PosClient.tsx` debe quedar por debajo de ~700 líneas.

- [ ] **Step 5: Commit**

```bash
git add app/admin/pos
git commit -m "refactor(pos): separa paneles y modales del POS en componentes"
```

---

### Task 4: Migración — `favorito_pos` y clave del modal de documento

**Files:**
- Create: `supabase/migrations/2026-08-07-pos-p2-1-favoritos.sql`
- Modify: `supabase/schema.sql` (columna en `productos`, índice, seed de la clave)

- [ ] **Step 1: Escribir la migración**

```sql
-- POS P2.1: productos anclados en el POS + interruptor del modal de documento.
alter table productos add column if not exists favorito_pos boolean not null default false;
create index if not exists productos_favorito_pos on productos (favorito_pos) where favorito_pos;

insert into configuracion (key, value) values ('pos_documento_modal', 'true')
  on conflict (key) do nothing;
```

- [ ] **Step 2: Replicar en `supabase/schema.sql`** — la columna dentro del `create table if not exists productos` (junto a `stock_minimo`, con el mismo estilo), el índice junto a los otros índices de productos, y el seed de la clave donde están los demás seeds de `configuracion`.

- [ ] **Step 3: Añadir el campo al tipo `Producto`** en `types/index.ts`: `favorito_pos: boolean` (no opcional — la columna es NOT NULL con default).

- [ ] **Step 4: Verificar** `npx tsc --noEmit` y `npx vitest run --exclude "**/.claude/**"` (390). NO aplicar la migración a ninguna BD.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-08-07-pos-p2-1-favoritos.sql supabase/schema.sql types/index.ts
git commit -m "feat(pos): columna favorito_pos y clave del modal de documento"
```

---

### Task 5: Catálogo — chips de categoría y subcategoría

**Files:**
- Modify: `app/admin/pos/page.tsx` (fetch de categorías activas + prop), `app/admin/pos/PosClient.tsx` (pasar la prop), `app/admin/pos/components/CatalogoPanel.tsx`, `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `filtrarInventario(productos, criterios)` de `lib/store/inventoryFilters.ts` — filtra por `criterios.categoriaIds?: string[]` y `subcategoriaIds?: string[]` comparando contra `producto.categoria_id` / `subcategoria_id`; `Categoria` de `types/index.ts` (campos `id`, `tipo`, `valor`, `categorias_padre: string[] | null` con **ids** de categoría padre, `orden`, `activo`).
- Produces: `CatalogoPanelProps` gana `categorias: Categoria[]`.

- [ ] **Step 1: Fetch en `page.tsx`** — añadir al `Promise.all` existente:

```ts
supabase.from('categorias')
  .select('id, tipo, valor, slug, imagen, categorias_padre, orden, activo')
  .eq('activo', true).in('tipo', ['cat', 'subcat']).order('orden'),
```
y pasar `categorias={categorias ?? []}` a `PosClient`, que la reenvía a `CatalogoPanel`.

- [ ] **Step 2: Estado y filtrado en `CatalogoPanel`**

```tsx
const [catId, setCatId] = useState<string | null>(null)
const [subcatId, setSubcatId] = useState<string | null>(null)

const cats = useMemo(() => categorias.filter(c => c.tipo === 'cat'), [categorias])
const subcats = useMemo(
  () => catId ? categorias.filter(c => c.tipo === 'subcat' && (c.categorias_padre ?? []).includes(catId)) : [],
  [categorias, catId],
)

const productosFiltrados = useMemo(() => {
  const base = filtrarInventario(productos, {
    categoriaIds: catId ? [catId] : undefined,
    subcategoriaIds: subcatId ? [subcatId] : undefined,
  })
  return base.filter(p => coincideBusqueda(p, busqueda))
}, [productos, catId, subcatId, busqueda])
```
`coincideBusqueda(producto, texto)` es el predicado de búsqueda que HOY está inline en el `.filter()` del catálogo (nombre / SKU del producto / SKU de variante, case-insensitive): extráelo a una función local del mismo archivo con ese nombre y reúsalo aquí, sin cambiar su comportamiento.

Elegir otra categoría limpia la subcategoría (`setSubcatId(null)`). El chip "Todos" pone ambos en null.

- [ ] **Step 3: JSX de los chips** — una fila `.chipsRow` con "Todos" + una pastilla por categoría; si `catId` no es null, una segunda fila con sus subcategorías. Usa `type="button"` y marca la activa con `aria-pressed`. Estilos: pastillas con `--radius-btn`, fondo `--bg-card` inactivo y `--cta` + `--text-on-accent` activo (en Task 12 se sustituyen por `btnMerlinChip`; aquí usa clases locales `.chip`/`.chipActivo` para no bloquear).

- [ ] **Step 4: Verificar** suite (390) + tsc + lint + build. Con catálogo vacío no debe romper (chips sin categorías → solo "Todos").

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pos): filtro de catalogo por categoria y subcategoria"
```

---

### Task 6: Catálogo — productos anclados con estrella

**Files:**
- Modify: `app/admin/pos/actions.ts` (nueva action), `app/admin/pos/components/CatalogoPanel.tsx`, `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `PosResult` y el patrón de actions de `app/admin/pos/actions.ts` (cliente de `lib/supabase-server.ts`, `revalidatePath`), `Producto.favorito_pos` (Task 4).
- Produces:

```ts
export async function toggleFavoritoPos(productoId: string, favorito: boolean): Promise<PosResult>
```

- [ ] **Step 1: Server action** en `app/admin/pos/actions.ts` (al final del archivo, sin tocar las existentes):

```ts
export async function toggleFavoritoPos(productoId: string, favorito: boolean): Promise<PosResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('productos')
    .update({ favorito_pos: favorito }).eq('id', productoId)
  if (error) {
    console.error('toggleFavoritoPos:', error)
    return { ok: false, error: 'No se pudo cambiar el anclaje del producto.' }
  }
  revalidatePath('/admin/pos')
  return { ok: true }
}
```

- [ ] **Step 2: Sección "Anclados" en `CatalogoPanel`** — sobre los chips, visible siempre que haya al menos un producto con `favorito_pos`. Contiene los productos anclados que pasan el filtro de TEXTO, ignorando los chips de categoría (existen para no filtrar). Encabezado `Anclados` + el mismo grid de tarjetas.

- [ ] **Step 3: Estrella en cada tarjeta** — botón absoluto en la esquina de la tarjeta (`type="button"`, `aria-label={p.favorito_pos ? 'Quitar de anclados' : 'Anclar al POS'}`), que llama `toggleFavoritoPos(p.id, !p.favorito_pos)` dentro de `startTransition`; al fallar, muestra el mensaje en el banner de avisos que ya usa el POS. El click de la estrella NO debe agregar el producto al carrito: `e.stopPropagation()`.

- [ ] **Step 4: Verificar** suite (390) + tsc + lint + build.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pos): productos anclados con estrella en el catalogo"
```

---

### Task 7: Carrito — fila rediseñada y modal de edición de línea

**Files:**
- Create: `app/admin/pos/components/LineaEditorModal.tsx`
- Modify: `app/admin/pos/components/CarritoPanel.tsx`, `app/admin/pos/PosClient.tsx`, `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `LineaVenta`, `brutoLinea`, `clampDescuentoLinea`, `descuentoDesdePorcentaje`, `topeCantidad` (Task 1); `formatPrice`.
- Produces:

```ts
interface LineaEditorModalProps {
  linea: LineaVenta
  stockDisponible: number | null      // null = ilimitado
  onGuardar: (linea: LineaVenta) => void
  onCerrar: () => void
}
```
`CarritoPanelProps` ya declara `onEditarLinea(key)` (Task 3); `PosClient` mantiene `lineaEditando: string | null` y aplica el resultado con los clamps.

- [ ] **Step 1: Rediseñar la fila** en `CarritoPanel`: `.lineaRow` pasa a un grid de 4 columnas `1fr auto auto auto` con
  (a) descripción — nombre en `--text-primary`, variante en segunda línea `--text-muted`, y si `descuento > 0` una etiqueta `−{formatPrice(descuento)}`;
  (b) cantidad — `−` / número / `+` con botones de 44px (clases locales `.qtyBtn` por ahora, Task 12 las cambia) y el número a `1rem`;
  (c) subtotal — `formatPrice(brutoLinea(l) - l.descuento)` a `0.95rem/700`;
  (d) acciones — botón **Editar** (texto o ícono ✎) y **Quitar**.
  Se eliminan de la fila los inputs de precio, de descuento y el selector L./%.

- [ ] **Step 2: `LineaEditorModal`** — usa el `Modal` de `components/admin/Modal.tsx` (patrón del repo). Campos con etiqueta visible y ancho completo: **Cantidad** (número, tope `topeCantidad(stockDisponible, linea.cantidad)`), **Precio unitario** (número; editarlo marca `precioManual: true`), **Descuento** (número + selector `L.` / `%`; en `%` el monto se calcula con `descuentoDesdePorcentaje`), y solo si `linea.producto_id === null` también **Descripción** (texto requerido) e **ISV** (select `15` / `18` / `exento`). Debajo, en vivo: `Subtotal: {formatPrice(brutoLinea(borrador) - borrador.descuento)}`. Botones **Cancelar** / **Guardar**; Guardar llama `onGuardar(clampDescuentoLinea(borrador))`.

- [ ] **Step 3: Cablear en `PosClient`** — `onEditarLinea(key)` abre el modal con esa línea y su stock disponible (el mismo cálculo que ya usa el tope de cantidad de la fila); `onGuardar` reemplaza la línea por la editada y re-clampa el descuento global con `clampDescuentoGlobal`.

- [ ] **Step 4: Verificar** suite (390) + tsc + lint + build. Probar mentalmente: subir cantidad con `+` respeta el tope; editar el precio a mano y luego cambiar a cliente revendedor NO recalcula esa línea (regla vigente de `precioManual`).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pos): fila de carrito legible y modal de edicion de linea"
```

---

### Task 8: Carrito — pie fijo y totales grandes

**Files:**
- Modify: `app/admin/pos/components/CarritoPanel.tsx`, `app/admin/pos/pos.module.css`

- [ ] **Step 1: Estructura de la columna** — `.carritoCol` pasa a `display: grid; grid-template-rows: 1fr auto; min-height: 0`. La lista de líneas va en un contenedor `.lineasScroll` con `overflow-y: auto; min-height: 0`; el pie `.pieCarrito` (descuento global + totales + cliente + vendedor + Cobrar) queda en la segunda fila con `position: sticky; bottom: 0; background: var(--bg-card); border-top: 1px solid var(--border)`. El botón de ítem libre queda al final de la lista scrolleable.

- [ ] **Step 2: Escala de los totales** — `.totalesRow` de `0.78rem` a `0.95rem`; `.totalesRowTotal` de `1rem` a `1.6rem` con `font-weight: 800`; el botón Cobrar muestra el importe: `Cobrar {formatPrice(totales.total)}` y su alto sube a 52px.

- [ ] **Step 3: Verificar** que con 1 línea y con 20 líneas el pie queda visible sin scroll de página (revisar en `npm run dev` si hay sesión; si no, verificar el CSS y dejarlo anotado para el checkpoint del usuario). Suite + tsc + lint + build.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(pos): pie de carrito fijo con totales grandes"
```

---

### Task 9: Cobro — chips de método, tasa USD visible y resumen grande

**Files:**
- Modify: `app/admin/pos/components/CobroModal.tsx`, `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `montosPagoAlAgregar` (Task 2), `validarPagos`, `cambioPago`, `validarEmision` de `lib/pos/emision.ts` (SIN modificarlas), `MetodoPago`, `PagoPos`.

- [ ] **Step 1: Sustituir el `<select>` por chips** — fila de pastillas con los métodos activos en su orden. Al tocar un método no seleccionado: `setPagos(montosPagoAlAgregar([...pagos, nuevoPago], total))` donde `nuevoPago` es `{ metodo_id, tipo, monto: 0, referencia: null }` (y `monto_usd`/`tasa` si el tipo es `efectivo_usd`). Al tocar un método ya seleccionado: quitar ese pago (sin recalcular los demás). El chip de `efectivo_usd` queda deshabilitado si la tasa es 0 o inválida, con el aviso que ya existe.

- [ ] **Step 2: Bloque por pago seleccionado** — debajo de los chips, una tarjeta por pago: nombre del método, campo **Monto** grande con etiqueta, y campo **Referencia** cuando el tipo es `tarjeta` o `transferencia`. Para `efectivo_usd`: línea `Tasa: L. {tasa} × USD 1.00` visible, input en **USD** y a la derecha `≈ {formatPrice(montoLps(p))}`.

- [ ] **Step 3: Resumen grande** — `Total` y `Restante` a `1.4rem/800` (restante en `var(--danger)` mientras `restante > 0`), `Cambio` a `1.4rem/800` en `var(--success)` cuando `cambioPago(pagos, total) > 0`, y las filas secundarias a `0.95rem`. La lógica de validación y el flujo de emisión no cambian.

- [ ] **Step 4: Verificar** suite (390) + tsc + lint + build. Trazar: un chip → monto = total; segundo chip → monto = restante; quitar el primero deja el segundo intacto; con tasa 0 el chip USD no se puede seleccionar.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pos): chips de pago con tasa USD visible y resumen grande"
```

---

### Task 10: Cliente nuevo desde el POS

**Files:**
- Create: `app/admin/pos/components/ClienteNuevoModal.tsx`
- Modify: `app/admin/pos/components/CarritoPanel.tsx` (botón + Nuevo), `app/admin/pos/PosClient.tsx` (estado del modal y selección tras crear)

**Interfaces:**
- Consumes: `createCliente(form: ClienteForm): Promise<ActionResult>` de `app/admin/clientes/actions.ts` (valida nombre requerido y `validarRtn` de `lib/pos/fiscal.ts`; RTN duplicado → mensaje con el nombre del cliente que ya lo tiene); `ClienteForm` y `Cliente` de `types/index.ts`.
- Produces:

```ts
interface ClienteNuevoModalProps {
  onCreado: (cliente: Cliente) => void
  onCerrar: () => void
}
```

- [ ] **Step 1: Modal** con el `Modal` del repo. Campos visibles: **Nombre** (requerido), **RTN**, **Identidad**, **Teléfono**, **Tipo** (select `final` / `revendedor`). Sección plegable **"Más datos"** (un `<button type="button">` que alterna): dirección, correo, checkbox **Exonerado** y, solo si está marcado, constancia de exonerado y registro SAG, más notas. Errores en español en un banner dentro del modal; `useTransition` para bloquear doble envío.

- [ ] **Step 2: Server action que crea y DEVUELVE el cliente.** `createCliente` de `app/admin/clientes/actions.ts` devuelve `ActionResult` sin el registro, y el POS necesita el `id` para seleccionarlo en la venta. Añade en `app/admin/pos/actions.ts`:

```ts
export async function crearClienteDesdePos(form: ClienteForm): Promise<PosResult<{ cliente: Cliente }>>
```
Implementación: valida `nombre` no vacío y, si viene RTN, `validarRtn(rtn)` de `lib/pos/fiscal.ts` (la MISMA validación del módulo de clientes — no escribas reglas nuevas); inserta con `.select().single()`; ante error `23505` sobre `clientes_rtn_unico`, relee el dueño del RTN y devuelve `El RTN ya pertenece a "<nombre>"`, igual que `app/admin/clientes/actions.ts`; cualquier otro error → mensaje genérico en español con `console.error` del crudo; `revalidatePath('/admin/pos')` al terminar.

- [ ] **Step 3: Selección automática** — `onCreado(cliente)` añade el cliente a la lista local del panel y lo selecciona (`onCliente(cliente.id)`), lo que dispara el recálculo de precios de revendedor que ya existe (sin tocar líneas con `precioManual`).

- [ ] **Step 4: Verificar** suite (390) + tsc + lint + build.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pos): alta de clientes desde la pantalla de venta"
```

---

### Task 11: Documento en modal + interruptor de configuración

**Files:**
- Create: `app/admin/pos/documento/[id]/DocumentoHoja.tsx`, `app/admin/pos/components/DocumentoModal.tsx`
- Modify: `app/admin/pos/documento/[id]/DocumentoView.tsx`, `app/admin/pos/documento/documento.module.css`, `app/admin/pos/PosClient.tsx`, `app/admin/configuracion/PosSection.tsx`, `app/admin/pos/page.tsx` (leer la clave y pasarla)

**Interfaces:**
- Consumes: la clave `pos_documento_modal` (Task 4) vía `config: ConfigMap`; `saveConfig` de `app/admin/configuracion/actions.ts`.
- Produces:

```ts
// DocumentoHoja: la hoja imprimible, sin toolbar. La usan la página y el modal.
interface DocumentoHojaProps {
  documento: Documento
  items: DocumentoItem[]
  pagos: DocumentoPagoConMetodo[]   // el shape que ya usa DocumentoView
  cai: CaiAutorizacion | null
  config: ConfigMap
  formato: '80mm' | 'carta'
}
// DocumentoModal
interface DocumentoModalProps {
  documentoId: string
  formatoDefault: '80mm' | 'carta'
  onNuevaVenta: () => void
  onCerrar: () => void
}
```

- [ ] **Step 1: Extraer `DocumentoHoja`** de `DocumentoView.tsx` — todo el JSX del papel (encabezado fiscal, cliente, detalle, desglose, letras, pagos, leyenda, marca de agua de anulado) SIN la toolbar. `DocumentoView` queda como toolbar + `<DocumentoHoja …/>`. Verificar que el papel renderiza idéntico (mismas clases del módulo).

- [ ] **Step 2: `DocumentoModal`** — al abrirse, carga el documento con una server action nueva en `app/admin/pos/actions.ts`:

```ts
export async function obtenerDocumento(documentoId: string): Promise<PosResult<{
  documento: Documento; items: DocumentoItem[]; pagos: DocumentoPagoConMetodo[]
  cai: CaiAutorizacion | null; caja: Caja; config: ConfigMap
}>>
```
(las mismas queries que hace `documento/[id]/page.tsx` — extráelas a esta action y que la página siga usando su propio fetch; no compartas estado de servidor). El modal muestra: selector 80mm / Carta (default `formatoDefault`), **Imprimir** (`window.print()`), **Nueva venta** (llama `onNuevaVenta`, que limpia el carrito y cierra), y **Cerrar**. Si la carga falla: mensaje en español + enlace `Abrir el documento` a `/admin/pos/documento/<id>`, porque el documento YA está emitido y no puede perderse de vista.

- [ ] **Step 3: Reglas de impresión del modal** — en `documento.module.css` (o el módulo del modal) añadir:

```css
@media print {
  /* Un contenedor fixed no fragmenta en paged media: se imprimiría solo la
     primera página. Se neutraliza el modal y se oculta el POS de atrás. */
  .modalDocumento { position: static; inset: auto; overflow: visible; background: none; }
  .modalDocumentoOverlay { position: static; background: none; }
}
```
Y en `app/admin/pos/pos.module.css`, dentro del `@media print` que ya existe para `.overlay`, ocultar el contenido del POS cuando el modal está abierto (marca el contenedor de venta con una clase `.ventaWrap` y añade `.ventaWrap { display: none }` en print). Verificar que imprimir desde la PÁGINA del documento sigue funcionando igual.

- [ ] **Step 4: Cablear en `PosClient`** — `handleEmitido(documentoId)`: si `config.pos_documento_modal !== 'false'` abre `DocumentoModal` (sin navegar); si está en `'false'`, mantiene el `router.push('/admin/pos/documento/<id>?volver=pos')` actual. En ambos casos el carrito se limpia solo al confirmar (el modal lo hace en "Nueva venta"; el push lo hace como hoy).

- [ ] **Step 5: Interruptor en configuración** — en `PosSection.tsx`, junto al límite de consumidor final, un checkbox **"Abrir el documento en modal tras cobrar"** que guarda `pos_documento_modal` (`'true'` / `'false'`) con el mismo `saveConfig` que ya usa la sección.

- [ ] **Step 6: Verificar** suite (390) + tsc + lint + build. Dejar anotado para el checkpoint del usuario: imprimir una factura de varios ítems desde el modal en 80mm y en carta.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(pos): documento en modal tras cobrar con interruptor en configuracion"
```

---

### Task 12: Botones Merlin — variantes nuevas y sustitución

**Files:**
- Modify: `app/merlin.css`, `app/admin/pos/pos.module.css`, `app/admin/pos/documento/documento.module.css`, los componentes del POS que usen las clases locales, `app/admin/pos/documento/[id]/DocumentoView.tsx`

- [ ] **Step 1: Añadir las variantes a `app/merlin.css`**, junto a `btnMerlinPrimary/Secondary/Tertiary` y con los mismos tokens:

```css
/* Botón compacto de ícono: −/+ de cantidad, quitar línea, estrella de anclado. */
.btnMerlinIcon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; padding: 0;
  font-size: 1rem; font-weight: 700; line-height: 1;
  color: var(--text-primary); background: var(--hover-input);
  border: 1px solid var(--border); border-radius: var(--radius-btn);
  cursor: pointer; transition: background .15s, border-color .15s;
}
.btnMerlinIcon:hover { background: var(--bg-hover); }
.btnMerlinIcon:disabled { opacity: .5; cursor: not-allowed; }

/* Pastilla con estado: chips de categoría, métodos de pago, tipo de
   documento, formato de impresión. El estado activo se marca con
   aria-pressed="true" para que el estilo siga al estado accesible. */
.btnMerlinChip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; font-size: .9rem; font-weight: 600;
  color: var(--text-primary); background: var(--bg-card);
  border: 1px solid var(--border); border-radius: var(--radius-btn);
  cursor: pointer; white-space: nowrap;
  transition: background .15s, color .15s, border-color .15s;
}
.btnMerlinChip:hover { background: var(--hover-input); }
.btnMerlinChip[aria-pressed="true"] {
  color: var(--text-on-accent); background: var(--cta); border-color: var(--cta);
}
.btnMerlinChip:disabled { opacity: .5; cursor: not-allowed; }
```
(Verifica los nombres reales de los tokens en `app/merlin.css` antes de escribir: usa los que existan para fondo de tarjeta, hover, borde, CTA y texto sobre acento. NO inventes tokens.)

- [ ] **Step 2: Sustituir las clases locales** por las variantes: `.qtyBtn` y `.btnQuitar` y la estrella → `btnMerlinIcon`; los chips de categoría (`.chip`/`.chipActivo` de Task 5), los chips de pago (Task 9), `.tipoDocBtn` y `.formatoBtn` → `btnMerlinChip` con `aria-pressed`; `.btnGhost` y `.btnCancel` → `btnMerlinTertiary`; `.btnItemLibre` → `btnMerlinSecondary`; `.backLink` → `btnMerlinTertiary`. Las clases locales que queden deben conservar SOLO posición/tamaño específico (p. ej. `position: absolute` de la estrella), nunca color, radio ni tipografía; borra las reglas que ahora son redundantes.

- [ ] **Step 3: Verificar** suite (390) + tsc + lint + build, y `grep -n "#[0-9a-fA-F]\{3,6\}" app/admin/pos/pos.module.css app/admin/pos/documento/documento.module.css` para confirmar que no quedan colores hardcodeados nuevos (el `#fff` preexistente de `.prodBadgeAgotado` puede quedarse).

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(diseno): variantes de boton icono y chip en Merlin, aplicadas al POS"
```

---

### Task 13: Verificación integral y entrega

- [ ] **Step 1:** `npx vitest run --exclude "**/.claude/**"` + `npx tsc --noEmit` + `npx eslint app components lib types middleware.ts` (0 errores) + `npm run build` — resultados reales.
- [ ] **Step 2:** Revisión final whole-branch (flujo del proyecto).
- [ ] **Step 3 (usuario):** aplicar `supabase/migrations/2026-08-07-pos-p2-1-favoritos.sql` en el SQL Editor + smoke corto que el controller entregará: la columna `favorito_pos` existe con default `false`, el índice parcial existe, y la clave `pos_documento_modal` está sembrada en `configuracion`.
- [ ] **Step 4 (usuario):** checkpoint visual — POS en la pantalla del mostrador: chips de categoría y anclados, agregar por SKU, editar una línea en el modal, pie fijo con 1 y con 15 líneas, chips de pago con dos métodos y con USD (tasa visible), alta de cliente, y **vista previa de impresión de una factura de varios ítems en 80mm y en carta desde el modal**.
- [ ] **Step 5:** Confirmar con el usuario la fusión a `main` (push = deploy); verificar READY en Vercel por SHA; borrar rama.
