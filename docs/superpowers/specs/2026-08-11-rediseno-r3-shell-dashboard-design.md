# Rediseño R3 — Shell del admin + Dashboard — Diseño

**Fecha:** 2026-08-11
**Serie:** Rediseño Hondusport (adopción de los diseños de Google Stitch). Ola **R3 de 5**
(R1 tienda ✅ · R2a empresa ✅ · R2b descuentos ✅ · **R3 shell + dashboard** · R4 POS mostrador · R5 resto de módulos admin).
**Estado:** aprobado para plan.

## Objetivo

Re-estilizar el **shell del admin** (sidebar/nav global + layout) y el **dashboard**
(pantalla de Inicio, `/admin`) al look Stitch, conservando la navegación agrupada actual y
todo el contenido/datos del dashboard. Se agregan dos mejoras de UX al sidebar:
**títulos de grupo colapsables** (acordeón) y el **arreglo del colapso total a solo-iconos**
(que hoy no re-expande).

## Fuente de verdad visual

`docs/diseno/stitch/hondusport_admin_dashboard_de_inicio/` (`screen.png` + `code.html`):
sidebar blanco con "Hondusport Admin / Panel de Control", nav con iconos dorados y activo en
pill, usuario abajo; contenido con título "Inicio", filtro segmentado (Hoy/Semana/Mes/Año/
Personalizado) en pill, cards blancas redondeadas con icono dorado, y tabla "Últimos
documentos". También `docs/diseno/stitch/hondusport_panel_de_administracion/` como referencia
del shell.

## Contexto (estado actual)

- **Shell:** `app/admin/layout.tsx` renderiza `<Sidebar>` + contenido. `components/admin/Sidebar.tsx`
  (client) tiene la nav agrupada (`NAV_GROUPS`: TIENDA/INGRESOS/EGRESOS/INVENTARIO/CLIENTES,
  ~15 ítems) + Inicio + Configuración/Salir, iconos dorados (`iconoMerlin`), y un botón de
  **colapso total** (`collapsed` en `useState`) que reduce a solo-iconos. Reportado: el
  colapso total "no re-expande".
- **Documentos:** `app/admin/pos/layout.tsx` es passthrough; el overlay fullscreen del POS
  se aplica solo en `app/admin/pos/page.tsx`, así que `/admin/pos/documentos` y
  `/admin/pos/documento/[id]` heredan el shell **con** el Sidebar visible. El problema
  "documentos sin menú" parece ya resuelto; se verifica.
- **Dashboard:** `app/admin/page.tsx` + `DashboardGraficos.tsx`, `FiltroFechas.tsx`,
  `GraficoBarras.tsx`, `GraficoLinea.tsx`, `KpiSegmento.tsx`, `dashboard.module.css`,
  `graficos.module.css`. Ya trae segmentos (Hoy/Semana/Mes/Año/Personalizado), KPIs y
  gráficos (ítems más vendidos, mejores clientes, ventas por día) de P6.1.

## Alcance

**Dentro:**
- Re-skin del sidebar + layout del admin al look Stitch.
- **Títulos de grupo colapsables** (acordeón), estado persistido en `localStorage`.
- **Arreglo del colapso total** a solo-iconos (re-expande bien), estado persistido.
- Footer de usuario en el sidebar (avatar + nombre desde la sesión).
- Verificar que documentos muestre el sidebar.
- Re-skin del dashboard (cards, filtro pill, tabla últimos documentos) **conservando**
  contenido, gráficos y datos.

**Fuera:**
- Cambios de lógica de negocio o de datos (dashboard: mismas RPC/queries; sidebar: mismas rutas).
- Adoptar la nav simplificada de 6 ítems del mockup (se mantiene la nav agrupada existente).
- R4 (re-skin del mostrador POS) y R5 (re-skin de las tablas/pantallas internas de cada
  módulo admin) — R3 toca solo el **shell** y el **dashboard**.

## 1. Shell del admin (sidebar + layout)

### 1.1 Look Stitch
- `Sidebar`: fondo blanco; encabezado con logo + **"Hondusport Admin"** y subtítulo
  **"Panel de Control"**; iconos dorados (se conserva `iconoMerlin`); ítem activo en **pill**
  (fondo suave, texto/acento); tipografía y radios Merlin. Footer inferior con **usuario**
  (avatar circular + nombre). El nombre/correo del usuario viene de la sesión de Supabase
  (`supabase.auth.getUser()` en el layout, pasado como prop); si no hay nombre, mostrar el
  correo o "Admin".
- `layout.module.css`: ajustar el shell (fondo de página, spacing) al look Stitch.

### 1.2 Títulos de grupo colapsables (nuevo)
- Cada grupo de `NAV_GROUPS` (TIENDA/INGRESOS/EGRESOS/INVENTARIO/CLIENTES) tiene su título
  como **botón** con un chevron; al hacer clic, pliega/despliega los ítems del grupo.
- Estado por grupo persistido en `localStorage` (p. ej. `hs_admin_nav_groups` = objeto
  `{ [label]: colapsado }`), leído al montar (con guard de hidratación para no romper SSR).
- En modo **solo-iconos** (colapso total) los títulos se ocultan, así que el acordeón no
  aplica ahí (todos los ítems se muestran como iconos).
- El grupo que contiene la ruta activa se muestra **expandido** por defecto (para no ocultar
  dónde estás), salvo que el usuario lo haya plegado explícitamente.

### 1.3 Colapso total a solo-iconos (arreglo)
- Se conserva el botón de colapso total (‹/›) que reduce el sidebar a solo-iconos.
- **Arreglo:** el control de colapso/expansión debe estar **siempre visible y clickeable**
  en ambos estados (el bug actual impide re-expandir). Asegurar que en estado colapsado el
  botón se renderiza, no queda tapado ni con área de clic nula, y `setColapsado(false)`
  re-expande. Estado persistido en `localStorage` (p. ej. `hs_admin_sidebar_colapsado`), con
  guard de hidratación.
- En solo-iconos, cada ítem muestra su icono con `title`/tooltip (como hoy).

### 1.4 Documentos con menú
- Verificar en el dev server que `/admin/pos/documentos` y `/admin/pos/documento/[id]`
  muestran el sidebar. Si algo lo tapa (z-index/overlay), corregirlo. No re-maquetar la hoja
  del documento (eso es del módulo de documentos, R5/otro).

## 2. Dashboard (Inicio, `/admin`)

Re-skin conservando **todo** el contenido y los datos de P6.1:
- **Cards KPI** (`KpiSegmento` y las cards del dashboard): blancas redondeadas, título +
  **icono dorado**, número grande, sub-líneas con color semántico (verde para
  utilidad/cobrado/pagado, rojo para perdidas/stock bajo). Mismos datos (ventas sin ISV,
  costo, utilidad neta %, documentos, cotizaciones abiertas/ganadas/perdidas, CxC, CxP,
  ítems stock bajo / nuevos).
- **Filtro segmentado** (`FiltroFechas`): pill con Hoy/Semana/Mes/Año/Personalizado; el
  activo en negro. Misma lógica de rango (P6.1) — solo estilo.
- **Gráficos** (`DashboardGraficos`, `GraficoBarras`, `GraficoLinea`): se **conservan**
  (ítems más vendidos, mejores clientes, ventas por día); se alinean al look (cards blancas,
  dorado de acento) sin cambiar los datos/SVG.
- **Tabla "Últimos documentos"**: Fecha / Cliente / Tipo (badge) / Total, estilo Stitch. Si
  no existe hoy en el dashboard, se puede omitir o agregar solo si los datos ya están
  disponibles (no inventar una query nueva; si no hay datos a mano, no se agrega en R3).
- **Sin cambios** a la lógica de datos: las RPC/queries del dashboard (P6.1) quedan igual.

## 3. Restricciones globales

- Idioma español (Honduras); Lempiras `L.`.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores que ya tienen token. Iconos dorados
  con la regla `iconoMerlin` existente.
- Solo estilo + las 2 mejoras del sidebar (acordeón, arreglo de colapso). Sin cambios de
  lógica de negocio ni de datos.
- Persistencia de estado del sidebar en `localStorage` con guard de hidratación (patrón ya
  usado en la tienda para carrito/wishlist).
- No hay migración SQL en R3.

## 4. Pruebas y verificación

- `npm test` (verdes; si la lógica de rango de fechas del dashboard tiene tests, siguen
  verdes), `npx tsc --noEmit`, `npm run build`.
- **Visual (dev server, login admin):**
  - Sidebar look Stitch (blanco, header, iconos dorados, activo en pill, usuario abajo).
  - **Grupos colapsables**: plegar/desplegar un grupo persiste tras navegar y recargar.
  - **Colapso total**: colapsar a solo-iconos y **re-expandir** funciona; persiste.
  - Documentos (`/admin/pos/documentos`, `/admin/pos/documento/[id]`) muestran el sidebar.
  - Dashboard con el look Stitch, gráficos y filtro segmentado intactos; cambiar el filtro
    sigue actualizando los datos.

## Fuera de alcance

R4 (mostrador POS), R5 (tablas/pantallas internas de cada módulo admin); adoptar la nav de 6
ítems del mockup; cambios de datos/lógica del dashboard o de la navegación.
