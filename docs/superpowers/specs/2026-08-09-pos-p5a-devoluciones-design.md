# POS P5a — Devoluciones y Notas de Crédito (CAI propio) — Diseño

**Fecha:** 2026-08-09
**Serie:** POS Honduras, sub-proyecto P5a (P5 se partió en P5a devoluciones + P5b gasto del saldo a favor).
**Estado:** aprobado para plan.

## Objetivo

Permitir devolver productos de una venta ya emitida y emitir el documento de
crédito correspondiente: **Nota de Crédito fiscal** (con CAI `'03'`) cuando el
origen es una factura, o **devolución** no fiscal cuando es un comprobante. La
devolución repone el stock al kardex, ajusta la cuenta por cobrar si la venta
fue al crédito, y reembolsa al cliente por efectivo (egreso de caja), saldo a
favor, o abono a su CxC. Es el reverso simétrico de la emisión fiscal de P2.

## Principios

- **Documentos inmutables**: el documento de devolución es un `documentos` nuevo
  que referencia al original; el original nunca se edita (trigger de BD).
- **Kardex append-only**: la reposición inserta un movimiento `'devolucion'`.
- **RPC atómica**: `emitir_nota_credito` valida, repone, reduce CxC y reembolsa
  todo-o-nada. **NO se toca `emitir_documento`** (la RPC fiscal de venta).
- **Frontera de confianza**: la RPC relee las líneas del origen y recalcula
  importes/ISV; valida cantidades devolvibles y coherencia del reembolso.

## Alcance

Devolución parcial por ítem y cantidad, sobre facturas (NC fiscal) y
comprobantes (devolución). Reembolso en efectivo / saldo a favor / abono CxC.
**Generación** de saldo a favor (el gasto es P5b). Toggle de regla
"no devoluciones en efectivo".

**Fuera de alcance (P5a):** gasto del saldo a favor (método de pago en POS +
abono a CxC) → **P5b**. Devolución sin documento original. Cambio de producto
(se modela como devolución + venta nueva).

---

## 1. Modelo fiscal y de datos

### 1.1 Documentos de devolución

Reusan la tabla `documentos` (items, totales, inmutabilidad, CAI):

- **`documentos.tipo`** gana `'nota_credito'` y `'devolucion'`. El check se
  recrea idempotente: `tipo in ('factura','comprobante','nota_credito','devolucion')`.
  - `nota_credito`: acredita una **factura**; fiscal, con CAI `'03'` (correlativo,
    `cai_id`), `numero_comprobante` null.
  - `devolucion`: acredita un **comprobante**; no fiscal, `numero_comprobante`
    vía `devolucion_numero_seq`, sin CAI ni correlativo.
- **`documento_origen_id uuid references documentos(id) on delete restrict`**
  (la factura/comprobante acreditada; null en ventas normales).
- **`documento_items.origen_item_id uuid references documento_items(id)`**: en
  las líneas de un documento de devolución, liga cada línea devuelta a la línea
  original exacta. La **cantidad devolvible** de una línea original =
  `cantidad − Σ (cantidad de líneas de devolución con ese origen_item_id, en
  documentos de devolución no anulados)`.
- **`documentos_correlativo_chk`** se extiende para agrupar:
  `(factura|nota_credito)` → `correlativo not null and cai_id not null and
  numero_comprobante null`; `(comprobante|devolucion)` → `correlativo null and
  cai_id null and numero_comprobante not null`.

### 1.2 CAI '03'

El documento `nota_credito` toma su correlativo de una fila de
`cai_autorizaciones` con `tipo_documento='03'` (misma mecánica que la factura con
`'01'`). El CRUD de CAIs existente (`CaisSection.tsx`) ya permite crear un CAI con
cualquier `tipo_documento` de 2 dígitos — **sin cambios de UI necesarios**. El
usuario configura el CAI '03' antes de emitir NC.

### 1.3 Saldo a favor (ledger)

- `saldo_favor_movimientos` (append-only): `id`, `cliente_id` (fk clientes),
  `monto numeric(12,2)` (con signo: `+` acreditación por devolución), `tipo text`
  (en P5a solo `'devolucion'`), `documento_id uuid` (la NC que lo generó),
  `notas`, `usuario`, `created_at`. RLS admin.
- Vista `saldo_favor_clientes`: `cliente_id`, `nombre`, `saldo = Σ monto`.
- En P5a el saldo solo **sube** (movimientos `+`). El consumo (`−`) es P5b.

### 1.4 CxC (P4c) — reducción por devolución

La vista **`documento_saldos`** de P4c se extiende para restar las devoluciones
aplicadas a CxC: `saldo = credito_total − cobrado − nc_cxc`, donde `nc_cxc` = Σ
de los reembolsos tipo `'cxc'` de los documentos de devolución cuyo
`documento_origen_id` es ese documento. Los reembolsos se registran en
`documento_pagos` del documento de devolución (ver 2.6), etiquetados por un
método cuyo `tipo` identifica la vía; alternativamente una tabla
`nota_credito_reembolsos` — **decisión de implementación:** usar
`nota_credito_reembolsos (id, documento_id, tipo check in ('efectivo','saldo_favor','cxc'),
metodo_id null, monto)` para no forzar la semántica de `documento_pagos`
(que asume pagos de venta). La vista de CxC y el arqueo leen de ahí.

---

## 2. RPC atómica `emitir_nota_credito(p jsonb)`

`security invoker`, atómica, `revoke from public, anon` + `grant to authenticated`.
Entrada: `{ documento_origen_id, caja_id, motivo, usuario,
lineas: [{origen_item_id, cantidad}],
reembolsos: [{tipo, monto, metodo_id?}] }`.

Pasos:

1. **Bloquea el documento origen** (`select ... for update`) para serializar
   devoluciones concurrentes sobre la misma factura. Valida: existe, `estado =
   'emitido'`, `tipo in ('factura','comprobante')`. `motivo` no vacío.
2. **Caja**: `caja_id` activa; sesión abierta de esa caja (para punto de emisión
   y egreso). Si no hay sesión abierta → error (igual que la venta de mostrador).
3. **Líneas devueltas**: por cada `{origen_item_id, cantidad}`: la línea original
   pertenece al documento origen; `cantidad > 0` y `cantidad ≤ devolvible`
   (original − ya devuelto, calculado con las devoluciones no anuladas). Recalcula
   `importe`/`base`/`isv_monto` **proporcional** a la línea original (no confía en
   montos del cliente). Suma el total NC.
4. **Correlativo**: si el origen es `factura` → tipo `nota_credito`, CAI `'03'`
   (`for update`, valida vigencia/rango/no agotado, incrementa `correlativo_actual`);
   si es `comprobante` → tipo `devolucion`, `nextval('devolucion_numero_seq')`.
5. **Inserta** el documento de devolución (tipo, `documento_origen_id`, cliente
   heredado del origen, totales recalculados, `total_letras`, `notas=motivo`) + sus
   `documento_items` con `origen_item_id`.
6. **Repone stock**: por cada línea con `producto_id` no null y stock finito:
   `stock = stock + cantidad` y movimiento `movimientos_inventario` tipo
   `'devolucion'` (+cantidad, `costo_resultante = coalesce(pv.costo, pr.costo)`,
   `referencia = 'nota_credito:'||id`). Ítems libres no tocan stock.
7. **Reembolso** (`Σ reembolsos = total NC ± 0.01`, validado):
   - `efectivo`: inserta `nota_credito_reembolsos` tipo `efectivo` (metodo_id) →
     el arqueo lo trata como **egreso**. Valida que no exceda lo pagado en
     efectivo en el origen. **Regla `devoluciones_sin_efectivo`**: si la config
     está en `'true'`, un reembolso `efectivo` → error (frontera de confianza).
   - `saldo_favor`: inserta `saldo_favor_movimientos` `+monto` para el
     `cliente_id` del origen (**exige cliente registrado**, no CONSUMIDOR FINAL)
     + fila `nota_credito_reembolsos` tipo `saldo_favor`.
   - `cxc`: inserta `nota_credito_reembolsos` tipo `cxc`; valida que no exceda el
     saldo pendiente de CxC del origen. La vista `documento_saldos` lo resta.
8. Devuelve el id de la NC/devolución.

No cambia el costo (la reposición usa el costo vigente, como `anular_comprobante`).
No toca `emitir_documento` ni la anulación existente.

---

## 3. Caja y arqueo + toggle de regla

- La devolución se emite desde una caja con **sesión abierta** (punto de emisión).
  El reembolso en efectivo es un **egreso** contra esa sesión.
- **`esperadoCaja`** (ya extendido en P4c con `cobros`) gana un parámetro
  **`devoluciones: Array<{ metodo: ...; monto: number }>`**: el efectivo
  reembolsado **resta** al `efectivoEsperado`; devuelve `devolucionesPorMetodo`.
  Las llamadas existentes sin devoluciones siguen válidas (default `[]`).
- **`CierreModal`** suma una sección **"Devoluciones / reembolsos"** (efectivo /
  saldo a favor / CxC), con el efectivo restando del esperado. Mantiene el crédito
  otorgado y los cobros de P4c. `formatPrice` en todo.
- **Toggle `devoluciones_sin_efectivo`** (config, default `'false'`): un toggle
  "No permitir devoluciones en efectivo" en `PosSection` (patrón
  `cxc_bloquear_limite`). Cuando `'true'`: la RPC rechaza reembolsos efectivo
  (paso 7) y el `DevolucionModal` oculta/deshabilita esa vía.

---

## 4. UI y flujo

Devolución **desde el documento**:

- En `/admin/pos/documentos` (listado) y `documento/[id]` (detalle): botón
  **"Devolver / Nota de crédito"**, habilitado si el documento es
  `factura|comprobante` `emitido` y tiene cantidad devolvible > 0.
- **`DevolucionModal`** (o página): lista los ítems del documento con su
  **cantidad devolvible** (original − ya devuelto); el cajero marca ítems y
  cantidades (input `type="text" inputMode="decimal"`, ≤ devolvible). Muestra el
  **total a acreditar** recalculado en vivo (con ISV). Luego el **desglose de
  reembolso**: efectivo (si hay caja abierta **y** la regla no lo prohíbe) /
  saldo a favor (si hay cliente registrado) / abono a CxC (si el origen tiene
  saldo al crédito), con validación de que sume el total. **Motivo obligatorio.**
- Al confirmar → `emitirNotaCredito(...)` (Server Action) → RPC. Al `ok`, muestra
  la NC en modal (mismo patrón que la emisión) y refresca.
- El documento origen muestra un badge **"Devuelto (parcial/total)"** y enlaza
  sus NC. El listado de documentos filtra por tipo (incluye nota_credito/devolucion).

---

## 5. Imprimible, lógica pura y archivos

- **`NotaCreditoHoja`** (imprimible): mismo formato fiscal del documento
  (80mm/carta, tinta fija, `@media print`, `.btnToolbar`), con los datos SAR de la
  NC (CAI '03', correlativo, **referencia a la factura original**, ítems
  devueltos, total acreditado, ISV, total en letras) o el correlativo interno para
  la devolución de comprobante.
- **`lib/pos/devoluciones.ts`** (puro, con tests): `cantidadDevolvible(original,
  yaDevuelto)`, `recalcularLineaDevuelta(lineaOriginal, cantidad)` (importe/base/ISV
  proporcional, redondeo consistente), `totalNotaCredito(lineas)`,
  `validarReembolsos(reembolsos, total, { efectivoPagado, saldoCxc, sinEfectivo,
  clienteRegistrado })`, `numeroDevolucion(n)`.
- **Archivos:**
  - Migración `2026-08-09-pos-p5a-devoluciones.sql`: columnas
    `documento_origen_id`, `documento_items.origen_item_id`; check de `tipo`
    recreado; `documentos_correlativo_chk` extendido; `devolucion_numero_seq`;
    `nota_credito_reembolsos`; `saldo_favor_movimientos` + vista
    `saldo_favor_clientes`; `documento_saldos` extendida (resta `nc_cxc`); config
    `devoluciones_sin_efectivo`; RPC `emitir_nota_credito`; RLS. + smoke.
  - `types/index.ts`: tipos de devolución/reembolso/saldo a favor; `MetodoPagoTipo`
    sin cambios (el saldo a favor como método es P5b).
  - Server Actions `app/admin/pos/actions.ts`: `obtenerDevolvible(documentoId)`,
    `emitirNotaCredito(input)`.
  - `lib/pos/emision.ts` (`esperadoCaja` + parámetro devoluciones) + tests.
  - `app/admin/pos/actions.ts` cierre + `CierreModal.tsx` (sección devoluciones).
  - `app/admin/configuracion/PosSection.tsx` (toggle `devoluciones_sin_efectivo`).
  - Componentes `DevolucionModal.tsx`, `NotaCreditoHoja.tsx`; badge/enlace en el
    listado/detalle de documentos.
  - Saldo a favor en `/admin/clientes` (lectura del balance).
- **Verificación:** `npm test` + `npx tsc --noEmit` + `npm run lint` +
  `npm run build`; visual tras aplicar la migración.

## Restricciones globales

- Idioma español; moneda en Lempiras con `formatPrice()`.
- Migración idempotente (`if not exists`, `create or replace`, drop/recreate del
  check por nombre detectado), aplicada por el usuario antes del push. Smoke con
  `to_regprocedure`. Estilo P4c/P4d.
- Documentos inmutables (trigger existente); NO se toca `emitir_documento` ni
  `anular_comprobante`. Kardex append-only (`'devolucion'` ya existe).
- Frontera de confianza: `emitir_nota_credito` relee líneas del origen, valida
  devolvible con `for update`, y aplica la regla `devoluciones_sin_efectivo` en
  el servidor.
- CSS Modules con tokens Merlin; botones `btnMerlin*` con clase de módulo.
  Dinero con `type="text" inputMode="decimal"`. Imprimible = HTML + CSS impresión
  (`.btnToolbar`, tinta fija, `@media print`).
- Cliente de Supabase de servidor. Tipo
  `type PosResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`
  (o el ya usado en pos/actions).

## Verificación visual (tras aplicar la migración)

Configurar CAI '03'; devolver parcialmente una factura (NC fiscal, stock repuesto,
kardex `'devolucion'`); devolver un comprobante (correlativo interno); reembolso
efectivo (egreso en arqueo) / saldo a favor (balance del cliente sube) / abono CxC
(saldo del origen baja); toggle `devoluciones_sin_efectivo` on → efectivo
bloqueado; segunda devolución parcial de la misma factura respeta el devolvible;
NC imprimible con referencia a la factura original.

## Follow-ups / P5b

- **P5b**: gasto del saldo a favor — método de pago `'saldo_favor'` en el POS
  (toca `emitir_documento`) y abono a CxC desde el saldo. Se apoya en
  `saldo_favor_movimientos`/`saldo_favor_clientes` de P5a.
