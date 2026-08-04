# Diseño — D: Variantes padre/hijo (stock y precio por variante)

**Fecha:** 2026-08-04
**Sub-proyecto:** D (de la mejora de herramientas de inventario; A, B y C ya desplegados).
**Objetivo:** un producto padre puede tener variantes hijas (nombre libre: talla, color,
edición…), cada una con su propio stock y precio opcional. La tienda vende por variante,
el checkout valida y **descuenta stock atómicamente** al crear el pedido, y las
herramientas de inventario (formulario admin, round-trip Excel, import de plantilla
externa) gestionan variantes.

## Alcance

- **Incluye:** tabla `producto_variantes` + RLS, RPC `crear_pedido` v2 con validación y
  descuento de stock (variantes **y** productos planos), tipos y lógica pura en
  `lib/store/` con tests, UI de tienda (dropdown de variantes, "desde", agotado),
  carrito/checkout con variante, sección de variantes en el formulario admin, stock
  efectivo en listados/carrusel/KPI, pestaña "Variantes" en el round-trip Excel, e import
  externo que crea variantes reales en vez de colapsarlas.
- **No incluye:** combinaciones estructuradas talla×color (la variante es un nombre
  libre), imágenes por variante, migración automática de tallas existentes a variantes,
  y wishlist por variante (sigue siendo por producto).

## Decisiones tomadas

1. **Variante = hijo con nombre libre** (no talla×color estructurado). Ej.: "M",
   "L / Azul", "Edición retro".
2. **Selector en tienda: dropdown** con nombre y precio cuando difiere; agotadas
   deshabilitadas.
3. **Precio: hereda del padre, opcional propio.** `precio` null en la variante = usa el
   del padre. Listados muestran "Desde L. X" si difieren.
4. **Stock: validar y descontar al vender**, dentro de la RPC (atómico). Aplica también
   a productos **sin** variantes (control uniforme; `stock` null sigue = ilimitado).
5. **Variantes opcionales, sin migrar.** Los productos actuales siguen igual; las
   variantes se agregan producto por producto desde el admin o los imports.
6. **Regla de venta:** producto con ≥1 variante activa ⇒ la compra exige `variante_id` y
   el `stock`/`tallas` del padre dejan de contar para la venta (quedan como referencia).
7. **Alcance completo de herramientas:** admin manual + round-trip Excel + import de
   plantilla externa, en fases deployables.

## Modelo de datos (migración SQL — aplicar en el SQL Editor ANTES del push)

### Tabla `producto_variantes`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK `gen_random_uuid()` | |
| `producto_id` | uuid not null FK → `productos(id)` | `on delete cascade` |
| `nombre` | text not null | único por producto (`unique (producto_id, nombre)`) |
| `sku` | text null | índice único parcial global (`where sku is not null`) |
| `precio` | numeric null | null = hereda `productos.precio` |
| `stock` | int null, `check (stock >= 0)` | null = ilimitado |
| `activo` | boolean not null default true | |
| `orden` | int not null default 0 | orden en el dropdown |
| `created_at` / `updated_at` | timestamptz | trigger de `updated_at` como `productos` |

**RLS** espejo de `productos`: lectura pública de variantes activas cuyo padre está
activo; escritura solo para usuarios autenticados (admin).

### `pedido_items`

Se agregan columnas nullables `variante_id uuid` (FK `on delete set null`) y
`variante_nombre text`. `talla` sigue usándose para productos planos.

### RPC `crear_pedido` v2

Misma transacción atómica de hoy (pedido + items), más:

- Cada item puede traer `variante_id`.
- **Con variante:** valida que pertenezca al producto, esté activa y su padre activo;
  si `stock` no es null, descuenta con
  `update producto_variantes set stock = stock - qty where id = ? and stock >= qty`;
  si no afecta filas ⇒ error y rollback total.
- **Sin variante:** si el producto tiene variantes activas ⇒ error ("elige variante");
  si no las tiene y `productos.stock` no es null, descuenta igual sobre `productos`.
- Errores distinguibles (SQLSTATE/mensaje) para: stock insuficiente (con disponible
  actual), variante inválida/inactiva, producto inactivo. El checkout los traduce a
  mensajes en español.

## Tipos y lógica pura (`lib/store/`)

- `ProductoVariante` en `types/index.ts` (fila de BD). En `types/store.ts`:
  `StoreVariante { id, nombre, precio, precioEfectivo, stock, agotada }` y
  `StoreProducto.variantes?: StoreVariante[]`.
- `CartItem` gana `varianteId?: string` y `variante?: string` (nombre para mostrar).
  Con variante, `size` va vacío. **Clave de línea:** `id + (varianteId ?? size) + custom`.
  `normalizeStoredCart` acepta carritos viejos (sin campos nuevos = producto plano).
- Funciones puras nuevas, con tests en `lib/store/tests/`:
  - `precioEfectivo(padre, variante)` → `variante.precio ?? padre.precio`.
  - Clave/igualdad de línea de carrito (actualiza `addToCart` en `lib/store/cart.ts`).
  - `validarCompra(producto, variantes, item)` → razón de rechazo o OK ("con variantes
    exige variante; la variante debe existir, estar activa y pertenecer al producto").
    El checkout la usa; los tests la cubren.
  - Adaptador `toStoreProducto` incluye variantes; helpers `stockEfectivo(producto)`
    (suma de variantes o stock plano) y `agotado(producto)`.

## Tienda pública

- **Página de producto:** con variantes activas, el dropdown reemplaza la botonera de
  tallas: `nombre — L. precio` (precio solo si difiere del padre), agotadas
  deshabilitadas con "(Agotada)". El precio grande se actualiza al elegir. Sin
  variantes, la botonera de tallas actual queda intacta (incluido el fallback de
  `getTallas`).
- **ProductCard:** "Desde L. X" si los precios de variantes difieren; badge "AGOTADO"
  cuando `stockEfectivo === 0` (aplica también a planos con stock 0, por la regla
  uniforme). El badge "ÚLTIMAS N UNIDADES" usa `stockEfectivo`.
- **Quick-add** (StoreClient y WishlistDrawer): producto con variantes ⇒ el botón navega
  a la página del producto (no se puede adivinar la variante). Planos ⇒ quick-add como
  hoy.
- **CartDrawer:** la línea muestra `variante` donde hoy va la talla; el `+` no supera el
  stock conocido de la variante (validación final siempre en servidor).

## Checkout (frontera de confianza)

- `cartItemSchema` acepta `varianteId` (uuid) opcional.
- El server action relee `productos` **y** `producto_variantes` de la BD, valida con
  `validarCompra`, arma el carrito confiable con `precioEfectivo` del servidor (nunca el
  precio del cliente) y agrega `variante_id`/`variante_nombre` a los items de la RPC
  (`cartItemsToPedidoItems`).
- Si la RPC falla por stock, el modal indica producto/variante y cantidad disponible.
- **Pedidos (admin):** las líneas muestran `variante_nombre` si existe, si no `talla`.

## Admin

- **Formulario (`ProductoFields`, modo completo):** sección "Variantes" — tabla editable
  `nombre | sku | precio (vacío = hereda) | stock (vacío = ilimitado) | activo`, con
  agregar/quitar/reordenar. Se guarda en el mismo server action del producto
  (upsert/delete de hijas por `producto_id`). Con variantes presentes, `stock` y
  `tallas` del padre se atenúan con nota "este producto vende por variantes".
- **Listado y carrusel:** columna de stock = `stockEfectivo` con indicador "N var." si
  aplica; filtros "stock bajo"/"sin stock" (`inventoryFilters.ts`) y el KPI del
  dashboard usan el stock efectivo.

## Round-trip Excel (herramienta B)

- El export agrega la pestaña **"Variantes"**: `producto_id` (bloqueada), `producto`
  (nombre, referencia), `variante_id` (bloqueada, llave), `variante` (nombre), `sku`,
  `precio`, `stock`, `activo` — una fila por variante existente.
- **Crear variantes:** filas nuevas con `producto_id` + `variante` y sin `variante_id`.
- En la pestaña "Actualizar", los productos con variantes exportan `stock`/`tallas` con
  nota "vende por variantes" y el import **ignora** esas celdas (la verdad vive en la
  pestaña Variantes).
- Misma filosofía: vacío = no cambia; validación **atómica** de las tres pestañas;
  errores con fila y motivo. Parser puro en `inventoryRoundtrip.ts` con tests.

## Import de plantilla externa (herramienta C)

- `agruparPorSku` deja de colapsar: **cada fila del grupo se vuelve una variante** con
  nombre derivado de talla/color ("M / Azul"; solo "M" si no hay color), y su
  stock/precio propios. El mapeo gana el campo opcional **"SKU de variante"**.
- Casar contra BD: el SKU del grupo identifica al **padre** (como hoy); las variantes
  casan por SKU de variante si viene, o por nombre. Existe ⇒ actualiza; no ⇒ crea.
- Un SKU con una sola fila y sin talla/color ⇒ producto **plano** (sin hijas), como hoy.
- Preview agrupa variantes bajo cada producto; commit atómico padre + variantes.

## Manejo de errores

- RPC: errores distinguibles (stock insuficiente con disponible, variante inválida,
  producto inactivo) → mensajes en español en el checkout.
- Imports: reporte por fila `{ fila|sku, motivo }`, todo-o-nada como en B/C.
- Carritos viejos en `localStorage`: `normalizeStoredCart` los trata como planos.

## Testing

- Toda regla nueva es función pura en `lib/store/` con tests Vitest: precio efectivo,
  clave de línea, `validarCompra`, `stockEfectivo`, parsers de B y C con variantes.
- Migración y RPC se prueban en Supabase (SQL Editor) **antes** del push/merge.
- Por fase: `npm test` + `npx tsc --noEmit` + `npm run build`.

## Fases de entrega (cada una deployable; las variantes son opt-in)

1. **BD + checkout:** migración (tabla, RLS, `pedido_items`, RPC v2) + tipos +
   `validarCompra`/`precioEfectivo` + checkout con descuento uniforme de stock.
   Nota: desde esta fase, un producto plano con `stock = 0` ya no se puede comprar
   (el checkout lo rechaza con mensaje claro); el badge "AGOTADO" en tienda llega
   en la fase 3.
2. **Admin:** sección de variantes en el formulario + stock efectivo en
   listados/carrusel/KPI + pedidos con `variante_nombre`.
3. **Tienda:** dropdown de variantes, "Desde", badges por stock efectivo, quick-add,
   carrito con variante.
4. **Excel round-trip:** pestaña "Variantes" (export + import atómico).
5. **Import externo:** variantes reales en `agruparPorSku` + mapeo "SKU de variante" +
   preview agrupado.
