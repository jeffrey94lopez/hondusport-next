# POS P4d — Inventario físico (conteo + kardex completo) — Diseño

**Fecha:** 2026-08-09
**Serie:** POS Honduras, sub-proyecto P4d.
**Estado:** aprobado para plan.

## Objetivo

Dar al negocio un proceso de **inventario físico** auditable: contar las
existencias reales de muchos ítems (a ciegas, con lector, por estante o
categoría) y aplicar los ajustes al kardex de golpe. Y, como requisito
transversal del usuario, **cerrar todas las escrituras directas de stock** que
hoy existen, para que **toda variación de unidades quede SIEMPRE registrada en
`movimientos_inventario`** — venga del ítem manual, de la plantilla (import),
del ajuste puntual o del conteo/carrusel.

## Principio rector

`movimientos_inventario` es el **libro mayor completo** del inventario: el
stock nunca se escribe directo; toda variación de unidades (alta inicial,
delta, cambio de modalidad, conteo) pasa por una RPC que inserta un movimiento.
Esto **termina** el principio de la serie ("stock nunca se escribe directo"),
eliminando las excepciones documentadas hasta P4c.

## Alcance

Dos frentes bajo el mismo principio:

- **A. Módulo de conteo físico** (nuevo): documento de toma con líneas,
  snapshot, dos modos de captura (tabla / carrusel), conteo a ciegas,
  aplicación atómica de ajustes, e imprimibles.
- **B. Cierre de escrituras directas de stock** (refactor transversal): el alta
  inicial y el cambio de modalidad ilimitado↔limitado pasan a generar
  movimiento en el ítem manual, en el alta de variante, en la plantilla/import
  y en el editor.

---

## A. Módulo de conteo físico

### A.1 Modelo de datos

**`conteos_fisicos`** (cabecera de la toma)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `numero` | text unique | `CONTEO-00000001` vía `nextval_conteo` |
| `estado` | text check | `en_conteo` \| `aplicada` \| `anulada` |
| `alcance_tipo` | text check | `todo` \| `categoria` \| `subcategoria` \| `seleccion` |
| `alcance_ref` | uuid null | categoría/subcategoría cuando aplica |
| `descripcion` | text null | rótulo libre ("Conteo camisetas set. 2026") |
| `notas` | text null | |
| `usuario` | text null | |
| `created_at` | timestamptz | |
| `aplicada_at` | timestamptz null | |

**`conteo_lineas`** (una por ítem contable)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `conteo_id` | uuid fk → conteos_fisicos on delete cascade | |
| `producto_id` | uuid fk → productos on delete restrict | |
| `variante_id` | uuid fk → producto_variantes on delete restrict, null | |
| `sku` | text null | snapshot al materializar |
| `nombre` | text | snapshot (producto + variante) |
| `stock_snapshot` | integer | stock del sistema al agregar la línea |
| `contado` | integer null | null = aún sin contar |
| `stock_al_aplicar` | integer null | stock leído al aplicar (FOR UPDATE) |
| `ajuste` | integer null | movimiento generado (contado − snapshot) |
| `aplicada` | boolean default false | |
| `aviso_movimiento` | boolean default false | true si stock_al_aplicar ≠ snapshot |

Índices: `conteo_lineas(conteo_id)`, `conteo_lineas(producto_id)`. Un ítem
`stock = null` (ilimitado) **no se materializa como línea** (no se ajusta lo
que no se rastrea). Unicidad lógica por `(conteo_id, producto_id, variante_id)`
para no duplicar líneas al escanear.

Secuencia `conteo_numero_seq` + `nextval_conteo() → bigint` (security definer,
grant a authenticated), mismo patrón que `nextval_cobro`/`nextval_compra`.

Config: `inventario_conteo_ciego` = `'true'` (por defecto a ciegas).

### A.2 Estados y guardas

- `en_conteo`: editable — agregar/quitar líneas, teclear `contado`. Una toma en
  borrador se puede **anular/eliminar** sin efecto contable.
- `aplicada`: **inmutable** (como los documentos fiscales). No se reabre; para
  recontar se crea una toma nueva.
- `anulada`: solo desde `en_conteo` (nunca desde `aplicada`).

### A.3 Aplicación atómica — `aplicar_conteo(p_conteo_id uuid)`

RPC `security invoker`, atómica (todo o nada), grant a authenticated,
`revoke from public, anon`. Frontera de confianza: la Server Action solo pasa
el `conteo_id`; los `snapshot`/`contado` ya están en la BD, la RPC no confía en
montos del cliente.

1. Si la toma no está `en_conteo` → error.
2. Por cada línea con `contado` no nulo:
   a. Bloquea la fila del producto/variante (`for update`), lee `stock_actual`.
   b. Si el ítem quedó `stock = null` (modalidad) o fue borrado entre contar y
      aplicar → se salta con nota (no se ajusta lo no rastreado).
   c. **`ajuste = contado − stock_snapshot`** (diferencia contra el snapshot, no
      contra el actual). Si `ajuste = 0`, no genera movimiento; marca `aplicada`.
   d. Inserta un movimiento `tipo = 'conteo'`, `cantidad = ajuste`,
      `costo_unitario = null` (**los ajustes de conteo NO cambian el costo**: el
      sobrante entra al costo promedio vigente y el faltante es merma al costo
      actual), `costo_resultante = costo vigente`, `referencia = 'conteo:'||numero`.
   e. `stock = stock_actual + ajuste` (nunca absoluto: las ventas ocurridas en
      la ventana se conservan). Escribe `stock_al_aplicar`, `ajuste`, `aplicada`.
   f. Si `stock_actual ≠ stock_snapshot` → `aviso_movimiento = true`
      (informativo; hubo movimiento durante el conteo).
3. `estado = 'aplicada'`, `aplicada_at = now()`.

**Concurrencia:** el conteo refleja la realidad al momento de contar; el ajuste
corrige exactamente el descuadre de ese momento (contado − snapshot). Las ventas
posteriores son movimientos independientes que se preservan.
`stock_final = stock_actual + (contado − snapshot)`.

### A.4 UI y flujo

Ruta **`/admin/inventario`** (sección "Inventario físico" en el Sidebar).

- **Listado** (`page.tsx` → `InventarioClient`): tabla de tomas con número,
  fecha, alcance, estado, avance (contados/total) y diferencia neta si aplicada.
  Botón "Nueva toma".
- **Nueva toma**: elegir alcance (Todo / Categoría / Subcategoría / Selección
  ad-hoc) → crea cabecera y **materializa las líneas** con snapshot del stock
  actual (excluye `stock = null`).
- **Editor `/admin/inventario/[id]`** (`TomaEditor`) con **dos modos sobre la
  misma toma** (mismas `conteo_lineas`):
  - **Modo tabla** (`ModoTabla`): la lista del alcance con el campo `contado`
    por fila; badges de estado por línea (Contado / Pendiente / Ilimitado).
  - **Modo carrusel** (`ModoCarrusel`): un ítem por tarjeta, campo `contado`
    grande y centrado, barra de progreso `idx/total`, botones
    Anterior / Saltar / Guardar y siguiente (espeja `CarruselClient`).
  - Selector Tabla ⇄ Carrusel arriba; **barra de escaneo por SKU** compartida:
    salta/enfoca la fila o tarjeta del ítem; un SKU fuera del alcance ofrece
    agregarlo; un ítem `stock = null` se muestra "no rastreado" y no genera línea.
  - **A ciegas por defecto** (config `inventario_conteo_ciego`): el stock del
    sistema no se muestra mientras se cuenta. Quien pueda verlo desactiva el toggle.
  - Guardado por línea con Server Action (autosave al salir del campo /
    "Guardar y siguiente" en carrusel), con aviso de cambios sin guardar al
    navegar (mismo patrón del carrusel de productos).
- **Revisar y aplicar** (`RevisarAplicarModal`): revela por línea
  `snapshot · contado · diferencia` (sobrante/faltante) + valor al costo + aviso
  "hubo movimiento durante el conteo", con totales; confirma → `aplicar_conteo`.
  Tras aplicar, la toma queda inmutable.

### A.5 Imprimibles (hoja carta, tinta fija, `@media print`, `.btnToolbar`)

- **Hoja de conteo en blanco** (`HojaConteo`): SKU, nombre, variante y renglón
  vacío para anotar a mano — **sin** stock del sistema (contar a ciegas en papel).
- **Reporte de diferencias** (`ReporteDiferencias`): SKU, nombre, snapshot,
  contado, diferencia, valor al costo, con totales de sobrantes/faltantes y valor
  neto — para firmar/archivar.

### A.6 Lógica pura y tests

`lib/inventario/conteo.ts` (puro, con tests en `lib/inventario/tests/`):

- `numeroConteo(n: number): string` → `CONTEO-00000001`.
- `diferenciaLinea(snapshot: number, contado: number | null): number | null` →
  `contado − snapshot` (null si `contado` null).
- `clasificarLinea(snapshot, contado): 'pendiente' | 'cuadra' | 'sobrante' | 'faltante'`.
- `valorDiferencia(diferencia: number, costo: number | null): number`.
- `resumenConteo(lineas): { contadas, pendientes, sobrantes, faltantes, valorNeto }`.

---

## B. Cierre de escrituras directas de stock (kardex completo)

Hoy el stock se escribe directo **sin movimiento** en dos casos (excepciones
documentadas en `lib/store/costeo.ts` y CLAUDE.md). P4d los cierra: **toda
variación de unidades genera movimiento**, sin excepciones.

### B.1 Casos y tratamiento

| Caso | Hoy | P4d |
|---|---|---|
| Número → número distinto | ✅ `registrar_entrada` (`entrada`/`ajuste`) | Sin cambio |
| **Alta inicial** de producto/variante con stock N | Insert directo, sin movimiento | Asiento de apertura `+N`: `tipo = 'inicial'` (con costo si se dio) |
| **Modalidad** ilimitado→N (`null`→N) | Escritura directa, sin movimiento | Asiento de apertura `+N`: `tipo = 'inicial'` |
| **Modalidad** N→ilimitado (N→`null`) | Escritura directa, sin movimiento | Asiento de cierre `−N`: `tipo = 'ajuste'`, `referencia = 'modalidad'` |

Nuevos valores del check de `movimientos_inventario.tipo`: se agregan
`'inicial'` y `'conteo'` (el check se recrea idempotente incluyendo los
existentes: `entrada, ajuste, venta_web, reposicion_cancelacion, venta_pos,
devolucion, compra, inicial, conteo`).

### B.2 Puntos de cambio

- **`lib/store/costeo.ts`** (`calcularCambioStock` / `CambioStock`): la modalidad
  deja de ser "no kardexable". Se ajusta el tipo/derivación para que
  ilimitado→N y N→ilimitado produzcan un movimiento (apertura/cierre). Tests de
  `costeo.test.ts` actualizados (los casos de modalidad ahora esperan movimiento).
- **`aplicarCambioStock`** (`app/admin/productos/actions.ts`): la rama
  `modalidad` deja de escribir directo; enruta por RPC (apertura/cierre). La rama
  `delta` sigue igual.
- **Alta inicial**: `createProducto` y el alta de variante en
  `sync_producto_variantes` pasan a generar el asiento `'inicial'` por el stock
  inicial rastreado (N no nulo). Una alta con `stock = null` (ilimitado) no
  genera movimiento (no hay unidades).
- **Plantilla / import**: `lib/store/inventoryRoundtrip.ts`
  (`calcularMovimientoStock`) deja de devolver `null` en modalidad y en altas con
  stock; emite el movimiento correspondiente. `importar_productos_variantes`
  (RPC) inserta esos movimientos y deja de escribir stock absoluto sin asiento en
  esos casos. Tests de `inventoryRoundtrip.test.ts` actualizados (el caso
  "modalidad no genera movimiento" se invierte).

### B.3 Consecuencia intencional (costo)

Al generar un asiento de apertura en el alta, el ítem pasa a "tener movimientos"
de inmediato, por lo que el **costo deja de ser editable directo** y pasa a
gobernarse por entradas (lógica ya existente "costo editable mientras no tenga
movimientos"). Es el comportamiento correcto del libro mayor: una vez asentada la
apertura a un costo, cambiarlo va por una entrada, no por edición silenciosa. Se
documenta como cambio esperado.

---

## Archivos (mapa)

**Nuevos**
- `supabase/migrations/2026-08-09-pos-p4d-inventario-fisico.sql`
- `supabase/smoke-pos-p4d.sql`
- `lib/inventario/conteo.ts` + `lib/inventario/tests/conteo.test.ts`
- `app/admin/inventario/page.tsx`, `InventarioClient.tsx`, `actions.ts`
- `app/admin/inventario/[id]/page.tsx`, `TomaEditor.tsx`, `ModoTabla.tsx`,
  `ModoCarrusel.tsx`, `RevisarAplicarModal.tsx`, `HojaConteo.tsx`,
  `ReporteDiferencias.tsx`, `inventario.module.css`

**Modificados**
- `supabase` (dentro de la misma migración P4d): check de `tipo`, RPCs
  `aplicar_conteo`, ajustes a `registrar_entrada`/apertura si aplica,
  `importar_productos_variantes`, `sync_producto_variantes`.
- `lib/store/costeo.ts` (+ tests), `lib/store/inventoryRoundtrip.ts` (+ tests)
- `app/admin/productos/actions.ts` (`aplicarCambioStock`, `createProducto`, `syncVariantes`)
- `types/index.ts` (tipos `ConteoFisico`, `ConteoLinea`, `EstadoConteo`, etc.;
  `MovimientoTipo` gana `'inicial'`/`'conteo'` si existe ese tipo)
- `components/admin/Sidebar.tsx` (link "Inventario físico")
- `app/admin/configuracion/PosSection.tsx` (toggle `inventario_conteo_ciego`)

## Restricciones globales

- Idioma español; moneda en Lempiras con `formatPrice()`.
- Migración idempotente (`if not exists`, `create or replace`), aplicada por el
  usuario antes del push. Smoke con `to_regprocedure`. Estilo P4c.
- Kardex append-only; **stock nunca se escribe directo** (fin de las
  excepciones). Toda variación pasa por RPC con movimiento.
- `aplicar_conteo` valida contra el snapshot con `for update`; frontera de
  confianza (solo recibe `conteo_id`).
- CSS Modules con tokens Merlin; botones `btnMerlin*` compuestos con clase de
  módulo (bug recurrente si se usan solos). Dinero con `type="text"
  inputMode="decimal"`. Imprimibles = HTML + CSS de impresión (`.btnToolbar`,
  tinta fija, `@media print`).
- Cliente de Supabase de servidor en Server Components/Actions. Tipo
  `type InvResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.
- Verificación: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.
  Los tests de `lib/store` (costeo, inventoryRoundtrip) DEBEN correrse por el
  cambio de reglas. Visual diferido al checkpoint tras aplicar la migración.

## Verificación visual (tras aplicar la migración)

Nueva toma por categoría; contar en modo tabla y en carrusel; escaneo que salta
a la fila; conteo a ciegas (sin ver el sistema) y con toggle informado; revisar
y aplicar (saldos ajustados, kardex con `tipo = 'conteo'`); aviso "hubo
movimiento" si se vende durante el conteo; hoja de conteo y reporte de
diferencias imprimibles; alta de producto con stock inicial (movimiento
`'inicial'`); cambio de modalidad ilimitado↔número (asiento de apertura/cierre);
import de plantilla con cambios de stock/modalidad (todos con movimiento).

## Fuera de alcance / follow-ups

- Recuento cíclico programado (ABC) y app móvil dedicada — futuro.
- Revalorización de inventario (cambiar costo masivo) — no es un conteo.
- Reapertura de una toma aplicada — por diseño no existe (se crea otra).
- Conciliación histórica del kardex de ítems que ya nacieron sin asiento de
  apertura antes de P4d (datos previos): no se retro-genera; el kardex queda
  completo hacia adelante.
