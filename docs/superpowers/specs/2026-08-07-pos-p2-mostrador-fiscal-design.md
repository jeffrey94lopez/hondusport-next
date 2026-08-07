# Diseño — POS P2: Mostrador, caja con arqueo y emisión fiscal

**Fecha:** 2026-08-07
**Serie:** POS Honduras — P2 de 6 (P1 configuración/catálogos/costeo/kardex DESPLEGADO ·
P3 Cotizaciones CRM · P4 Compras/CxP/CxC · P5 Devoluciones/NC · P6 Dashboard).
**Objetivo:** pantalla de venta de mostrador con caja multi-estación (apertura/cierre
con arqueo), pagos mixtos configurables, y emisión atómica de **factura fiscal CAI**
(Acuerdo 481-2017) y **comprobante no fiscal**, con impresión térmica 80mm y carta,
facturación de pedidos web y anulación de comprobantes.

## Alcance

- **Incluye:** tablas de cajas/sesiones/vendedores/métodos de pago/documentos,
  RPCs `emitir_documento` y `anular_comprobante`, pantalla `/admin/pos` (venta,
  ítems libres, ventas en espera, cobro con pagos mixtos), apertura/cierre de caja
  con arqueo, página imprimible del documento (80mm + carta), botón "Emitir
  factura/comprobante" en pedidos web, sección POS en configuración, y el barrido
  del backlog menor de P1.
- **No incluye:** cotizaciones y CRM (P3); compras, proveedores, CxP/CxC (P4);
  devoluciones parciales y notas de crédito (P5 — en P2 las facturas NO se anulan);
  dashboard/reportes y libro de ventas (P6); modo offline; facturación electrónica
  certificada.

## Decisiones tomadas

1. Opción 1 aprobada: POS dentro del admin Next.js + Supabase actual, sin
   dependencias nuevas; RPCs atómicas + lógica pura testeada (patrón del repo).
   Documentos como páginas HTML con CSS de impresión (sin librerías PDF).
2. **Regla ISV:** el precio cargado del producto es SIEMPRE el precio final al
   público. El desglose fiscal se calcula hacia atrás por línea según el campo
   `isv` del producto (P1): `15` → base = importe/1.15; `18` → /1.18; `exento` →
   el importe completo a la columna exento. Cliente **exonerado**: se resta el
   ISV del precio (paga la base) y el monto va a la columna exonerado.
3. **Multi-caja** con punto de emisión configurable por caja (default `001`).
   Cada caja consume el CAI activo de su `(establecimiento fijo 000, punto, tipo 01)`.
4. **Métodos de pago configurables:** sembrados Efectivo L. (con cambio), Tarjeta,
   Transferencia/depósito y Efectivo USD (a la tasa `tasa_cambio_usd`); se pueden
   crear nuevos (tipo `otro`), activar/desactivar y ordenar. El `tipo` gobierna el
   comportamiento (cambio, conversión USD, arqueo).
5. **Descuentos:** por línea (monto o %) y global a la venta; el global se
   **prorratea por línea** para que el desglose por alícuota sea exacto. Los
   cupones de la tienda web NO aplican en mostrador.
6. **Ítems libres desde P2:** líneas sin producto de inventario (descripción,
   cantidad, precio, ISV). No tocan stock ni kardex. `documento_items.producto_id`
   nullable — P3 reutiliza el mismo modelo.
7. **Pedidos web:** botón en el detalle del pedido; se elige tipo y caja; emite con
   los items del pedido SIN volver a tocar stock; máximo un documento vigente por
   pedido.
8. **Impresión:** formato default por caja (`80mm`/`carta`), cambiable al imprimir.
9. **Anulación:** comprobantes se anulan con motivo (reponen stock vía kardex y
   salen del esperado de caja); **facturas fiscales NO se anulan en P2** — solo
   nota de crédito (P5). El correlativo anulado se conserva visible.
10. Regla consumidor final: factura con total > **L.10,000** (clave
    `pos_limite_consumidor_final`, default `10000`) exige nombre + número de
    identificación (Art. 11, último párrafo).
11. Vendedor por venta desde catálogo `vendedores` (sin logins ni PIN).

## Modelo de datos (migración SQL — aplicar ANTES del push)

Todas las tablas nuevas: RLS solo `authenticated` (dato del admin), trigger
estándar de `updated_at` donde aplique.

### `cajas`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text not null | ej. "Caja 1" |
| `punto_emision` | text not null default '001' | 3 dígitos, check regex |
| `formato_impresion` | text not null default '80mm' | check `80mm` \| `carta` |
| `activo` | boolean not null default true | |
| `created_at` / `updated_at` | timestamptz | |

### `sesiones_caja`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `caja_id` | uuid not null FK cajas | on delete restrict |
| `estado` | text not null default 'abierta' | check `abierta` \| `cerrada` |
| `monto_inicial` | numeric not null check >= 0 | efectivo de apertura |
| `abierta_at` | timestamptz not null default now() | |
| `cerrada_at` | timestamptz | |
| `monto_esperado` | numeric | calculado al cierre (ver Arqueo) |
| `monto_contado` | numeric | lo contado por el cajero |
| `diferencia` | numeric | contado − esperado |
| `notas` | text | |
| `usuario` | text | email auth |

Índice único parcial: `(caja_id) where estado = 'abierta'` — una sesión abierta
por caja. No se emite documento sin sesión abierta en la caja.

### `vendedores`

`id` uuid PK, `nombre` text not null, `activo` boolean not null default true,
`created_at`/`updated_at`.

### `metodos_pago`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text not null | |
| `tipo` | text not null | check `efectivo_lps` \| `efectivo_usd` \| `tarjeta` \| `transferencia` \| `otro` |
| `activo` | boolean not null default true | |
| `orden` | integer not null default 0 | |

Seed en la migración: Efectivo L. (`efectivo_lps`), Tarjeta (`tarjeta`),
Transferencia/Depósito (`transferencia`), Efectivo USD (`efectivo_usd`).

### `documentos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tipo` | text not null | check `factura` \| `comprobante` |
| `correlativo` | text | facturas: `000-PPP-01-NNNNNNNN` (formateado, congelado); comprobantes: null |
| `numero_comprobante` | integer | comprobantes: serie propia (secuencia `comprobante_numero_seq`), se muestra `C-00000001`; facturas: null |
| `cai_id` | uuid FK cai_autorizaciones | facturas; on delete restrict |
| `caja_id` | uuid not null FK cajas | on delete restrict |
| `sesion_id` | uuid FK sesiones_caja | ventas de mostrador: obligatoria (sesión abierta); pedidos web: null (se emiten sin sesión y NO entran al arqueo) |
| `vendedor_id` | uuid FK vendedores | null = sin vendedor |
| `cliente_id` | uuid FK clientes | null = consumidor final |
| `cliente_nombre` | text not null default 'CONSUMIDOR FINAL' | snapshot congelado |
| `cliente_rtn` | text | snapshot |
| `cliente_identidad` | text | snapshot (regla L.10,000) |
| `exonerado` | boolean not null default false | snapshot |
| `orden_compra_exenta` | text | snapshot Art. 10.8 |
| `constancia_exonerado` | text | snapshot |
| `registro_sag` | text | snapshot |
| `pedido_id` | uuid FK pedidos | facturación de pedido web |
| `total_exento` / `total_exonerado` / `total_gravado15` / `total_gravado18` | numeric not null default 0 | desglose |
| `isv15` / `isv18` | numeric not null default 0 | impuesto por alícuota |
| `descuento_total` | numeric not null default 0 | línea + global prorrateado |
| `total` | numeric not null | lo que paga el cliente |
| `total_letras` | text not null | almacenado (inmutable) |
| `tasa_usd` | numeric | si hubo pago USD (se imprime, Art. 11) |
| `estado` | text not null default 'emitido' | check `emitido` \| `anulado` |
| `anulado_motivo` / `anulado_at` | text / timestamptz | solo comprobantes |
| `notas` | text | |
| `usuario` | text | email auth |
| `created_at` | timestamptz | fecha de emisión |

Índices: único parcial `(pedido_id) where pedido_id is not null and estado = 'emitido'`
(un documento vigente por pedido); único `(cai_id, correlativo)` para facturas.

### `documento_items`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `documento_id` | uuid not null FK documentos | on delete restrict |
| `producto_id` | uuid FK productos | null = ítem libre; on delete restrict |
| `variante_id` | uuid FK producto_variantes | on delete restrict |
| `descripcion` | text not null | snapshot (nombre + variante, o texto libre) |
| `cantidad` | integer not null check > 0 | |
| `precio_unitario` | numeric not null | precio final con ISV incluido |
| `descuento` | numeric not null default 0 | monto por línea (incluye prorrateo del global) |
| `isv` | text not null | check `15` \| `18` \| `exento` |
| `importe` | numeric not null | cantidad×precio − descuento |
| `base` | numeric not null | importe sin impuesto (o importe si exento/exonerado) |
| `isv_monto` | numeric not null default 0 | impuesto de la línea (0 si exento/exonerado) |

### `documento_pagos`

`id` uuid PK, `documento_id` FK not null (on delete restrict), `metodo_id` FK
metodos_pago not null (on delete restrict), `monto` numeric not null check > 0
(en Lempiras), `monto_usd` numeric (solo tipo `efectivo_usd`), `tasa` numeric
(ídem), `referencia` text (voucher/nº transferencia), `created_at`.
El cambio no se registra como pago: `sum(monto)` puede exceder `total` solo por
el efectivo (el exceso es el cambio, se calcula al vuelo y en el arqueo).

### `ventas_espera`

`id` uuid PK, `caja_id` FK not null, `nombre` text not null (etiqueta),
`payload` jsonb not null (carrito serializado del POS), `created_at`.
Se crean/retoman/descartan libremente; no tocan stock ni correlativo.

### Kardex

Sin cambios de esquema: `movimientos_inventario.tipo` ya admite `venta_pos` y
`devolucion` (P1). Emisión inserta `venta_pos` (cantidad negativa, referencia
`documento:<id>`); anulación de comprobante inserta `devolucion` (positiva,
misma referencia).

### `configuracion` (claves nuevas)

`pos_limite_consumidor_final` (default `10000`). Las demás ya existen de P1
(`fiscal_*`, `empresa_*`, `tasa_cambio_usd`, `moneda_secundaria_activa`,
`cotizacion_estilo`).

## Lógica pura (lib/pos/, con tests Vitest)

- `desglosarLinea(precioFinal, cantidad, descuento, isv, exonerado)` →
  `{ importe, base, isvMonto, columna }` donde columna ∈ exento|exonerado|g15|g18.
  Gravado: bruto = cantidad×precioFinal − descuento; base = bruto/(1+tasa);
  isvMonto = bruto − base; importe (cobrado) = bruto. Exento: base = importe =
  bruto, isvMonto = 0. Exonerado (cliente): base = bruto/(1+tasa), isvMonto = 0,
  **importe cobrado = base** (el precio efectivo baja) y esa base va a la
  columna exonerado. Redondeo a 2 decimales.
- `prorratearDescuentoGlobal(lineas, descuentoGlobal)` → descuento por línea
  proporcional al importe (el residuo de redondeo va a la línea mayor).
- `totalesDocumento(lineas)` → los 8 campos de desglose + total. Redondeo a 2
  decimales por línea (regla fiscal), suma exacta.
- `numeroALetras(monto)` → "UN MIL DOSCIENTOS TREINTA Y CUATRO LEMPIRAS CON
  56/100" (español HN, centavos como fracción NN/100).
- `validarEmision(tipo, cliente, total, limite)` → factura a consumidor final
  con total > limite exige nombre + identidad; mensajes en español.
- `precioLineaPos(producto|variante, tipoCliente)` → reutiliza
  `precioParaCliente` de P1 con herencia de variantes.
- `esperadoCaja(sesion, pagos)` → efectivo esperado: inicial + pagos
  `efectivo_lps` + (pagos `efectivo_usd` convertidos) − cambio entregado
  (sum(pagos efectivo) − parte del total cubierta en efectivo), + resumen por
  método para el cierre. Documentos anulados quedan fuera.
- `validarPagos(pagos, total)` → cubren el total; cambio solo si hay efectivo;
  referencia opcional.
- Reutiliza de P1: `formatearCorrelativo`, `estadoCai`, `validarRtn`.

## RPCs (migración, security invoker salvo indicación, set search_path, grant authenticated + revoke public/anon)

### `emitir_documento(p jsonb) returns uuid`

Atómica. Payload: tipo, caja_id, vendedor_id, cliente (id + snapshot editado),
items (producto_id/variante_id/descripcion/cantidad/precio_unitario/descuento/
isv/base/isv_monto/importe), totales calculados en TS, pagos, pedido_id, notas,
usuario. Pasos:

1. Venta de mostrador (sin `pedido_id`): valida sesión abierta de la caja
   (`HS_CAJA|<caja>` si no) y que los pagos cubran el total. Con `pedido_id`:
   no requiere sesión (`sesion_id` null, sin pagos POS — el cobro del pedido
   web sigue su flujo actual) y el documento no entra al arqueo.
2. Si `tipo = 'factura'`: toma el CAI activo del punto de la caja `FOR UPDATE`;
   valida `fecha_limite >= hoy` y `correlativo_actual < rango_hasta`
   (`HS_CAI|vencido|<fecha>` / `HS_CAI|agotado|<rango>`); incrementa
   `correlativo_actual` y congela el correlativo formateado. Si
   `tipo = 'comprobante'`: toma `nextval('comprobante_numero_seq')`.
3. **Re-verifica los totales**: recalcula suma de items vs totales del payload
   (tolerancia 0.01) — si difieren, `HS_TOTAL` (defensa contra bugs del cliente).
4. Si NO viene `pedido_id`: valida y descuenta stock por item con producto
   (mismo patrón `FOR UPDATE` + `HS_STOCK`/`HS_REQUIERE_VARIANTE`/`HS_VARIANTE`/
   `HS_INACTIVO` de `crear_pedido`, más check de canal ≠ solo-tienda **no**:
   el mostrador vende cualquier canal `mostrador`/`ambas`; productos solo-tienda
   se rechazan con `HS_INACTIVO`); ítems libres (producto_id null) no tocan stock.
   Inserta kardex `venta_pos` por cada item que descontó.
   Si viene `pedido_id`: NO toca stock ni kardex; valida que el pedido exista y
   no tenga documento vigente (`HS_PEDIDO_DOC|<numero>`).
5. Inserta documento + items + pagos. Devuelve el id.

### `anular_comprobante(p_documento_id uuid, p_motivo text) returns void`

Solo `tipo='comprobante'` y `estado='emitido'` (`HS_DOC` si no). Marca anulado
con motivo/fecha; repone stock de items con producto (`stock is not null`,
mismos filtros de reposición de `cambiar_estado_pedido`) e inserta kardex
`devolucion`. Si el documento venía de pedido web (sin stock propio), no repone.

### Backlog P1 (misma migración)

- `crear_pedido`: check de canal (`canal in ('tienda','ambas')`) junto al de
  activo — defensa en profundidad.
- `aplicar_costeo` y `sync_producto_variantes`: `set search_path = public` +
  `revoke execute from public, anon` (higiene).
- `caiActions.updateCai`: traducir el error del check
  `correlativo_actual >= rango_desde - 1` a mensaje claro en español.

## UI

### `/admin/pos` (layout propio a pantalla completa, look Merlin)

- Selección de caja al entrar (recordada en `localStorage`); si no hay sesión
  abierta → pantalla de apertura (monto inicial).
- Columna izquierda: buscador siempre enfocado (nombre o SKU exacto → Enter
  agrega directo: compatible con lector de código de barras USB), grid de
  productos canal `mostrador`/`ambas` con stock efectivo; productos con
  variantes abren selector rápido.
- Columna derecha: líneas (cantidad, precio, descuento por línea), botón "Ítem
  libre", descuento global, selector de cliente (default CONSUMIDOR FINAL;
  revendedor cambia precios automáticamente) y vendedor, panel de totales con
  desglose. Banner de alertas CAI (`estadoCai`).
- Ventas en espera: aparcar con nombre / retomar / descartar (persisten en BD).
- Modal de cobro: métodos activos, pagos mixtos, cambio para efectivo,
  conversión USD a la tasa; elegir factura/comprobante; si factura a consumidor
  final > límite → exige nombre + identidad. Al emitir → página del documento.
- Cierre de caja: resumen por método, esperado vs contado, diferencia, notas.
  Histórico de sesiones consultable (lista simple por caja con fecha y
  diferencia).

### `/admin/pos/documento/[id]`

Página imprimible: vista 80mm y carta (CSS `@media print` + selector de
formato, default el de la caja). La factura incluye TODOS los requisitos del
Acuerdo 481-2017 Arts. 10-11: identificación del emisor (`fiscal_rtn`,
`fiscal_razon_social`, `fiscal_nombre_comercial`, `fiscal_domicilio`,
`fiscal_telefono`), denominación "Factura", CAI, fecha límite de emisión,
rango autorizado, "Original: Cliente / Copia: Obligado tributario emisor",
correlativo 16 dígitos, datos del adquirente exonerado (cuando aplique),
cliente (nombre/RTN o identidad, o CONSUMIDOR FINAL), detalle por línea,
desglose exento/exonerado/gravado por alícuota e impuestos por alícuota,
moneda "L", total en números y letras, tasa de cambio si hubo pago USD,
`fiscal_leyenda`, y branding de empresa (logo) en formato carta. El
comprobante: mismo layout sin CAI/correlativo SAR, rotulado
"Comprobante — documento no fiscal", numerado `C-NNNNNNNN`. Documentos
anulados se imprimen con marca de agua "ANULADO".
Listado `/admin/pos/documentos`: búsqueda por correlativo/cliente/fecha,
filtro por tipo/estado, acceso a anular comprobantes (con motivo).

### Pedidos web (`/admin/pedidos`)

Botón "Emitir factura/comprobante" en el detalle: modal con tipo, caja,
cliente opcional del catálogo (default: datos del pedido) → llama
`emitir_documento` con `pedido_id`. El pedido muestra el documento vinculado
(correlativo + link). Regla: pedidos cancelados no se facturan.

### Configuración (`/admin/configuracion`, sección "POS")

CRUD de cajas, vendedores y métodos de pago (crear tipo `otro`, activar/
desactivar, ordenar; los sembrados no se eliminan, solo se desactivan) y el
límite de consumidor final. Todo con el patrón visual de las secciones de P1.

## Manejo de errores

- Contrato `HS_*` ampliado: `HS_CAJA` (sin sesión abierta), `HS_CAI|vencido|…`
  / `HS_CAI|agotado|…`, `HS_TOTAL` (totales inconsistentes), `HS_PEDIDO_DOC`
  (pedido ya facturado), `HS_DOC` (anulación inválida) — todos traducidos en
  `traducirErrorPedido` (o un `traducirErrorPos` hermano) a español.
- La emisión es todo-o-nada: nunca queda un correlativo consumido sin documento
  ni stock descontado sin documento.
- El POS revalida stock al emitir (no al agregar la línea): el mensaje indica
  producto y disponible, como el checkout.

## Testing

- Lógica pura completa con Vitest: desglose por alícuota (15/18/exento,
  exonerado), prorrateo con residuos de redondeo, numeroALetras (0, centavos,
  miles, millones), validarEmision (límite 10k), validarPagos (mixtos, cambio,
  USD), esperadoCaja (con anulados excluidos), precioLineaPos (revendedor +
  herencia).
- Suite existente permanece verde; `npx tsc --noEmit`; `npm run build`.
- Smoke SQL auto-limpiante antes del push: correlativo sin huecos (2 emisiones
  seguidas), factura descuenta stock + kardex `venta_pos`, comprobante anulado
  repone + `devolucion`, pedido web no descuenta doble y bloquea segundo
  documento, CAI agotado/vencido rechaza con `HS_CAI`, emisión sin sesión
  rechaza con `HS_CAJA`.

## Entrega

Rama `feature/pos-p2-mostrador`. Migración en el SQL Editor ANTES del push;
smoke SQL; confirmación del usuario para fusionar (deploy = producción).
P3 (cotizaciones) reutiliza `documento_items` con producto null y el modelo
de documentos.
