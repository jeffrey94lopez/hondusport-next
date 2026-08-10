# POS P6.1 — Dashboard segmentado — Diseño

**Fecha:** 2026-08-10
**Serie:** POS Honduras, iteración de P6 (el dashboard base ya está desplegado en `main`).
**Estado:** aprobado para plan.

## Objetivo

Segmentar los KPIs del dashboard (`/admin`) en cards por tema con sub-métricas
(Ventas/Costo/Utilidad, Documentos, Cotizaciones, CxC, CxP, Ítems), arreglar dos
bugs de layout (cards que no se adaptan al ancho; "Últimos documentos"
desalineada y demasiado ancha), y extender la capa de agregación de P6 con las
métricas nuevas. Todo **solo lectura**.

## Alcance

**Dentro:** nuevas sub-métricas (costo de ventas, utilidad neta, conteo por tipo
de documento, estados de cotización, CxC/CxP por rango + acumulado, productos
nuevos), reestructura de la UI de KPIs a cards de segmento, fixes de layout,
extensión de `dashboard_resumen` + `lib/dashboard/` puro.

**Fuera:** los 5 reportes de P7; el resto de la cola de Ps. No se toca la lógica
de ventas/stock/caja (solo lectura). No se cambia el filtro de fechas ni los 3
gráficos existentes (ventas/día, top ítems, top clientes) — se conservan.

## Principios

- **Solo lectura.** Ninguna escritura; las funciones SQL solo agregan.
- **Ventas sin ISV.** El KPI de ventas para el cálculo de utilidad usa la **base
  sin ISV** (el ISV cobrado no es ingreso, se entrega al SAR). La etiqueta dice
  explícitamente "sin ISV". `Utilidad Neta = Ventas (sin ISV) − Costo de Ventas`.
- **Costo al momento de la venta.** El costo de ventas sale del kardex
  (`movimientos_inventario.costo_resultante` de los movimientos `venta_pos`), no
  del costo actual del producto.
- **Rango vs snapshot.** Las métricas de flujo (ventas, costo, utilidad,
  documentos, cotizaciones creadas, crédito nuevo, cobrado/pagado, productos
  nuevos) siguen el filtro de fechas global. Los **acumulados** de CxC/CxP y el
  **stock bajo** son snapshot (no dependen del rango).
- **Fechas ancladas a Honduras** (igual que P6): bordes en TS puro; el SQL
  recupera el día local con `at time zone 'America/Tegucigalpa'`.

---

## 1. KPIs segmentados (cards de segmento)

Se reemplazan las dos filas planas actuales de P6 ("En el rango" / "Ahora
mismo") por **cards por tema**, cada una con un título y 2–3 sub-métricas
(valor + etiqueta). Todas responden al filtro salvo lo marcado *(snapshot)*.

- **💵 Ventas** *(rango)*: **Ventas (sin ISV)** · **Costo de Ventas** ·
  **Utilidad Neta** (+ margen % opcional como texto secundario).
- **📄 Documentos** *(rango)*: **Total** · **Facturas** · **Comprobantes**.
- **📝 Cotizaciones** *(rango, por `created_at`)*: **Abiertas** · **Ganadas** ·
  **Perdidas** (conteo por `cotizacion_etapas.tipo` de las cotizaciones creadas
  en el rango).
- **📈 Cuentas por Cobrar**: **Crédito nuevo** *(rango)* · **Cobrado** *(rango)*
  · **Acumulado** *(snapshot)*.
- **🧾 Cuentas por Pagar**: **Crédito nuevo** *(rango)* · **Pagado** *(rango)* ·
  **Acumulado** *(snapshot)*.
- **📦 Ítems**: **Stock bajo** *(snapshot, < 5)* · **Ítems nuevos** *(rango:
  productos + variantes creados)*.

Montos con `formatPrice`. Alertas suaves (borde) en Stock bajo > 0 y, si se
desea, Utilidad Neta < 0. Cada sub-métrica de flujo se lee del `DashboardResumen`
extendido; los snapshots igual que P6.

## 2. Layout / UX

- **Cards adaptables al ancho:** el contenedor de las cards de segmento usa un
  grid fluido `repeat(auto-fit, minmax(240px, 1fr))` (llena el ancho disponible,
  sin huecos en pantallas anchas ni desbordes en angostas). Cada card de segmento
  distribuye sus 2–3 sub-métricas en una fila interna que baja a columna en
  ancho reducido.
- **"Últimos documentos" alineada y más estrecha:** hoy son filas flex con
  anchos flojos → las columnas bailan. Se pasa a **CSS grid con columnas fijas**
  (`grid-template-columns` para número · cliente · total · tipo · hora; número/
  total/tipo/hora con ancho fijo, cliente flexible), y la card recibe un
  **`max-width`** (≈ 560px) para que sea angosta; se mantiene full-width del
  contenedor hasta ese tope, alineada a la izquierda.

## 3. Capa de datos

### 3.1 `dashboard_resumen` extendida (migración `2026-08-10-pos-p6-1-dashboard-segmentado.sql`)

`create or replace function dashboard_resumen(p_desde timestamptz, p_hasta
timestamptz)` — se **agregan** columnas al `returns table` de P6 (se conservan
las existentes: `ventas_netas, num_documentos, pedidos_web,
pedidos_sin_procesar, cxc_pendiente, cxp_pendiente, cotizaciones_abiertas,
cotizaciones_monto`). Nuevas columnas:

- `ventas_sin_isv numeric` — Σ `documento_items.base` (neto: venta − NC/
  devolución) de documentos de venta no anulados en el rango. (`base` es la base
  por línea antes de ISV.)
- `costo_ventas numeric` — del kardex, en el rango (`movimientos_inventario`
  filtrado por `created_at`):
  `Σ costo_resultante × (−cantidad)` para `tipo = 'venta_pos'`
  **menos** `Σ costo_resultante × cantidad` para `tipo = 'devolucion'` cuyas
  `referencia` correspondan a una devolución de VENTA (empieza con `'documento:'`
  o `'nota_credito:'`; NO las devoluciones de anulación de compra, cuya
  `referencia` es el número de compra). El plan verifica los formatos de
  `referencia` contra la migración P5a.
  > `venta_pos.cantidad` es negativa (salida) → `−cantidad` positiva = unidades
  > vendidas. Ítems libres / stock null no generan `venta_pos`, así que su costo
  > no entra (aproximación aceptada: aportan venta, no costo de inventario).
- `facturas integer` / `comprobantes integer` — conteo de documentos no anulados
  en el rango por `tipo = 'factura'` y `tipo = 'comprobante'`.
- `cotizaciones_ganadas integer` / `cotizaciones_perdidas integer` — conteo de
  `cotizaciones` con `created_at` en el rango, `join cotizacion_etapas` por
  `tipo = 'ganada'` / `'perdida'`. (`cotizaciones_abiertas`, ya existente de P6,
  pasa a contar también **por creadas en el rango** con `tipo='abierta'`, para
  ser coherente con las otras dos — reemplaza el snapshot de P6.)
- `cxc_nuevo numeric` — Σ `credito_total` de `documento_saldos` cuyos documentos
  tienen `fecha` (día local del `created_at`) en el rango (crédito otorgado en
  el rango).
- `cxc_cobrado numeric` — Σ `cobros.monto` con `cobros.fecha` en el rango (día
  local).
- `cxp_nuevo numeric` — Σ del total al crédito de `compra_saldos` de compras al
  crédito con `fecha` en el rango. El plan verifica la columna que marca "al
  crédito" en `compras`.
- `cxp_pagado numeric` — Σ `pagos_proveedor.monto` con `fecha` en el rango.
- `productos_nuevos integer` — conteo de `productos` con `created_at` en el rango
  **más** `producto_variantes` con `created_at` en el rango. El plan verifica que
  `producto_variantes` tenga `created_at`; si no, cuenta solo `productos`.

Los acumulados `cxc_pendiente`/`cxp_pendiente` (snapshot, ya en P6) se conservan
y se rotulan "Acumulado". `stock_bajo` sigue calculándose en el server helper
con `stockEfectivo` (P6), sin cambio.

Filtro de fechas para tablas con `fecha date` (cobros, pagos, documento_saldos,
compras): comparar contra el **día local** — `fecha >= (p_desde at time zone
'America/Tegucigalpa')::date and fecha < (p_hasta at time zone
'America/Tegucigalpa')::date`. Para `movimientos_inventario` (sin `fecha`),
filtrar por `created_at >= p_desde and < p_hasta` (igual que P6).

`security invoker`, `set search_path = public`, `revoke ... from public, anon` +
`grant ... to authenticated`. Smoke: `to_regprocedure` de la firma + llamada de
ejemplo sin error (extiende/actualiza `supabase/smoke-p6-dashboard.sql`).

### 3.2 Lógica pura `lib/dashboard/metricas.ts` (extender, con tests)

- `utilidadNeta(ventasSinIsv: number, costoVentas: number): number` → resta,
  `round2`.
- `margen(ventasSinIsv: number, utilidad: number): number` → `ventasSinIsv > 0 ?
  round2(utilidad / ventasSinIsv * 100) : 0` (para el % opcional).

### 3.3 Tipos (`types/index.ts`)

Extender `DashboardResumen` con: `ventas_sin_isv, costo_ventas, facturas,
comprobantes, cotizaciones_ganadas, cotizaciones_perdidas, cxc_nuevo,
cxc_cobrado, cxp_nuevo, cxp_pagado, productos_nuevos` (todas number/integer).

### 3.4 Server helper (`app/admin/dashboard-data.ts`)

`obtenerDashboardData` ya llama `dashboard_resumen`; al agregarse columnas, solo
se castean a `Number(...)` los nuevos campos numéricos (mismo patrón defensivo de
P6). `stock_bajo` sin cambio. No se agregan RPC nuevas (todo va en
`dashboard_resumen`).

## 4. Archivos

- `supabase/migrations/2026-08-10-pos-p6-1-dashboard-segmentado.sql` (recrea
  `dashboard_resumen` con las columnas nuevas). Actualiza
  `supabase/smoke-p6-dashboard.sql` (o crea `smoke-p6-1-...sql`).
- `types/index.ts` (extender `DashboardResumen`).
- `lib/dashboard/metricas.ts` + `lib/dashboard/tests/metricas.test.ts` (utilidad,
  margen).
- `app/admin/dashboard-data.ts` (cast de los campos nuevos).
- `app/admin/page.tsx` (reestructura de KPIs a cards de segmento) +
  `app/admin/dashboard.module.css` (grid fluido de segmentos + fix de "Últimos
  documentos" a grid con columnas fijas y `max-width`). Posible componente
  `app/admin/KpiSegmento.tsx` (card de segmento con título + sub-métricas) para
  mantener `page.tsx` legible.

## 5. Restricciones globales

- Idioma español; Lempiras con `formatPrice()`.
- **Solo lectura**; ninguna escritura a documentos/movimientos/stock/caja/cobros/
  pagos.
- Migración idempotente (`create or replace function`), aplicada por el usuario
  antes del push; smoke con `to_regprocedure`.
- Fechas ancladas a hora Honduras; `at time zone 'America/Tegucigalpa'` para el
  día local; rango semiabierto `>= desde and < hasta`.
- CSS Modules con tokens Merlin; gráficos existentes sin cambios; iconos dorados
  (regla `.iconoMerlin` de P6).
- Cliente de Supabase de servidor para las RPC. `SUPABASE_SERVICE_ROLE_KEY` nunca
  al cliente.
- La capa extendida queda disponible para que **P7 (Reportes)** la reuse.

## 6. Verificación

- `npm test` (incluye `lib/dashboard/`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Smoke SQL: `dashboard_resumen` con la firma nueva presente; llamada de ejemplo
  sin error.
- **Visual (tras aplicar la migración):** cards de segmento se adaptan al ancho
  (probar pantalla ancha y angosta); Ventas/Costo/Utilidad cuadran
  (Ventas − Costo = Utilidad) con el "sin ISV" visible; Documentos = Facturas +
  Comprobantes; Cotizaciones por estado; CxC/CxP con crédito nuevo + cobrado/
  pagado del rango + acumulado snapshot; Ítems (stock bajo + nuevos); "Últimos
  documentos" con columnas alineadas y card angosta.

## Fuera de alcance

Los 5 reportes de P7 (incl. libro SAR y ganancias por ítem detallado); export
CSV; valorización de inventario; cambios al filtro de fechas o a los 3 gráficos
de P6.
