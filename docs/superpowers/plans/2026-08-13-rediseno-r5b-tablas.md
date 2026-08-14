# Rediseño R5b — Tablas admin con patrón compartido — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-estilizar al look Stitch las 11 pantallas admin restantes creando un módulo CSS compartido que elimine la duplicación del patrón página/toolbar/tabla/botones/badges, y unificar todas las barras de búsqueda de la app a fondo blanco.

**Architecture:** Se crea `app/admin/tabla-admin.module.css` con el patrón Stitch ya validado en R5a (lista de productos como referencia interna). Las pantallas lo consumen con `composes` de CSS Modules, manteniendo sus nombres de clase locales — así los `.tsx` casi no cambian y lo específico de cada pantalla se queda en su módulo. Riesgo acotado: el módulo se crea y prueba primero en 4 tablas simples antes de adoptarse en el resto.

**Tech Stack:** Next.js 16 (App Router), TypeScript, CSS Modules. Nada nuevo.

**Spec:** `docs/superpowers/specs/2026-08-13-rediseno-r5b-tablas-design.md`

## Global Constraints

- Idioma español (Honduras); moneda Lempiras `L.`; **2 decimales** vía `formatPrice()`.
- **Solo estilo.** Sin tocar server actions, RPCs, exportadores, cálculos de compras/CxP (costeo, saldos, pagos, aplicaciones), kardex, validaciones ni queries. Conservar props/handlers/estado.
- **Hojas imprimibles intactas:** `HojaOrdenCompra`, estados de cuenta, `HojaKardex`, hojas fiscales, PDF de cotización.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores con token.
- **Especificidad (lección R4/R5a):** las reglas globales `input[type=...]`/`select` de `app/globals.css` (0,1,1) pisan clases de CSS Modules (0,1,0) — usar selectores compuestos (`.wrap .clase`) donde el re-skin cambie padding/fondo/tamaño de inputs.
- **Regla de buscadores:** fondo `var(--bg-card)` (blanco) + borde visible `var(--border-input)`. NUNCA `--bg-hover` con borde transparente (se pierde sobre la card).
- Sin migración SQL.
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes).
- **Gotcha OneDrive:** si el dev server sirve código viejo con archivos correctos en disco → parar server, `rm -rf .next`, reiniciar.

**Método de cada tarea de re-skin:** (1) leer el/los componente(s) y su CSS actual; (2) adoptar el compartido con `composes` donde encaje; (3) dejar en el módulo local lo específico; (4) verificar montos con `formatPrice` y que ningún handler cambió.

---

## File Structure

- `app/admin/tabla-admin.module.css` (crear) — patrón compartido: `.page`, `.topbar`, `.title`, `.subtitle`, `.tableWrap`, `.tabla`, `.filtros`, `.searchWrap`, `.search`, `.btnPrimary`, `.btnEdit`, `.btnDelete`, `.btnCancel`, `.badge` + variantes, `.empty`.
- **Grupo A:** `app/admin/{categorias,banners,cupones,envios}/*.module.css` (+ `.tsx` solo si hace falta un wrapper de búsqueda).
- **Grupo B:** `app/admin/{pedidos,clientes,movimientos}/*.module.css` + `app/admin/pos/documentos/documentos.module.css`.
- **Grupo C:** `app/admin/compras/compras.module.css` (+ `CompraEditor.tsx` si hace falta), `app/admin/cuentas-por-pagar/*.module.css`, `app/admin/cotizaciones/[id]/editor.module.css` (+ `CotizacionEditor.tsx`).
- **Barrido de buscadores:** `app/admin/productos/productos.module.css`, `app/admin/cotizaciones/cotizaciones.module.css`, `app/admin/pos/pos.module.css`, `app/admin/clientes/clientes.module.css`, `app/admin/pos/documentos/documentos.module.css`, `app/admin/cotizaciones/[id]/editor.module.css`.

---

## Task 1: Módulo compartido + Grupo A (tablas simples)

**Files:**
- Create: `app/admin/tabla-admin.module.css`
- Modify: `app/admin/categorias/categorias.module.css`, `app/admin/banners/banners.module.css`, `app/admin/cupones/cupones.module.css`, `app/admin/envios/envios.module.css`
- Modify (solo si hace falta estructura): los `.tsx` de esas 4 pantallas

**Interfaces:**
- Produces: `app/admin/tabla-admin.module.css` con las clases listadas abajo. Las Tasks 2–4 las consumen con `composes: <clase> from '../tabla-admin.module.css'` (ajustar la ruta relativa según la carpeta: `../tabla-admin.module.css` desde `app/admin/<modulo>/`, `../../tabla-admin.module.css` desde `app/admin/pos/documentos/` y `app/admin/cotizaciones/[id]/`).

- [ ] **Step 1: Crear el módulo compartido**

Crear `app/admin/tabla-admin.module.css` tomando como referencia el patrón ya aplicado en `app/admin/productos/productos.module.css` (R5a). Debe incluir, con tokens Merlin:

```css
/* Patrón compartido de las pantallas de tabla del admin (look Stitch, R5b).
   Se consume con `composes` desde cada módulo de pantalla, para que los .tsx
   conserven sus nombres de clase locales. */
.page { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.title { font-size: 1.75rem; font-weight: 700; color: var(--text); }
.subtitle { font-size: 0.85rem; color: var(--text-muted); }
.tableWrap { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-card); box-shadow: var(--shadow-card); overflow: hidden; }
.tabla { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.tabla th { background: var(--bg-hover); color: var(--text-muted); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; padding: 0.7rem 0.9rem; }
.tabla td { padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border-light); color: var(--text); }
.tabla tbody tr:hover td { background: var(--bg-hover); }
.filtros { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.searchWrap { position: relative; display: flex; align-items: center; }
.btnPrimary { padding: 0.55rem 1rem; white-space: nowrap; }
.btnEdit { background: none; border: none; color: var(--accent); font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0.2rem 0.4rem; }
.btnEdit:hover { text-decoration: underline; }
.btnDelete { background: none; border: none; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; padding: 0.2rem 0.4rem; }
.btnDelete:hover { color: var(--danger); }
.btnCancel { padding: 0.55rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-btn); background: var(--bg-card); color: var(--text); font-size: 0.85rem; cursor: pointer; }
.badge { display: inline-flex; align-items: center; padding: 0.2rem 0.6rem; border-radius: var(--radius-tag); font-size: 0.72rem; font-weight: 700; }
.badgeOk { background: var(--success-bg); color: var(--success); }
.badgeWarn { background: var(--accent-dim); color: var(--accent); }
.badgeDanger { background: var(--error-bg); color: var(--danger); }
.badgeMuted { background: var(--bg-hover); color: var(--text-muted); }
.empty { padding: 3rem; text-align: center; color: var(--text-muted); font-size: 0.88rem; }
```

Verificar que TODOS los tokens usados existan en `app/merlin.css`/`app/globals.css` (`--success-bg`, `--accent-dim`, `--error-bg`, `--border-light`, `--shadow-card`, `--radius-*`); si alguno no existe, usar el equivalente real que ya se use en el repo y anotarlo en el reporte.

- [ ] **Step 2: Regla de búsqueda compartida (fondo blanco)**

Agregar al mismo módulo, con selector compuesto para ganar a la regla global de inputs:

```css
/* Barras de búsqueda: fondo BLANCO con borde visible. El gris (--bg-hover)
   con borde transparente se pierde sobre las cards blancas del look Stitch
   (pedido del usuario, pase visual R5b). Selector compuesto: la regla global
   input[type=...] de app/globals.css (0,1,1) pisa una clase sola (0,1,0). */
.searchWrap .search {
  width: 100%;
  min-width: 220px;
  padding: 0.55rem 0.9rem 0.55rem 2.35rem;
  border: 1px solid var(--border-input);
  border-radius: var(--radius-btn);
  background: var(--bg-card);
  color: var(--text);
  font-size: 0.85rem;
}
.searchWrap .search:focus { outline: none; border-color: var(--accent); }
```

- [ ] **Step 3: Adoptar el compartido en las 4 tablas simples**

En `categorias.module.css`, `banners.module.css`, `cupones.module.css`, `envios.module.css`: reemplazar las definiciones locales duplicadas por `composes`, p. ej.:

```css
.page { composes: page from '../tabla-admin.module.css'; }
.topbar { composes: topbar from '../tabla-admin.module.css'; }
.table { composes: tabla from '../tabla-admin.module.css'; }
.btnPrimary { composes: btnPrimary from '../tabla-admin.module.css'; }
.btnEdit { composes: btnEdit from '../tabla-admin.module.css'; }
.btnDelete { composes: btnDelete from '../tabla-admin.module.css'; }
.btnCancel { composes: btnCancel from '../tabla-admin.module.css'; }
```

OJO con los nombres reales de cada módulo (unos usan `.table`, otros `.tabla`) — mantener el nombre LOCAL que ya usa el `.tsx` y solo componer desde el compartido, para no tocar los `.tsx`. Lo que sea específico de la pantalla (anchos de columna, estilos de formulario propios) se conserva tal cual. `composes` debe ser la PRIMERA declaración de la regla.

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (login admin, si el entorno lo permite): las 4 pantallas con el look nuevo (toolbar, tabla con encabezado gris y hover, botones). Si no puedes autenticarte, verifica por estructura/estilos computados.

```bash
git add app/admin/tabla-admin.module.css app/admin/categorias app/admin/banners app/admin/cupones app/admin/envios
git commit -m "feat(admin): modulo compartido de tablas + grupo A (categorias, banners, cupones, envios) (R5b)"
```

---

## Task 2: Barrido de buscadores a fondo blanco (app-wide)

**Files:**
- Modify: `app/admin/productos/productos.module.css` (`.searchWrap .searchInput`, ~línea 59)
- Modify: `app/admin/cotizaciones/cotizaciones.module.css` (`.searchWrap .searchInput`, ~línea 57)
- Modify: `app/admin/pos/pos.module.css` (`.searchInputWrap .searchInput`, ~línea 535)
- Modify: `app/admin/clientes/clientes.module.css` (`.search`, ~línea 34)
- Modify: `app/admin/pos/documentos/documentos.module.css` (`.search`, ~línea 18)
- Modify: `app/admin/cotizaciones/[id]/editor.module.css` (`.searchInput`, ~línea 120)

**Contexto (verificado):** productos y cotizaciones usan hoy `background: var(--bg-hover)` con `border: 1px solid transparent` — por eso el campo "no se ve" sobre la card. `compras.module.css:209` ya usa `var(--bg-card)` + `var(--border-input)`: **ese es el patrón correcto**, no se toca.

- [ ] **Step 1: Corregir los buscadores con fondo gris**

En cada regla listada: cambiar `background: var(--bg-hover)` → `background: var(--bg-card)` y `border: 1px solid transparent` → `border: 1px solid var(--border-input)`. Conservar el resto (padding, radio, tamaño, el `padding-left` que deja sitio al icono de lupa). Mantener el `:focus` con `border-color: var(--accent)`.

- [ ] **Step 2: Verificar que no quede ningún buscador gris**

Run: `grep -rn "bg-hover" app/admin --include=*.module.css | grep -iE "search|busqueda"`
Expected: sin resultados (o solo coincidencias que NO sean el fondo del input de búsqueda — revisarlas y reportarlas).
También revisar `app/admin/clientes/clientes.module.css` y `app/admin/pos/documentos/documentos.module.css`: si su `.search` solo define `width`, el fondo viene de la regla global — en ese caso envolverlo no es necesario, pero SÍ hay que confirmar que se ve blanco (la regla global usa `--bg-input`; si `--bg-input` no es blanco, darles fondo `--bg-card` explícito con selector compuesto).

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.
Visual: los buscadores de productos, cotizaciones (kanban), POS (catálogo), clientes, documentos y editor de cotización se ven como campos blancos con borde.

```bash
git add app/admin/productos/productos.module.css app/admin/cotizaciones/cotizaciones.module.css app/admin/pos/pos.module.css app/admin/clientes/clientes.module.css app/admin/pos/documentos/documentos.module.css "app/admin/cotizaciones/[id]/editor.module.css"
git commit -m "fix(admin): barras de busqueda con fondo blanco y borde visible (R5b)"
```

---

## Task 3: Grupo B — tablas con filtros y badges

**Files:**
- Modify: `app/admin/pedidos/pedidos.module.css` (+ `PedidosClient.tsx` si hace falta)
- Modify: `app/admin/clientes/clientes.module.css` (+ `ClientesClient.tsx` si hace falta)
- Modify: `app/admin/movimientos/movimientos.module.css`
- Modify: `app/admin/pos/documentos/documentos.module.css`

**Interfaces:**
- Consumes: las clases de `app/admin/tabla-admin.module.css` (Task 1) vía `composes`. Ruta: `../tabla-admin.module.css` desde `app/admin/<modulo>/`; `../../tabla-admin.module.css` desde `app/admin/pos/documentos/`.

- [ ] **Step 1: Adoptar el compartido**

En las 4 pantallas: componer `.page`/`.topbar`/`.table`(o `.tabla`)/`.filtros`/`.btn*`/`.empty` desde el compartido, conservando los nombres locales que usan los `.tsx`. Los **badges propios** de cada pantalla (estado de pedido, `.badgeCliente`/`.badgeProveedor`/`.badgeExonerado`/`.badgeRevendedor` de clientes, tipo de movimiento, tipo de documento) se mantienen en su módulo pero **componen** `.badge` del compartido para heredar forma/tamaño, cambiando solo color: `composes: badge from '...'` + `background`/`color` propios. Los chips de filtro que ya usan `btnMerlinChip` global se dejan igual.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual: las 4 pantallas con tabla/toolbar/badges coherentes; filtros y acciones funcionando.

```bash
git add app/admin/pedidos app/admin/clientes app/admin/movimientos app/admin/pos/documentos
git commit -m "feat(admin): grupo B (pedidos, clientes, movimientos, documentos POS) con el patron compartido (R5b)"
```

---

## Task 4: Grupo C — compras y cuentas por pagar

**Files:**
- Modify: `app/admin/compras/compras.module.css` (+ `app/admin/compras/ComprasClient.tsx` / `[id]/CompraEditor.tsx` si hace falta)
- Modify: `app/admin/cuentas-por-pagar/*.module.css` (+ sus `.tsx` si hace falta)
- NO tocar: `app/admin/compras/[id]/orden/HojaOrdenCompra.tsx`, `app/admin/cuentas-por-pagar/proveedor/[id]/HojaEstadoCuenta.tsx` (hojas imprimibles)

**ZONA SENSIBLE:** compras y CxP muestran costos, saldos, pagos y aplicaciones. **Ningún número se recalcula ni se re-formatea** fuera del `formatPrice()` que ya tengan; ninguna server action ni cálculo se toca.

- [ ] **Step 1: Compras (lista + editor)**

Adoptar el compartido donde encaje (página, toolbar, tabla, botones, badges de estado de compra). El editor de compra (`CompraEditor.tsx`) alinea su formulario al patrón de **cards por sección** del editor de producto (R5a) si su estructura lo permite; si su layout es muy propio, solo alinear inputs/botones/tabla de líneas sin re-maquetar. Conservar toda la lógica (líneas, costos, totales, guardar, recibir).

- [ ] **Step 2: Cuentas por pagar**

Adoptar el compartido en la lista/tablero de CxP y sus modales de pago (alineación ligera, mismo lenguaje que los modales ya re-skineados). Conservar la lógica de pagos/aplicaciones/saldos.

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual: compras y CxP con el look nuevo; **confirmar que los montos mostrados son los mismos que antes** (comparar una compra y un saldo concretos).

```bash
git add app/admin/compras app/admin/cuentas-por-pagar
git commit -m "feat(admin): compras y cuentas por pagar con el patron compartido (R5b)"
```

---

## Task 5: Editor de cotización

**Files:**
- Modify: `app/admin/cotizaciones/[id]/CotizacionEditor.tsx`
- Modify: `app/admin/cotizaciones/[id]/editor.module.css`
- NO tocar: `app/admin/cotizaciones/[id]/pdf/` (vista imprimible)

**Contexto:** es la pantalla más grande de las pendientes (~1053 líneas de `.tsx`). Sigue el patrón de **cards por sección** del editor de producto (R5a), que el usuario ya validó visualmente.

- [ ] **Step 1: Re-skin en cards por sección**

Agrupar el formulario en cards con encabezado (p. ej.: datos del cliente/cotización, líneas/ítems, totales, términos/notas), inputs redondeados (selector compuesto), botones de acción al look nuevo (guardar negro, secundarios outline). La tabla de líneas adopta el patrón de tabla del compartido donde encaje. **Conservar TODA la lógica**: agregar/quitar líneas, precios, descuentos, cálculo de totales, guardar, duplicar, convertir a documento, bloqueo de facturadas.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual: abrir una cotización existente, verificar que los totales son los mismos y que agregar/quitar una línea sigue funcionando; la vista PDF no cambió.

```bash
git add "app/admin/cotizaciones/[id]/CotizacionEditor.tsx" "app/admin/cotizaciones/[id]/editor.module.css"
git commit -m "feat(admin): re-skin del editor de cotizacion en cards por seccion (R5b)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Módulo compartido `tabla-admin.module.css` con el patrón + consumo por `composes` → Task 1. ✅
- Regla de buscadores fondo blanco (en el compartido) → Task 1 Step 2; barrido de los existentes → Task 2. ✅
- Grupo A (categorías, banners, cupones, envíos) → Task 1 Step 3. ✅
- Grupo B (pedidos, clientes, movimientos, documentos POS) → Task 3. ✅
- Grupo C (compras, CxP) → Task 4; editor de cotización → Task 5. ✅
- Mitigación de riesgo (compartido probado primero en grupo A) → orden de tareas: Task 1 crea+prueba en A, Tasks 3–4 adoptan después. ✅
- Solo estilo / dinero intocable / hojas imprimibles / tokens / especificidad / sin migración → Global Constraints + notas por tarea. ✅

**2. Placeholder scan:** el módulo compartido va con su CSS completo; el barrido de buscadores nombra archivo y línea verificados; las tareas de adopción explican el mecanismo (`composes`, nombres locales, rutas relativas). Sin TBD.

**3. Type consistency:** ninguna tarea cambia interfaces TS. Los nombres de clase del compartido (`.page`, `.topbar`, `.title`, `.subtitle`, `.tableWrap`, `.tabla`, `.filtros`, `.searchWrap`, `.search`, `.btnPrimary`, `.btnEdit`, `.btnDelete`, `.btnCancel`, `.badge`, `.badgeOk`, `.badgeWarn`, `.badgeDanger`, `.badgeMuted`, `.empty`) se definen en Task 1 y se consumen con esos mismos nombres en Tasks 3–4.

## Notas de entrega (para el controlador SDD)

- **Sin migración.** No hay smoke SQL.
- **Login admin:** verificación visual por estructura/estilos si el subagente no puede autenticarse; el **pase visual final lo hace el usuario con el chrome agent**.
- **Riesgo del compartido:** si en Task 1 el patrón no encaja bien en alguna de las 4 simples, detenerse y reportar antes de que Tasks 3–4 lo adopten.
- **Orden:** 1 → 2 → 3 → 4 → 5.
- Al mergear: FF a `main`, push, verificar deploy (el conector de Vercel puede estar caído; alternativa: `gh api repos/jeffrey94lopez/hondusport-next/deployments`).
