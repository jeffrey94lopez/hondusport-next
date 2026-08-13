# Rediseño R5a — Pantallas admin con diseño Stitch + deuda R4 — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-estilizar al look Stitch las 7 pantallas admin con diseño propio (productos lista + editor, inventario físico, kanban de cotizaciones, cascada de CxC, reportes índice/detalle/ganancias) y saldar la deuda visual de R4 (pantallas de caja del POS + limpiezas), sin cambiar lógica ni datos.

**Architecture:** Cada tarea re-estiliza una pantalla real (JSX de presentación + su CSS Module) tomando como referencia visual la carpeta Stitch correspondiente (`screen.png` + `code.html`; se replica el look, no se copia el HTML). El shell (R3) y el lenguaje visual (cards blancas sobre fondo gris, iconos dorados, pills, CTA negro) ya están establecidos — estas pantallas se alinean a él. Se conservan props/handlers/estado/queries.

**Tech Stack:** Next.js 16 (App Router), TypeScript, CSS Modules. Nada nuevo.

## Global Constraints

- Idioma español (Honduras); moneda Lempiras `L.`; **siempre 2 decimales** vía `formatPrice()`.
- **Solo estilo.** Sin tocar server actions, RPCs, filtros, exportadores (los `.limit(5000)` y la matemática de reportes quedan intactos), flujo de caja/arqueo, kardex, validaciones/costeo del editor de producto, ni drag & drop del kanban.
- **Reportes = dinero:** los números mostrados no se recalculan ni se re-formatean fuera de `formatPrice()`; solo cambia el marco visual.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores con token; `#fff` sobre negro/dorado solo donde ya es idiom.
- **Especificidad (lección R4):** las reglas globales `input[type=...]`/`select` de `app/globals.css` (0,1,1) pisan clases de CSS Modules (0,1,0) — usar selectores compuestos (`.wrap .clase`) donde el re-skin cambie padding/tamaño/fondo de inputs o selects.
- Las hojas imprimibles (kardex `HojaKardex`, conteo `HojaConteo`/`impresion.module.css`, estados de cuenta, hojas fiscales) NO se re-maquetan; solo marcos/controles si aplica.
- Sin migración SQL.
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes). Verificación visual por estructura/estilos si no hay login admin; **pase visual final del usuario con el chrome agent**.

**Método de cada tarea de re-skin:** (1) observar `screen.png` y leer `code.html` de la referencia; (2) leer el/los componente(s) reales completos; (3) ajustar JSX de presentación + CSS conservando lógica; (4) verificar montos con `formatPrice` y tokens.

---

## File Structure (pantalla → archivos reales)

- **Deuda R4:** `app/admin/pos/PosClient.tsx` (estados 1-2, ~líneas 940-1032), `app/admin/pos/pos.module.css`, `app/admin/pos/components/CatalogoPanel.tsx` (placeholder).
- **Productos lista + editor:** `app/admin/productos/page.tsx`, `app/admin/productos/ProductosClient.tsx` (lista Y editor-modal), `app/admin/productos/productos.module.css`. (El editor es un modal dentro de ProductosClient; no hay página [id] de edición — [id] solo tiene movimientos/kardex, fuera de alcance.)
- **Inventario físico:** `app/admin/inventario/page.tsx`, `InventarioClient.tsx`, `inventario.module.css`, y `[id]/TomaEditor.tsx` + `[id]/ModoTabla.tsx` + `[id]/ModoCarrusel.tsx` + `[id]/RevisarAplicarModal.tsx` (NO `HojaConteo`/`impresion.module.css`).
- **Kanban cotizaciones:** `app/admin/cotizaciones/page.tsx`, `KanbanBoard.tsx`, `cotizaciones.module.css`. (El editor de cotización `[id]/` queda FUERA — R5b/futuro.)
- **CxC cascada:** `app/admin/cuentas-por-cobrar/page.tsx`, `CuentasPorCobrarClient.tsx`, `cxc.module.css` (+ alinear ligero `CobroModal.tsx`/`SaldoFavorModal.tsx` si comparten clases).
- **Reportes índice:** `app/admin/reportes/page.tsx`, `reportes.module.css`.
- **Reportes detalle:** `ganancias/` (bandera, con Stitch), y el mismo patrón aplicado a `ventas/`, `libro-ventas/`, `contactos/`, `cxc/` (cada uno con su `page.tsx`, `*Controls.tsx` y `.module.css`).

---

## Task 1: Deuda R4 — pantallas de caja del POS + limpiezas

**Files:**
- Modify: `app/admin/pos/PosClient.tsx` (~líneas 940-1032: estados de selección de caja y apertura de sesión)
- Modify: `app/admin/pos/pos.module.css`
- Modify: `app/admin/pos/components/CatalogoPanel.tsx` (solo el placeholder)

- [ ] **Step 1: Selección de caja + apertura de sesión al look nuevo**

Leer `PosClient.tsx` (estados 1 y 2: `.centerWrap`/`.panel`/`.cajaCard` y el form de apertura con `.form`/`.formLabel`/`.btnCancel`/`.btnSubmit`). Re-estilizar al lenguaje del mostrador: cards de caja blancas redondeadas con hover y CTA claro; formulario de apertura con inputs pill (fondo `var(--bg-hover)`, sin borde — con selector compuesto por la especificidad global) y botón negro. El enlace "← Volver al admin" (`.headerBack`) con estilo coherente. SIN tocar la lógica de abrir/reanudar sesión ni el arqueo.

- [ ] **Step 2: Limpieza de CSS muerto en `pos.module.css`**

Eliminar las reglas sin consumidor: `.lineaRow` (y su `grid-template-areas`), `.lineaDesc`, `.clienteBlock`, `.vendedorBlock`, `.formRow`; corregir el comentario falso (~línea 688) que dice que DevolucionModal usa `.lineaRow`/`.lineaDesc` (usa su propio módulo); consolidar las DOS definiciones de `.chipsRow` en una (conservando el comportamiento actual de los chips de descuento y categorías). Verificar con grep que ningún `.tsx` referencia las clases eliminadas.

- [ ] **Step 3: Contraste + placeholder**

En el chip de categoría activo del catálogo (`.catChipsRow :global(.btnMerlinChip)[aria-pressed="true"]`): texto `var(--ink)` sobre el dorado (en vez de `#fff`). En `CatalogoPanel.tsx`: placeholder → `"Buscar por nombre o SKU…"`.

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/pos/PosClient.tsx app/admin/pos/pos.module.css app/admin/pos/components/CatalogoPanel.tsx
git commit -m "feat(pos): pantallas de caja al look nuevo + limpieza CSS + contraste chip (deuda R4) (R5a)"
```

---

## Task 2: Productos — lista

**Files:**
- Modify: `app/admin/productos/ProductosClient.tsx` (solo la parte de LISTA: toolbar, tabla/cards, filtros — el editor-modal es Task 3)
- Modify: `app/admin/productos/productos.module.css`
- Modify: `app/admin/productos/page.tsx` (solo si hace falta para clases)

**Referencia:** `docs/diseno/stitch/hondusport_admin_inventario_de_productos/`.

- [ ] **Step 1: Re-skin de la lista**

Toolbar con búsqueda redondeada + filtros + botón **"+ Nuevo producto"** negro; tabla/cards de productos al estilo Stitch (imagen thumb, nombre, SKU, categoría, precio con 2 decimales, stock con badge de estado, acciones); paginación/orden si existe, con el look nuevo. Conservar búsqueda/filtros/acciones (activar, editar, kardex, etc.).

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/productos/ProductosClient.tsx app/admin/productos/productos.module.css app/admin/productos/page.tsx
git commit -m "feat(admin): re-skin de la lista de productos (R5a)"
```

---

## Task 3: Productos — editor (modal)

**Files:**
- Modify: `app/admin/productos/ProductosClient.tsx` (el editor-modal)
- Modify: `app/admin/productos/productos.module.css`

**Referencia:** `docs/diseno/stitch/hondusport_admin_editor_de_producto/`.

- [ ] **Step 1: Re-skin del editor**

Formulario en secciones tipo card (datos generales, precios, imágenes, variantes, tallas/categorías), inputs redondeados (selector compuesto por la especificidad global), botón guardar negro, cancelar outline. **SIN tocar** validaciones, costeo, manejo de variantes (alta/edición/stock) ni la lógica de imágenes.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/productos/ProductosClient.tsx app/admin/productos/productos.module.css
git commit -m "feat(admin): re-skin del editor de producto (R5a)"
```

---

## Task 4: Inventario físico (conteo)

**Files:**
- Modify: `app/admin/inventario/InventarioClient.tsx` + `app/admin/inventario/inventario.module.css` + `app/admin/inventario/page.tsx` (si aplica)
- Modify: `app/admin/inventario/[id]/TomaEditor.tsx`, `[id]/ModoTabla.tsx`, `[id]/ModoCarrusel.tsx`, `[id]/RevisarAplicarModal.tsx`
- NO tocar: `[id]/HojaConteo.tsx`, `[id]/impresion.module.css`, `[id]/ReporteDiferencias.tsx` si es hoja imprimible (verificar; si es vista en pantalla, alinear solo estilos)

**Referencia:** `docs/diseno/stitch/hondusport_admin_inventario_f_sico_conteo/`.

- [ ] **Step 1: Re-skin**

Lista de tomas (cards/filas con estado y fechas); editor de toma: inputs de conteo compactos (selector compuesto), progreso visible, modos tabla/carrusel con el look nuevo; modal de revisar/aplicar coherente con los modales del POS. **SIN tocar** la lógica de conteo ciego, diferencias, ni `aplicar_conteo`.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/inventario
git commit -m "feat(admin): re-skin del inventario fisico (tomas y conteo) (R5a)"
```

---

## Task 5: Cotizaciones — kanban

**Files:**
- Modify: `app/admin/cotizaciones/KanbanBoard.tsx`, `app/admin/cotizaciones/cotizaciones.module.css`, `app/admin/cotizaciones/page.tsx` (si aplica)
- FUERA: `[id]/CotizacionEditor.tsx` + `editor.module.css` (R5b/futuro)

**Referencia:** `docs/diseno/stitch/hondusport_admin_cotizaciones_kanban/`.

- [ ] **Step 1: Re-skin del kanban**

Columnas como contenedores grises con encabezado (nombre de etapa + conteo, acento por etapa); tarjetas blancas redondeadas (cliente, monto 2 decimales, vencimiento, badges de estado/vencida); toolbar superior (búsqueda/nueva cotización) al look nuevo. **Drag & drop y acciones intactos** (mover etapa, abrir, duplicar, facturar).

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/cotizaciones/KanbanBoard.tsx app/admin/cotizaciones/cotizaciones.module.css app/admin/cotizaciones/page.tsx
git commit -m "feat(admin): re-skin del kanban de cotizaciones (R5a)"
```

---

## Task 6: Cuentas por cobrar — cascada

**Files:**
- Modify: `app/admin/cuentas-por-cobrar/CuentasPorCobrarClient.tsx`, `app/admin/cuentas-por-cobrar/cxc.module.css`, `app/admin/cuentas-por-cobrar/page.tsx` (si aplica)
- Alinear ligero (solo si comparten clases): `CobroModal.tsx`, `SaldoFavorModal.tsx`
- FUERA: `cobros/` (historial — R5b), `cliente/[id]/` (estado de cuenta, ya tocado en R2a; su hoja es imprimible)

**Referencia:** `docs/diseno/stitch/hondusport_admin_cuentas_por_cobrar_cascada/`.

- [ ] **Step 1: Re-skin de la cascada**

Niveles expandibles (cliente → documentos → pagos) como cards/filas con chevrons, badges de saldo/vencido (rojo para vencido), montos 2 decimales, totales visibles; toolbar/filtros al look nuevo. **SIN tocar** la lógica de expansión, cobros, saldo a favor ni los cálculos de saldo.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/cuentas-por-cobrar
git commit -m "feat(admin): re-skin de la cascada de cuentas por cobrar (R5a)"
```

---

## Task 7: Reportes — índice

**Files:**
- Modify: `app/admin/reportes/page.tsx`, `app/admin/reportes/reportes.module.css`

**Referencia:** `docs/diseno/stitch/hondusport_admin_ndice_de_reportes/`.

- [ ] **Step 1: Re-skin del índice**

Grid de cards de reporte (icono dorado, título, descripción corta, flecha/CTA), como el mockup. Conservar los enlaces a cada reporte.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.

```bash
git add app/admin/reportes/page.tsx app/admin/reportes/reportes.module.css
git commit -m "feat(admin): re-skin del indice de reportes (R5a)"
```

---

## Task 8: Reportes — detalle (ganancias bandera + mismo patrón al resto)

**Files:**
- Modify: `app/admin/reportes/ganancias/` (`page.tsx`, `GananciasControls.tsx`, `ganancias.module.css`) — bandera, con Stitch
- Modify (mismo patrón): `ventas/`, `libro-ventas/`, `contactos/`, `cxc/` (cada uno: `page.tsx`, `*Controls.tsx`/`CxcCascada.tsx`, su `.module.css`)

**Referencia:** `docs/diseno/stitch/hondusport_admin_reporte_de_ganancias_por_tem/` + `hondusport_admin_cat_logo_de_reportes_refinado/`.

- [ ] **Step 1: Ganancias (bandera)**

Filtros como pills/inputs redondeados (selector compuesto); **cards de totales** (Total Ventas / Total Costos / Total Ganancias, con acento y 2 decimales); tabla (Código/Nombre/Variantes/Categoría/Cantidad/Ventas/Costos/Ganancia/Ganancia%) con encabezado limpio y hover; botones Exportar/Imprimir como pills. **SIN tocar** queries/RPC, `.limit(5000)`, exportadores ni la vista imprimible.

- [ ] **Step 2: Mismo patrón al resto de reportes**

Aplicar el mismo tratamiento (filtros pill, cards de totales si existen, tabla limpia, botones pill) a `ventas/`, `libro-ventas/`, `contactos/` y `cxc/` (CxcCascada con chevrons como la Task 6). Conservar lógica y exportadores intactos.

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.

```bash
git add app/admin/reportes
git commit -m "feat(admin): re-skin de los reportes (ganancias, ventas, libro, contactos, cxc) (R5a)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Deuda R4 (cajas POS + CSS muerto + chipsRow duplicada + contraste + placeholder) → Task 1. ✅
- Productos lista → Task 2; editor → Task 3 (es modal en ProductosClient; el spec decía "editor" sin asumir página — cubierto). ✅
- Inventario físico → Task 4 (hojas imprimibles excluidas). ✅
- Kanban → Task 5 (editor de cotización explícitamente fuera). ✅
- CxC cascada → Task 6. ✅
- Reportes índice → Task 7; catálogo/detalle + ganancias → Task 8 (ganancias bandera + patrón al resto). ✅
- Solo estilo / reportes=dinero / tokens / 2 decimales / especificidad / sin migración → Global Constraints. ✅

**2. Placeholder scan:** re-skin puro; cada tarea nombra archivos exactos (verificados con find), la referencia Stitch y qué lógica NO tocar. Sin TBD.

**3. Type consistency:** ninguna tarea cambia interfaces; Tasks 2-3 tocan `ProductosClient.tsx` en secuencia (SDD secuencial, sin conflicto).

## Notas de entrega (para el controlador SDD)

- **Sin migración.** No hay smoke SQL.
- **Login admin:** verificación visual por estructura/estilos si el subagente no puede autenticarse; el **pase visual final lo hace el usuario con el chrome agent** (probado en R4).
- **Gotcha OneDrive:** si el dev server sirve código viejo con archivos correctos en disco → parar server, `rm -rf .next`, reiniciar.
- **Orden:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
- Al mergear: FF a `main`, push, verificar deploy READY; confirmar con el usuario.
