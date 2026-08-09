# POS P4b — Cuentas por Pagar (CxP) — Diseño

**Fecha:** 2026-08-08
**Serie:** POS Honduras, sub-proyecto **P4b** (segundo pedazo de P4). P1, P2, P2.1, P3 y **P4a (compras/proveedores)** están desplegados.
**Objetivo:** Registrar y controlar las deudas con proveedores derivadas de las compras al crédito: pagos (abonos por compra y pagos globales distribuidos), saldos pendientes, estado de cuenta por proveedor y antigüedad de saldos.

## Contexto (qué dejó P4a)

Cada `compras` guarda `condicion_pago` (`contado`/`credito`), `dias_credito`, `fecha`, `fecha_vencimiento`, `total` (en Lempiras, ya convertido si fue USD), `estado` (`borrador`/`ordenada`/`parcial`/`recibida`/`anulada`) y `proveedor_id` (→ `clientes` con `es_proveedor=true`). Una CxP es, naturalmente, una compra al crédito con saldo pendiente. El proveedor es un contacto unificado. `hoyHonduras(instante)` (en `lib/cotizaciones/cotizaciones.ts`) da la fecha local de Honduras (UTC-6) para el vencimiento/antigüedad.

## Principio rector

Un **pago** es un documento que se **aplica a una o varias compras** (aplicaciones). Esto cubre los dos modos elegidos: un *abono* es un pago con una sola aplicación a una compra; un *pago global distribuido* es un pago con varias aplicaciones (más-antigua-primero o selección manual). Los saldos **no se cachean**: se calculan con una vista (`total − Σ aplicaciones`). Los pagos **no tocan la caja del POS** (se pagan desde banco/fondos generales). Todo en Lempiras (el saldo ya vive en L. porque `compra.total` se guardó convertido).

## Decisiones fijadas (de la sesión de brainstorming)

1. **Ambos modos de pago:** abono a una compra puntual Y pago global a un proveedor que se distribuye entre sus compras pendientes. Modelo único: pago (encabezado) + aplicaciones (por compra).
2. **Independiente de la caja:** los pagos se registran en el libro de CxP con `metodo` (efectivo/transferencia/cheque/otro) + referencia; NO afectan la sesión de caja ni el arqueo del POS.
3. **Saldos calculados, no cacheados:** una vista `compra_saldos` expone `total`/`pagado`/`saldo`/`dias_vencido` por compra al crédito.
4. **Guard de anulación:** una compra con pagos aplicados no se puede anular (P4b agrega el guard a la acción `anularCompra` de P4a).

## Modelo de datos

Migración P4b: `supabase/migrations/2026-08-08-pos-p4b-cuentas-por-pagar.sql`.

### Tabla `pagos_proveedor` (encabezado)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `numero` | text not null unique | Formato `PAGO-00000001`, secuencia `pago_numero_seq` |
| `proveedor_id` | uuid not null fk → clientes | `on delete restrict`; debe ser `es_proveedor=true` |
| `fecha` | date not null default current_date | |
| `monto` | numeric(12,2) not null check (> 0) | Total del pago; **= suma de aplicaciones** (validado en la RPC) |
| `metodo` | text not null | `check in ('efectivo','transferencia','cheque','otro')` |
| `referencia` | text null | Nro de cheque/transferencia |
| `notas` | text null | |
| `usuario` | text null | |
| `created_at` | timestamptz default now() | |

### Tabla `pago_aplicaciones` (aplicaciones a compras)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `pago_id` | uuid not null fk → pagos_proveedor | `on delete cascade` |
| `compra_id` | uuid not null fk → compras | `on delete restrict` |
| `monto` | numeric(12,2) not null check (> 0) | Aplicado a esa compra |

Índice en `pago_aplicaciones (compra_id)` para el cálculo de saldo.

### Vista `compra_saldos`

Por cada compra al crédito no anulada:

```sql
create or replace view compra_saldos as
select
  c.id                         as compra_id,
  c.proveedor_id,
  c.numero,
  c.fecha,
  c.fecha_vencimiento,
  c.total,
  coalesce(sum(a.monto), 0)    as pagado,
  c.total - coalesce(sum(a.monto), 0) as saldo
from compras c
left join pago_aplicaciones a on a.compra_id = c.id
where c.condicion_pago = 'credito' and c.estado <> 'anulada'
group by c.id;
```

(`dias_vencido` se calcula en JS con `hoyHonduras`, no en la vista, para no depender de la zona horaria del servidor de BD.)

### Secuencia y RLS

- `create sequence if not exists pago_numero_seq;` + función `nextval_pago()` (security definer, revoke public/anon, grant authenticated) — mismo patrón que `nextval_compra` de P4a.
- RLS admin en las 2 tablas nuevas; la vista hereda los permisos de sus tablas base (o se le da `grant select ... to authenticated`).

## RPC

- **`nextval_pago()`** — correlativo.
- **`registrar_pago_proveedor(p jsonb)`** — atómica, `security invoker`. Entrada: `{ proveedor_id, fecha, metodo, referencia, notas, usuario, aplicaciones: [{ compra_id, monto }] }`. Lógica:
  1. Valida `aplicaciones` no vacío y todos los `monto > 0`.
  2. Por cada aplicación: bloquea la compra (`for update`); valida que sea del `proveedor_id`, `condicion_pago='credito'`, `estado <> 'anulada'`; calcula su saldo actual (`total − Σ aplicaciones existentes`) y valida `monto <= saldo` (sino error `El abono excede el saldo de la compra`).
  3. Inserta `pagos_proveedor` con `numero = nextval_pago`, `monto = Σ aplicaciones`, y las filas de `pago_aplicaciones`.
  4. Retorna el id del pago. Todo en la transacción — falla completa si algo revienta.
- **`eliminar_pago_proveedor(p_pago_id uuid)`** — borra el pago (aplicaciones en cascada). Sin stock/costo; el saldo se recalcula solo (la vista). `security invoker`.

Frontera de confianza: la Server Action recalcula/valida las aplicaciones antes de llamar la RPC, y la RPC vuelve a validar contra el saldo real releído — nunca se confía en los montos del cliente.

## Server Actions (`app/admin/cuentas-por-pagar/actions.ts`)

Tipo de resultado: `type CxpResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }`.

- **`registrarPago(input: RegistrarPagoInput)`** — arma las aplicaciones y llama `registrar_pago_proveedor`. En **modo abono** una sola aplicación (compra + monto). En **modo global** recibe `proveedorId` + `monto` + `modo` (`auto`/`manual`): si `auto`, releé las compras con saldo del proveedor (ordenadas por `fecha_vencimiento` asc) y arma las aplicaciones con `distribuirPago` (más-antigua-primero); si `manual`, usa las aplicaciones que manda el cliente (revalidadas por la RPC).
- **`eliminarPago(pagoId: string)`** — llama `eliminar_pago_proveedor`.
- **`obtenerCxp(filtros)`** — lista de `compra_saldos` con `saldo > 0` (join a `clientes` para el nombre del proveedor), filtrable por proveedor/estado; y el `dias_vencido`/estado/bucket se derivan en JS.
- **`obtenerEstadoCuenta(proveedorId)`** — compras al crédito del proveedor (con saldo) + sus pagos, para el estado de cuenta.
- **`obtenerPagos()`** — historial de pagos con sus aplicaciones (para `PagosClient`).
- **Guard en P4a:** la acción `anularCompra` (en `app/admin/compras/actions.ts`) gana un guard: antes de anular, contar `pago_aplicaciones` de esa compra; si > 0, devolver error `La compra tiene pagos registrados. Elimínalos antes de anular.`

## UI, rutas y componentes

- **`/admin/cuentas-por-pagar`** — `CuentasPorPagarClient`: (1) **resumen de antigüedad** con los buckets *Por vencer / 1-30 / 31-60 / 61-90 / +90 días* y el saldo total de cada uno; (2) **lista** de compras con `saldo > 0` (número, proveedor, total, pagado, saldo, vencimiento, estado *pendiente/parcial/vencida* con badge por color), filtro por proveedor y estado; (3) acción por fila **"Abonar"** → `PagoModal` (modo abono, compra prellenada, monto default = saldo, máx = saldo); (4) botón **"Nuevo pago"** → `PagoModal` (modo global).
- **`PagoModal`** — registra un pago: campos `fecha`, `metodo` (select), `referencia`, `notas`. En **modo abono**: compra fija + monto (≤ saldo). En **modo global**: select de proveedor, monto total, y un toggle *Distribuir automáticamente (más antigua primero)* / *Elegir compras*; en manual muestra las compras pendientes del proveedor con su saldo e inputs de monto; valida en vivo que Σ = monto y cada ≤ saldo. Dinero con `type="text" inputMode="decimal"` + `parseMoneyInput`/`valorMostrado`.
- **`/admin/cuentas-por-pagar/pagos`** — `PagosClient`: historial de `pagos_proveedor` (número, proveedor, fecha, monto, método, referencia) con sus aplicaciones expandibles y acción **Eliminar** (con confirmación; restaura saldo).
- **`/admin/cuentas-por-pagar/proveedor/[id]`** — `EstadoCuentaProveedor`: compras al crédito del proveedor con saldo + sus pagos + total adeudado; botón *Imprimir* que abre `HojaEstadoCuenta` (hoja imprimible, patrón HTML + CSS de impresión como `DocumentoHoja`, barra con `.btnToolbar`, `@media print`).
- **`CompraCxpBlock`** — en el editor de compra de P4a (`CompraEditor`), un bloque de **solo lectura** que muestra saldo y pagos de la compra cuando es al crédito (llama `obtenerEstadoCuenta` o una consulta puntual del saldo de esa compra). No agrega acciones de pago ahí (el pago se hace desde el tablero de CxP).
- Link **"Cuentas por pagar"** en el sidebar.

Dinero con `formatPrice`; CSS Modules con tokens Merlin (botones `btnMerlin*` con clase de módulo).

## Antigüedad (aging)

Cada compra con saldo se ubica en un bucket según `dias_vencido = hoyHonduras − fecha_vencimiento`:
- **Por vencer:** `dias_vencido <= 0`.
- **1-30 / 31-60 / 61-90 / +90:** por rangos de días vencidos.

El resumen suma los saldos por bucket (y opcionalmente por proveedor). Función pura `bucketAntiguedad(fechaVencimiento, hoy)`.

## Lógica pura y pruebas

Nuevo módulo `lib/cxp/` con tests en `lib/cxp/tests/`:
- `saldoCompra(total: number, pagado: number): number` → `round2(total − pagado)`.
- `estadoPago(total: number, pagado: number, fechaVencimiento: Date, hoy: Date): 'pagada'|'parcial'|'pendiente'|'vencida'` (pagada si saldo ≤ 0; vencida si saldo > 0 y hoy > vencimiento; parcial si pagado > 0; pendiente si no).
- `bucketAntiguedad(fechaVencimiento: Date, hoy: Date): 'por_vencer'|'d1_30'|'d31_60'|'d61_90'|'d90_mas'`.
- `distribuirPago(monto: number, comprasConSaldo: { compra_id: string; saldo: number }[]): { aplicaciones: { compra_id: string; monto: number }[]; remanente: number }` — asigna más-antigua-primero (el orden lo da el llamador) hasta agotar `monto`; nunca aplica más que el saldo de cada compra; `remanente` = lo que sobra si `monto` supera el total adeudado.
- Reutiliza `hoyHonduras` de `lib/cotizaciones/cotizaciones` (candidato futuro a mover a un `lib/fecha` compartido si un tercer módulo lo necesita).

## Manejo de errores

- **Registrar pago:** la RPC valida cada aplicación ≤ saldo real releído, Σ = monto, compra al crédito y no anulada; atómica. `distribuirPago` no sobre-paga (topa al saldo). En modo global auto, si `monto` supera el total adeudado del proveedor, se aplica hasta agotar deudas y se avisa del remanente (o se rechaza — se rechaza para no dejar dinero "sin aplicar": error `El monto supera el total adeudado del proveedor.`).
- **Eliminar pago:** restaura saldo (la vista recalcula); confirmación en UI.
- **Anular compra:** bloqueada si tiene pagos (guard en `anularCompra`).
- **Proveedor:** el pago exige un proveedor con `es_proveedor=true` (validado en la RPC vía las compras).

## Entrega

- Una migración P4b (tablas `pagos_proveedor`/`pago_aplicaciones` + vista `compra_saldos` + secuencia + `nextval_pago` + `registrar_pago_proveedor` + `eliminar_pago_proveedor` + RLS), **idempotente**, aplicada por el usuario en el SQL Editor **antes** del push. Smoke SQL corto (`supabase/smoke-pos-p4b.sql`) que verifica estructura, vista y funciones **con `to_regprocedure`** (no `to_regproc`) — lección de P4a.
- `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` verdes; verificación visual tras aplicar la migración (registrar un abono a una compra al crédito, un pago global distribuido, ver antigüedad, estado de cuenta imprimible, eliminar un pago, y el guard de anular una compra con pagos).
- Commits en español, formato convencional. Merge a `main` (fast-forward) tras confirmación del usuario → deploy automático en Vercel; verificar READY por SHA.

## Fuera de alcance (P4b)

- Integración con la caja del POS / arqueo.
- Anticipos/adelantos a proveedores sin compra asociada (crédito a favor).
- Notas de débito/crédito de proveedor; retenciones fiscales.
- Multimoneda en el pago (el saldo ya vive en Lempiras).
- **CxC (P4c)** y **Inventario físico (P4d)**.
- Recordatorios/alertas automáticas de vencimiento (candidato a P6 dashboard).
