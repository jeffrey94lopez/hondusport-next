# Rediseño R3 — Shell del admin + Dashboard — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-estilizar el shell del admin (sidebar + layout) y el dashboard al look Stitch, agregando títulos de grupo colapsables (acordeón persistido) y el arreglo del colapso total del sidebar, sin cambiar la navegación ni los datos.

**Architecture:** `components/admin/Sidebar.tsx` (client) se re-estiliza a Stitch y gana dos interacciones de colapso persistidas en `localStorage` (por grupo + total). `app/admin/layout.tsx` (server) pasa el usuario de la sesión al sidebar. El dashboard (`app/admin/page.tsx` + componentes) se re-estiliza vía `dashboard.module.css`/`graficos.module.css` conservando todo el contenido, los gráficos y los datos de P6.1.

**Tech Stack:** Next.js 16 (App Router, Server + Client Components), TypeScript, CSS Modules, Supabase Auth.

## Global Constraints

- Idioma español (Honduras); moneda Lempiras `L.`.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores que ya tienen token. Iconos dorados con la regla `iconoMerlin` existente.
- **Solo estilo + las 2 interacciones del sidebar** (grupos colapsables, arreglo del colapso total). Sin cambios de lógica de negocio ni de datos (dashboard: mismas RPC/queries; sidebar: mismas rutas de `NAV_GROUPS`).
- Persistencia del estado del sidebar en `localStorage` con **guard de hidratación** (patrón de montaje ya usado en la tienda para carrito/wishlist: un `useState(false)` `montado` que se pone `true` en un `useEffect`, para no leer `localStorage` en el render del servidor).
- Se conserva la nav agrupada actual (NO se adopta la nav de 6 ítems del mockup).
- No hay migración SQL en R3.
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes).

---

## File Structure

- `components/admin/Sidebar.tsx` (modificar) — re-skin + prop de usuario + interacciones de colapso.
- `components/admin/Sidebar.module.css` (modificar) — look Stitch + estilos de acordeón/footer.
- `app/admin/layout.tsx` (modificar) — pasar el usuario de la sesión al `Sidebar`.
- `app/admin/layout.module.css` (modificar) — fondo/spacing del shell al look Stitch.
- `app/admin/dashboard.module.css` (modificar) — re-skin de cards/filtro/tabla últimos documentos.
- `app/admin/FiltroFechas.tsx` (modificar si hace falta para el pill) — filtro segmentado.
- `app/admin/DashboardGraficos.tsx` / `app/admin/graficos.module.css` (modificar) — alinear las cards de gráficos.
- `app/admin/KpiSegmento.tsx` (modificar si hace falta; su estilo vive en `dashboard.module.css`).

**Referencia visual (todas las tareas):** `docs/diseno/stitch/hondusport_admin_dashboard_de_inicio/screen.png` + `code.html` (y `hondusport_panel_de_administracion/` para el shell). Replicar el LOOK; no copiar el HTML de Stitch.

---

## Task 1: Re-skin del shell (Sidebar look + layout + footer de usuario)

**Files:**
- Modify: `components/admin/Sidebar.tsx`
- Modify: `components/admin/Sidebar.module.css`
- Modify: `app/admin/layout.tsx`
- Modify: `app/admin/layout.module.css`

**Interfaces:**
- Produces: `Sidebar` acepta una prop nueva `userName: string` (además del `pendingOrders` actual). Task 2 sigue trabajando sobre este mismo `Sidebar`.

**Contexto:** hoy `Sidebar` tiene header `HS`+`Hondusport`; `layout.tsx` le pasa solo `pendingOrders`. Se re-estiliza a Stitch: sidebar blanco, header "Hondusport Admin / Panel de Control", iconos dorados (ya usa `iconoMerlin`), activo en pill, y footer de usuario abajo.

- [ ] **Step 1: Pasar el usuario de la sesión desde el layout**

En `app/admin/layout.tsx`, obtener el usuario y pasarlo al `Sidebar`:
```tsx
const { data: { user } } = await supabase.auth.getUser()
const userName =
  (user?.user_metadata?.nombre as string | undefined) ?? user?.email ?? 'Admin'
```
y `<Sidebar pendingOrders={count ?? 0} userName={userName} />`.

- [ ] **Step 2: Header + footer de usuario en `Sidebar`**

En `components/admin/Sidebar.tsx`:
- Agregar `userName: string` a `Props`.
- Header: logo + **"Hondusport Admin"** con subtítulo **"Panel de Control"** (dos líneas), conservando el botón de colapso (‹/›) — su comportamiento se arregla en Task 2, aquí solo el estilo.
- Footer (al final del `.bottom`, después de Configuración/Salir, o en su propia zona): avatar circular (un placeholder con iniciales si no hay imagen) + `userName`. Se oculta el texto en modo colapsado (igual que los labels).

- [ ] **Step 3: Look Stitch en el CSS**

En `components/admin/Sidebar.module.css` y `app/admin/layout.module.css`: sidebar blanco (`var(--bg-card)`/blanco), header con la marca en negro y subtítulo muted; ítem activo en **pill** (fondo suave dorado/gris, texto acento) con `var(--radius-input)`/`var(--radius-tag)`; iconos dorados (ya `var(--brand)`); footer de usuario con avatar circular. Fondo de página del shell (`layout.module.css .content`/`.shell`) al gris claro del mockup. Tokens Merlin; no hardcodear valores con token.

- [ ] **Step 4: Verificar documentos con menú**

Verificar (dev server, login admin) que `/admin/pos/documentos` y `/admin/pos/documento/[id]` muestran el sidebar. Si el sidebar no aparece o queda tapado, diagnosticar (z-index/overlay) y corregir mínimamente. Si ya se ve bien, dejar constancia. NO re-maquetar la hoja del documento.

- [ ] **Step 5: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual (login admin): sidebar look Stitch (blanco, "Hondusport Admin / Panel de Control", iconos dorados, activo en pill, usuario abajo). Si no puedes autenticarte, verifica por estructura/estilos computados y dilo.

```bash
git add components/admin/Sidebar.tsx components/admin/Sidebar.module.css app/admin/layout.tsx app/admin/layout.module.css
git commit -m "feat(admin): re-skin del sidebar al look Stitch + footer de usuario (R3)"
```

---

## Task 2: Interacciones del sidebar (grupos colapsables + arreglo del colapso total, persistidos)

**Files:**
- Modify: `components/admin/Sidebar.tsx`
- Modify: `components/admin/Sidebar.module.css`

**Interfaces:**
- Consumes: el `Sidebar` re-estilizado de Task 1 (con `NAV_GROUPS`, `collapsed`, `isActive`).

**Objetivo:** (a) hacer los **títulos de grupo colapsables** (acordeón), (b) **arreglar el colapso total** para que re-expanda, ambos con estado persistido en `localStorage` y guard de hidratación.

- [ ] **Step 1: Guard de hidratación + persistencia**

En `Sidebar.tsx`, agregar un `const [montado, setMontado] = useState(false)` y `useEffect(() => setMontado(true), [])`. Leer el estado persistido solo cuando `montado` es true (para no divergir SSR/CSR). Claves:
- `hs_admin_sidebar_colapsado` (string `'true'`/`'false'`) para el colapso total.
- `hs_admin_nav_groups` (JSON `{ [label]: boolean }`) para los grupos plegados.
Al cambiar cada estado, escribir en `localStorage`.

- [ ] **Step 2: Grupos colapsables (acordeón)**

Convertir el título de cada grupo (`.groupLabel`) en un **botón** con un chevron (▸/▾) que alterna un estado `gruposColapsados[label]`. Cuando un grupo está colapsado, no renderizar sus `items`. Por defecto, un grupo está **expandido** si contiene la ruta activa (usar `isActive` sobre sus items) o si el usuario no lo ha plegado; respetar el valor persistido cuando exista. En modo **colapso total** (solo-iconos) los títulos se ocultan y se muestran todos los iconos (el acordeón no aplica ahí).

- [ ] **Step 3: Arreglo del colapso total**

Asegurar que el botón de colapso total (‹/›) esté **siempre renderizado y clickeable** en ambos estados y que `setColapsado(false)` re-expanda (diagnosticar por qué hoy no re-expande: el botón debe quedar visible, con área de clic > 0, no tapado por `overflow`/otro elemento en estado colapsado). Persistir el estado. Mantener los `title`/tooltips de los ítems en modo colapsado.

- [ ] **Step 4: Estilos del acordeón**

En `Sidebar.module.css`: estilo del título-botón de grupo (chevron, hover), y transición sutil al plegar/desplegar. Reusar tokens Merlin.

- [ ] **Step 5: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (login admin): plegar/desplegar un grupo persiste tras navegar y recargar; colapsar a solo-iconos y **re-expandir** funciona y persiste; el grupo de la ruta activa aparece expandido. Si no puedes autenticarte, verifica por estructura/DOM y dilo.

```bash
git add components/admin/Sidebar.tsx components/admin/Sidebar.module.css
git commit -m "feat(admin): grupos del sidebar colapsables + arreglo del colapso total, persistidos (R3)"
```

---

## Task 3: Re-skin del dashboard (Inicio)

**Files:**
- Modify: `app/admin/dashboard.module.css`
- Modify: `app/admin/FiltroFechas.tsx` (si hace falta para el pill)
- Modify: `app/admin/DashboardGraficos.tsx` / `app/admin/graficos.module.css`
- Modify: `app/admin/KpiSegmento.tsx` (si hace falta; su estilo vive en `dashboard.module.css`)

**Interfaces:**
- Consumes: `app/admin/page.tsx` ya arma el dashboard (`FiltroFechas`, 6 `KpiSegmento`, `DashboardGraficos`, tabla "Últimos documentos" con `data.ultimosDocumentos`). NO se cambia la lógica de datos ni la estructura de `page.tsx` (salvo clases si hace falta).

**Contexto:** el dashboard ya trae segmentos, KPIs, gráficos y "Últimos documentos" con datos reales. Esta tarea solo re-estiliza al look Stitch.

- [ ] **Step 1: Cards KPI + página**

En `app/admin/dashboard.module.css`: `.page` con el fondo gris claro; `.topbar`/`.title` "Inicio" grande; `.segmentos` como grid responsivo de **cards blancas redondeadas** (`.segmento`) con sombra; `.segmentoHead` con **icono dorado** + título; `.segValor` número grande; `.segLabel` muted; `.segAlerta` en rojo (stock bajo / utilidad negativa / sin procesar / perdidas). Sub-líneas con color semántico donde el mockup lo muestra (verde para utilidad/cobrado/pagado — se puede aplicar por regla de clase si el dato lo amerita, sin cambiar el marcado de datos). Tokens Merlin.

- [ ] **Step 2: Filtro segmentado (pill)**

`FiltroFechas` + su CSS: los botones Hoy/Semana/Mes/Año/Personalizado como **pill segmentado** (contenedor redondeado, el activo en negro/`var(--cta)` con texto blanco). Conservar la lógica de navegación/rango (P6.1) — solo estilo.

- [ ] **Step 3: Tabla "Últimos documentos" + gráficos**

`.ultimos`/`.pedidosList`/`.pedidoRow` con el estilo Stitch (filas con Fecha/Cliente/Tipo como badge/Total, hover). `DashboardGraficos`/`graficos.module.css`: envolver los gráficos en cards blancas redondeadas con título e icono/acento dorado, sin cambiar los datos ni el SVG. Conservar los enlaces (`Link` a `/admin/pos/documento/[id]`).

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes (incluida la lógica de rango de fechas si tiene tests).
Visual (login admin, `/admin`): dashboard con el look Stitch (cards blancas, iconos dorados, filtro pill, últimos documentos, gráficos); cambiar el filtro sigue actualizando los datos. Si no puedes autenticarte, verifica por estructura/estilos computados y dilo.

```bash
git add app/admin/dashboard.module.css app/admin/FiltroFechas.tsx app/admin/DashboardGraficos.tsx app/admin/graficos.module.css app/admin/KpiSegmento.tsx
git commit -m "feat(admin): re-skin del dashboard al look Stitch (cards, filtro, graficos) (R3)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Shell re-skin (sidebar blanco, header, iconos dorados, activo pill, usuario abajo) → Task 1. ✅
- Footer de usuario desde la sesión → Task 1. ✅
- Verificar documentos con menú → Task 1 Step 4. ✅
- Títulos de grupo colapsables (persistidos) → Task 2. ✅
- Arreglo del colapso total (persistido) → Task 2. ✅
- Guard de hidratación → Task 2 Step 1 (constraint). ✅
- Dashboard re-skin conservando contenido/gráficos/datos → Task 3. ✅
- Filtro segmentado pill → Task 3 Step 2. ✅
- Últimos documentos → Task 3 Step 3 (ya existe con datos reales). ✅
- Sin cambios de datos/lógica; nav agrupada conservada → constraints. ✅

**2. Placeholder scan:** las tareas dan directivas concretas sobre archivos reales (leídos: `Sidebar.tsx`, `Sidebar.module.css`, `layout.tsx`, `page.tsx`, `KpiSegmento.tsx`) + referencia Stitch + claves de `localStorage` concretas + el snippet del usuario de sesión. Es un re-skin: los valores exactos de CSS salen de la referencia Stitch, no son placeholders de lógica.

**3. Type consistency:** `Sidebar` gana `userName: string` en Task 1 y Task 2 sigue sobre el mismo componente; el layout pasa `userName` (Task 1). Claves de `localStorage` (`hs_admin_sidebar_colapsado`, `hs_admin_nav_groups`) definidas en Task 2 y usadas solo ahí.

## Notas de entrega (para el controlador SDD)

- **Sin migración** (solo shell + dashboard admin). No hay smoke SQL.
- **Login admin:** toda la verificación visual (sidebar, dashboard, documentos) requiere sesión admin; si el subagente no puede autenticarse, verifica por estructura/estilos computados y deja constancia.
- **Orden:** 1 → 2 → 3 (Task 1 y 2 tocan `Sidebar.tsx` en secuencia; Task 3 es independiente).
- Al mergear: FF a `main`, verificar deploy READY por SHA; confirmar con el usuario antes de producción.
