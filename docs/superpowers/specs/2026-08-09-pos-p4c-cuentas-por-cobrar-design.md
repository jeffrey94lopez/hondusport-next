# POS P4c — Cuentas por Cobrar (CxC) — Diseño

**Fecha:** 2026-08-09
**Serie:** POS Honduras, sub-proyecto **P4c** (tercer pedazo de P4). P1, P2, P2.1, P3, P4a (compras) y P4b (CxP) están desplegados.
**Objetivo:** Vender al crédito a clientes registrados desde el POS y controlar las deudas por cobrar: crédito otorgado, cobros, saldos, límite de crédito, antigüedad y estado de cuenta. Simétrico a P4b (CxP) pero del lado de las ventas/emisión fiscal.

## Contexto (qué toca)

Las ventas del POS son **documentos fiscales** (`documentos` + `documento_pagos`, emitidos por la RPC `emitir_documento`, con CAI). Hoy `validarPagos` (en `lib/pos/emision.ts`) exige que los pagos cubran el total; los tipos de pago son `efectivo_lps`/`efectivo_usd`/`tarjeta`/`transferencia`/`otro`. Los clientes ya tienen `dias_credito` (de P4a). La caja se cierra con arqueo (`esperadoCaja`, `cerrarSesion`, `CierreModal`). La lógica pura de antigüedad/estado/distribución de P4b vive en `lib/cxp/cxp.ts` (`bucketAntiguedad`, `estadoPago`, `distribuirPago`, `saldoCompra`) y es genérica.

## Principio rector

**El documento ES la cuenta por cobrar** (como en P4b la compra es la CxP). Vender al crédito = usar un **método de pago "Crédito"** en el cobro: ese monto cubre el total para la emisión fiscal pero no es efectivo. El monto a cobrar de un documento = Σ de sus `documento_pagos` cuyo método es tipo `credito`. Los **cobros** (documento propio + aplicaciones) lo reducen; los saldos se calculan con una vista (sin cache). Se reutiliza la lógica pura de `lib/cxp`.

## Decisiones fijadas (de la sesión de brainstorming)

1. **Método "Crédito" en el cobro:** el cajero cubre el total combinando efectivo/tarjeta/… y "Crédito" por lo que queda a deber; exige un cliente registrado (no CONSUMIDOR FINAL). En el `CobroModal`, cuando un pago parcial no cubre el total, se ofrece un botón **"Dejar el restante a crédito (L. X)"** que convierte el restante en el pago de crédito.
2. **Arqueo:** el crédito otorgado aparece como línea del desglose por método en el cierre (informativa, NO suma al efectivo esperado). Los **cobros** recibidos en la sesión aparecen como un **ingreso separado** ("Cobros de CxC"), desglosado por método; los cobros en efectivo SÍ suman al efectivo esperado.
3. **Límite de crédito:** campo `limite_credito` por cliente (null = sin límite); un toggle de config `cxc_bloquear_limite` decide si exceder el límite **bloquea** la emisión o solo **avisa el excedente**.
4. **Cobros y caja:** un cobro en efectivo con caja abierta se liga a esa sesión (`sesion_id`) y entra al arqueo como ingreso separado; sin caja abierta queda sin sesión.
5. **Al crédito puede comprar cualquier cliente registrado** (no solo revendedores); no CONSUMIDOR FINAL.

## Modelo de datos

Migración P4c: `supabase/migrations/2026-08-09-pos-p4c-cuentas-por-cobrar.sql`.

### Cambios en tablas existentes

- **`clientes`** → `limite_credito numeric null` (null = sin límite).
- **`documentos`** → `fecha_vencimiento date null`. Se setea en el INSERT (dentro de `emitir_documento`) = fecha de emisión + `cliente.dias_credito` cuando el documento lleva algún pago de tipo `credito`; null si no hay crédito. Respeta la inmutabilidad (se fija al crear, no se edita después).
- **`metodos_pago`** → el check de `tipo` gana `'credito'`; seed idempotente de un método activo "Crédito" (`tipo='credito'`). El enum `MetodoPagoTipo` en `types/index.ts` gana `'credito'`.
- **Config:** clave `cxc_bloquear_limite` (`'true'`/`'false'`, default `'false'` = avisa, no bloquea).

### Tabla `cobros` (encabezado)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `numero` | text not null unique | `COBRO-00000001`, secuencia `cobro_numero_seq` |
| `cliente_id` | uuid not null fk → clientes | `on delete restrict` |
| `fecha` | date not null default current_date | |
| `monto` | numeric(12,2) not null check (> 0) | = Σ aplicaciones |
| `metodo` | text not null | `check in ('efectivo','transferencia','tarjeta','cheque','otro')` |
| `referencia` | text null | |
| `notas` | text null | |
| `sesion_id` | uuid null fk → sesiones_caja | `on delete set null`; la sesión de caja abierta al registrar (para el arqueo) |
| `usuario` | text null | |
| `created_at` | timestamptz default now() | |

### Tabla `cobro_aplicaciones`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `cobro_id` | uuid not null fk → cobros | `on delete cascade` |
| `documento_id` | uuid not null fk → documentos | `on delete restrict` |
| `monto` | numeric(12,2) not null check (> 0) | |

Índices en `cobro_aplicaciones (documento_id)` y `(cobro_id)`.

### Vista `documento_saldos`

Por cada documento no anulado con crédito:

```sql
create or replace view documento_saldos as
select
  d.id                                              as documento_id,
  d.cliente_id,
  d.tipo, d.correlativo, d.numero_comprobante,
  d.created_at::date                                as fecha,
  d.fecha_vencimiento,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) as credito_total,
  coalesce(max(ca.cobrado), 0)                      as cobrado,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) - coalesce(max(ca.cobrado), 0) as saldo
from documentos d
join documento_pagos dp on dp.documento_id = d.id
join metodos_pago m on m.id = dp.metodo_id
left join (
  select documento_id, sum(monto) as cobrado from cobro_aplicaciones group by documento_id
) ca on ca.documento_id = d.id
where d.estado <> 'anulado'
group by d.id, ca.cobrado
having coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) > 0;
```

(El `cobrado` se pre-agrega en una subconsulta para no multiplicar filas al unir `documento_pagos` con `cobro_aplicaciones`. La antigüedad usa `fecha_vencimiento`, calculada en JS con `hoyHonduras`. Columnas reales confirmadas en `schema.sql`: `documentos.estado in ('emitido','anulado')`, fecha de emisión = `created_at`, y `documentos.sesion_id` ya existe — el crédito otorgado del arqueo se calcula por `documentos.sesion_id`.)

### Secuencia y RLS

- `cobro_numero_seq` + `nextval_cobro()` (security definer, revoke/grant), patrón de P4b.
- RLS admin en `cobros` y `cobro_aplicaciones`; `grant select on documento_saldos to authenticated`.

## RPC

- **`nextval_cobro()`** — correlativo.
- **`registrar_cobro(p jsonb)`** — atómica, `security invoker`. Entrada `{ cliente_id, fecha, metodo, referencia, notas, sesion_id, usuario, aplicaciones: [{ documento_id, monto }] }`. **Agrupa las aplicaciones por documento** (suma), y por cada documento distinto: bloquea el documento (`for update`), valida que sea del `cliente_id`, no anulado, con crédito; calcula saldo real (`credito_total − Σ cobro_aplicaciones existentes`) y valida `monto <= saldo`; inserta el `cobro` (numero de `nextval_cobro`, monto = Σ) y las `cobro_aplicaciones` agregadas. Todo en la transacción.
- **`eliminar_cobro(p_cobro_id uuid)`** — borra el cobro (aplicaciones en cascada). El saldo se recalcula solo (la vista).

## Venta al crédito (POS) — cambios en la emisión y el cobro

- **`MetodoPagoTipo`** gana `'credito'`. El `CobroModal` muestra "Crédito" como método; y cuando el `restante > 0` y hay un cliente registrado seleccionado, ofrece **"Dejar el restante a crédito (L. X)"** que agrega un pago de crédito por el restante. `validarPagos` no cambia (el crédito suma como cualquier pago para cubrir el total; no es efectivo, así que la regla de "exceso solo en efectivo" lo excluye naturalmente).
- **Validación de cliente:** si hay un pago de crédito, el documento debe tener un cliente registrado (no CONSUMIDOR FINAL). Se valida en la Server Action `emitirVenta` y en la UI.
- **Límite de crédito:** en `emitirVenta`, si hay crédito y el cliente tiene `limite_credito`, se calcula `saldo actual del cliente (Σ saldo de sus documento_saldos) + credito_nuevo`; con `excedeLimite`. Según `cxc_bloquear_limite`: si `true` y excede → error `El cliente supera su límite de crédito.`; si `false` → se emite y el resultado incluye un aviso del excedente (mostrado en el `CobroModal`).
- **`emitir_documento` / `emitirVenta`:** al persistir el documento, se setea `fecha_vencimiento` = fecha + `cliente.dias_credito` cuando hay crédito. El pago de crédito se guarda en `documento_pagos` como cualquier pago (con `metodo_id` del método "Crédito"). El descuento de stock y el kardex no cambian (una venta al crédito igual entrega mercadería).

### Arqueo / cierre (aditivo)

- El desglose por método del cierre (`CierreModal` + el cálculo de `esperadoCaja`/`cerrarSesion`) gana:
  - Línea **"Crédito otorgado"** = Σ `documento_pagos` tipo `credito` de los documentos de la sesión. Informativa; **NO** suma al efectivo esperado.
  - Sección **"Cobros de CxC"** = los `cobros` con `sesion_id` de esta sesión, desglosados por `metodo`. Los cobros en **efectivo** SÍ suman al efectivo esperado (`esperadoCaja` los incluye); los otros son informativos.
- `esperadoCaja` (pura, `lib/pos/emision.ts`) se extiende para recibir los cobros en efectivo de la sesión y sumarlos al esperado; se mantiene su firma actual para las llamadas existentes (parámetro nuevo opcional).

## Server Actions (`app/admin/cuentas-por-cobrar/actions.ts`)

Tipo de resultado `type CxcResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.

- **`obtenerCxc()`** — `documento_saldos` con `saldo > 0` + nombre del cliente (traer clientes aparte y mapear por `cliente_id` — PostgREST no embebe sobre una vista, lección de P4b); deriva `dias_vencido`/`estado`/`bucket` en JS.
- **`registrarCobro(input)`** — modo abono / global auto (distribuye con `distribuirPago` sobre los documentos con saldo del cliente ordenados por vencimiento) / manual; resuelve `sesion_id` (la sesión de caja abierta si método efectivo) y llama `registrar_cobro`; `traducirError`.
- **`eliminarCobro(cobroId)`** — guard: si el cobro está ligado a una sesión **cerrada**, error `El cobro pertenece a una caja ya cerrada; no se puede eliminar.`; si no, `eliminar_cobro`.
- **`obtenerEstadoCuentaCliente(clienteId)`** — documentos con saldo + cobros + total adeudado.
- **`obtenerCobros()`** — historial con aplicaciones.
- **Guard en `anularDocumento`** (en `app/admin/pos/actions.ts`): antes de anular, contar `cobro_aplicaciones` del documento; si > 0, error `El documento tiene cobros registrados. Elimínalos antes de anular.`

Frontera de confianza: la acción arma/valida y la RPC revalida contra el saldo real releído.

## UI, rutas y componentes

- **`/admin/cuentas-por-cobrar`** — `CuentasPorCobrarClient`: resumen de antigüedad, lista con badges de estado, filtros por cliente/estado, acción "Cobrar" (→ `CobroModal` abono) y "Nuevo cobro" (global).
- **`CobroModal`** — simétrico al `PagoModal` de P4b (abono/global auto/manual, rechaza montos negativos); campos `fecha`/`metodo`/`referencia`/`notas`; muestra la caja ligada si el método es efectivo. Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado`.
- **`/admin/cuentas-por-cobrar/cobros`** — `CobrosClient`: historial con aplicaciones y eliminar (respeta el guard de sesión cerrada).
- **`/admin/cuentas-por-cobrar/cliente/[id]`** — `EstadoCuentaClienteView` + `HojaEstadoCuentaCliente` (imprimible, patrón HTML + CSS de impresión, `.btnToolbar`, `@media print`).
- **POS `CobroModal`** (`app/admin/pos/components/CobroModal.tsx`): botón "Dejar el restante a crédito" + validación de cliente + aviso de excedente de límite.
- **POS `CierreModal`**: nuevas líneas de crédito otorgado y cobros por método.
- Link **"Cuentas por cobrar"** en el sidebar. Config: campo `limite_credito` en el alta/edición de cliente (`ClientesClient`) y el toggle `cxc_bloquear_limite` en `PosSection`/configuración.

Español; Lempiras con `formatPrice`; CSS Modules con tokens Merlin.

## Antigüedad (aging)

Cada documento con saldo se ubica en un bucket por `dias_vencido = hoyHonduras − fecha_vencimiento`: **Por vencer** (≤ 0), **1-30 / 31-60 / 61-90 / +90**. El resumen suma saldos por bucket. Reutiliza `bucketAntiguedad`/`estadoPago` de `lib/cxp`.

## Lógica pura y pruebas

- Se **reutiliza** `lib/cxp/cxp.ts` (`bucketAntiguedad`, `estadoPago`, `distribuirPago`) para CxC — genéricas.
- Nueva función pura `excedeLimite(saldoActual: number, creditoNuevo: number, limite: number | null): { excede: boolean; excedente: number }` en `lib/cxp/cxp.ts` (o `lib/cxc/`), con tests: `limite` null → nunca excede; excede si `saldoActual + creditoNuevo > limite`, `excedente = max(0, saldoActual + creditoNuevo − limite)`.

## Manejo de errores

- **Emisión al crédito:** exige cliente registrado; valida límite (bloquea o avisa según config).
- **Registrar cobro:** la RPC valida cada documento ≤ saldo (agrupado); atómica.
- **Eliminar cobro:** guard de sesión cerrada.
- **Anular documento:** bloqueado si tiene cobros.
- **Arqueo:** el crédito no infla el efectivo esperado; los cobros efectivo sí, mostrados aparte.

## Entrega

- Una migración P4c (tablas `cobros`/`cobro_aplicaciones` + vista `documento_saldos` + `clientes.limite_credito` + `documentos.fecha_vencimiento` + tipo `credito` en `metodos_pago` con seed + config + secuencia + RPCs + RLS), **idempotente**, aplicada por el usuario **antes** del push. Smoke SQL corto (`supabase/smoke-pos-p4c.sql`) con `to_regprocedure`.
- `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes; verificación visual tras aplicar la migración (venta con restante a crédito, límite bloquea/avisa, crédito y cobros en el arqueo, cobrar un documento, antigüedad, estado de cuenta imprimible, anular bloqueado con cobros).
- Commits en español. Merge a `main` (fast-forward) tras confirmación → deploy; verificar READY por SHA.

## Fuera de alcance (P4c)

- Intereses/mora por atraso.
- Anticipos/adelantos de clientes sin documento (saldo a favor).
- Venta al crédito desde la tienda web (solo POS).
- Notas de crédito/devoluciones (P5).
- **P4d (inventario físico)**.
- Recordatorios automáticos de vencimiento (candidato a P6 dashboard).
