# POS P7a — Reportes: infra + Libro de ventas SAR + Reporte de ventas — Diseño

**Fecha:** 2026-08-10
**Serie:** POS Honduras, sub-proyecto P7 (Reportes), **Ola 1 de 2**. Ola 2 (P7b) = Ganancias por ítem + Clientes/proveedores + CxC en cascada.
**Estado:** aprobado para plan.

## Objetivo

Crear el módulo de Reportes del admin con su índice, la navegación y el mecanismo
de exportación a Excel, y entregar los dos primeros reportes: el **Libro de ventas
SAR** (fiscal) y el **Reporte de ventas** (operativo, con filtros y detallado).
Todo **solo lectura**.

## Alcance

**Dentro:** índice `/admin/reportes`, ítem "Reportes" en el menú (grupo Ingresos),
exportación a `.xlsx` server-side reusando la lib `xlsx` ya instalada, impresión
HTML, el Libro de ventas SAR y el Reporte de ventas, y la lógica pura
`lib/reportes/` con tests.

**Fuera (Ola 2 / otros P):** Ganancias por ítem, Clientes/proveedores, CxC en
cascada (P7b); cualquier reporte no listado. No se toca la emisión de documentos
ni el kardex (solo lectura).

## Principios

- **Solo lectura.** Ningún reporte escribe en la BD. Las consultas son `select`.
- **El libro SAR se construye de los documentos fiscales**, con el desglose base/
  ISV por tasa que ya guarda cada documento (`total_exento, total_exonerado,
  total_gravado15, isv15, total_gravado18, isv18, total`).
- **Excel real, server-side.** El `.xlsx` se genera en un Route Handler con la lib
  `xlsx` (SheetJS, `^0.18.5`, **ya instalada** para el import de inventario) — la
  lib nunca entra al bundle del cliente.
- **Fechas ancladas a Honduras** (reuso `lib/dashboard/rango.ts`): los períodos se
  calculan en TS puro; las consultas filtran por `created_at` timestamptz en
  `[desde, hasta)`.
- **Lógica de armado de filas y totales en `lib/reportes/` puro y testeado**; la
  serialización xlsx (I/O) va en el route handler.

---

## 1. Módulo de Reportes (infra + navegación + export)

### 1.1 Índice y menú

- **`/admin/reportes`** (`app/admin/reportes/page.tsx`): página índice que lista
  los reportes como cards/enlaces. Ola 1 muestra **Libro de ventas SAR** y
  **Reporte de ventas** activos; los otros 3 aparecen como "próximamente"
  (deshabilitados) o se omiten hasta P7b (decisión: **se omiten** en P7a y P7b los
  agrega, para no mostrar enlaces muertos).
- **Menú (`components/admin/Sidebar.tsx`):** en el grupo **INGRESOS** se agrega el
  ítem **"Reportes"** (`/admin/reportes`, icono `documentos` o uno nuevo
  `reportes`). Reemplaza el "Libro de ventas (SAR)" que P6 había reservado (el
  libro ahora vive dentro del índice de Reportes). Se respeta la regla de iconos
  dorados de P6.

### 1.2 Exportación a Excel (mecanismo compartido)

- Cada reporte expone un **Route Handler GET** que devuelve el `.xlsx`
  (`app/admin/reportes/<reporte>/export/route.ts`), leyendo los mismos filtros por
  query params que la página. Usa `import * as XLSX from 'xlsx'` (server-only),
  arma una hoja con `XLSX.utils.aoa_to_sheet` (array de arrays) o
  `json_to_sheet`, y responde con
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  y `Content-Disposition: attachment; filename="<reporte>-<periodo>.xlsx"` usando
  `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })`.
- La construcción del **array de filas** (encabezados + datos + fila de totales) es
  una función pura en `lib/reportes/` reusada por la página (para la tabla HTML) y
  por el route handler (para el xlsx) — misma fuente de verdad.
- El botón "Exportar Excel" de cada reporte es un `<a href="…/export?…filtros">`
  (descarga directa; no necesita client JS).

### 1.3 Impresión

Cada reporte es una pantalla HTML con `@media print` (tinta fija, oculta
controles/menú al imprimir), mismo patrón que los documentos. Botón "Imprimir"
(`window.print()`), en un client component mínimo si hace falta.

---

## 2. Libro de ventas SAR (`/admin/reportes/libro-ventas`)

### 2.1 Datos

- **Solo documentos fiscales:** `documentos` con `tipo in ('factura',
  'nota_credito')` (facturas CAI 01 + notas de crédito CAI 03). Comprobantes y
  devoluciones internas **no** entran. Las facturas/NC nunca están `anulado` por
  diseño (guard de BD), así que no hay huecos de correlativo que representar.
- **Período:** por defecto el **mes en curso** (Honduras); selector de mes/rango
  reusando `rangoDesdePreset` (presets Mes/Personalizado; el libro se piensa
  mensual). Filtra por `created_at` en `[desde, hasta)`.
- **Orden:** cronológico por `created_at`, luego `correlativo`.

### 2.2 Columnas (por documento)

Fecha · Correlativo · CAI (código) · Cliente · RTN · **Exento · Exonerado ·
Gravado 15% · ISV 15% · Gravado 18% · ISV 18% · Total**.

- Los montos salen directo de los campos del documento (`total_exento`,
  `total_exonerado`, `total_gravado15`, `isv15`, `total_gravado18`, `isv18`,
  `total`).
- **Notas de crédito en negativo** (acreditan): sus columnas de base/ISV/total se
  muestran con signo negativo, de modo que los totales del período reflejen la
  venta neta fiscal.
- **CAI:** se muestra el código de autorización (de `cai_autorizaciones` vía
  `documento.cai_id`) — join simple.

### 2.3 Totales del período

Fila de totales al pie sumando cada columna de base/ISV/total (facturas suman, NC
restan) — el número que el contador lleva a la declaración. Función pura
`totalesLibro(filas)`.

### 2.4 Salidas

Tabla HTML imprimible + "Exportar Excel" (mismas columnas + fila de totales).

---

## 3. Reporte de ventas (`/admin/reportes/ventas`)

### 3.1 Filtros

Rango de fecha (reuso rango) · tipo de documento (factura/comprobante/
nota_credito/devolucion, o todos) · cliente · vendedor · caja · método de pago.
Los filtros viajan por query params (la página los lee y la exportación los
respeta). Filtros vacíos = sin restringir.

- **Método de pago** requiere cruzar `documento_pagos`→`metodos_pago`: un documento
  entra si tiene al menos un pago del método elegido.
- **Vendedor/Caja/Cliente:** por `vendedor_id`/`caja_id`/`cliente_id`.

### 3.2 Vista resumen

Una fila por documento: Número · Fecha · Cliente · Vendedor · Caja · Tipo ·
Total. (Vendedor y caja resueltos por join a `vendedores`/`cajas`.)

### 3.3 Toggle "detallado"

Un interruptor que, por cada documento, expande sus **ítems** (`documento_items`:
descripción · cantidad · precio unitario · importe). En impresión, el detallado se
respeta. Estado del toggle en cliente (no re-consulta: los ítems se traen con el
documento cuando el modo detallado está activo, o siempre y se muestran/ocultan —
decisión: se traen siempre los ítems y el toggle solo muestra/oculta, para que la
exportación detallada no dependa del estado de UI).

### 3.4 Salidas

Tabla HTML imprimible (resumen o detallado) + "Exportar Excel". El xlsx del modo
detallado incluye las filas de ítems bajo cada documento (o una hoja aparte de
ítems — decisión: **una sola hoja** con filas de documento y sus ítems intercalados
e identados por una columna "tipo de fila", más simple de leer para el contador).

---

## 4. Arquitectura, archivos y datos

### 4.1 Lógica pura `lib/reportes/` (con tests)

- **`lib/reportes/libro-ventas.ts`**: `filaLibro(documento)` → objeto con las
  columnas (aplica signo negativo a NC); `totalesLibro(filas)` → suma por columna;
  `libroAoA(filas, totales)` → array-of-arrays (encabezados + filas + totales) que
  consumen la tabla HTML y el xlsx.
- **`lib/reportes/ventas.ts`**: `filaVenta(documento, {vendedor, caja})` → fila
  resumen; `ventasAoA(filas, incluirItems)` → array-of-arrays (con filas de ítem
  intercaladas si `incluirItems`).
- Tests en `lib/reportes/tests/` (signos de NC, totales, AoA con/sin ítems).

### 4.2 Server (Server Components + Route Handlers)

- `app/admin/reportes/page.tsx` — índice.
- `app/admin/reportes/libro-ventas/page.tsx` + `LibroVentasView` (client mínimo
  para imprimir/selector) + `.module.css`. Route handler
  `app/admin/reportes/libro-ventas/export/route.ts`.
- `app/admin/reportes/ventas/page.tsx` + `VentasReporteView` (client para filtros/
  toggle/imprimir) + `.module.css`. Route handler
  `app/admin/reportes/ventas/export/route.ts`.
- Cliente de Supabase de **servidor** en páginas y route handlers. Consultas
  `select` con filtros; joins a `cai_autorizaciones`, `vendedores`, `cajas`,
  `metodos_pago` según el reporte. `SUPABASE_SERVICE_ROLE_KEY` nunca al cliente.

### 4.3 Tipos (`types/index.ts`)

`FilaLibroVentas`, `TotalesLibroVentas`, `FiltrosReporteVentas`, `FilaReporteVenta`
(y lo que necesiten las puras).

## 5. Restricciones globales

- Idioma español; Lempiras con `formatPrice()`.
- **Solo lectura**; ninguna escritura a documentos/kardex/caja.
- Excel real con la lib `xlsx` (SheetJS) **ya instalada**, usada **solo en route
  handlers server-side** (no en el bundle del cliente). Sin dependencias nuevas.
- Impresión HTML + `@media print`. CSS Modules con tokens Merlin; iconos dorados
  (regla `.iconoMerlin` de P6).
- Fechas ancladas a Honduras (reuso `lib/dashboard/rango.ts`); rango semiabierto
  `[desde, hasta)` por `created_at`.
- Libro SAR = solo `factura` + `nota_credito`; NC en negativo; totales del período.
- La lógica de armado de filas queda en `lib/reportes/` (una sola fuente para tabla
  HTML y xlsx). Reutilizable/consistente con P7b.

## 6. Verificación

- `npm test` (incluye `lib/reportes/`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- **Visual/funcional:** menú con "Reportes"; índice; Libro SAR del mes con desglose
  base/ISV por tasa, NC en negativo, totales que cuadran; Reporte de ventas con los
  6 filtros + toggle detallado; una **exportación xlsx de prueba** de cada reporte
  que abra en Excel con los datos y la fila de totales.

## Fuera de alcance

Ganancias por ítem, Clientes/proveedores, CxC en cascada (P7b); export CSV; gráficos
en reportes; cualquier cambio a emisión/kardex.
