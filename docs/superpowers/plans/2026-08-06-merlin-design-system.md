# Sistema de diseño Merlin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aplicar el sistema de diseño Merlin (`merlin-hondusport.md`) a toda la plataforma — tienda pública (claro + oscuro derivado) y admin (re-tema completo a claro) — mediante una capa central de tokens semánticos.

**Architecture:** un archivo global `app/merlin.css` define los tokens semánticos (valores exactos de Merlin); `.storeRoot` (tienda) y `:root` (admin) re-mapean sus variables existentes a esos tokens — eso re-tematiza ~72% de la tienda y ~71% del admin "gratis" (209/214 usos de `var()` concentrados en pocas variables); después se migran módulo por módulo los valores hardcodeados. Poppins entra vía `next/font/google` y reemplaza a Inter y Bebas Neue.

**Tech Stack:** Next.js 16 (App Router), CSS Modules, `next/font/google`. Sin librerías nuevas.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-merlin-design-system-design.md` — el mapeo Merlin→semántico y los valores exactos viven ahí y en `merlin-hondusport.md`; NO inventar valores.
- **Este proyecto NO toca lógica.** Solo CSS, `className`, y los 3 mapas de color en TS identificados (badges/estados). La suite (233 tests) debe permanecer verde en todas las tareas; `npx tsc --noEmit` y `npm run lint` (0 errores) también.
- Commits en español, formato convencional (`feat(diseno): …`).
- Rama: `feature/merlin-design-system`, creada desde `main` DESPUÉS de fusionar `feature/variantes-padre-hijo`.
- **Reglas de migración de valores hardcodeados** (aplican a TODA tarea de componente):
  - Radios: inputs y botones de acción → `var(--radius-input)` (9px); cards/alerts/modales/drawers → `var(--radius-card)` (9px); botones → `var(--radius-btn)` (25px, pill); chips/tags/badges (hoy `999px`/`20px`/`26px`) → `var(--radius-tag)` (26px). Radios estructurales grandes sueltos (12–30px en overlays/imágenes) → `var(--radius-card)` salvo que rompa la forma (documentar en el reporte si se conserva).
  - Sombras: toda `box-shadow` propia → `var(--shadow-card|raised|pop|modal)` según elevación (reposo / dropdown / hover-popover / modal-drawer).
  - Colores: `#e74c3c`→`var(--error)` (o badge, ver Task 6); `#27ae60`→`var(--success)`; `#f1c40f`→`var(--warning-star)` (token definido en Task 1 para estrellas de rating); grises sueltos → el token `--ink*`/`--line`/`--hover-input` más cercano; `#25d366` (WhatsApp) se CONSERVA (color de marca externa).
  - `font-family` en módulos: ELIMINAR la declaración (heredan Poppins del global); excepción: `monospace` en `cupones.module.css` se conserva.
  - `text-transform: uppercase`: eliminar (26 en módulos + 1 global), salvo abreviaturas funcionales tipo SKU si las hay (documentar).
  - Jerarquía tipográfica: títulos de página/hero → `font: var(--text-header)`; títulos de sección → `var(--text-title)`; labels/subtítulos → `var(--text-subtitle)`; caption/notas → `var(--text-caption)`.
- **Checkpoint visual por fase:** al cerrar cada fase, el controller levanta el dev server y revisa con el usuario (desktop + móvil; tienda en claro Y oscuro). No se avanza de fase sin visto bueno visual del usuario.
- No tocar: `@import` de Font Awesome, `prefers-reduced-motion` de store-globals, la inyección `--primary` desde BD en `ThemeRoot.tsx` (línea del `style={{'--primary': accent}}` — sigue funcionando porque `--primary` se re-mapea a `--brand` con el mismo valor por defecto), y los archivos legacy fuera del build (`styles.css`, `admin-hs/`, `index.html`, `app.js`).

---

## Fase 1 — Fundación

### Task 1: Capa de tokens `app/merlin.css` + Poppins vía next/font

**Files:**
- Create: `app/merlin.css`
- Modify: `app/layout.tsx` (next/font + import del CSS)
- Modify: `app/globals.css:1` (eliminar `@import` de Inter; `font-family` del body)

**Interfaces:**
- Produces: todos los tokens `--brand*, --cta*, --page, --card, --ink*, --hover-input, --line, --error*, --warning*, --success*, --info*, --radius-*, --shadow-*, --text-*, --gradient-*` y las clases globales de botón `.btnMerlinPrimary`, `.btnMerlinSecondary`, `.btnMerlinTertiary` (consumidas por Tasks 4–13). Variable de fuente `--font-poppins`.

- [ ] **Step 1: Crear `app/merlin.css`** con el contenido completo (valores exactos del spec):

```css
/* Tokens del sistema de diseño Merlin (merlin-hondusport.md).
   Nombres semánticos: el mapeo Merlin→semántico vive en el spec
   2026-08-06-merlin-design-system-design.md. */
:root {
  /* Marca (dorado) */
  --brand: #c9a84c;
  --brand-hover: #a58a3e;
  --brand-subtle: #efe5c9;
  --brand-bg: #faf6ed;
  /* CTA (negro) */
  --cta: #0a0a0a;
  --cta-hover: #080808;
  --cta-disabled-bg: #6c6c6c;
  --cta-disabled-text: #b6b6b6;
  /* Superficies y texto */
  --page: #f7f8fb;
  --card: #ffffff;
  --ink: #1e1e1e;
  --ink-muted: #606060;
  --ink-disabled: #969696;
  --hover-input: #f3f3f3;
  --line: #e7e7e7;
  /* Estados */
  --error: #910022;
  --error-deep: #610017;
  --error-strong: #c31a2f;
  --error-bg: #fbf3f5;
  --warning: #a16b00;
  --warning-deep: #5b3100;
  --warning-star: #ffc217;
  --warning-bg: #fff3d1;
  --success: #1b8959;
  --success-deep: #0b3b26;
  --success-strong: #6cdcab;
  --success-bg: #f4fdf9;
  --info: #0a53a5;
  --info-deep: #052d65;
  --info-strong: #227ad1;
  --info-bg: #f1f9ff;
  /* Forma */
  --radius-input: 9px;
  --radius-card: 9px;
  --radius-btn: 25px;
  --radius-tag: 26px;
  /* Sombras */
  --shadow-card: 0px 4px 12px 0px rgba(18, 30, 108, 0.08);
  --shadow-raised: 0px 4px 16px 0px rgba(18, 30, 108, 0.08);
  --shadow-pop: 0px 8px 20px 0px rgba(18, 30, 108, 0.08);
  --shadow-modal: 0px 12px 28px 0px rgba(18, 30, 108, 0.08);
  /* Gradientes */
  --gradient-h: linear-gradient(to right, #c9a84c, #0a0a0a);
  --gradient-v: linear-gradient(to bottom, #0a0a0a, #c9a84c);
  /* Tipografía (shorthands para font:) */
  --text-header: 500 clamp(32px, 5vw, 48px)/1.08 var(--font-poppins), sans-serif;
  --text-title: 400 28px/32px var(--font-poppins), sans-serif;
  --text-subtitle: 600 16px/24px var(--font-poppins), sans-serif;
  --text-body: 400 16px/24px var(--font-poppins), sans-serif;
  --text-caption: 700 12px/16px var(--font-poppins), sans-serif;
}

/* Variantes de botón Merlin (pill). Los módulos las componen con sus
   clases propias: className={`${styles.addBtn} btnMerlinPrimary`}. */
.btnMerlinPrimary,
.btnMerlinSecondary,
.btnMerlinTertiary {
  border: none;
  border-radius: var(--radius-btn);
  font: var(--text-subtitle);
  cursor: pointer;
}
.btnMerlinPrimary { background: var(--cta); color: #ffffff; }
.btnMerlinPrimary:hover:not(:disabled) { background: var(--cta-hover); }
.btnMerlinPrimary:disabled {
  background: var(--cta-disabled-bg);
  color: var(--cta-disabled-text);
  cursor: not-allowed;
}
.btnMerlinSecondary { background: var(--brand-bg); color: var(--brand); }
.btnMerlinSecondary:hover:not(:disabled) { background: var(--brand-subtle); }
.btnMerlinTertiary { background: var(--hover-input); color: var(--brand); }
.btnMerlinTertiary:hover:not(:disabled) { background: var(--line); }
.btnMerlinSecondary:disabled,
.btnMerlinTertiary:disabled { color: var(--ink-disabled); cursor: not-allowed; }
```

- [ ] **Step 2: Poppins en `app/layout.tsx`**

```tsx
import { Poppins } from 'next/font/google'
import './merlin.css'
import './globals.css'

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
})
```

y en el JSX: `<body className={poppins.variable}>`. (`merlin.css` se importa ANTES de `globals.css` para que los tokens existan cuando globals los consuma.)

- [ ] **Step 3: `app/globals.css`** — eliminar la línea 1 (`@import` de Inter) y cambiar el `font-family` del body a `var(--font-poppins), system-ui, sans-serif`.

- [ ] **Step 4: Verificar** — `npm run build` (la fuente compila), `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: todo verde; la UI aún se ve igual salvo la fuente del admin (Poppins).

- [ ] **Step 5: Commit**

```bash
git add app/merlin.css app/layout.tsx app/globals.css
git commit -m "feat(diseno): capa de tokens Merlin y Poppins via next/font"
```

---

### Task 2: Re-tema claro del `:root` admin

**Files:**
- Modify: `app/globals.css` (bloque `:root` líneas ~5–27, inputs ~42–58, scrollbar ~73–76)

**Interfaces:**
- Consumes: tokens de Task 1.
- Produces: variables admin re-mapeadas — los 15 CSS modules del admin cambian de piel sin tocarlos (214 usos de `var()`).

- [ ] **Step 1: Reescribir el `:root`** de `app/globals.css`:

```css
:root {
  --bg:           var(--page);
  --bg-deep:      #eef0f5;
  --bg-card:      var(--card);
  --bg-hover:     var(--hover-input);
  --bg-input:     var(--page);
  --border:       var(--line);
  --border-light: #f0f0f0;
  --border-input: var(--line);
  --accent:       var(--brand);
  --accent-dim:   var(--brand-bg);
  --accent-border: var(--brand-subtle);
  --text:         var(--ink);
  --text-muted:   var(--ink-muted);
  --text-dim:     var(--ink-disabled);
  --danger:       #910022;   /* --error */
  --success:      #1b8959;   /* Merlin success-150 (no var(): el nombre choca) */
  --warning:      #a16b00;   /* Merlin warning-150 (idem) */
  --info:         #0a53a5;   /* Merlin info-150 (idem) */
  --sidebar-w:    200px;
  --sidebar-col:  52px;
  --topbar-h:     52px;
}
```

(Las variables admin conservan sus NOMBRES actuales para no tocar los 15 módulos todavía; `--success/--warning/--info` llevan el valor literal porque referenciar `var(--success)` desde `--success` sería circular — el token global y el alias admin comparten nombre.)

- [ ] **Step 2: Inputs y scrollbar** — en el bloque de inputs: `border-radius: 7px` → `var(--radius-input)`; hover/focus quedan (focus ya usa `--accent`). Scrollbar: thumb `#2a2a2a`/`#3a3a3a` → `var(--line)` / `var(--ink-disabled)`. Añadir a `html, body`: nada más (el bg ya viene de `--bg`).

- [ ] **Step 3: Verificación visual rápida** — `npm run dev`, abrir `/admin`: fondo claro `#f7f8fb`, cards blancas, texto oscuro, acento dorado. Se esperan restos oscuros hardcodeados en módulos (se barren en Fase 4). `npm test` + `npm run lint` + `npx tsc --noEmit` verdes.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(diseno): re-tema claro Merlin del admin via :root"
```

---

### Task 3: Re-mapeo de `.storeRoot` + tipografía de tienda

**Files:**
- Modify: `app/(store)/store-globals.css`

**Interfaces:**
- Consumes: tokens de Task 1.
- Produces: variables de tienda re-mapeadas (los 17 módulos cambian ~72% gratis); tema oscuro derivado; escala Poppins en títulos.

- [ ] **Step 1: Reescribir `.storeRoot`** (se conservan los NOMBRES de variables que consumen los módulos):

```css
.storeRoot {
  --primary: var(--brand);
  --bg: var(--page);
  --text: var(--ink);
  --text-muted: var(--ink-muted);
  --card: var(--card);
  --border: var(--line);
  --btn-bg: var(--cta);
  --btn-text: #ffffff;
  --btn-hover: var(--cta-hover);
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --max-width: 1400px;
  --qty-btn-bg: var(--brand);
  --qty-btn-text: #ffffff;
  /* fondos de estado por tema (claro = Merlin *-bg) */
  --estado-error-bg: var(--error-bg);
  --estado-success-bg: var(--success-bg);

  background: var(--bg);
  color: var(--text);
  font: var(--text-body);
  min-height: 100vh;
}

.storeRoot[data-theme="dark"] {
  --bg: #0a0a0a;
  --text: #f5f5f5;
  --text-muted: rgba(255, 255, 255, 0.6);
  --card: #141414;
  --border: #2a2a2a;
  --hover-input: #1a1a1a;
  --btn-bg: #ffffff;
  --btn-text: #0a0a0a;
  --btn-hover: #e8e8e6;
  --estado-error-bg: rgba(145, 0, 34, 0.15);
  --estado-success-bg: rgba(27, 137, 89, 0.15);
}
```

Se eliminan del bloque las variables muertas `--bg-light/--text-light/--card-light/--border-light/--bg-dark/--text-dark/--card-dark/--border-dark` (solo se usaban para el mapeo interno; verificar con grep que ningún módulo las consume directo — el inventario marca 1 uso de `--bg-light`: migrarlo al token nuevo).

- [ ] **Step 2: Tipografía** — eliminar el `@import` de Bebas Neue (línea 1; el de Font Awesome se queda); reemplazar el bloque `h1–h4`:

```css
.storeRoot h1 { font: var(--text-header); }
.storeRoot h2 { font: var(--text-title); }
.storeRoot h3,
.storeRoot h4 { font: var(--text-subtitle); }
```

(sin `text-transform`, sin `letter-spacing`). Inputs de tienda: `border-radius: 0` → `var(--radius-input)`, `background: transparent` → `var(--page)` con `:hover { background: var(--hover-input) }` — en dark el `--page` global no aplica dentro de `.storeRoot` porque el fondo de inputs debe seguir la superficie: usar `background: var(--bg)` y hover `var(--hover-input)` (re-mapeada en dark).

- [ ] **Step 3: Verificación visual** — dev server: tienda en claro (fondo `#f7f8fb`, títulos Poppins sin mayúsculas forzadas, inputs redondeados) y en oscuro (toggle: superficies oscuras, dorado intacto). `npm test` + lint + tsc verdes.

- [ ] **Step 4: Commit**

```bash
git add app/(store)/store-globals.css
git commit -m "feat(diseno): storeRoot con tokens Merlin, tema oscuro derivado y escala Poppins"
```

**⛔ CHECKPOINT FASE 1:** revisión visual con el usuario (tienda claro/oscuro + admin, desktop y móvil) antes de seguir.

---

## Fase 2 — Tienda: catálogo

*(Cada task de componente sigue las Reglas de migración de Global Constraints: el trabajo es reemplazar los valores hardcodeados listados por tokens, aplicar la escala tipográfica, y componer las clases de botón Merlin donde se indique. Verificación por task: `npm test` + `npx tsc --noEmit` + revisión visual propia en dev server en ambos temas; commit por task.)*

### Task 4: Header — Nav, MobileNav, CategoryBar

**Files:**
- Modify: `components/store/Nav.module.css` (deuda: 1 hex `#E74C3C`, 1 rgba, 1 shadow, 3 font-family, 1 uppercase)
- Modify: `components/store/MobileNav.module.css` (1 hex `#E74C3C`, 2 rgba, 1 radius, 1 shadow, 2 font-family, 1 uppercase)
- Modify: `components/store/CategoryBar.module.css` (1 rgba, 2 shadows, 1 font-family, 2 uppercase)

Trabajo: `#E74C3C` (contador del carrito/wishlist) → `var(--error-strong)`; sombras → `var(--shadow-raised)` (dropdown de CategoryBar → `var(--shadow-pop)`); eliminar font-family propios y uppercase; radios → tokens. El logo/título del Nav usa `var(--text-subtitle)`.

Commit: `feat(diseno): header de tienda con tokens Merlin`

### Task 5: Home — HeroCarousel, promoBar, Footer

**Files:**
- Modify: `components/store/HeroCarousel.module.css` (1 hex `#000`, 3 rgba, radios 6/12px, 1 font-family, 1 uppercase)
- Modify: `app/(store)/page.module.css` (radius 30px del mobileFilterTrigger → `var(--radius-btn)`)
- Modify: `components/store/Footer.module.css` (1 hex `#0a0a0a`, 7 rgba, 4 font-family, 1 uppercase)

Trabajo: título del hero → `font: var(--text-header)`; CTA del hero → componer `.btnMerlinPrimary`; el Footer es la superficie oscura intencional de la marca — conserva fondo `var(--cta)` con texto claro (documentar como decisión: el footer negro es parte de la identidad, Merlin no lo prohíbe), pero tipografía y espaciados adoptan la escala.

Commit: `feat(diseno): home y footer con tokens Merlin`

### Task 6: Catálogo — ProductCard, ProductGrid + badges

**Files:**
- Modify: `components/store/ProductCard.module.css` (4 hex, 3 rgba, 5 radius, 2 shadows, **6 uppercase**)
- Modify: `components/store/ProductGrid.module.css` (5 hex, 5 radius, 1 shadow, 2 uppercase, 2 `!important`)
- Modify: `lib/store/format.ts:2-9` (mapa `BADGE_COLOR`)
- Test: `lib/store/tests/format.test.ts` (ajustar si fija los hex viejos)

Trabajo: cards → `var(--radius-card)` + `var(--shadow-card)`, hover `var(--shadow-pop)`; badge AGOTADO/ÚLTIMAS → `var(--radius-tag)`; `#e74c3c`→`var(--error-strong)`, `#27ae60`→`var(--success)`; quitar los 8 uppercase y los 2 `!important` si la especificidad lo permite (si no, documentar). `BADGE_COLOR` actualiza sus valores a Merlin conservando la firma `getBadgeColor(badge: string): string`:

```ts
const BADGE_COLOR: Record<string, string> = {
  'Oferta': '#c31a2f',           // --error-strong
  'Más Vendido': '#c31a2f',
  'Nuevo': '#1b8959',            // --success
  'Sustentable': '#0a53a5',      // --info
  'Últimas unidades': '#a16b00', // --warning
}
const DEFAULT_BADGE_COLOR = '#c31a2f'
```

Commit: `feat(diseno): catalogo y badges con tokens Merlin`

### Task 7: Filtros y búsqueda — FilterSidebar, ActiveFilterChips, MegaSearch

**Files:**
- Modify: `components/store/FilterSidebar.module.css` (2 rgba, 4 radius, 2 shadows, 1 uppercase)
- Modify: `components/store/ActiveFilterChips.module.css` (radius 999px → `var(--radius-tag)`)
- Modify: `components/store/MegaSearch.module.css` (1 hex `#f5f5f5`, 5 radius, 1 font-family)

Trabajo: chips → `var(--radius-tag)` con `var(--brand-bg)`/texto `var(--brand)` (patrón Secondary); overlay de búsqueda → `var(--shadow-modal)`, inputs → `var(--radius-input)`; botones de talla del sidebar → `var(--radius-input)`.

Commit: `feat(diseno): filtros y busqueda con tokens Merlin`

**⛔ CHECKPOINT FASE 2:** revisión visual con el usuario.

---

## Fase 3 — Tienda: flujo de compra

### Task 8: ProductDetail (el módulo más grande)

**Files:**
- Modify: `components/store/ProductDetail.module.css` (417 líneas; deuda: 1 hex `#f1c40f`, 2 rgba, 9 radius, **8 font-family**)

Trabajo: nombre del producto → `font: var(--text-header)`; precio grande → `var(--text-title)` con color `var(--brand)` si hoy es dorado; labels (SELECCIONA TU TALLA / ELIGE UNA OPCIÓN) → `var(--text-subtitle)`; estrellas `#f1c40f` → `var(--warning-star)`; botones: AGREGAR AL CARRITO → `.btnMerlinPrimary` (compuesto), GUÍA DE TALLAS y compartir → `.btnMerlinTertiary`; dropdown de variantes (`.varianteSelect`) → `var(--radius-input)`, borde `var(--line)`, sombra `var(--shadow-raised)` al abrir; galería/thumbs → `var(--radius-card)`; eliminar los 8 font-family propios.

Commit: `feat(diseno): ficha de producto con tokens Merlin`

### Task 9: CartDrawer + WishlistDrawer

**Files:**
- Modify: `components/store/CartDrawer.module.css` (4 hex, 2 rgba, 4 radius, 1 shadow, 2 font-family, 3 uppercase)
- Modify: `components/store/WishlistDrawer.module.css` (1 rgba, 3 radius, 3 uppercase)

Trabajo: drawers → `var(--shadow-modal)`; `#e74c3c` (eliminar/contador) → `var(--error-strong)`; `#a3893c` → `var(--brand-hover)`; `#888` → `var(--ink-muted)`; barra de envío gratis → track `var(--brand-subtle)`, fill `var(--brand)`; botón CHECKOUT → `.btnMerlinPrimary`; qty buttons → `var(--radius-tag)` (circulares pequeños).

Commit: `feat(diseno): carrito y favoritos con tokens Merlin`

### Task 10: CheckoutModal, SizeGuideModal, ExitPopup

**Files:**
- Modify: `components/store/CheckoutModal.module.css` (3 hex, 3 rgba, 4 font-family, 3 uppercase)
- Modify: `components/store/SizeGuideModal.module.css` (2 rgba, 1 font-family)
- Modify: `components/store/ExitPopup.module.css` (1 hex `#e74c3c`, 1 rgba, 1 radius, 1 font-family, 1 uppercase)

Trabajo: modales → `var(--radius-card)` + `var(--shadow-modal)`; errores de formulario del checkout → texto `var(--error)` sobre `var(--estado-error-bg)`; éxito → `var(--success)`/`var(--estado-success-bg)`; botón CONFIRMAR PEDIDO → `.btnMerlinPrimary`; inputs → `var(--radius-input)`.

Commit: `feat(diseno): checkout y modales con tokens Merlin`

**⛔ CHECKPOINT FASE 3:** revisión visual con el usuario (flujo de compra completo, ambos temas, móvil incluido).

---

## Fase 4 — Admin

### Task 11: Estructura — Sidebar, layout, dashboard + estados de pedido unificados

**Files:**
- Modify: `components/admin/Sidebar.module.css` (2 hex `#000`, radios 10/7px)
- Modify: `app/admin/layout.module.css`
- Modify: `app/admin/dashboard.module.css` (2 rgba, radios 12px)
- Create: `app/admin/estadoColor.ts`
- Modify: `app/admin/pedidos/PedidosClient.tsx:16-20` y `app/admin/page.tsx:46-50` (importar el mapa compartido en vez de duplicarlo)

Trabajo: sidebar → card blanca `var(--bg-card)` + `var(--shadow-card)`, item activo `var(--accent-dim)` (crema) + texto `var(--accent)`; dashboard stats → cards con `var(--radius-card)`. El mapa `ESTADO_COLOR` duplicado se unifica:

```ts
// app/admin/estadoColor.ts
import type { EstadoPedido } from '@/types'

// Colores de estado de pedido (valores Merlin *-150; ver spec de diseño)
export const ESTADO_COLOR: Record<EstadoPedido, string> = {
  recibido: '#0a53a5',    // --info
  preparando: '#a16b00',  // --warning
  enviado: '#227ad1',     // --info-strong
  entregado: '#1b8959',   // --success
  cancelado: '#910022',   // --error
}
```

Ambos consumidores importan de aquí (se borran los mapas locales). Sin test nuevo (mapa de presentación); `npx tsc --noEmit` valida el tipado con `EstadoPedido`.

Commit: `feat(diseno): estructura del admin en claro Merlin y estados de pedido unificados`

### Task 12: Formularios admin — productos, carrusel, ImageUpload, Modal, Toggle

**Files:**
- Modify: `app/admin/productos/productos.module.css` (250 líneas, compartido por ProductoFields e ImportarPlantilla; deuda: 2 hex, 2 rgba, 7 radius)
- Modify: `app/admin/productos/carrusel.module.css` (3 hex `#ddd`/`#c00`, 2 radius)
- Modify: `components/admin/ImageUpload.module.css` (1 hex, 2 radius)
- Modify: `components/admin/Modal.module.css` (1 rgba, radius 14px)
- Modify: `components/admin/Toggle.module.css` (2 hex, 1 radius)

Trabajo: radios 7/8px → `var(--radius-input)`/`var(--radius-card)`; `#c00` → `var(--error-strong)`; `#ddd` → `var(--line)`; botones guardar → `.btnMerlinPrimary`, secundarios (`btnSecondary` existente) → patrón Tertiary con tokens, `btnDelete` → texto `var(--error)`; el Modal → `var(--shadow-modal)`; el Toggle activo → `var(--brand)`.

Commit: `feat(diseno): formularios del admin con tokens Merlin`

### Task 13: Vistas admin — pedidos, cupones, categorías, envíos, banners, config, login

**Files:**
- Modify: `app/admin/pedidos/pedidos.module.css` (2 hex, radios 6/20px; `#25d366` WhatsApp SE CONSERVA)
- Modify: `app/admin/cupones/cupones.module.css` (monospace SE CONSERVA)
- Modify: `app/admin/categorias/categorias.module.css`, `app/admin/envios/envios.module.css` (1 uppercase), `app/admin/banners/banners.module.css`, `app/admin/configuracion/config.module.css`
- Modify: `app/admin/login/login.module.css` (88 líneas, 13 hex — paleta propia oscura → Merlin claro completo)

Trabajo: badges de estado de pedidos → fondo `var(--*-bg)` + texto `var(--*)` de su estado (tríada Merlin); login pasa de negro a `var(--page)` con card blanca `var(--shadow-modal)` y CTA `.btnMerlinPrimary`; radios → tokens en todos.

Commit: `feat(diseno): vistas del admin con tokens Merlin`

**⛔ CHECKPOINT FASE 4:** revisión visual con el usuario (admin completo, incluido login y wizard de importación).

---

## Fase 5 — Barrido final

### Task 14: Barrido de remanentes y limpieza

**Files:**
- Modify: los que detecte el barrido (grep)

- [ ] **Step 1: Greps de verificación** (0 resultados esperados en app/ y components/, salvo excepciones documentadas):

```bash
grep -rn "Bebas" app components
grep -rn "'Inter'" app components
grep -rn "text-transform: uppercase" app components   # 0 salvo excepciones documentadas
grep -rn "#e74c3c\|#E74C3C\|#27ae60\|#f1c40f" app components lib
grep -rn "border-radius: [0-9]" app components | grep -v "var(--"
```

- [ ] **Step 2: Corregir lo que aparezca** aplicando las Reglas de migración; eliminar variables muertas (`--accent-border` si quedó sin uso tras Fase 4, `--topbar-h` si sigue muerta — verificar con grep antes de borrar).
- [ ] **Step 3: Estados disabled** — verificar que los botones deshabilitados reales (AGREGAR AL CARRITO agotado, `+` del carrito al tope, submit del checkout en vuelo) muestran los estados Merlin (`--cta-disabled-*`).
- [ ] **Step 4: Suite + lint + tsc + build** — todo verde.
- [ ] **Step 5: Commit** — `git commit -m "feat(diseno): barrido final de remanentes del sistema Merlin"`

### Task 15: Verificación integral y entrega

- [ ] **Step 1:** `npm test` (233) + `npx tsc --noEmit` + `npm run lint` (0 errores) + `npm run build` — reportar resultados reales.
- [ ] **Step 2:** Revisión final whole-branch (flujo del proyecto).
- [ ] **Step 3:** Recorrido visual completo con el usuario: home, catálogo con filtros, ficha (plano y con variantes), carrito, checkout, confirmación — en claro y oscuro, desktop y móvil — y admin: login, dashboard, productos (form + variantes + carrusel), pedidos, config, wizard de importación. Contra `merlin-hondusport.md`.
- [ ] **Step 4:** Sin migración de BD en este proyecto. **Confirmar con el usuario** la fusión a `main` (push = deploy a producción); tras el push, verificar deployment `READY` en Vercel.
- [ ] **Step 5:** Actualizar `CLAUDE.md` (una línea en Convenciones: los estilos usan los tokens Merlin de `app/merlin.css`; el mapeo vive en el spec) — `git commit -m "docs: tokens Merlin en convenciones"`.
