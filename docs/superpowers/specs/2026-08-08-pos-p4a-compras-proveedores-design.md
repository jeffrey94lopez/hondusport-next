# POS P4a — Compras y Proveedores (+ reorden) — Diseño

**Fecha:** 2026-08-08
**Serie:** POS Honduras, sub-proyecto **P4a** (primer pedazo de P4). P1 (config/costeo/kardex), P2 (mostrador/caja/emisión fiscal), P2.1 (UX del mostrador) y P3 (cotizaciones CRM) están desplegados.
**Objetivo:** Registrar compras a proveedores (orden formal y/o compra directa al recibir), alimentando el kardex y el costeo ya existentes, con soporte de moneda L./USD, gestión de proveedores y sugerencias de reorden por stock mínimo.

## Descomposición de P4

P4 agrupa varios subsistemas independientes; se descompone en sub-proyectos, cada uno con su ciclo spec→plan→implementación:

- **P4a — Compras y Proveedores (+ reorden)** ← ESTE spec. El cimiento: extiende el kardex/costeo, entrega valor solo.
- **P4b — CxP (Cuentas por Pagar):** deudas con proveedores, pagos, antigüedad. Se apoya en P4a (la compra ya guarda condición de pago + total + vencimiento).
- **P4c — CxC (Cuentas por Cobrar):** crédito a revendedores desde el POS; se apoya en la emisión de P2, independiente de compras.
- **P4d — Inventario físico:** sesiones de conteo + ajustes al kardex (tipo `ajuste`, ya existe). Standalone.

## Principio rector

Una compra es un documento con **estados** (orden pendiente → recepción parcial/total). La **recepción** es lo único que toca el kardex y el costeo. Una "compra directa" es el atajo de crear + recibir todo de una. El kardex `movimientos_inventario` (que ya tiene el tipo `compra`) es a la vez el registro de recepciones. Se reutiliza la función de costeo existente `aplicar_costeo` (promedio/último configurable); **las compras SÍ cambian el costo** (a diferencia de las ventas). Nada escribe stock/costo directo fuera de las RPC — se respeta la convención del kardex append-only.

## Decisiones fijadas (de la sesión de brainstorming)

1. **Ambos flujos:** orden de compra formal (pendiente, sin tocar stock) Y compra directa (crear + recibir de una). Un solo modelo `compras` con estados; la directa salta a recibida.
2. **Moneda L. o USD:** cada compra es en L. o USD; si es USD se captura costo en USD + tasa, y el sistema convierte a Lempiras para el kardex/costeo (que siempre viven en L.).
3. **Costo:** el `costo_unitario` que ingresa el usuario es el costo que va al kardex (él decide si incluye flete/impuesto). Distribución automática de fletes/aduana (landed cost) **fuera de P4a**.
4. **Pago:** la compra guarda la condición (contado/crédito), días de crédito, `fecha_vencimiento` y total, para que **P4b (CxP)** se apoye ahí. El libro de pagos a proveedores en sí es P4b. P4a **no toca caja**.
5. **Contacto unificado cliente/proveedor:** no hay entidad `proveedores` separada. Se extiende `clientes` con flags de rol (`es_cliente`/`es_proveedor`, ambos seleccionables); un contacto puede ser cliente, proveedor o ambos. Un solo panel (en `/admin/clientes`, "Clientes y proveedores") con filtro Todos/Clientes/Proveedores; el formulario tiene los checkboxes de rol. Los proveedores son `clientes` con `es_proveedor = true`.

## Modelo de datos

Migración P4a: `supabase/migrations/2026-08-08-pos-p4a-compras.sql`.

### Extensión de `clientes` (contacto unificado cliente/proveedor)

**No hay tabla `proveedores`.** Un contacto es una sola fila en `clientes` que puede ser cliente, proveedor o ambos. Se extiende la tabla existente `clientes` con flags de rol y los campos propios de proveedor (los demás — `nombre`, `rtn`, `telefono`, `correo`, `direccion`, `notas`, `activo` — ya existen y se comparten). Un proveedor es cualquier `clientes` con `es_proveedor = true`.

| Columna nueva | Tipo | Notas |
|---|---|---|
| `es_cliente` | boolean not null default true | Rol cliente (las filas existentes quedan true) |
| `es_proveedor` | boolean not null default false | Rol proveedor (las existentes quedan false) |
| `contacto` | text null | Nombre de la persona de contacto (usado sobre todo como proveedor) |
| `dias_credito` | int not null default 0 | Default de conveniencia al crear una compra |

Regla: al menos un rol activo (`es_cliente or es_proveedor`) — validado en la Server Action; se agrega un `check (es_cliente or es_proveedor)` en la migración. Los campos fiscales de cliente (`tipo_cliente`, `exonerado`, `constancia_exonerado`, `registro_sag`, `identidad`) siguen igual y aplican al rol cliente.

### Tabla `compras` (encabezado)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `numero` | text not null unique | Formato `COMP-00000001`, secuencia `compra_numero_seq` |
| `proveedor_id` | uuid not null fk → clientes | `on delete restrict`; debe ser un contacto con `es_proveedor = true` |
| `estado` | text not null | `check in ('borrador','ordenada','parcial','recibida','anulada')` |
| `moneda` | text not null default 'L' | `check in ('L','USD')` |
| `tasa_cambio` | numeric(12,4) null | Requerida (>0) si `moneda='USD'`; null si `L` |
| `factura_proveedor` | text null | Nro de factura del proveedor |
| `condicion_pago` | text not null default 'contado' | `check in ('contado','credito')` |
| `dias_credito` | int not null default 0 | |
| `fecha` | date not null | Fecha de la compra |
| `fecha_vencimiento` | date null | `fecha + dias_credito` si crédito (para P4b) |
| `notas` | text null | |
| `total` | numeric(12,2) not null default 0 | Cacheado, en **Lempiras**; recalculado en el servidor |
| `anulado_motivo` | text null | |
| `created_at` / `updated_at` | timestamptz default now() | |

### Tabla `compra_items` (líneas)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `compra_id` | uuid not null fk → compras | `on delete cascade` |
| `producto_id` | uuid not null fk → productos | `on delete restrict` (una compra siempre es de un producto del catálogo) |
| `variante_id` | uuid null fk → producto_variantes | El stock vive por variante |
| `descripcion` | text not null | Snapshot para la orden imprimible |
| `cantidad_ordenada` | numeric(12,2) not null check (> 0) | |
| `cantidad_recibida` | numeric(12,2) not null default 0 check (>= 0) | Acumulada |
| `costo_unitario` | numeric(12,4) not null check (>= 0) | En la moneda de la compra |
| `orden` | int not null default 0 | |

### Secuencia, config, RLS

- `create sequence if not exists compra_numero_seq;` + función `nextval_compra()` (security definer, revoke public/anon, grant authenticated) — mismo patrón que `nextval_cotizacion` de P3.
- No hay claves de config nuevas: la tasa USD por defecto se lee de la clave existente `tasa_cambio_usd` (P2), editable por compra.
- RLS habilitado en las 2 tablas nuevas (`compras`, `compra_items`) con políticas `for all to authenticated using (true) with check (true)` (patrón admin de P1-P3); `clientes` ya tiene su RLS. Triggers `updated_at` con la función existente `update_updated_at` en `compras` (`clientes` ya lo tiene).

## RPC y costeo

En la migración P4a (SQL). Se reutiliza `aplicar_costeo(stock, costo_actual, cantidad, costo_entrada)` (ya existe, promedio/último).

- **`nextval_compra()`** — correlativo.
- **`recibir_compra(p jsonb)`** — atómica, `security invoker`, `set search_path = public`. Entrada: `{ compra_id, recepciones: [{ compra_item_id, cantidad }], usuario }`. Lógica:
  1. Bloquea la compra (`for update`); si `estado in ('recibida','anulada')` → error.
  2. Lee `moneda`/`tasa_cambio` de la compra.
  3. Por cada recepción:
     - Bloquea la línea; valida `cantidad > 0` y `cantidad <= cantidad_ordenada - cantidad_recibida` (sino error `Recepción excede lo pendiente`).
     - `costo_L := costo_unitario * (case when moneda='USD' then tasa_cambio else 1 end)`.
     - Bloquea la fila del producto/variante (`for update`), calcula `nuevo_costo := aplicar_costeo(stock, costo, cantidad::int, costo_L)`, actualiza `stock = coalesce(stock,0) + cantidad`, `costo = nuevo_costo`.
     - Inserta `movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario, notas)` con `tipo = 'compra'`, `costo_unitario = costo_L`, `costo_resultante = nuevo_costo`, `referencia = <numero de compra>`.
     - `update compra_items set cantidad_recibida = cantidad_recibida + cantidad`.
  4. Recalcula el estado: si todas las líneas tienen `cantidad_recibida >= cantidad_ordenada` → `recibida`; si alguna tiene `cantidad_recibida > 0` → `parcial`; sino queda igual.
  5. Retorna void (o el nuevo estado). Todo en la transacción de la función — falla completa si algo revienta.
- **`anular_compra(p_compra_id, p_motivo)`** — `security invoker`. Bloquea la compra. Si `estado in ('parcial','recibida')`: por cada línea con `cantidad_recibida > 0`, bloquea la fila del producto/variante y postea un movimiento compensatorio `tipo = 'devolucion'`, `cantidad = -cantidad_recibida`, `costo_unitario = null` (sin costo → **no** recalcula costeo), `referencia = <numero> ' (anulación)'`, y `update ... set stock = coalesce(stock,0) - cantidad_recibida`. Marca `estado='anulada'`, `anulado_motivo`. Si estaba en `borrador`/`ordenada` (sin recepciones): solo marca anulada. **El costeo no se recalcula hacia atrás** — limitación documentada, coherente con el kardex append-only del resto del proyecto.

Reglas de costeo: las compras cambian el costo (por eso van por `aplicar_costeo`); las ventas nunca. El stock nunca se escribe directo fuera de estas RPC.

## Server Actions (`app/admin/compras/actions.ts` y las acciones de `app/admin/clientes/actions.ts`)

Tipo de resultado: `type ComprasResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }` (espejo de los de POS/cotizaciones).

- **`guardarCompra(input: GuardarCompraInput)`** — upsert de borrador/orden (header + items). **Solo permitido si la compra está en `borrador`/`ordenada`** (una vez que hay recepción, las líneas se congelan). Recalcula `total` **en el servidor** en Lempiras: `Σ cantidad_ordenada × costo_unitario × (tasa si USD, si no 1)`, con `round2`. Calcula `fecha_vencimiento` si `condicion_pago='credito'` (`fecha + dias_credito`). Asigna `numero` de la secuencia al crear. Estado inicial `ordenada` (o `borrador` si se guarda sin líneas). Upsert secuencial de items (borrar previos + insertar), como en cotizaciones.
- **`recibirCompra(compraId: string, recepciones: { compraItemId: string; cantidad: number }[])`** — llama la RPC `recibir_compra`; traduce errores; `revalidatePath('/admin/compras')`.
- **`anularCompra(compraId: string, motivo: string)`** — llama `anular_compra`.
- **`obtenerCompra(id)`** — encabezado + items + proveedor, para el editor y la orden imprimible.
- **`crearOrdenDesdeReorden(lineas, proveedorId)`** — crea una compra en estado `ordenada` con esas líneas (reusa `guardarCompra`).
- **Contactos (clientes/proveedores):** se extienden las acciones existentes de `app/admin/clientes/actions.ts` para manejar los flags de rol (`es_cliente`/`es_proveedor`, al menos uno) y los campos `contacto`/`dias_credito`. `eliminarCliente` gana un guard: no borrar un contacto que tenga compras como proveedor (además del clásico de pedidos/documentos como cliente) — FK restrict + mensaje. No se crean acciones `proveedores` separadas.
- **`obtenerReorden()`** — devuelve productos/variantes con `stock ≤ stock_minimo` (ambos campos existen en productos/variantes desde P1), con `cantidad_sugerida` (ver lógica pura). Solo canal/estado relevantes; ignora productos sin `stock_minimo`.

Frontera de confianza: el `total` y la conversión USD→L se recalculan en el servidor; nunca se confía en los importes del cliente.

## UI, rutas y componentes

- **`/admin/clientes` (panel unificado "Clientes y proveedores")** — se modifica el `ClientesClient` existente: un **filtro** Todos / Clientes / Proveedores (por los flags de rol), una columna/etiqueta de rol, y el formulario de crear/editar con **checkboxes "Es cliente" / "Es proveedor"** (ambos seleccionables, al menos uno) más los campos de proveedor (`contacto`, `dias_credito`) visibles cuando `es_proveedor`. No hay ruta `/admin/proveedores` nueva.
- **`/admin/compras`** — `ComprasClient`: listado con estado (badge por color), proveedor, total (L.), fecha; filtro por estado/proveedor; botón *Nueva compra*. Link en el sidebar.
- **`/admin/compras/[id]`** — `CompraEditor` (client): proveedor (select de contactos con `es_proveedor = true`, con alta rápida que crea un contacto marcado como proveedor), toggle moneda L./USD + tasa (default `tasa_cambio_usd`), factura del proveedor, condición (contado/crédito → días + `fecha_vencimiento`), líneas con buscador de productos/variantes (reusa la lógica pura del catálogo: `variantesActivasDe`, etc.), cantidad ordenada + costo unitario, y **total en vivo en Lempiras**. Acciones: *Guardar* (si editable), *Recibir* (abre `RecepcionModal`), *Anular* (con motivo), *Imprimir orden*.
- **`RecepcionModal`** — cada línea con lo pendiente (`cantidad_ordenada − cantidad_recibida`), input de cantidad a recibir (default = pendiente), confirmar → `recibirCompra`. Soporta recepción parcial.
- **`/admin/compras/reorden`** — `ReordenPanel`: tabla de productos/variantes bajo mínimo con cantidad sugerida, selección múltiple, elegir proveedor, *crear orden de compra* desde la selección → `crearOrdenDesdeReorden`.
- **`/admin/compras/[id]/orden`** — `HojaOrdenCompra`: vista imprimible simple (datos de empresa y proveedor, líneas con cantidad y costo, total), un solo estilo, patrón HTML + CSS de impresión como `DocumentoHoja` (barra con botón *Imprimir* usando `.btnToolbar`; `@media print` oculta la barra). Números de dinero con `formatPrice`.

Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado` (consistencia con POS/cotizaciones). CSS Modules con tokens Merlin; botones `btnMerlin*` compuestos con clase de módulo.

## Lógica pura y pruebas

Nuevo módulo `lib/compras/` con tests en `lib/compras/tests/`:
- `numeroCompra(seq: number): string` → `COMP-00000001`.
- `costoEnLempiras(costo: number, moneda: 'L'|'USD', tasa: number | null): number` → `round2` del costo en L.
- `totalCompra(items: { cantidad_ordenada: number; costo_unitario: number }[], moneda, tasa): number` → total en Lempiras.
- `estadoCompra(items: { cantidad_ordenada: number; cantidad_recibida: number }[]): 'borrador'|'ordenada'|'parcial'|'recibida'` (deriva el estado de las cantidades; sin líneas = borrador).
- `cantidadSugeridaReorden(stock: number, stockMinimo: number): number` → cantidad para volver al mínimo (o a un múltiplo; MVP = `max(0, stockMinimo - stock)`).

La matemática de costeo vive en SQL (`aplicar_costeo`) y ya está probada indirectamente por P1; no se reimplementa en JS.

## Manejo de errores

- **Guardar:** solo en `borrador`/`ordenada`; total recalculado en servidor; validación de proveedor y líneas (cantidad > 0, costo ≥ 0); USD exige tasa > 0.
- **Recibir:** la RPC valida que no se reciba más de lo pendiente; atómica; errores claros surfaceados al cajero/comprador.
- **Anular:** revierte stock con movimiento compensatorio; costeo no retroactivo (documentado); una compra ya anulada no se re-anula.
- **Contactos:** al menos un rol (`es_cliente or es_proveedor`); RTN único si presente (índice ya existente en `clientes`); no borrar un contacto con compras como proveedor (FK restrict + mensaje). Un proveedor referenciado por una compra debe existir con `es_proveedor = true`.
- **Reorden:** respeta variantes (stock por variante); ignora productos sin `stock_minimo`.

## Entrega

- Una migración P4a (extensión de `clientes` con `es_cliente`/`es_proveedor`/`contacto`/`dias_credito` vía `add column if not exists` + tablas `compras`/`compra_items` + secuencia + `nextval_compra` + `recibir_compra` + `anular_compra` + RLS + trigger `updated_at`), **idempotente**, aplicada por el usuario en el SQL Editor **antes** del push. Smoke SQL corto (`supabase/smoke-pos-p4a.sql`) que verifica estructura, secuencia y funciones, sin crear/borrar datos.
- `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes antes del push; verificación visual en el navegador tras aplicar la migración (proveedores, compra directa que actualiza stock/costo, orden → recepción parcial → recibida, anular, reorden → orden, orden imprimible).
- Commits en español, formato convencional. Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.

## Fuera de alcance (P4a)

- Libro de pagos a proveedores / **CxP (P4b)**: P4a solo guarda condición + total + vencimiento.
- **CxC (P4c)** y **Inventario físico (P4d)**.
- Distribución de fletes/aduana en el costo (landed cost): el `costo_unitario` es el costo final que ingresa el usuario.
- Tratamiento contable del ISV de compras / crédito fiscal.
- Multi-bodega; proveedor preferido por producto; historial de precios de compra por proveedor.
- Recepciones como entidad propia con fecha/nota agrupada: el kardex (con `referencia` + `created_at`) es el registro de recepciones en P4a.
- Edición de líneas en estado `parcial` (se congelan tras la primera recepción).
