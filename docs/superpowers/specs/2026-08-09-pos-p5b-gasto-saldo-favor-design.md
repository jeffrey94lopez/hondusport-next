# POS P5b — Gasto del saldo a favor — Diseño

**Fecha:** 2026-08-09
**Serie:** POS Honduras, sub-proyecto P5b (continúa P5a: P5a genera el saldo a favor; P5b lo gasta).
**Estado:** aprobado para plan.

## Objetivo

Permitir **gastar** el saldo a favor que P5a acumula por devoluciones, por dos
vías: (1) como método de pago **'Saldo a favor'** en el cobro del POS, y (2) como
**abono a la cuenta por cobrar (CxC)** del cliente. El descuento del balance es
atómico, validado bajo lock, y nunca deja el saldo negativo.

## Principios

- **Ledger append-only con signo**: `saldo_favor_movimientos` acumula
  acreditaciones (+, `devolucion`) y gastos (−, `venta`/`cobro`); el balance es
  `Σ monto`. No se edita ni se borra.
- **Nunca negativo**: todo gasto se valida contra el balance real, bloqueando la
  fila del cliente (`for update`) para serializar gastos concurrentes.
- **Frontera de confianza**: la validación del balance y de los topes vive en la
  RPC bajo lock, no en el navegador.
- **El saldo a favor no es efectivo**: no da vuelto en el POS ni entra a la caja
  en el abono a CxC.

## Alcance

Gasto del saldo a favor en el POS (método `saldo_favor`) y en CxC (abono).
**Fuera de alcance:** vencimiento/caducidad del saldo; retiro del saldo en
efectivo (el saldo se gasta, no se retira). La generación del saldo por
devolución sigue siendo P5a.

---

## 1. Ledger de saldo a favor (abrir a gasto)

`saldo_favor_movimientos` (creada en P5a con `check (monto > 0)` y
`tipo in ('devolucion')`) se modifica:

- El check de `monto` pasa a **`monto <> 0`** (permite gastos negativos).
- El check de `tipo` pasa a **`tipo in ('devolucion','venta','cobro')`**:
  `devolucion` acredita (+, P5a); `venta` (gasto en POS) y `cobro` (abono a CxC)
  descuentan (−, P5b).
- La vista `saldo_favor_clientes` (`saldo = Σ monto`) **no cambia**: el signo lo
  maneja la suma.

Se agrega una columna opcional `cobro_id uuid references cobros(id)` en
`saldo_favor_movimientos` para trazar el gasto por CxC al cobro que lo consumió
(el gasto por venta ya se traza con `documento_id`).

---

## 2. Pago con 'Saldo a favor' en el POS (toca `emitir_documento`)

- **Método de pago `'saldo_favor'`**: se recrea el check `metodos_pago_tipo_chk`
  (que en P4c quedó `in (...,'credito')`) agregando `'saldo_favor'`, y se siembra
  una fila `metodos_pago` tipo `saldo_favor` (idempotente, como `'credito'` en P4c).
  `MetodoPagoTipo` (TS) gana `'saldo_favor'`.
- **`CobroModal`**: con un cliente registrado seleccionado, aparece el chip
  **"Saldo a favor (disp. L. X)"**, topeado a **`min(saldo del cliente, restante)`**;
  sin vuelto (el saldo nunca excede el total ni se convierte en efectivo).
- **`emitir_documento` (RPC fiscal) — modificación sensible**: se re-crea completa
  con `create or replace` (copiando su cuerpo vigente), agregando, **después de
  insertar `documento_pagos`**, un bloque: si hay algún pago de método tipo
  `'saldo_favor'`:
  1. Exige `cliente_id` no nulo → si no, error `HS_SALDO|requiere cliente`.
  2. **Bloquea la fila del cliente** (`select ... from clientes where id = cliente_id for update`).
  3. Calcula el balance (`coalesce(sum(monto),0)` de `saldo_favor_movimientos`),
     valida `Σ pagos saldo_favor ≤ balance` → si no, error `HS_SALDO|insuficiente`.
  4. Inserta un `saldo_favor_movimientos` **negativo** (`−Σ`, `tipo='venta'`,
     `documento_id` = la venta emitida, `usuario`).
  - **No cambia el resto de la lógica fiscal** (correlativo, stock, kardex,
    totales, validación de pagos). El pago `saldo_favor` cuenta para cubrir el
    total como cualquier otro `documento_pagos`.
- **Arqueo**: el pago `saldo_favor` **no es efectivo** — `esperadoCaja` lo trata
  como los métodos no-efectivo (no suma al efectivo esperado); se muestra en el
  desglose por método si aplica.

---

## 3. Abono a CxC desde el saldo a favor

Nueva RPC atómica **`aplicar_saldo_favor_cxc(p jsonb)`** (`security invoker`,
`revoke from public, anon` + `grant to authenticated`). Entrada:
`{ cliente_id, aplicaciones: [{documento_id, monto}], usuario, notas? }`.

Pasos:
1. **Bloquea la fila del cliente** (`for update`) — serializa contra otros gastos.
2. `v_monto := Σ aplicaciones.monto`. Valida `v_monto > 0`.
3. Balance: `coalesce(sum(monto),0)` de `saldo_favor_movimientos ≥ v_monto` → si no,
   error `HS_SALDO|insuficiente`.
4. **Agrupa las aplicaciones por documento** y valida cada una `≤ saldo pendiente`
   del documento (mismo cálculo que `registrar_cobro` de P4c: crédito − cobrado −
   nc_cxc, releído con la lógica de `documento_saldos`; pertenece al cliente; no
   anulado) → si excede, error.
5. Inserta un **cobro** (`cobros`) con `metodo='saldo_favor'` (se agrega ese valor
   al check de `cobros.metodo`), `monto = v_monto`, `sesion_id = null` (no toca
   caja), + sus `cobro_aplicaciones` (agrupadas por documento). Esto reduce la CxC
   igual que un cobro normal (la vista `documento_saldos` ya resta
   `cobro_aplicaciones`).
6. Inserta el `saldo_favor_movimientos` **negativo** (`−v_monto`, `tipo='cobro'`,
   `cobro_id` = el cobro creado, `usuario`).

Tope en la UI = **`min(saldo disponible, deuda pendiente del cliente)`**. El cobro
desde saldo **no entra a la caja/arqueo** (`sesion_id = null`; no es efectivo).

---

## 4. Tipos, UI y arqueo

- **`MetodoPagoTipo`** gana `'saldo_favor'` — rompe los `Record<MetodoPagoTipo, number>`
  (agregar `saldo_favor: 0` donde tsc lo marque, p.ej. `esperadoCaja.porMetodo`,
  mapas de etiquetas). El arqueo lo trata como no-efectivo.
- **`CobroModal` (POS)**: al elegir cliente registrado, mostrar su **saldo
  disponible** y el chip "Saldo a favor" (`min` con el restante). `emitirVenta`
  (Server Action) valida cliente registrado si hay pago `saldo_favor` (frontera de
  confianza; el descuento lo hace la RPC bajo lock).
- **CxC**: botón **"Aplicar saldo a favor"** en el tablero de Cuentas por Cobrar y/o
  el estado de cuenta del cliente (habilitado si `saldo > 0` y hay deuda), con un
  mini-modal que muestra saldo disponible y deuda, arma las aplicaciones
  (distribución por vencimiento o por documento) y llama `aplicarSaldoFavorCxc`.
- **`/admin/clientes`**: el saldo a favor ya se muestra (P5a); ahora baja al usarse.
- **Historial de saldo a favor**: listado de `saldo_favor_movimientos` por cliente
  (acreditaciones por devolución, gastos por venta/cobro) en el estado de cuenta
  del cliente, para trazabilidad.

---

## 5. Lógica pura, archivos y tests

- **`lib/pos/saldo-favor.ts`** (puro, con tests): `saldoAplicable(saldoDisponible,
  restante)` = `min(...)` con clamp ≥ 0; `validarGastoSaldo(saldoDisponible, monto)`
  → error si `monto > saldoDisponible` o `monto ≤ 0`; `distribuirSaldoCxc(
  saldoDisponible, documentosOrdenados, monto)` (reusa `distribuirPago` de
  `@/lib/cxp/cxp` cuando aplique).
- **Migración** `2026-08-09-pos-p5b-gasto-saldo-favor.sql`: check de
  `saldo_favor_movimientos` a `monto <> 0` + tipos `venta`/`cobro`; columna
  `saldo_favor_movimientos.cobro_id`; recrear `metodos_pago_tipo_chk` con
  `saldo_favor` + seed; recrear el check de `cobros.metodo` con `saldo_favor`;
  `emitir_documento` re-creada con el bloque de descuento; RPC
  `aplicar_saldo_favor_cxc`; RLS ya existente. + smoke con `to_regprocedure`.
- **Server Actions**: `emitirVenta` (validación de cliente para `saldo_favor`),
  `aplicarSaldoFavorCxc`, `obtenerSaldoFavorCliente(clienteId)`,
  `obtenerHistorialSaldoFavor(clienteId)`.
- **UI**: `CobroModal` (chip saldo a favor + saldo disponible del cliente);
  botón + mini-modal "Aplicar saldo a favor" en CxC; historial en el estado de
  cuenta del cliente.
- **Verificación**: `npm test` + `npx tsc --noEmit` + `npm run lint` +
  `npm run build`; visual tras aplicar la migración.

## Restricciones globales

- Idioma español; moneda en Lempiras con `formatPrice()`.
- Migración idempotente (`if not exists`, `create or replace`, drop/recreate de
  checks por nombre), aplicada por el usuario antes del push. Smoke con
  `to_regprocedure`. Estilo P4c/P5a.
- **NO se cambia la lógica fiscal de `emitir_documento`** — solo se agrega el
  bloque de descuento del saldo (validación + movimiento negativo), re-creando la
  función completa sin perder su cuerpo. NO se toca `emitir_nota_credito` ni
  `anular_comprobante`.
- Frontera de confianza: el balance y los topes se validan en las RPC bajo lock
  del cliente; nunca negativo. Append-only.
- El pago/abono con saldo a favor no toca la caja (no es efectivo).
- CSS Modules con tokens Merlin; botones `btnMerlin*` con clase de módulo. Dinero
  con `type="text" inputMode="decimal"`. Cliente de Supabase de servidor.

## Verificación visual (tras aplicar la migración)

Cliente con saldo a favor (de una devolución): pagar una venta con "Saldo a favor"
(mixto con efectivo; sin vuelto; el balance baja; movimiento `'venta'`); intentar
gastar más que el saldo → bloqueado; aplicar saldo a favor a una deuda de CxC (la
deuda baja, el balance baja, movimiento `'cobro'`, no toca caja); el saldo en
`/admin/clientes` refleja los gastos; historial de movimientos por cliente;
el arqueo no cuenta el saldo a favor como efectivo.
