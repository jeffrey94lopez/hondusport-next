# Rediseño R5a — Pantallas admin con diseño Stitch + deuda R4 — Diseño

**Fecha:** 2026-08-13
**Serie:** Rediseño Hondusport (adopción de los diseños de Google Stitch). La ola R5 se
partió en **R5a** (pantallas CON diseño Stitch propio + deuda R4) y **R5b** (tablas
genéricas con patrón compartido, después). Estado de la serie: R1 tienda ✅ · R2a empresa ✅
· R2b descuentos ✅ · R3 shell+dashboard ✅ · R4 mostrador POS ✅ · **R5a** · R5b.
**Estado:** aprobado para plan.

## Objetivo

Re-estilizar al look Stitch las **7 pantallas admin que tienen diseño Stitch propio**
(productos lista y editor, inventario físico, kanban de cotizaciones, cascada de CxC, y
los reportes índice/catálogo/ganancias) y saldar la **deuda visual de R4** (pantallas de
selección de caja y apertura de sesión del POS + limpiezas de CSS). Solo estilo — cero
cambios de lógica/datos.

## Fuente de verdad visual

`docs/diseno/stitch/` (cada carpeta con `screen.png` + `code.html`; se replica el LOOK, no
se copia el HTML):

| Pantalla real | Referencia |
|---|---|
| `app/admin/productos` (lista) | `hondusport_admin_inventario_de_productos/` |
| `app/admin/productos/[id]` (editor) | `hondusport_admin_editor_de_producto/` |
| `app/admin/inventario` (conteo físico) | `hondusport_admin_inventario_f_sico_conteo/` |
| `app/admin/cotizaciones` (kanban) | `hondusport_admin_cotizaciones_kanban/` |
| `app/admin/cuentas-por-cobrar` (cascada) | `hondusport_admin_cuentas_por_cobrar_cascada/` |
| `app/admin/reportes` (índice) | `hondusport_admin_ndice_de_reportes/` |
| `app/admin/reportes/*` (catálogo/detalle, ganancias) | `hondusport_admin_cat_logo_de_reportes_refinado/` + `hondusport_admin_reporte_de_ganancias_por_tem/` |

## Contexto

- Todas las pantallas YA existen con su lógica completa (kanban de P3, cascada CxC y
  reportes de P7a/P7b, conteo físico de P4d, productos de las olas previas). Tienen tokens
  Merlin de olas anteriores; R5a las alinea al lenguaje Stitch ya establecido (fondo gris
  claro, cards blancas redondeadas con sombra, iconos dorados, pills, botón CTA negro).
- El shell (sidebar + fondo) ya es Stitch (R3); aquí se toca solo el CONTENIDO de cada
  pantalla.
- Deuda R4 anotada en `.superpowers/sdd/2026-08-11-rediseno-r4-pos/progress.md`.

## Alcance

**Dentro:**
1. Re-skin de las 7 pantallas de la tabla (listas, filtros, cards, kanban, cascada,
   tablas de reportes, formularios del editor y del conteo).
2. **Deuda R4:**
   - Pantallas de **selección de caja** y **apertura de sesión** del POS
     (`PosClient.tsx` estados 1 y 2, ~líneas 940-1032) al look nuevo del mostrador.
   - Limpieza de CSS muerto en `pos.module.css` (`.lineaRow`, `.lineaDesc`,
     `.clienteBlock`, `.vendedorBlock`, `.formRow`; corregir el comentario falso sobre
     DevolucionModal; consolidar la `.chipsRow` duplicada).
   - Contraste del chip de categoría activo del catálogo POS: texto `var(--ink)` sobre
     dorado (en vez de `#fff`, que da ~2.3:1).
   - Placeholder de búsqueda del POS: "Buscar por nombre o SKU…" (hoy promete "código de
     barras", campo que no existe; el escáner funciona por SKU).

**Fuera:**
- R5b: categorías, banners, cupones, envíos, pedidos, clientes, movimientos, compras,
  CxP, lista de documentos (patrón compartido, sub-ola siguiente).
- Cambios de lógica/datos en cualquier pantalla: server actions, RPCs, filtros,
  exportadores (los `.limit(5000)` y la matemática de reportes quedan intactos), flujo de
  caja/arqueo, kardex, edición de producto (validaciones/costeo).
- Las hojas fiscales/imprimibles (inmutables).

## Principios (los de la serie)

- **Solo estilo.** Conservar props/handlers/estado/queries de cada pantalla.
- **Reportes = dinero:** los números mostrados no se recalculan ni se re-formatean fuera
  de `formatPrice()`; solo cambia el marco visual. Siempre 2 decimales.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores con token; `#fff` sobre
  negro/dorado solo donde ya es idiom (y en el chip de categoría POS se corrige a
  `var(--ink)`).
- **Especificidad (lección R4):** las reglas globales `input[type=...]`/`select` de
  `app/globals.css` (0,1,1) pisan clases de CSS Modules (0,1,0); usar selectores
  compuestos donde el re-skin cambie padding/tamaño/fondo de inputs.
- Idioma español; Lempiras `L.`.
- Sin migración SQL.

## 1. Pantallas (qué cambia en cada una)

1. **Productos (lista):** toolbar (búsqueda + filtros + botón "+ Nuevo producto" negro),
   tabla/cards de productos al estilo Stitch (imagen, nombre, SKU, categoría, precio,
   stock con badge de estado), paginación/acciones con el look nuevo.
2. **Editor de producto:** formulario en cards blancas por sección (datos, precios,
   imágenes, variantes, tallas), inputs redondeados, botón guardar negro. SIN tocar
   validaciones, costeo, ni el manejo de variantes/kardex.
3. **Inventario físico (conteo):** lista de conteo con inputs compactos, progreso, y
   acciones al look nuevo. SIN tocar la lógica de conteo ciego/aplicar conteo.
4. **Cotizaciones (kanban):** columnas como cards grises con encabezado (etapa + conteo),
   tarjetas de cotización blancas (cliente, monto, vencimiento, badges), drag & drop
   intacto.
5. **CxC (cascada):** los niveles expandibles (cliente → documentos → pagos) como cards/
   filas Stitch con chevrons, badges de saldo/vencido, montos 2 decimales.
6. **Reportes (índice):** grid de cards de reporte (icono dorado, título, descripción),
   como el mockup.
7. **Reportes (catálogo/detalle + ganancias):** filtros como pills/inputs redondeados,
   tablas con encabezado limpio y filas con hover, cards de totales (Total Ventas/Costos/
   Ganancias) con acento; exportar/imprimir como botones pill. Los botones de exportar y
   la vista imprimible conservan su comportamiento.

## 2. Deuda R4 (POS)

- **Selección de caja:** cards de caja al estilo del mostrador (blancas, redondeadas,
  hover), título y CTA claros.
- **Apertura de sesión:** formulario (monto inicial, etc.) con inputs redondeados estilo
  pill y botón negro, como los modales del POS.
- Limpiezas de CSS + contraste + placeholder según Alcance.

## 3. Pruebas y verificación

- `npm test` (verdes), `npx tsc --noEmit`, `npm run build` al cierre de cada tarea.
- Visual por tarea (login admin si el entorno lo permite; si no, estructura/estilos
  computados) y **pase visual final del usuario con el chrome agent** (como R4).
- Reportes: verificar contra datos reales que los totales/filas se ven igual que antes
  (mismos números, solo otro marco).

## Fuera de alcance

R5b; cambios de lógica/datos; hojas fiscales; migraciones.
