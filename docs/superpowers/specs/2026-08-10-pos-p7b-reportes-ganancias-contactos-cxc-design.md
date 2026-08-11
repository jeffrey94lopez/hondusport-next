# POS P7b — Reportes Ola 2: Ganancias por ítem + Clientes/proveedores + CxC en cascada — Diseño

**Fecha:** 2026-08-10
**Serie:** POS Honduras, sub-proyecto P7 (Reportes), **Ola 2 de 2** (cierra el módulo). Continúa P7a (infra + Libro SAR + Reporte de ventas, ya desplegado).
**Estado:** aprobado para plan.

## Objetivo

Cerrar el módulo de Reportes con tres reportes que reusan la infra de P7a
(índice `/admin/reportes`, export xlsx server-side con la lib `xlsx`, `lib/reportes/`
puro, filtros con `lib/dashboard/rango`): **Ganancias por ítem**, **Clientes y
proveedores** (directorio) y **Cuentas por cobrar en cascada**. Todo **solo lectura**.

## Alcance

**Dentro:** dos funciones SQL de agregación (`reporte_ganancias_items`,
`reporte_contactos`), la lógica pura `lib/reportes/` de los tres reportes, las tres
páginas (con impresión + export xlsx), y su alta en el índice `/admin/reportes`.

**Fuera:** cualquier reporte no listado; export CSV; gráficos en reportes; cambios
a emisión/kardex (solo lectura).

## Principios

- **Solo lectura.** Ninguna escritura; las funciones SQL solo agregan (`select`).
- **Ganancias sin ISV.** Las ventas del reporte de ganancias son la **base sin ISV**
  (Σ `documento_items.base`), consistente con P6.1 (`Ganancia = Ventas sin ISV −
  Costo`). El costo sale del kardex (`venta_pos`, neto de devoluciones NC), misma
  matemática que `dashboard_resumen.costo_ventas` de P6.1.
- **Ítems libres incluidos.** Las ventas sin producto de catálogo (`producto_id
  null`) se agrupan en una sola fila "Ítems libres" con costo 0 (aportan venta, sin
  costo de inventario).
- **Fechas ancladas a Honduras** (reuso `rangoDesdePreset`): rango semiabierto
  `[desde, hasta)` por `created_at`.
- **Matemática de dinero en SQL; presentación (nombres/SKU/categoría) resuelta en el
  server por lote** (patrón del Visor de Kardex), separando responsabilidades.
- **La lógica de filas/totales/AoA vive en `lib/reportes/` puro y testeado** (una
  fuente para tabla HTML y xlsx).

---

## 1. Capa de datos (migración `2026-08-10-pos-p7b-reportes.sql`)

Dos funciones `security invoker`, `set search_path = public`, `revoke ... from
public, anon` + `grant ... to authenticated`. Smoke con `to_regprocedure`.

### 1.1 `reporte_ganancias_items(p_desde timestamptz, p_hasta timestamptz)`

Devuelve `(producto_id uuid, variante_id uuid, cantidad numeric, ventas numeric,
costo numeric)`:
- **ventas** = Σ `documento_items.base` con signo (+factura/comprobante,
  −nota_credito/devolucion), documentos no anulados en el rango, agrupado por
  `(producto_id, variante_id)`. Los ítems libres (`producto_id null`) colapsan en una
  sola fila con `producto_id null, variante_id null` (no agrupa por descripción — es
  el bucket "Ítems libres").
- **cantidad** = Σ `cantidad` con el mismo signo, mismo agrupamiento.
- **costo** = del kardex, por `(producto_id, variante_id)`: Σ `venta_pos`
  (`costo_resultante × −cantidad`, join a `documentos` no anulados por
  `split_part(referencia,':',2)::uuid`) **menos** Σ `devolucion` `referencia like
  'nota_credito:%'` (`costo_resultante × cantidad`). Copia la definición de
  `costo_ventas` de P6.1 pero **agrupada por producto/variante** en vez de global.
  Los ítems libres no tienen kardex → costo 0 (left join / coalesce).

Se implementa con CTEs `ventas` (de `documento_items`) y `costos` (de
`movimientos_inventario`), `full outer join` por `(producto_id, variante_id)` para
que un ítem con costo pero sin venta en el rango (o viceversa) no se pierda, con
`coalesce(...,0)`.

### 1.2 `reporte_contactos(p_desde timestamptz, p_hasta timestamptz)`

Devuelve, por fila de `clientes`, `(id uuid, nombre text, rtn text, identidad text,
es_cliente boolean, es_proveedor boolean, total_ventas numeric, total_compras
numeric, saldo_cxc numeric, saldo_cxp numeric)`:
- **total_ventas** = Σ venta neta de `documentos` (`factura`+`comprobante` no anulados
  menos `nota_credito`+`devolucion`) del contacto en el rango (`cliente_id = c.id`,
  `created_at` en rango).
- **total_compras** = Σ `compras.total` (`estado <> 'anulada'`) del contacto como
  proveedor en el rango (`proveedor_id = c.id`, `created_at` en rango).
- **saldo_cxc** = Σ `documento_saldos.saldo` (`saldo > 0`) del contacto (snapshot).
- **saldo_cxp** = Σ `compra_saldos.saldo` (`saldo > 0`) del contacto (snapshot).
- Se devuelven todos los contactos con actividad o saldo (filtrar filas donde los
  cuatro montos son 0 para no listar contactos inertes). La UI filtra por rol.

### 1.3 Lógica pura `lib/reportes/`

- **`ganancias.ts`**: `filaGanancia(row, meta)` (calcula `ganancia = ventas − costo`,
  `margen% = ventas>0 ? ganancia/ventas*100 : 0`); `totalesGanancias(filas)`
  (Σ ventas/costo/ganancia + margen global); `gananciasAoA(filas, totales)`.
- **`contactos.ts`**: `filaContacto(row)` → normaliza rol legible y elige total/saldo
  según rol; `contactosAoA(filas, rol)`.
- **`cxc-cascada.ts`**: `agruparCxc(saldos)` → agrupa `documento_saldos` por cliente
  en `{ cliente, total, docs[] }[]`; `cxcAoA(grupos)` (filas de cliente + documentos
  intercaladas). Reusa `hoyHonduras`/`bucketAntiguedad` de `lib/cxp` para días
  vencido.
- Tests en `lib/reportes/tests/`.

---

## 2. Ganancias por ítem (`/admin/reportes/ganancias`)

- Filtro de rango (default `mes`). `data.ts`: llama `reporte_ganancias_items`, resuelve
  por lote `sku`, `nombre`, nombre de variante y categoría (join/consultas a
  `productos`, `producto_variantes`, `categorias`), y arma las filas; la fila con
  `producto_id null` se rotula "Ítems libres" (código/variante/categoría vacíos).
- **Totales arriba:** Total Ventas · Total Costos · Total Ganancias · Margen %.
- **Tabla:** Código · Nombre · Variante · Categoría · Cantidad · Ventas · Costos ·
  Ganancia · Ganancia %. Orden por ganancia desc.
- Imprimible + Excel (mismas columnas + fila de totales).

## 3. Clientes y proveedores (`/admin/reportes/contactos`)

- Filtros: **rol** (clientes / proveedores / ambos) + rango. `data.ts`: llama
  `reporte_contactos` y filtra por rol en el server.
- **Tabla:** Nombre · RTN/Identidad · Rol · Total transado en el rango · Saldo actual.
  "Total transado" y "Saldo actual" toman ventas+CxC si el rol filtrado es cliente,
  compras+CxP si es proveedor; en "ambos" se muestran las columnas de venta/compra y
  CxC/CxP.
- Imprimible + Excel.

## 4. Cuentas por cobrar en cascada (`/admin/reportes/cxc`)

- **Snapshot** (no rango). Filtro opcional por cliente. `data.ts`: consulta
  `documento_saldos` (`saldo > 0`) + `clientes(nombre)`, agrupa por cliente con
  `agruparCxc`.
- **Cascada navegable** (client component): fila por cliente (nombre · # documentos ·
  total pendiente) que **expande/colapsa** sus documentos (número · fecha ·
  vencimiento · días vencido · saldo). Días vencido con `hoyHonduras` + `fecha_vencimiento`.
- Imprimible (todo expandido) + Excel (filas de cliente + documentos intercaladas en
  una hoja, con una columna "tipo de fila").

---

## 5. Arquitectura, archivos y datos

- `supabase/migrations/2026-08-10-pos-p7b-reportes.sql` (2 funciones) + `supabase/smoke-p7b-reportes.sql`.
- `lib/reportes/{ganancias.ts, contactos.ts, cxc-cascada.ts}` + `lib/reportes/tests/*`.
- `types/index.ts`: `FilaGananciaItem`, `TotalesGanancias`, `FilaContacto`, `GrupoCxc`, `DocCxc`, `RolContacto`.
- Por reporte: `app/admin/reportes/<reporte>/{data.ts, page.tsx, *Controls.tsx, *.module.css}` + `app/api/reportes/<reporte>/export/route.ts` (patrón de P7a: auth `getUser()`→401, `import * as XLSX from 'xlsx'` solo server, `.limit(5000)` en las consultas de lista).
- `app/admin/reportes/page.tsx` (índice): agregar las 3 cards nuevas.
- Cliente de Supabase de **servidor** en páginas y route handlers.

## 6. Restricciones globales

- Idioma español; Lempiras con `formatPrice()`.
- **Solo lectura**; ninguna escritura. Funciones SQL solo agregan.
- Ganancias: ventas **sin ISV** (base); costo del kardex neto de NC; ítems libres
  incluidos con costo 0.
- Migración idempotente (`create or replace function`), aplicada por el usuario antes
  del push; smoke con `to_regprocedure`.
- Excel real con la lib `xlsx` ya instalada, **solo en route handlers server-side**.
- **`.limit(5000)`** en toda consulta de lista (evita el tope silencioso ~1000 de
  Supabase — lección de P7a).
- Fechas ancladas a Honduras; rango `[desde, hasta)` por `created_at`; columnas `date`
  contra `(… at time zone 'America/Tegucigalpa')::date` si aplica.
- Impresión HTML + `@media print`. CSS Modules con tokens Merlin; iconos dorados.
- La lógica de filas/totales/AoA en `lib/reportes/` (una fuente para tabla y xlsx).

## 7. Verificación

- `npm test` (incluye `lib/reportes/`), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Smoke SQL: 2 funciones presentes por firma + llamada de ejemplo sin error.
- **Visual (tras aplicar la migración):** índice con 5 reportes; Ganancias con totales
  y margen, fila "Ítems libres", Ventas−Costo=Ganancia por fila; Clientes/proveedores
  con filtro de rol y totales+saldo; CxC en cascada que expande documentos; una
  exportación xlsx de prueba de cada uno.

## Fuera de alcance

Export CSV; gráficos en reportes; valorización de inventario; cualquier cambio a
emisión/kardex/caja.
