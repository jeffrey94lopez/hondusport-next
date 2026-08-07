# Diseño — POS P1: Configuración, catálogos base, costeo y kardex

**Fecha:** 2026-08-07
**Serie:** POS Honduras — P1 de 6 (P2 POS+fiscal · P3 Cotizaciones CRM · P4 Compras/CxP/CxC · P5 Devoluciones/NC · P6 Dashboard). Este spec cubre SOLO P1.
**Objetivo:** dejar montados los cimientos del POS: perfiles de Empresa y Facturador
(CAI/SAR), catálogo de clientes con RTN único, clasificación fiscal y canales de
venta por producto, control de costos (promedio/último) con kardex de movimientos,
y las reglas de integridad (desactivar, no eliminar).

## Alcance

- **Incluye:** módulo de configuración (perfil empresa con branding + perfil
  facturador con CAIs), tabla y CRUD de `clientes`, campos nuevos en
  productos/variantes (canal, ISV, costo, precio revendedor, stock mínimo),
  tabla `movimientos_inventario` (kardex) + lógica de costeo con tests,
  integración del kardex con las RPCs existentes (`crear_pedido`,
  `cambiar_estado_pedido`) y con el formulario/imports de inventario,
  regla de no-eliminación, y alertas puras de CAI (por vencer/agotarse).
- **No incluye (sub-proyectos posteriores):** pantalla POS, caja, emisión de
  documentos (P2); cotizaciones y CRM (P3); compras, proveedores, CxP/CxC,
  reorden, inventario físico (P4); devoluciones/notas de crédito (P5);
  dashboard/reportes (P6). Sin modo offline. Sin facturación electrónica
  certificada SAR (régimen distinto al CAI; diseñable a futuro).

## Decisiones tomadas

1. Todo dentro del admin Next.js + Supabase actual (Opción A aprobada): sin
   dependencias nuevas; RPCs atómicas y lógica pura testeada (patrón del repo).
2. Costeo configurable global: **promedio ponderado** o **último costo**; aplica
   **por variante** en productos con variantes y por producto en planos.
3. Cotizaciones NO reservan stock (regla fijada aquí para la serie): el stock se
   toca al facturar/emitir comprobante.
4. RTN único en clientes (constraint); ventas sin cliente = "Consumidor Final".
5. Los documentos SAR usan correlativo `NNN-NNN-NN-NNNNNNNN` (Acuerdo 481-2017,
   Arts. 10-11): establecimiento (000 = casa matriz) + punto de emisión + tipo
   (01=Factura; otros tipos los usará P5) + correlativo de 8 dígitos. El modelo
   de CAIs de P1 ya soporta múltiples establecimientos/puntos/tipos.

## Modelo de datos (migración SQL — aplicar ANTES del push)

### Tabla `clientes`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text not null | nombre o razón social |
| `rtn` | text null | **índice único parcial** (`where rtn is not null`); 14 dígitos |
| `identidad` | text null | para consumidor final > L10,000 (regla de P2) |
| `tipo_cliente` | text not null default 'final' | check: `final` \| `revendedor` |
| `exonerado` | boolean not null default false | |
| `constancia_exonerado` | text null | N° Constancia Registro de Exonerados |
| `registro_sag` | text null | N° Registro SAG |
| `direccion` / `telefono` / `correo` | text null | |
| `notas` | text null | |
| `activo` | boolean not null default true | |
| `created_at` / `updated_at` | timestamptz | trigger estándar |

RLS: sin lectura pública; todo `authenticated` (es dato del admin).

### Tabla `cai_autorizaciones`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `cai` | text not null | clave alfanumérica otorgada por SAR |
| `establecimiento` | text not null default '000' | 3 dígitos |
| `punto_emision` | text not null default '001' | 3 dígitos |
| `tipo_documento` | text not null default '01' | 2 dígitos (01=Factura; P5 añadirá NC) |
| `rango_desde` / `rango_hasta` | integer not null | correlativo autorizado |
| `correlativo_actual` | integer not null | último emitido; empieza en `rango_desde - 1` |
| `fecha_limite` | date not null | fecha límite de emisión |
| `activo` | boolean not null default true | solo un activo por (establecimiento, punto, tipo) — índice único parcial |
| `created_at` / `updated_at` | timestamptz | |

El consumo atómico del correlativo (RPC `emitir_documento`) es de **P2**; P1 solo
administra los CAIs y calcula alertas.

### Productos y variantes (columnas nuevas)

- `productos`: `canal` text not null default 'ambas' (check `tienda|mostrador|ambas`),
  `isv` text not null default '15' (check `15|18|exento`), `costo` numeric null,
  `precio_revendedor` numeric null, `stock_minimo` integer null.
- `producto_variantes`: `costo` numeric null (null = hereda el del padre),
  `precio_revendedor` numeric null (null = hereda). El canal y el ISV son del
  padre (una variante no cambia de canal ni de tasa).
- La tienda web filtra `canal in ('tienda','ambas')` en sus queries públicas
  (page.tsx, producto/[slug]); el POS (P2) filtrará mostrador/ambas.

### Tabla `movimientos_inventario` (kardex)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `producto_id` | uuid not null FK | `on delete restrict` (integridad histórica) |
| `variante_id` | uuid null FK | `on delete restrict` |
| `tipo` | text not null | check: `entrada` \| `ajuste` \| `venta_web` \| `reposicion_cancelacion` (P2+ añade `venta_pos`, `devolucion`, `compra`) |
| `cantidad` | integer not null | positivo entra, negativo sale |
| `costo_unitario` | numeric null | solo en entradas con costo |
| `costo_resultante` | numeric null | costo del producto DESPUÉS del movimiento (auditoría del costeo) |
| `referencia` | text null | ej. `pedido:<uuid>`, `import:<archivo>`, `manual` |
| `usuario` | text null | email del emisor (auth) |
| `notas` | text null | |
| `created_at` | timestamptz | |

Es **append-only**: sin update/delete por diseño (RLS solo insert/select para
authenticated; las RPCs security definer también insertan).

## Configuración (claves nuevas en `configuracion`)

- **Perfil de empresa** (branding de documentos): `empresa_nombre_comercial`,
  `empresa_logo_url`, `empresa_icono_url`, `empresa_telefono`, `empresa_correo`,
  `empresa_direccion`, `empresa_terminos_cotizacion`, `empresa_terminos_factura`
  (textos al pie, opcional c aprobada), `cotizacion_estilo` (`ejecutivo` default;
  P3 define los otros dos), `moneda_secundaria_activa` (`true|false`),
  `tasa_cambio_usd` (numeric como texto; la usan P2/P3 al mostrar USD y la
  factura la imprime cuando aplica, Art. 11).
- **Perfil de facturador** (fiscal): `fiscal_rtn`, `fiscal_razon_social`,
  `fiscal_nombre_comercial`, `fiscal_domicilio`, `fiscal_telefono`,
  `fiscal_leyenda` (default "LA FACTURA ES BENEFICIO DE TODOS, EXÍJALA"),
  `metodo_costeo` (`promedio` default \| `ultimo`).

UI: `/admin/configuracion` gana pestañas o secciones **Empresa** y **Facturador**
(la página actual de configuración se reorganiza; los campos existentes de
`configuracion` que ya cubren empresa —logo, dirección, contacto— se reutilizan,
no se duplican: el perfil de empresa LEE/ESCRIBE esas mismas claves). La sección
Facturador incluye el CRUD de CAIs con sus alertas.

## Lógica pura (lib/store/ o lib/pos/, con tests)

- `validarRtn(rtn)`: 14 dígitos numéricos; mensajes en español.
- `formatearCorrelativo(cai, numero)` → `"000-001-01-00000123"`.
- `estadoCai(cai, hoy)` → `{ vigente, diasParaVencer, restantes, alerta }`
  (alerta cuando faltan ≤30 días o ≤10% del rango; umbrales constantes).
- `aplicarEntradaCosto(metodo, stockActual, costoActual, cantidad, costoEntrada)`
  → nuevo costo: promedio ponderado `((stock*costo)+(cant*costoEnt))/(stock+cant)`
  (si stock/costo actual es null se toma el costo de entrada) o `ultimo` →
  `costoEntrada`. Redondeo a 4 decimales.
- `precioParaCliente(tipoCliente, precio, precioRevendedor)` → revendedor usa su
  precio si existe, si no el normal (variante hereda del padre como el precio).
- `margen(precio, costo)` → `{ ganancia, porcentaje }` (null-safe).

## Integraciones con lo existente

1. **Formulario admin de producto/variante:** campos canal, ISV, costo (solo
   lectura si hay movimientos — el costo lo fija el costeo; editable solo como
   "costo inicial" cuando no hay kardex), precio revendedor, stock mínimo. Al
   AUMENTAR stock desde el form aparece el campo "costo de esta entrada"
   (opcional; si se da, genera movimiento `entrada` + recalcula costo vía RPC
   `registrar_entrada` transaccional; si no, es `ajuste` sin efecto en costo).
   Reducciones de stock manuales = `ajuste` negativo (no tocan costo).
2. **Excel round-trip:** columnas nuevas `canal`, `isv`, `precio_revendedor`,
   `stock_minimo` (Actualizar/Nuevos) y `costo`/`precio_revendedor` en la pestaña
   Variantes; cambios de stock por Excel piden columna `costo_entrada` (vacía =
   ajuste sin costo). Import de plantilla externa: mapeo opcional de `costo`.
   Ambos generan movimientos de kardex por las diferencias de stock.
3. **RPCs existentes:** `crear_pedido` inserta movimientos `venta_web` (cantidad
   negativa, snapshot de `costo_resultante` vigente) por cada item que descuenta
   stock; `cambiar_estado_pedido` inserta `reposicion_cancelacion` /
   `venta_web` al cancelar/reactivar. (Extensión de las funciones actuales en la
   misma migración.)
4. **Regla de no-eliminación:** `deleteProducto` bloquea si el producto tiene
   `pedido_items` o `movimientos_inventario` → error "Este producto tiene
   historial; desactívalo en su lugar". Igual para variantes (vía
   `sync_producto_variantes`: borrar una variante con historial falla con mensaje
   claro). Clientes: sin documentos aún (P2), pero el CRUD ya usa desactivar como
   acción principal y solo permite eliminar si no hay referencias.

## UI nueva (admin, look Merlin)

- `/admin/clientes`: listado con búsqueda (nombre/RTN), badge de tipo
  (Final/Revendedor) y exonerado, form con validación de RTN única y formato.
- `/admin/configuracion` reorganizada: secciones Empresa / Facturador / Tienda
  (lo existente). CAIs: tabla con estado (vigente/por vencer/agotándose/vencido),
  alta y edición; correlativo_actual visible pero no editable a mano (solo al
  crear se fija en rango_desde−1).
- Formulario de producto y carrusel: los campos nuevos, con el patrón de
  variantes existente (heredar del padre).

## Manejo de errores

- RTN duplicado → mensaje con el nombre del cliente que ya lo tiene.
- CAI solapado (mismo establecimiento/punto/tipo activo) → bloqueo con mensaje.
- Movimientos: RPC `registrar_entrada` valida cantidad > 0 y costo ≥ 0.
- Ninguna operación de kardex/costeo se hace en dos pasos: RPCs transaccionales.

## Testing

- Lógica pura completa con Vitest: costeo (promedio/último, casos null/cero),
  RTN, correlativo, estadoCai, precioParaCliente, margen.
- Parsers de Excel actualizados con tests (columnas nuevas + movimientos).
- RPCs/migración: smoke test SQL en el editor antes del push (patrón del repo).
- Suite existente permanece verde; `npx tsc --noEmit` tras tipos/Server Actions.

## Entrega

Rama `feature/pos-p1-configuracion`. Migración en el SQL Editor ANTES del push;
smoke SQL; confirmación del usuario para fusionar (deploy). P2 arranca después.
