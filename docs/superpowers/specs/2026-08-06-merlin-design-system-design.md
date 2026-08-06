# Diseño — Sistema de diseño Merlin en toda la plataforma

**Fecha:** 2026-08-06
**Objetivo:** aplicar el sistema de diseño "Merlin Hondusport" (`merlin-hondusport.md`,
generado con el Editor Visual Merlin) a toda la plataforma: tienda pública y panel
admin, en un solo proyecto por fases.

## Alcance

- **Incluye:** capa central de tokens semánticos (`app/merlin.css`), Poppins vía
  `next/font/google` (elimina los `@import` de Inter y Bebas Neue), re-tema de la
  tienda (claro Merlin + modo oscuro derivado, conservando el toggle), re-tema
  **completo a claro** del admin (hoy oscuro), botones en 3 variantes Merlin,
  escala tipográfica, radios, sombras y colores de estado en ambas áreas.
- **No incluye:** cambios de lógica, estructura de páginas o navegación; librerías
  de UI nuevas (se mantiene CSS Modules); cambios al `@import` de Font Awesome;
  tematización dinámica desde `configuracion` (los tokens son estáticos).

## Decisiones tomadas

1. **Todo en un solo proyecto**, por fases deployables (tienda y admin).
2. **Admin: re-tema completo a claro** (Merlin fiel, fondo `#f7f8fb`).
3. **Tienda: se conserva el toggle oscuro** — el modo oscuro deriva variantes de
   superficie; marca/estados/forma/tipografía idénticos en ambos temas.
4. **Poppins en todo** (Merlin fiel): desaparecen Bebas Neue (títulos tienda,
   uppercase) e Inter.
5. **Enfoque: capa de tokens semánticos** (Opción 1). Los nombres auto-generados
   de Merlin son engañosos (`--blue-*` es el dorado de marca, `--coral-*` es el
   negro CTA); el código usa nombres semánticos y el mapeo vive en este spec.
6. **Secuencia:** este proyecto arranca DESPUÉS de fusionar la rama
   `feature/variantes-padre-hijo` (D); la rama nueva sale de `main` con variantes
   incluidas (el rediseño toca los mismos componentes que D tocó).

## Capa de tokens — `app/merlin.css`

Archivo global único cargado en el layout raíz (antes de `globals.css`). Mapeo
Merlin → semántico (valores exactos de `merlin-hondusport.md`):

| Semántico | Merlin | Valor | Uso |
|---|---|---|---|
| `--brand` | `--blue-100` | `#c9a84c` | Dorado de marca: títulos destacados, labels, acentos |
| `--brand-hover` | `--blue-hover` | `#a58a3e` | Hover de elementos dorados |
| `--brand-subtle` | `--blue-30` | `#efe5c9` | Deshabilitado/sutil de marca |
| `--brand-bg` | `--blue-10` | `#faf6ed` | Fondo botón Secondary, item activo sidebar |
| `--cta` | `--coral-100` | `#0a0a0a` | Botón primario y destructivo |
| `--cta-hover` | `--coral-hover` | `#080808` | Hover CTA |
| `--cta-disabled-bg` | `--coral-60` | `#6c6c6c` | CTA deshabilitado fondo |
| `--cta-disabled-text` | `--coral-30` | `#b6b6b6` | CTA deshabilitado texto |
| `--page` | `--background-page` | `#f7f8fb` | Fondo de pantalla e inputs |
| `--card` | `--black-0` | `#ffffff` | Cards, botón Secondary |
| `--ink` | `--black-100` | `#1e1e1e` | Texto principal |
| `--ink-muted` | `--black-60` | `#606060` | Placeholder, helper |
| `--ink-disabled` | `--black-40` | `#969696` | Texto deshabilitado |
| `--hover-input` | `--black-10` | `#f3f3f3` | Hover de inputs, botón Tertiary |
| `--line` | `--coral-10` | `#e7e7e7` | Bordes/divisores claros |
| `--error` / `--error-deep` / `--error-bg` | `--error-150/200/10` | `#910022` / `#610017` / `#fbf3f5` | Texto+borde / énfasis / fondo |
| `--warning` / `--warning-deep` / `--warning-bg` | `--warning-150/200/10` | `#a16b00` / `#5b3100` / `#fff3d1` | idem |
| `--success` / `--success-deep` / `--success-bg` | `--success-150/200/10` | `#1b8959` / `#0b3b26` / `#f4fdf9` | idem |
| `--info` / `--info-deep` / `--info-bg` | `--info-150/200/10` | `#0a53a5` / `#052d65` / `#f1f9ff` | idem |
| `--radius-input` | `--radius-sm` | `9px` | Inputs, botones Action |
| `--radius-card` | `--radius-md` | `9px` | Cards, alerts, toasts, modales |
| `--radius-btn` | `--radius-pill` | `25px` | Botones (web) |
| `--radius-tag` | `--radius-full` | `26px` | Tags, badges |
| `--shadow-card` | `--shadow-2` | `0 4px 12px rgba(18,30,108,.08)` | Cards en reposo |
| `--shadow-raised` | `--shadow-4` | `0 4px 16px rgba(18,30,108,.08)` | Dropdowns |
| `--shadow-pop` | `--shadow-8` | `0 8px 20px rgba(18,30,108,.08)` | Hover de cards, popovers |
| `--shadow-modal` | `--shadow-12` | `0 12px 28px rgba(18,30,108,.08)` | Modales, drawers |
| `--gradient-h` | `--gradient-horizontal` | `linear-gradient(to right, #c9a84c, #0a0a0a)` | Decorativo |
| `--gradient-v` | `--gradient-vertical` | `linear-gradient(to bottom, #0a0a0a, #c9a84c)` | Decorativo |

**Tipografía** (shorthands `font:` listos para usar; fuente vía variable de
`next/font`):

| Token | Valor |
|---|---|
| `--text-header` | `500 clamp(32px, 5vw, 48px)/1.08 var(--font-poppins)` |
| `--text-title` | `400 28px/32px var(--font-poppins)` |
| `--text-subtitle` | `600 16px/24px var(--font-poppins)` |
| `--text-body` | `400 16px/24px var(--font-poppins)` |
| `--text-caption` | `700 12px/16px var(--font-poppins)` |

(El clamp del header es la única adaptación responsive; 48px exactos en desktop.)

**Poppins:** `next/font/google`, pesos 400/500/600/700, `subsets: ['latin']`,
`variable: '--font-poppins'`, aplicado en el `<body>` del layout raíz. Se eliminan
los `@import` de Google Fonts de Inter (`app/globals.css`) y Bebas Neue
(`app/(store)/store-globals.css`). El `@import` de Font Awesome se conserva.

## Tienda pública

- `.storeRoot` re-mapea sus variables existentes a los tokens: `--primary: var(--brand)`,
  `--bg: var(--page)`, `--card: var(--card)`, `--border: var(--line)`,
  `--btn-bg: var(--cta)`, `--btn-hover: var(--cta-hover)`, etc. Los módulos que ya
  consumen esas variables cambian solos; los valores hardcodeados se migran módulo
  por módulo.
- **Modo oscuro** (`data-theme="dark"`): re-mapea SOLO superficies — `--page: #0a0a0a`,
  `--card: #141414`, `--line: #2a2a2a`, `--ink: #f5f5f5`, `--ink-muted:
  rgba(255,255,255,.6)`, `--hover-input: #1a1a1a`, y la inversión actual del botón
  primario (fondo blanco/texto negro). Marca, estados, radios, sombras y tipografía
  no cambian. Los fondos `--*-bg` de estados usan sus variantes oscuras derivadas
  (mismo tono al ~15% de opacidad sobre superficie) para mantener contraste.
- **Botones (3 variantes Merlin, todas pill `--radius-btn`):**
  - Primary: fondo `--cta`, texto blanco; hover `--cta-hover`; disabled
    `--cta-disabled-bg`/`--cta-disabled-text`. Ej.: AGREGAR AL CARRITO, checkout.
  - Secondary: fondo `--brand-bg`, texto `--brand`. Ej.: acciones secundarias
    destacadas.
  - Tertiary: fondo `--hover-input`, texto `--brand`. Ej.: GUÍA DE TALLAS,
    compartir.
  - La asignación botón-por-botón exacta se fija en el plan.
- **Títulos:** fuera Bebas Neue y el `text-transform: uppercase` global de
  `.storeRoot h1-h4`; entra la escala Poppins (`--text-header` para el hero/nombre
  de producto, `--text-title` para secciones, `--text-subtitle` para labels).
- Cards/modales/drawers: `--radius-card` + sombra según elevación; inputs:
  `--radius-input`, fondo `--page`, hover `--hover-input`; tags/badges:
  `--radius-tag`.

## Admin (re-tema claro)

- El `:root` de `app/globals.css` se reescribe con tokens Merlin: `--bg: var(--page)`,
  `--bg-card: var(--card)` (+ `--shadow-card`), `--bg-hover/--bg-input:
  var(--hover-input)`, `--border*: var(--line)`, `--text: var(--ink)`,
  `--text-muted: var(--ink-muted)`, `--text-dim: var(--ink-disabled)`, `--accent:
  var(--brand)`; `--danger/success/warning/info` pasan a los valores Merlin (150
  texto/borde, 10 fondo). Los ~20 CSS modules del admin consumen esas variables:
  el grueso del re-tema ocurre aquí; después se barren los módulos con oscuros
  hardcodeados.
- **Sidebar/topbar:** cards blancas con `--shadow-card`; item activo con
  `--brand-bg` + texto `--brand` (patrón Secondary).
- **Botones:** guardar/crear → Primary; secundarios → Tertiary; destructivos →
  Primary (negro, como define Merlin) con texto/confirmación clara. Inputs a
  `--radius-input` con hover `--hover-input`.
- Badges de estado de pedidos, KPIs del dashboard, toasts y errores de formulario
  usan la tríada de estado (`--*`, `--*-bg`).
- Poppins también en el admin, con la escala Merlin en títulos de página/sección.

## Manejo de errores / riesgos

- **Regresión visual** es el riesgo principal: no hay tests de CSS. Mitigación:
  revisión visual en navegador POR FASE (desktop + móvil; tienda en claro Y
  oscuro) contra `merlin-hondusport.md`, con visto bueno del usuario por fase.
- La suite de lógica (233 tests) debe permanecer verde — este proyecto no toca
  lógica; cualquier cambio se limita a CSS/clases/JSX de presentación.
- Contraste: el dorado `#c9a84c` sobre blanco es débil para texto pequeño — se usa
  para acentos/labels grandes (como define Merlin), nunca para body text; los
  textos de estado usan la variante 150 (accesible sobre fondo 10).

## Fases de entrega (cada una deployable, con visto bueno visual del usuario)

1. **Fundación:** `app/merlin.css` + Poppins (`next/font`) + re-mapeo de
   `.storeRoot` y `:root` admin + eliminación de Bebas/Inter. La plataforma entera
   cambia de piel de forma coherente (transición gruesa).
2. **Tienda — catálogo:** Nav, hero/banners, ProductCard, FilterSidebar,
   MegaSearch, footer.
3. **Tienda — compra:** ProductDetail (incl. dropdown de variantes), CartDrawer,
   WishlistDrawer, CheckoutModal, página/confirmación de pedido.
4. **Admin:** layout/sidebar, productos (formulario + sección variantes),
   carrusel, pedidos, cupones, banners, configuración, wizard de importación.
5. **Barrido final:** estados disabled/error/success/info en toda la plataforma,
   badges, toasts, limpieza de variables muertas y de estilos Bebas/Inter
   remanentes.

## Verificación

- Por fase: `npm test` (233 verdes, sin cambios de lógica), `npm run lint`,
  `npm run build`, y revisión visual en navegador (desktop + preset móvil; tienda
  en ambos temas).
- Criterio de éxito: valores exactos de `merlin-hondusport.md` en tokens
  (colores, radios, sombras, escala tipográfica); cero referencias restantes a
  Bebas Neue/Inter; admin sin fondos oscuros remanentes.
