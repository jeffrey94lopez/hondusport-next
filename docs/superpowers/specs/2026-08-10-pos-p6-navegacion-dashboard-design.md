# POS P6 — Navegación + Dashboard — Diseño

**Fecha:** 2026-08-10
**Serie:** POS Honduras, sub-proyecto P6 (parte 1 de lo que era "P6 dashboard + libro SAR"; los Reportes se separan a P7).
**Estado:** aprobado para plan.

## Objetivo

Reorganizar la navegación completa del admin y reconstruir el dashboard con
KPIs reales (POS + web + CxC/CxP + cotizaciones + inventario), gráficos y un
filtro global de fechas. Todo **solo lectura**. Se construye además la **capa de
agregación** (SQL + lógica pura) que P7 (Reportes) reusará.

## Alcance

**Dentro:** rediseño del `Sidebar` (5 grupos + fixes de colapso e iconos),
fix de navegación del documento (no tapar el menú), dashboard nuevo en `/admin`
con filtro de fechas/gráficos/KPIs, capa de agregación (funciones SQL de solo
lectura + `lib/dashboard/` pura), regla Merlin de iconos dorados.

**Fuera (otros P):** los 5 reportes (P7 — SAR, ventas detallado, clientes/
proveedores, ganancias por ítem, CxC en cascada); el barrido app-wide de iconos
emoji→dorado en POS/tienda/resto (P de diseño); el rediseño rico y navegable del
documento con clics a cliente/producto y card de pagos (P8). Cierre de venta por
WhatsApp (P) y cards de tienda estilo POS (P) siguen pendientes.

## Principios

- **Solo lectura.** P6 no escribe ventas, stock ni movimientos. Las funciones
  SQL son de agregación (`select`), sin efectos.
- **Ventas = documento fiscal.** La venta la manda el documento POS emitido
  (`factura` + `comprobante`, `estado ≠ anulado`), **neto** de `nota_credito` +
  `devolucion`. Los pedidos web son un pipeline operativo aparte (no se suman al
  monto de ventas, para no duplicar el pedido web que luego se factura).
- **Fechas en hora Honduras.** Los bordes del rango se calculan en TS puro y
  testeado (reusando `hoyHonduras`), nunca con el día UTC crudo (ya nos mordió).
- **Agregación en SQL.** `group by día`, `sum`, `top N` viven en funciones SQL,
  no en JS sobre miles de filas traídas al server.

---

## 1. Capa de datos (compartida con P7)

### 1.1 Funciones SQL de agregación (solo lectura)

Migración `2026-08-10-pos-p6-dashboard.sql`. Todas `security invoker`,
`revoke execute from public, anon` + `grant execute to authenticated`, con
`set search_path = public`. Reciben rango `p_desde timestamptz, p_hasta
timestamptz` (bordes ya calculados en TS, en hora Honduras).

Definición de **venta neta** reutilizada por todas: sobre `documentos` con
`created_at >= p_desde and created_at < p_hasta`, sumar `total` de
`tipo in ('factura','comprobante') and estado <> 'anulado'` y **restar** `total`
de `tipo in ('nota_credito','devolucion') and estado <> 'anulado'`.

- **`dashboard_resumen(p_desde, p_hasta)`** → una fila con:
  - `ventas_netas numeric` — venta neta del rango (definición de arriba).
  - `num_documentos integer` — conteo de `factura`+`comprobante` no anulados en
    el rango (las NC/devoluciones no cuentan como documentos de venta).
  - `pedidos_web integer` — conteo de `pedidos` con `created_at` en el rango.
  - `pedidos_sin_procesar integer` — conteo de `pedidos` con `estado='recibido'`
    (snapshot, **sin** filtro de rango — es una cola operativa actual).
  - `cxc_pendiente numeric` — Σ `saldo` de `documento_saldos` con `saldo > 0`
    (snapshot actual, sin rango).
  - `cxp_pendiente numeric` — Σ `saldo` de `compra_saldos` con `saldo > 0`
    (snapshot actual).
  - `cotizaciones_abiertas integer` + `cotizaciones_monto numeric` — cotizaciones
    en etapa de tipo `abierta` (snapshot; `join cotizacion_etapas` por
    `tipo='abierta'`).

  El KPI de **stock bajo NO va en esta función**: se calcula en el server action
  reusando `stockEfectivo` (`lib/store/variantes`) sobre los productos activos,
  exactamente como lo hace hoy `app/admin/page.tsx` (evita replicar la lógica de
  stock efectivo padre/variante en SQL). Es un snapshot, no depende del rango.

  > Los campos "snapshot" (sin rango) se devuelven en la misma fila por
  > conveniencia de una sola llamada; el server action los rotula como "ahora
  > mismo" en la UI, separados de los del rango.

- **`dashboard_ventas_por_dia(p_desde, p_hasta)`** → filas `(dia date, ventas
  numeric)`, una por día con venta neta > 0 (o todos los días del rango con
  `generate_series` y `coalesce(...,0)` para que la línea no tenga huecos —
  usar `generate_series` sobre `p_desde::date .. (p_hasta - interval '1 day')
  ::date` en zona Honduras y left join a las ventas del día).

- **`dashboard_top_items(p_desde, p_hasta, p_limite integer)`** → top ítems por
  el rango, sobre `documento_items` de documentos de venta no anulados (netos:
  las líneas de NC/devolución restan). Devuelve `(producto_id uuid,
  variante_id uuid, nombre text, cantidad numeric, monto numeric)`. La UI
  ordena por `monto` o `cantidad` según el toggle; la función devuelve ambas
  métricas y ordena por `monto desc` por defecto, con `limit p_limite`.

- **`dashboard_top_clientes(p_desde, p_hasta, p_limite integer)`** → top clientes
  por el rango. Devuelve `(cliente_id uuid, nombre text, num_compras integer,
  monto numeric)`. **Excluye** documentos sin `cliente_id` (CONSUMIDOR FINAL).
  Netos por cliente (NC/devoluciones restan). Ordena por `monto desc`,
  `limit p_limite`.

Smoke `supabase/smoke-p6-dashboard.sql`: verifica con `to_regprocedure` que las
4 funciones existen con su firma, y que una llamada de ejemplo no lanza error.

### 1.2 Lógica pura `lib/dashboard/rango.ts` (con tests)

- **`type PresetRango = 'hoy' | 'semana' | 'mes' | 'anio' | 'personalizado'`**.
- **`rangoDesdePreset(preset, hoy: Date, desde?: string, hasta?: string):
  { desde: string; hasta: string }`** — devuelve los bordes ISO (timestamptz)
  del rango en hora Honduras (UTC-6). `semana` = lunes 00:00 de la semana en
  curso → inicio del día siguiente a hoy (exclusivo). `hoy` = hoy 00:00 → mañana
  00:00. `mes` = día 1 del mes → mañana. `anio` = 1 de enero → mañana.
  `personalizado` = `desde` 00:00 → `hasta` +1 día 00:00 (inclusivo del día
  hasta). Todos los bordes se anclan restando el offset de Honduras, no con el
  día UTC. Reusa/extiende el helper `hoyHonduras` existente.
- **`etiquetaRango(preset, desde, hasta): string`** — texto legible ("Semana en
  curso", "1–10 ago 2026", …).

### 1.3 Lógica pura `lib/dashboard/metricas.ts` (con tests)

- **`ticketPromedio(ventasNetas: number, numDocumentos: number): number`** —
  `numDocumentos > 0 ? ventasNetas / numDocumentos : 0`, `round2`.
- **`ordenarPor<T>(filas: T[], metrica: 'monto' | 'cantidad', campos):
  T[]`** — ordena descendente por la métrica elegida (para el toggle de los
  gráficos), estable.
- **`maxValor(filas, selector): number`** — el máximo para escalar las barras
  (evita división por cero → devuelve 1 si todo es 0).

---

## 2. Navegación — rediseño del `Sidebar`

### 2.1 Estructura (5 grupos)

`components/admin/Sidebar.tsx`, `NAV_GROUPS`:

```
🏠 Inicio                         /admin           (suelto, arriba, sin grupo)

🛍️ TIENDA
   Productos                      /admin/productos
   Categorías                     /admin/categorias
   Banners                        /admin/banners
   Cupones                        /admin/cupones
   Envíos                         /admin/envios

💵 INGRESOS
   POS                            /admin/pos
   Documentos                     /admin/pos/documentos
   Cotizaciones                   /admin/cotizaciones
   Pedidos (badge)                /admin/pedidos
   Cuentas por cobrar             /admin/cuentas-por-cobrar
   Libro de ventas (SAR)          /admin/reportes/libro-ventas   [placeholder, lo llena P7]

🧾 EGRESOS
   Compras                        /admin/compras
   Cuentas por pagar              /admin/cuentas-por-pagar

📦 INVENTARIO
   Inventario físico              /admin/inventario
   Movimientos (kardex)           /admin/movimientos

👥 CLIENTES
   Clientes y proveedores         /admin/clientes

⚙️ Configuración                  /admin/configuracion   (abajo, como está)
🚪 Salir                          (abajo, como está)
```

- **Inicio** se agrega como ítem suelto arriba del primer grupo (nuevo).
- El ítem **Libro de ventas (SAR)** apunta a `/admin/reportes/libro-ventas`. Como
  esa ruta la construye P7, en P6 el ítem se incluye pero **comentado/oculto tras
  un flag** para no dejar un enlace roto — o se omite y P7 lo agrega. **Decisión:
  se omite en P6** y P7 lo agrega junto con la pantalla; el grupo Ingresos ya
  queda con su forma final. (Se documenta para que P7 sepa dónde va.)
- `isActive` se conserva (elige el href más largo que matchea; ver comentario
  actual sobre `Documentos` anidado bajo `POS`).

### 2.2 Fix del colapso

Hoy `setCollapsed(c => !c)` es un toggle correcto, pero el botón de colapsar vive
en el `header` y en modo colapsado queda inaccesible/oculto por el CSS (ancho
reducido). El fix: garantizar que el botón de expandir **siempre** sea visible y
clickeable en modo colapsado (reposicionar/reestilar en `Sidebar.module.css`),
de modo que el colapso sea reversible. Verificación: colapsar y volver a
expandir con el mismo botón.

### 2.3 Iconos dorados sin fondo (regla Merlin)

- Se agrega a `app/merlin.css` una **clase/token de icono** documentada (p.ej.
  `.iconoMerlin { color: var(--merlin-oro); background: none; }` con la variable
  de oro ya existente del design system) + una nota de convención: *todos los
  iconos del app van en dorado, sin fondo*.
- El **nuevo sidebar** adopta la regla: los iconos del menú pasan de emoji a
  **SVG inline** que heredan `currentColor` (dorado), sin fondo. Se introduce un
  set mínimo de iconos SVG para los ítems del menú (un `icons.tsx` o inline).
- El **barrido del resto del app** (POS, tienda, cards, botones) queda para el P
  de diseño, reusando la misma clase/convención. En P6 solo el sidebar.

### 2.4 Fix del documento sin menú

`app/admin/pos/documento/[id]/DocumentoView.tsx` hoy se pinta como hoja a
pantalla completa (probable `position: fixed`/inset que tapa el shell). El fix de
P6 es **acotado**: la vista deja de cubrir el `Sidebar` — se renderiza dentro del
`.content` del `AdminLayout` con el menú visible, y con un botón "← Volver"
**siempre presente** (no solo cuando `?volver=pos`), que regrese al listado de
documentos (o al origen si viene con `volver`). La hoja imprimible sigue
existiendo vía `@media print` (al imprimir se oculta el shell). El rediseño
navegable completo (clics, card de pagos) es P8 — aquí solo se recupera la
navegación.

---

## 3. Dashboard — `/admin` reconstruido

`app/admin/page.tsx` (Server Component) + un client component para el filtro y
los toggles. La página lee el rango de `searchParams` (`?preset=&desde=&hasta=`),
calcula los bordes con `rangoDesdePreset`, y llama a las 4 funciones SQL vía RPC
del cliente de servidor.

### 3.1 Filtro global de fechas

Client component `FiltroFechas` arriba del tablero:
- Presets: **Hoy / Semana / Mes / Año / Personalizado**. Default al entrar:
  **Semana** (semana en curso).
- `Personalizado` muestra dos inputs `date` (desde/hasta).
- Cambiar el filtro actualiza los `searchParams` (navegación shallow) → el Server
  Component re-lee y re-renderiza. Etiqueta del rango visible (`etiquetaRango`).

### 3.2 KPIs

Dos filas rotuladas:
- **En el rango:** Ventas netas (POS) · N° de documentos · Ticket promedio ·
  Pedidos web (total del rango, con badge de "sin procesar").
- **Ahora mismo:** Por cobrar (CxC) · Por pagar (CxP) · Cotizaciones abiertas
  (# y monto) · Stock bajo.

Montos con `formatPrice`. Cards con estilo Merlin; alertas suaves (`statWarn`/
`statAlert`) para sin-procesar > 0 y stock bajo > 0, como el dashboard actual.

### 3.3 Gráficos (SVG/CSS, tokens Merlin)

- **Ventas por día** — gráfico de línea o barras verticales, un punto/barra por
  día del rango (de `dashboard_ventas_por_dia`, sin huecos). Eje con el monto;
  hover/tooltip opcional (título nativo). Escala con `maxValor`.
- **Ítems más vendidos** — barras horizontales, top 10
  (`dashboard_top_items(..., 10)`), con **toggle monto/cantidad** (client) que
  reordena y reescala usando `ordenarPor`/`maxValor` sobre los datos ya traídos
  (ambas métricas vienen en la fila; el toggle no re-consulta).
- **Mejores clientes** — barras horizontales, top 10
  (`dashboard_top_clientes(..., 10)`), **toggle monto/cantidad**, excluye
  CONSUMIDOR FINAL. Cada barra enlaza al cliente (`/admin/clientes` o su estado
  de cuenta) — enlace simple, no bloqueante.

### 3.4 Últimos documentos

Reemplaza "Últimos pedidos" del dashboard actual: lista de los últimos ~5–8
documentos de venta (`factura`/`comprobante`) con número, cliente, total, tipo y
hora; cada fila enlaza al documento. (Los pedidos web ya se ven en su propio
módulo con badge; el dashboard prioriza la venta fiscal.)

---

## 4. Archivos

- `supabase/migrations/2026-08-10-pos-p6-dashboard.sql` — 4 funciones de
  agregación + grants/revoke. `supabase/smoke-p6-dashboard.sql`.
- `lib/dashboard/rango.ts` + `lib/dashboard/metricas.ts` +
  `lib/dashboard/tests/*.test.ts`.
- `app/admin/dashboard-data.ts` (server action / helper que llama las RPC y
  arma el `DashboardData`) — o inline en `page.tsx`.
- `app/admin/page.tsx` (reconstruido) + client components:
  `app/admin/FiltroFechas.tsx`, `app/admin/GraficoBarras.tsx`,
  `app/admin/GraficoLinea.tsx`, `app/admin/dashboard.module.css` (extendido).
- `components/admin/Sidebar.tsx` (5 grupos + Inicio + fix colapso + iconos SVG),
  `components/admin/Sidebar.module.css`, `components/admin/icons.tsx` (set SVG),
  `app/merlin.css` (clase/convención de icono dorado).
- `app/admin/pos/documento/[id]/DocumentoView.tsx` +
  `DocumentoView.module.css` (dejar de tapar el shell + "Volver" siempre).
- `types/index.ts`: `DashboardResumen`, `VentaPorDia`, `TopItem`, `TopCliente`,
  `PresetRango`, `RangoFechas`, `DashboardData`.

## 5. Restricciones globales

- Idioma español; moneda en Lempiras con `formatPrice()`.
- **Solo lectura** — ninguna escritura a `documentos`, `movimientos_inventario`,
  stock ni caja. Las funciones SQL solo agregan.
- Migración idempotente (`create or replace function`, drops de firma por
  `to_regprocedure` si hace falta), aplicada por el usuario antes del push. Smoke
  con `to_regprocedure`. Estilo P4c/P5.
- Fechas ancladas a **hora Honduras** en TS puro y testeado; nunca el día UTC.
- CSS Modules con tokens Merlin; **iconos dorados sin fondo** (regla nueva en
  `merlin.css`). Gráficos SVG/CSS sin librerías.
- Cliente de Supabase de **servidor** para leer las RPC. `SUPABASE_SERVICE_ROLE_KEY`
  nunca al cliente.
- La capa `lib/dashboard/` y las funciones SQL quedan pensadas para que **P7
  (Reportes) las reuse** (mismos rangos, misma definición de venta neta).

## 6. Verificación

- `npm test` (incluye `lib/dashboard/`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Smoke SQL: 4 funciones presentes por firma; llamada de ejemplo sin error.
- **Visual (tras aplicar la migración):** menú con 5 grupos, Inicio arriba,
  colapsar/expandir reversible, iconos dorados sin fondo; documento con menú
  visible y "Volver"; dashboard abre en la semana en curso, cambia con los
  presets y el rango personalizado, KPIs cuadran con lo fiscal, los 3 gráficos
  dibujan y el toggle monto/cantidad reordena ítems/clientes.

## Fuera de alcance

Los 5 reportes (P7); el barrido app-wide de iconos (P de diseño); el rediseño
navegable del documento con clics a cliente/producto y card de pagos (P8);
exportar a Excel/CSV; valorización de inventario; WhatsApp; cards de tienda.
