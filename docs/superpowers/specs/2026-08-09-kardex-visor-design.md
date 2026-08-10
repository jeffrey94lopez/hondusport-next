# Visor de Kardex — Diseño

**Fecha:** 2026-08-09
**Estado:** aprobado para plan.

## Objetivo

Un visor de **solo lectura** de los movimientos de inventario
(`movimientos_inventario`, append-only): (1) una vista por ítem
(producto/variante) con todos sus movimientos, saldo corrido, costo y la
referencia resuelta a su documento origen; y (2) una pantalla global paginada
de todos los movimientos con filtros. No modifica nada.

## Principios

- **Solo lectura.** El visor nunca escribe en `movimientos_inventario` ni en el
  stock. La única escritura a BD del proyecto es un índice nuevo para la
  paginación global.
- **Referencia resuelta.** La `referencia` cruda (texto, FK polimórfica) se
  traduce a una etiqueta legible + enlace al documento origen cuando existe.
- **Resolución por lote** (no N+1): se recolectan los ids/números de la página
  y se hace un `select ... in (...)` por tabla destino.

## Contexto: la `referencia` en el kardex

Prefijos que produce el sistema hoy (verificados en las migraciones):

| Referencia | Origen | Tipos de movimiento típicos |
|---|---|---|
| `documento:<uuid>` | venta/anulación de mostrador | `venta_pos`, `devolucion` |
| `nota_credito:<uuid>` | devolución / nota de crédito (P5a) | `devolucion` |
| `pedido:<uuid>` | venta web / cancelación | `venta_web`, `reposicion_cancelacion` |
| `<número de compra>` (sin prefijo) | recepción de compra (P4a) | `compra`, `devolucion` (anular compra) |
| `conteo:<número>` | inventario físico (P4d) | `conteo` |
| `alta` | alta inicial de producto/variante (P4d) | `inicial` |
| `manual` | ajuste manual desde el editor | `entrada`, `ajuste` |
| `modalidad` | cambio de modalidad ilimitado↔número (P4d) | `ajuste` |
| otra (import u otras) | plantilla/import u orígenes varios | varios |

Tipos de `movimientos_inventario.tipo`: `entrada`, `ajuste`, `venta_web`,
`reposicion_cancelacion`, `venta_pos`, `devolucion`, `compra`, `inicial`,
`conteo`.

---

## 1. Resolución de referencias (lógica compartida)

Capa que convierte `referencia` → `{ etiqueta, href? }`:

- `documento:<uuid>` → resolver el uuid en `documentos` a tipo+correlativo/
  numero_comprobante → "Venta POS — Factura EST-PTO-01-…" o "Comprobante C-…";
  href `/admin/pos/documento/<uuid>`.
- `nota_credito:<uuid>` → `documentos` (la NC/devolución) → "Nota de crédito …" /
  "Devolución …"; href `/admin/pos/documento/<uuid>`.
- `pedido:<uuid>` → `pedidos.numero` → "Venta web — Pedido #<numero>"; href
  `/admin/pedidos` (detalle del pedido).
- número de compra → `compras` por número → "Compra <número>"; href
  `/admin/compras/<id>`.
- `conteo:<número>` → "Conteo físico <número>"; href `/admin/inventario`.
- `alta` / `manual` / `modalidad` → "Alta inicial" / "Ajuste manual" /
  "Cambio de modalidad"; sin enlace.
- otra → se muestra el texto crudo; sin enlace.

**Parte pura** (`lib/inventario/kardex.ts`, con tests): `parseReferencia(ref)` →
`{ clase, valor }`; `etiquetaTipoMovimiento(tipo)` → `{ nombre, direccion:
'entrada'|'salida'|'neutro' }`; `saldoCorrido(movimientosAsc)` → agrega la suma
acumulada de `cantidad`.

**Parte server** (en las Server Actions): dado un lote de movimientos, recolecta
los uuid/números por clase, hace un batch-fetch por tabla destino y produce la
etiqueta+href de cada uno.

---

## 2. Vista por ítem — `/admin/productos/[id]/movimientos`

Página dedicada, enlazada desde el listado de productos con un botón **"Kardex"**.

- Si el producto tiene variantes activas: **selector de variante** (o "producto
  plano" para su propio stock). Cambia el ítem cuyos movimientos se ven.
- Cabecera: nombre del producto/variante, **stock actual**, **costo actual**.
- Tabla (por defecto más reciente arriba; toggle para orden ascendente que lee
  el kardex): **fecha/hora**, **tipo** (etiqueta con color por dirección:
  entradas verde, salidas rojo, neutro gris), **cantidad con signo**, **saldo
  corrido** (suma acumulada del kardex — nota informativa: reconcilia con el
  stock desde P4d en adelante; ítems con stock previo al kardex pueden diferir),
  **costo unitario / costo resultante** (`formatPrice`), **referencia resuelta +
  enlace**, **usuario**, **notas**.
- **Imprimible** (`HojaKardex`): hoja carta, tinta fija, `@media print`,
  `.btnToolbar` — para auditoría.

---

## 3. Pantalla global — `/admin/movimientos`

Nueva entrada en el Sidebar ("Movimientos de inventario"). Tabla **paginada
server-side** con **filtros**:

- **Tipo** de movimiento (multi o single select).
- **Rango de fechas** (desde/hasta).
- **Producto** (búsqueda por nombre/SKU).
- **Usuario**.

Cada fila: **producto/variante** (enlace a `/admin/productos/[id]/movimientos`),
tipo, cantidad con signo, costo, **referencia resuelta+enlace**, usuario,
fecha. Orden `created_at desc`. Paginación con `count` total (ej. 50/página).
Sin saldo corrido (es multi-producto).

---

## 4. Acceso a datos, paginación e índice

- **Server Actions** (`app/admin/movimientos/actions.ts`):
  - `obtenerMovimientosItem(productoId, varianteId | null): Promise<KardexResult<{ movimientos: MovimientoResuelto[]; producto: {...}; variante: {...} | null }>>` — todos los movimientos del ítem (orden asc para el saldo corrido; la vista puede invertir), con saldo corrido y referencias resueltas por lote.
  - `obtenerMovimientosGlobal(filtros: FiltrosMovimientos, pagina: number): Promise<KardexResult<{ movimientos: MovimientoResuelto[]; total: number }>>` — paginado (`.range()`), filtros aplicados, `count: 'exact'` para el total, referencias resueltas por lote.
- **Índice**: `movimientos_created_idx on movimientos_inventario (created_at desc)`
  (el índice existente `movimientos_producto_idx (producto_id, created_at desc)`
  sirve la vista por ítem, no el orden global). Migración idempotente
  (`create index if not exists`), aplicada por el usuario antes del push. **Es la
  única escritura a BD.** + smoke que verifica el índice.
- **Resolución por lote**: PostgREST no embebe sobre una FK polimórfica por texto
  (`referencia`); se resuelve en la Server Action con un `in (...)` por tabla
  destino (`documentos`, `pedidos`, `compras`, `conteos_fisicos`) y se mapea.

---

## 5. Lógica pura, archivos y tests

- **`lib/inventario/kardex.ts`** (puro, con tests en `lib/inventario/tests/`):
  `parseReferencia`, `etiquetaTipoMovimiento`, `saldoCorrido`.
- **Archivos:**
  - `supabase/migrations/2026-08-09-kardex-indice.sql` (solo el índice) + `supabase/smoke-kardex.sql`.
  - `lib/inventario/kardex.ts` + `lib/inventario/tests/kardex.test.ts`.
  - `app/admin/movimientos/actions.ts` (las dos acciones + resolución por lote).
  - `app/admin/productos/[id]/movimientos/page.tsx` + `MovimientosItemView.tsx` + `HojaKardex.tsx` + su CSS.
  - `app/admin/movimientos/page.tsx` + `MovimientosGlobalClient.tsx` + su CSS.
  - Botón "Kardex" en `app/admin/productos/ProductosClient.tsx`; link en `components/admin/Sidebar.tsx`.
  - `types/index.ts`: `MovimientoInventario`, `MovimientoResuelto`, `FiltrosMovimientos`, `KardexResult<T>`.
- **Verificación:** `npm test` + `npx tsc --noEmit` + `npm run lint` +
  `npm run build`; visual tras aplicar el índice.

## Restricciones globales

- Idioma español; moneda en Lempiras con `formatPrice()`.
- **Solo lectura** — el visor no escribe en `movimientos_inventario` ni en el
  stock. Única escritura a BD: el índice.
- Migración idempotente (`create index if not exists`), aplicada antes del push.
  Smoke con `to_regclass` (o `pg_indexes`).
- Resolución de referencias por lote (no N+1). Cliente de Supabase de servidor.
- CSS Modules con tokens Merlin; botones `btnMerlin*` con clase de módulo.
  Imprimible = HTML + CSS impresión (`.btnToolbar`, tinta fija, `@media print`).
  Tipo `type KardexResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.

## Verificación visual (tras aplicar el índice)

Abrir la vista por ítem de un producto con historial (venta, compra, ajuste,
conteo, devolución): saldo corrido correcto, referencias resueltas con enlace al
documento; selector de variante; imprimible. Pantalla global: filtros por tipo/
fecha/producto/usuario, paginación, enlaces a la vista por ítem y a los
documentos origen.

## Fuera de alcance

Editar/borrar movimientos (append-only, solo lectura); exportar a Excel/CSV
(futuro); valorización de inventario / reportes contables (P6 dashboard);
reconciliación retroactiva del saldo para ítems con stock previo al kardex.
