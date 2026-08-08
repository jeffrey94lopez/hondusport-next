# POS P3 — Cotizaciones CRM — Diseño

**Fecha:** 2026-08-08
**Serie:** POS Honduras, sub-proyecto P3 (tras P1 config/costeo/kardex, P2 mostrador/caja/emisión fiscal y P2.1 UX del mostrador, todos desplegados).
**Objetivo:** Módulo de cotizaciones para Hondusport con tablero kanban de etapas configurables, ítems de catálogo y libres, exportación a PDF en 3 estilos, y conversión de cotización a venta reutilizando el POS fiscal ya construido.

## Principio rector

Una cotización es **un carrito con etapa y vigencia**: un documento **mutable y no fiscal** (a diferencia de los documentos del POS, que son inmutables y llevan CAI). Comparte toda la matemática con el POS (`lib/pos/desglose` y `lib/pos/emision.precioLineaPos`) y **no reserva stock** — el stock se valida y descuenta recién al facturar, por la RPC `emitir_documento` ya existente.

El módulo vive en `/admin/cotizaciones` y **no modifica los componentes del POS** (estable y desplegado): importa solo la lógica pura compartida y tiene su propia UI, más simple (sin caja ni pestañas). Si en P4/P5 aparece un tercer consumidor del "buscador de catálogo", ahí se evalúa extraer un componente común — no ahora, para no arriesgar el POS.

## Decisiones fijadas (de la sesión de brainstorming)

1. **Kanban CRM real:** las etapas del pipeline son configurables (crear/renombrar/reordenar/color). Cada etapa tiene un **tipo semántico** (`abierta` / `ganada` / `perdida`) que el sistema entiende para habilitar la conversión y las métricas.
2. **Conversión a venta = abrir el POS con el carrito precargado.** Reutiliza el flujo fiscal completo (CAI, arqueo, kardex, pagos). La cotización queda ligada al documento emitido y pasa a la etapa `ganada`.
3. **Vigencia:** cada cotización tiene `válida hasta` (default configurable, editable por cotización). Se imprime en el PDF y, pasada la fecha, la tarjeta muestra un badge *Vencida* — **sin** mover la tarjeta sola de columna (respeta el kanban manual).
4. **3 estilos de PDF:** Ejecutivo (estilo Akuo adaptado a Merlin), Minimalista y Catálogo con imágenes.

## Modelo de datos

Migración P3: `supabase/migrations/2026-08-08-pos-p3-cotizaciones.sql`.

### Tabla `cotizacion_etapas` (pipeline configurable)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `nombre` | text not null | Ej. "En negociación" |
| `tipo` | text not null | `check in ('abierta','ganada','perdida')` — semántica del sistema |
| `color` | text not null | Token/hex para la columna y la tarjeta |
| `orden` | int not null | Orden de las columnas en el tablero |
| `activo` | boolean not null default true | |
| `created_at` / `updated_at` | timestamptz default now() | |

**Seed inicial:** *Borrador* (abierta), *Enviada* (abierta), *En negociación* (abierta), *Aceptada* (ganada), *Rechazada* (perdida).

### Tabla `cotizaciones` (encabezado)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `numero` | text not null unique | Formato `COT-00000001`, de la secuencia `cotizacion_numero_seq`; **no fiscal** (sin CAI) |
| `etapa_id` | uuid not null fk → cotizacion_etapas | `on delete restrict` (ver guard de borrado) |
| `cliente_id` | uuid null fk → clientes | Nullable: cotización a prospecto sin registrar |
| `cliente_nombre` | text null | Snapshot para el PDF cuando `cliente_id` es null o para congelar el nombre |
| `cliente_rtn` | text null | Snapshot de RTN para el PDF |
| `vendedor_id` | uuid null fk → vendedores | |
| `descuento_global` | numeric(12,2) not null default 0 | |
| `validez_dias` | int not null | Copiado del default `cotizacion_validez_dias` al crear, editable |
| `valido_hasta` | date not null | `created_at::date + validez_dias` (recalculado si cambia validez_dias) |
| `condiciones` | text null | Términos/forma de pago para el PDF (default de config) |
| `notas` | text null | Notas internas |
| `total` | numeric(12,2) not null default 0 | Total cacheado para la tarjeta del kanban; recalculado en el servidor en cada guardado |
| `documento_id` | uuid null fk → documentos | Se llena al facturar; `on delete set null` |
| `created_at` / `updated_at` | timestamptz default now() | |

### Tabla `cotizacion_items` (líneas)

Misma forma que `LineaPos` (types/index.ts):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `cotizacion_id` | uuid not null fk → cotizaciones | `on delete cascade` |
| `producto_id` | uuid null fk → productos | null = ítem libre |
| `variante_id` | uuid null fk → producto_variantes | |
| `descripcion` | text not null | |
| `cantidad` | numeric(12,2) not null | |
| `precio_unitario` | numeric(12,2) not null | |
| `descuento` | numeric(12,2) not null default 0 | Descuento por línea (monto) |
| `isv` | text not null | `check in ('15','18','exento')` |
| `orden` | int not null | Orden de la línea en el documento |

### Secuencia y config

- `create sequence if not exists cotizacion_numero_seq;` (mismo patrón que `comprobante_numero_seq` de P2).
- Claves nuevas en `configuracion`: `cotizacion_validez_dias` (default `15`), `cotizacion_formato_default` (`ejecutivo` | `minimalista` | `catalogo`, default `ejecutivo`), `cotizacion_condiciones_default` (texto de términos por defecto).

### RLS

Todas las tablas: RLS habilitado, políticas para `authenticated` (admin) — mismo criterio que las tablas del POS. Nada de acceso anónimo.

## RPC / mutaciones (Server Actions en `app/admin/cotizaciones/actions.ts`)

- **`guardar_cotizacion(payload jsonb)`** (RPC en la migración) — upsert **atómico** de encabezado + reemplazo de líneas en una transacción. Asigna `numero` de la secuencia al crear. **Recalcula los totales en el servidor** (frontera de confianza, como el checkout — nunca confía en los importes del cliente); relee los precios de catálogo para líneas con `producto_id` según el tipo de cliente, y respeta `precio_unitario` de ítems libres/precio manual. Devuelve el id.
- **`moverEtapaCotizacion(cotizacionId, etapaId)`** — actualiza `etapa_id` (drag-drop y menú "Mover a…").
- **`eliminarCotizacion(cotizacionId)`** — borra (cascade de items).
- **`obtenerCotizacion(cotizacionId)`** — carga encabezado + items + etapa + cliente + config para el editor y el PDF.
- **`obtenerCotizacionParaPos(cotizacionId)`** — devuelve el payload que el POS necesita para precargar una pestaña (cliente, líneas revalidables, descuento global, cotizacionId).
- **`marcarCotizacionFacturada(cotizacionId, documentoId)`** — setea `documento_id` y mueve la cotización a la etapa `ganada` (la primera etapa activa de tipo `ganada`, por orden). Guardado idempotente: si ya tenía `documento_id`, no re-emite.
- **CRUD de etapas** (`crearEtapa`, `actualizarEtapa`, `reordenarEtapas`, `eliminarEtapa`) — en `EtapasSection`. `eliminarEtapa` **falla con mensaje** si hay cotizaciones en esa etapa (reasignar primero); el FK es `on delete restrict`.

## Rutas, UI y componentes

### Rutas

- **`/admin/cotizaciones`** — tablero kanban. Server Component carga etapas + cotizaciones (con total, cliente, vendedor, valido_hasta); Client Component `KanbanBoard` maneja el arrastre.
- **`/admin/cotizaciones/[id]`** — editor (`.../nueva` para crear una nueva).
- **`/admin/cotizaciones/[id]/pdf?estilo=ejecutivo|minimalista|catalogo`** — hoja imprimible.
- Gestión de etapas → nueva sección `EtapasSection` dentro de `/admin/configuracion` (mismo patrón que `PosSection`).
- Link **"Cotizaciones"** en el sidebar (`components/admin/Sidebar`), en el grupo del panel.

### Componentes

- **`KanbanBoard`** (client) — columnas por etapa (respeta `orden`, incluye columnas vacías vía `agruparPorEtapa`); tarjetas arrastrables. Cada tarjeta: número, cliente, total (`formatPrice`), `válida hasta` con badge *Vencida* si pasó, vendedor. Botón *Nueva cotización*; clic en tarjeta abre el editor.
  - **Arrastre:** drag-and-drop **nativo de HTML5** (sin librería, coherente con el proyecto — sin librería de PDF, CSS Modules), más un menú *"Mover a…"* por tarjeta como alternativa accesible/táctil. (Si a futuro se quiere arrastre más pulido con soporte touch/teclado, se evalúa `@dnd-kit` — fuera del alcance de P3.)
- **`CotizacionEditor`** (client) — versión simplificada de la venta del POS (sin caja ni pestañas): buscador de catálogo + agregar líneas, ítem libre (reusa el criterio de `ItemLibreModal`), editar línea (cantidad/precio/descuento, reusa el criterio de `LineaEditorModal`), descuento global, selector de cliente con alta rápida (reusa `ClienteNuevoModal`), vendedor, etapa, validez (días → `valido_hasta`), condiciones/notas, y **totales en vivo** con `lib/pos/desglose`. Botones: *Guardar*, *Ver PDF* (los 3 estilos), *Facturar* (→ POS, deshabilitado si ya tiene `documento_id`), y mover de etapa.
- **`CotizacionHoja`** — hoja imprimible con 3 variantes de estilo, cada una un componente que recibe los mismos datos (cotización + items + cliente + config); comparten el cargador `obtenerCotizacion`. Mismo patrón "HTML + CSS de impresión" que `DocumentoHoja` del POS (sin librería de PDF). Barra de acciones con selector de estilo + Imprimir, usando la clase `.btnToolbar` (los `btnMerlin*` sueltos no traen caja — lección de P2.1).
  - **Ejecutivo (Akuo):** encabezado con marca, tipografía refinada, elegante/corporativo. Referencia visual: la plantilla HTML del nodo *"Plantilla Recolección y Calculo de Datos HTML2"* en `C:\Users\IT\OneDrive\Aplicaciones\Akuo-Cotizaciones\Akuo-Generador de Cotizaciones.json`, adaptada a los tokens de Merlin (no copiar colores/fuentes de Akuo; adaptar la estructura y el aire).
  - **Minimalista:** compacto, blanco y negro, logo + tabla limpia de ítems y totales, una página.
  - **Catálogo con imágenes:** miniatura de cada producto (de `productos.imagenes[0]`; ítems libres sin imagen) junto a descripción y precio.
- **`EtapasSection`** (en configuración) — CRUD de etapas: nombre, color, tipo (abierta/ganada/perdida), reordenar (`orden`). Guard de borrado (ver RPC).

## Flujo de conversión a venta

1. *Facturar* en el editor navega a `/admin/pos?cotizacion=<id>`.
2. `PosClient` detecta el parámetro `cotizacion`, llama `obtenerCotizacionParaPos`, y abre una **pestaña nueva precargada** con cliente + líneas + descuento global, **revalidando las líneas contra el catálogo vigente** con la lógica que ya usa al retomar una espera (`revalidarLineasCatalogo`): productos inactivos o variantes muertas se avisan y se quitan. La pestaña recuerda su `cotizacionId` de origen.
3. El cajero elige caja/pagos y emite (factura/comprobante) con `emitir_documento`. El stock se valida/descuenta **en ese momento**; si falta, salen los errores `HS_*` que el POS ya maneja.
4. Al emitir con éxito, si la pestaña trae `cotizacionId`, `PosClient` llama `marcarCotizacionFacturada(cotizacionId, documentoId)` → setea `documento_id` y mueve la cotización a `ganada`.
5. **Anti doble-emisión:** una cotización con `documento_id` no null deshabilita *Facturar* y muestra el documento ligado. Para rehacerla, se **duplica** (nueva cotización, sin `documento_id`).

**Precios en la conversión:** al precargar el POS se respeta el tipo de cliente (revendedor) como en cualquier venta; pero como el POS **relee todo de BD al emitir** (frontera de confianza), los importes finales son siempre los recalculados, no los guardados en la cotización.

## Lógica pura y pruebas

Nuevo módulo `lib/cotizaciones/` con tests en `lib/cotizaciones/tests/` (regla del CLAUDE.md: reglas con peso van en lib puro con test):

- `numeroCotizacion(seq: number): string` → `COT-00000001` (padding a 8 dígitos).
- `validoHasta(fechaCreacion: Date, dias: number): Date` y `estaVencida(validoHasta: Date, hoy: Date): boolean`.
- `agruparPorEtapa(cotizaciones, etapas)` → estructura para el kanban que respeta el orden de etapas e **incluye columnas vacías**.
- `etapaGanadaDestino(etapas)` → primera etapa activa de tipo `ganada` por orden (para `marcarCotizacionFacturada`).
- Helpers de tipo de etapa (abierta/ganada/perdida) y validación de que exista al menos una `ganada` para poder facturar.
- La **matemática de totales se reusa** de `lib/pos` (`totalesDocumento`, `desglosarLinea`, `prorratearDescuentoGlobal`, `precioLineaPos`) — ya testeada; se agregan casos propios solo si aparece una regla nueva de cotización.

## Manejo de errores

- **Guardar:** totales recalculados en el servidor (RPC). Validación de cliente/líneas; una cotización puede guardarse en borrador sin líneas, pero **no** se puede facturar ni generar PDF sin líneas (avisos).
- **Facturar:** reusa toda la validación del POS (caja abierta, CAI vigente, stock, pagos). Sin caja abierta, el POS pide abrir sesión primero (comportamiento actual).
- **Etapas:** borrar una etapa con cotizaciones está bloqueado (FK restrict + mensaje claro).
- **PDF de vencida:** se genera igual (es un registro), con el sello *Vencida*.
- **Cotización ya facturada:** *Facturar* deshabilitado; se ofrece *Duplicar*.

## Entrega

- Una migración P3 (tablas + secuencia + RLS de admin + seeds de etapas + claves de config), **idempotente** (`if not exists`, seeds con `on conflict do nothing`), aplicada por el usuario en el SQL Editor **antes** del push (flujo de entrega de siempre).
- Smoke SQL corto (`supabase/smoke-pos-p3.sql`) que verifica estructura (tablas, columnas clave, secuencia), seeds de etapas y claves de config, sin crear ni borrar datos.
- `npm test` + `npx tsc --noEmit` + `npm run lint` verdes antes del push; verificación visual del kanban/editor/PDF en el navegador.
- Commits en español, formato convencional. Deploy a producción tras confirmación del usuario.

## Fuera de alcance (P3)

- Envío automático de la cotización por correo/WhatsApp (el PDF se descarga/imprime; el envío queda para una iteración futura).
- Cotizaciones en USD (solo Lempiras, como el resto).
- Reserva de stock por cotización (explícitamente: no reservan).
- Ordenamiento manual de tarjetas **dentro** de una columna (se ordenan por `updated_at`; el arrastre entre columnas sí cambia la etapa).
- Firma/aceptación digital del cliente, historial de actividad por cotización, y métricas/embudo (candidatos a P6 dashboard).
- Arrastre con librería (`@dnd-kit`): se usa DnD nativo; la librería queda como posible mejora futura.
