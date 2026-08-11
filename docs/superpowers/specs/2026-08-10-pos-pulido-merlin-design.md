# P-diseño — Pulido Merlin — Diseño

**Fecha:** 2026-08-10
**Serie:** POS Honduras, sub-proyecto transversal de diseño (independiente de la numeración P; barrido de UI para alinear a Merlin).
**Estado:** aprobado para plan.

## Objetivo

Alinear la UI del app al design system Merlin actualizado por el usuario
(`merlin-hondusport.md`): re-sincronizar los tokens de `app/merlin.css` (colores y
radios), arreglar el control de cantidad del POS, y barrer los emojis-icono del
chrome del admin/POS a SVG dorados sin fondo (regla `.iconoMerlin` de P6). La
tienda pública y sus emojis de marketing quedan fuera (van con el futuro P-tienda).

## Alcance

**Dentro:**
1. **Tokens** (`app/merlin.css`): adoptar los valores del design sync (CTA negro
   puro, fondo de página gris, radios más redondeados, gradientes negros).
2. **POS**: botón +/− de cantidad más compacto y caja de cantidad de ancho fijo.
3. **Iconos**: reemplazar los emojis que son iconos de interfaz en el **admin/POS**
   por SVG dorados (`.iconoMerlin`), expandiendo `components/admin/icons.tsx`.

**Fuera:**
- La **tienda** (`app/(store)`, `components/store/*`): sus emojis (🎉✨🎁🔍🎉) son
  copy de marketing / carácter de marca; su restyle es el P-tienda aparte.
- **Símbolos funcionales** que NO son iconos de marca: `←` volver, `×` cerrar,
  `▾`/`▸` carets, `★`/`☆` rating y favorito, viñetas — se conservan.
- Cambios de layout/estructura (esto es pulido de estilo, no rediseño).
- Modo oscuro (el app es light-only).

## Principios

- **Los tokens son la única fuente.** El cambio de look vive en `app/merlin.css`
  (valores de variables); `globals.css` y los CSS Modules ya consumen esas
  variables (`var(--page)`, `var(--radius-card)`, `var(--cta)`, …), así que el
  cambio propaga a toda la app sin tocar módulos.
- **No romper contraste/legibilidad.** Ningún estado (hover, activo, deshabilitado)
  puede dejar texto ilegible; se verifica en el navegador con los colores nuevos.
- **Iconos dorados = solo chrome de interfaz.** Se distingue "icono de marca"
  (decorativo, → dorado) de "símbolo funcional" (tipográfico/estado, se queda).
- Cambios acotados y verificables visualmente; sin refactors ajenos.

---

## 1. Tokens (`app/merlin.css`)

Actualizar los valores a los del reference (`merlin-hondusport.md`, edición
2026-08-10). Solo cambian valores en el bloque `:root` de `app/merlin.css`:

| Token | Antes | Después |
|---|---|---|
| `--cta` | `#0a0a0a` | `#000000` |
| `--cta-hover` | `#080808` | `#000000` |
| `--cta-disabled-bg` | `#6c6c6c` | `#666666` |
| `--cta-disabled-text` | `#b6b6b6` | `#b3b3b3` |
| `--page` | `#f7f8fb` | `#dbdce1` |
| `--line` | `#e7e7e7` | `#e6e6e6` |
| `--radius-input` | `9px` | `12px` |
| `--radius-card` | `9px` | `16px` |
| `--radius-btn` | `25px` | `32px` |
| `--radius-tag` | `26px` | `100px` |
| `--gradient-h` | `…#0a0a0a` | `…#000000` |
| `--gradient-v` | `#0a0a0a…` | `#000000…` |

**Consecuencia intencional:** el fondo de página pasa a gris (`#dbdce1`) con cards
blancas (más contraste); los inputs heredan el fondo de página (así lo define el
reference, `--bg-input: var(--page)` en `globals.css`); los pills/tags y botones
quedan más redondeados (`--radius-tag: 100px` = totalmente redondeados). No se
tocan los tokens de estado (error/success/warning/info) — el sync no los cambió.

**Verificación de contraste (obligatoria):** revisar en el navegador que
`.btnMerlinPrimary/:hover/:disabled`, `.btnMerlinSecondary`, `.btnMerlinTertiary`,
`.btnMerlinChip[aria-pressed]` y los estados de foco de inputs mantengan texto
legible con los valores nuevos. Si algún hover deja texto sobre fondo del mismo
tono (p. ej. gris deshabilitado), ajustar el token o el estado puntual.

## 2. Control de cantidad del POS

En la fila del carrito del POS (mostrador), el `−`/`+` usa `.btnMerlinIcon`
(40×40) y la caja de cantidad tiene ancho variable.

- **Botón compacto:** se agrega un modificador `.btnMerlinIconSm` (≈32×32, mismo
  estilo/redondeo/estados que `.btnMerlinIcon`, solo menor tamaño y fuente) en
  `app/merlin.css`, y se aplica a los `−`/`+` de la fila del carrito. **No** se
  achica `.btnMerlinIcon` global (lo usan también quitar-línea y la estrella de
  anclado, que deben mantener su tamaño).
- **Caja de cantidad de ancho fijo:** el input/display de cantidad de la fila del
  carrito recibe un ancho estable (p. ej. `width: 40px; text-align: center`) para
  que no cambie de tamaño según el número de dígitos.

Ubicación: `app/admin/pos/components/CarritoPanel.tsx` (+ su `.module.css`) y/o el
componente de fila/edición de línea del carrito — el implementador localiza el
`−`/`+` y la caja de cantidad y aplica el modificador + el ancho.

## 3. Barrido de iconos (emoji → SVG dorado) en admin/POS

- **Qué se reemplaza:** los emojis usados como **iconos de interfaz** en el
  admin/POS: las 6 cards del dashboard (`KpiSegmento` recibe `icon` — pasa de
  emoji a un componente SVG), encabezados de sección y prefijos de botón/título en
  configuración, cotizaciones, inventario, compras, CxC/CxP, pedidos, documentos,
  movimientos. Se envuelven con la clase `.iconoMerlin` (dorado, sin fondo,
  `currentColor`).
- **Set de iconos:** se expande `components/admin/icons.tsx` (hoy ~19 iconos del
  menú) con los que falten para cubrir los conceptos usados (ventas, documento,
  cotización, gráfico/tendencia, factura, caja/ítems, etc.), siguiendo el patrón
  `base(path, className)` existente (SVG viewBox 0 0 24 24, stroke currentColor,
  fill none). `KpiSegmento` cambia su prop `icon: string` (emoji) por
  `icon: IconoKey` (o un `ReactNode`), y renderiza `<Icono className="iconoMerlin" />`.
- **Qué NO se toca:** símbolos funcionales (`←`, `×`, `▾`/`▸`, `★`/`☆`, viñetas) y
  toda la tienda (`app/(store)`, `components/store/*`).
- **Método:** por área (grupo de archivos), reemplazar cada emoji-icono por su
  icono SVG. Es mecánico pero requiere criterio por archivo (distinguir icono de
  marca vs símbolo funcional). El plan lo descompone por área.

## 4. Archivos

- `app/merlin.css` — valores de token (§1) + modificador `.btnMerlinIconSm` (§2).
- `app/admin/pos/components/CarritoPanel.tsx` (+ `.module.css`) y componente de
  línea de carrito — control de cantidad (§2).
- `components/admin/icons.tsx` — iconos nuevos (§3).
- `app/admin/KpiSegmento.tsx` + `app/admin/page.tsx` — dashboard con iconos SVG (§3).
- Archivos de admin/POS con emojis-icono (por área) — §3.

## 5. Restricciones globales

- Idioma español; tokens Merlin (no hardcodear valores que ya tienen token).
- Solo pulido de estilo; sin cambios de datos, lógica ni estructura de layout.
- Iconos dorados sin fondo (regla `.iconoMerlin` de P6); solo chrome de admin/POS.
- Tienda y símbolos funcionales fuera de alcance.
- Verificación visual obligatoria (contraste/hover con colores nuevos; iconos
  dorados; +/− compacto; caja de cantidad estable).

## 6. Verificación

- `npx tsc --noEmit`, `npm run lint`, `npm run build` (los cambios de icono tocan
  TSX; `KpiSegmento` cambia su prop → revisar tipos).
- `npm test` (no debería afectar tests; confirmar que sigue verde).
- **Visual (dev server):** fondo gris con cards blancas; CTA negro; radios
  redondeados; **hover de todos los botones legible**; +/− del carrito compacto y
  caja de cantidad de ancho fijo; iconos dorados sin fondo en el dashboard y el
  chrome del admin; la tienda sin cambios de emoji.

## Fuera de alcance

Restyle de la tienda / cards estilo POS (P-tienda); reemplazo de símbolos
funcionales; modo oscuro; cualquier cambio de estructura o de comportamiento.
