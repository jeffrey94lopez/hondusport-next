# Rediseño R1 — Tienda — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-estilizar el storefront a los diseños de Stitch (banner full-bleed, cards/detalle/carrito/header/footer/filtros) y convertir el checkout en un asistente de 4 pasos dentro del modal, sin tocar lógica/datos/Server Actions. Solo tema claro.

**Architecture:** Cada tarea re-estiliza uno o dos componentes React reales (CSS Modules) tomando como **referencia visual** las capturas + código de Stitch en `docs/diseno/stitch/` (se replica layout/espaciado/estilo, NO se copia el HTML de Stitch). El checkout (`CheckoutModal`) pasa de un formulario de una vista a un carrusel de pasos con un state machine simple, reusando el mismo Server Action de emisión.

**Tech Stack:** Next.js 16 (App Router, Client Components de tienda), CSS Modules, TypeScript. La tienda scopea sus estilos bajo `.storeRoot` (`app/(store)/store-globals.css`).

## Global Constraints

- Idioma español (Honduras); moneda en Lempiras `L. 1,234.56` con `formatPrice()`.
- **Solo estilo + el flujo de pasos del checkout.** NADA de lógica de negocio, datos ni Server Actions. El checkout sigue emitiendo con `crearPedido` (`app/(store)/checkout/actions.ts`), que relee y recalcula en el servidor.
- **Referencia visual = Stitch** (`docs/diseno/stitch/<pantalla>/screen.png` + `code.html`). Se re-estiliza el componente React real; NO se copia el markup de Stitch.
- **Look Merlin/tienda:** dorado `#c9a84c` como acento, CTA negro `#000`, cards blancas, fondo de página claro, Poppins, radios redondeados (pills), tags redondeados. Reusar la capa de tokens que ya usa la tienda (`.storeRoot`).
- **Responsive:** los diseños de Stitch son desktop; adaptar a móvil con el patrón existente (`MobileNav`/`BottomNav`).
- **Solo tema claro** en R1.
- **Sin regresiones funcionales:** carrito, wishlist, filtros, búsqueda, tallas y checkout siguen funcionando igual.
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (los tests de la tienda deben seguir verdes). Verificación visual en el dev server (la tienda es pública, sin login). Reportar resultados reales.

---

## File Structure

- Tema: `components/store/ThemeToggle.tsx`, `ThemeRoot.tsx`, `app/(store)/layout.tsx` (Task 1).
- Banner: `components/store/HeroCarousel.tsx` + `.module.css` (Task 2).
- Header/footer/búsqueda: `Nav.tsx`/`StoreHeader.tsx`/`MobileNav.tsx`/`BottomNav.tsx`, `Footer.tsx`, `MegaSearch.tsx` + sus `.module.css` (Task 3).
- Cards/grid/categorías: `ProductCard.tsx`, `ProductGrid.tsx`, `CategoryBar.tsx`, `StoreClient.tsx` + `.module.css` (Task 4).
- Detalle: `ProductDetail.tsx`, `ProductPageShell.tsx`, `SizeGuideModal.tsx` + `.module.css` (Task 5).
- Cart drawer: `CartDrawer.tsx` + `.module.css` (Task 6).
- Filtros: `FilterSidebar.tsx`, `ActiveFilterChips.tsx` + `.module.css` (Task 7).
- Checkout: `CheckoutModal.tsx` + `.module.css` (Task 8).

**Nota de método (todas las tareas de re-skin):** abrir `docs/diseno/stitch/<pantalla>/screen.png` (diseño) y `code.html` (valores exactos de color/espaciado/radio). Ajustar el `.module.css` del componente y, si hace falta, su JSX para reproducir el diseño, **conservando props, handlers y estructura de datos**. No introducir librerías nuevas. Verificar en el navegador.

---

## Task 1: Tema claro (ocultar toggle, fijar light)

**Files:**
- Modify: `app/(store)/layout.tsx` y/o `components/store/ThemeRoot.tsx` (fijar tema claro)
- Modify: `components/store/ThemeToggle.tsx` (ocultar el control) o el punto donde se renderiza

**Objetivo:** la tienda se renderiza siempre en **tema claro** y el `ThemeToggle` no se muestra. NO se borra la infraestructura de tema (es reversible); solo se oculta el toggle y se fuerza el estado claro.

- [ ] **Step 1: Localizar dónde se aplica el tema y dónde se monta el toggle**

Leer `components/store/ThemeRoot.tsx`, `ThemeToggle.tsx` y `app/(store)/layout.tsx` para entender cómo se setea el tema (clase/atributo/estado) y dónde se renderiza el toggle (probablemente en `Nav`/`StoreHeader`/`BottomNav`).

- [ ] **Step 2: Fijar tema claro**

Hacer que `ThemeRoot` (o el layout) aplique siempre el tema claro (la clase/atributo que hoy corresponde a "light"), sin leer/escribir la preferencia de oscuro. Mantener el resto del árbol igual.

- [ ] **Step 3: Ocultar el `ThemeToggle`**

No renderizar el `ThemeToggle` (removerlo del header/nav donde se monte, o retornar `null`). No borrar el archivo.

- [ ] **Step 4: Verificación, typecheck, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores. Visual: la tienda abre en claro, sin control de tema; nada quedó roto.

```bash
git add app/(store)/layout.tsx components/store/ThemeRoot.tsx components/store/ThemeToggle.tsx
git commit -m "feat(tienda): fijar tema claro y ocultar el toggle (R1)"
```

---

## Task 2: Banner full-bleed (`HeroCarousel`)

**Files:**
- Modify: `components/store/HeroCarousel.tsx`
- Modify: `components/store/HeroCarousel.module.css`

**Referencia:** `docs/diseno/stitch/hondusport_inicio_tienda/` (banner superior).

**Objetivo:** el hero ocupa **el ancho completo del viewport, sin márgenes ni esquinas redondeadas**, con imagen a sangre, overlay gold→negro, título con acento dorado y CTA(s). Mantiene el carrusel de banners (autoplay + indicadores) que ya trae `HeroCarousel` (los banners vienen de la BD).

- [ ] **Step 1: Full-bleed en el CSS**

En `HeroCarousel.module.css`, `.hero`/`.slide`: ancho completo del viewport (si el contenedor padre tiene padding/max-width, romperlo con `width: 100vw; margin-left: calc(50% - 50vw)` o quitando el contenedor limitante), `border-radius: 0`, sin margen. Altura amplia: `min-height: 72vh` en desktop, `min-height: 56vh` en móvil. `background-size: cover; background-position: center`.

- [ ] **Step 2: Overlay y contenido según Stitch**

Overlay gradiente (usar un `linear-gradient` oscuro a un lado para legibilidad del texto, estilo gold→negro del `code.html`). `.slideContent` alineado a la izquierda, con: título grande (Poppins bold) donde una palabra va en **dorado** (`--brand`/gold), subtítulo en gris claro, y el CTA principal como **pill dorado** (`btn_texto`/`btn_link` de la BD). Opcional: un segundo CTA estático "Ver catálogo" como pill negro-outline que lleve a la sección de catálogo. El indicador de scroll (`scrollHint`) y los `indicators` se conservan y se re-estilizan sutiles.

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores. Visual: banner a ancho completo, sin bordes/márgenes, texto legible con acento dorado, CTA(s), responsive.

```bash
git add components/store/HeroCarousel.tsx components/store/HeroCarousel.module.css
git commit -m "feat(tienda): banner del home a pantalla completa (full-bleed) con estilo Stitch (R1)"
```

---

## Task 3: Header / footer / búsqueda

**Files:**
- Modify: `components/store/Nav.tsx` / `StoreHeader.tsx` / `MobileNav.tsx` / `BottomNav.tsx` (según cuál renderice el header) + `.module.css`
- Modify: `components/store/Footer.tsx` + `Footer.module.css`
- Modify: `components/store/MegaSearch.tsx` + `MegaSearch.module.css`

**Referencia:** header/footer de `hondusport_inicio_tienda/` y `detalle_de_producto_hondusport/`.

- [ ] **Step 1: Header**

Logo "Hondusport" en dorado a la izquierda; links de navegación (Hombre/Mujer/Accesorios/Ofertas) con el activo subrayado/dorado; barra de búsqueda prominente redondeada con icono; a la derecha iconos de **cuenta** y **carrito con badge de conteo** en dorado. Fondo blanco, hairline inferior. En móvil, `MobileNav`/`BottomNav` con el mismo lenguaje.

- [ ] **Step 2: Footer**

`Footer` con **fondo negro**, logo, columnas de links (Empresa/Soporte/Redes o Envíos/Contacto/Términos según lo existente), y nota de copyright + "Precios en Lempiras (L.)". Texto claro sobre negro.

- [ ] **Step 3: Búsqueda (`MegaSearch`)**

Input redondeado con icono dorado, resultados/tags con el estilo nuevo (chips redondeados). Sin cambios de lógica de búsqueda.

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual: header/footer/búsqueda con el look Stitch, badge de carrito, responsive.

```bash
git add components/store/Nav.tsx components/store/StoreHeader.tsx components/store/MobileNav.tsx components/store/BottomNav.tsx components/store/Footer.tsx components/store/MegaSearch.tsx components/store/*.module.css
git commit -m "feat(tienda): header, footer y busqueda con estilo Stitch (R1)"
```

---

## Task 4: Cards / grid / categorías (home)

**Files:**
- Modify: `components/store/ProductCard.tsx` + `ProductCard.module.css`
- Modify: `components/store/ProductGrid.tsx` + `ProductGrid.module.css`
- Modify: `components/store/CategoryBar.tsx` + `CategoryBar.module.css` (o la sección de categorías en `StoreClient.tsx`)

**Referencia:** grid del home y cards de "relacionados" en `detalle_de_producto_hondusport/`.

- [ ] **Step 1: `ProductCard`**

Card blanca redondeada con: imagen; **tag** superior-izquierda "NUEVO" (dorado) o "-N%" (rojo) cuando `precio_original` esté presente (descuento); **corazón** de wishlist arriba-derecha (reusa la lógica de wishlist existente); rating con estrellas doradas + conteo (si el producto tiene rating); nombre; categoría en gris; **precio en L.** y, si hay descuento, el **precio original tachado** al lado; botón **"+" negro** (o "Agregar") que añade al carrito (reusa el handler existente). Estado **"Agotado"** con tag rojo cuando el stock efectivo sea 0. Conservar props y handlers actuales de `ProductCard`.

- [ ] **Step 2: `ProductGrid` + categorías**

Grid responsivo (`repeat(auto-fill, minmax(...))`). Sección "Explorar por categoría" con 3 cards grandes (imagen de fondo, nombre blanco, "Ver todo →" dorado) — reusar `CategoryBar` o una grilla en `StoreClient`, con las categorías existentes. Sin cambios de datos.

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual: cards con tags/rating/precio tachado/corazón/+; grid y categorías con el look Stitch.

```bash
git add components/store/ProductCard.tsx components/store/ProductGrid.tsx components/store/CategoryBar.tsx components/store/StoreClient.tsx components/store/*.module.css
git commit -m "feat(tienda): cards de producto, grid y categorias con estilo Stitch (R1)"
```

---

## Task 5: Detalle de producto

**Files:**
- Modify: `components/store/ProductDetail.tsx` + `ProductDetail.module.css`
- Modify: `components/store/ProductPageShell.tsx` (layout de la página de producto)
- Modify: `components/store/SizeGuideModal.tsx` + `.module.css` (estilo)

**Referencia:** `docs/diseno/stitch/detalle_de_producto_hondusport/`.

- [ ] **Step 1: Galería**

A la izquierda: imagen principal grande (card blanca redondeada) + fila de **thumbnails** (el activo con borde dorado). Tag "NUEVO" superior si aplica. Reusa las imágenes del producto existentes.

- [ ] **Step 2: Panel de compra**

A la derecha, card blanca: **eyebrow** de categoría en mayúsculas doradas, **título grande**, **rating dorado + "(N reseñas)"**, **precio L.**, descripción, **selector de tallas** (chips redondos; el activo dorado; "Guía de tallas" abre `SizeGuideModal`; las tallas salen de `getTallas()`), **stepper de cantidad + "Agregar al carrito" (pill negro con flecha) + corazón outline**, y una **caja de info** (envío gratis sobre L.X, devoluciones 30 días). Conservar la lógica de selección de talla/variante/cantidad y agregar al carrito.

- [ ] **Step 3: Relacionados**

Sección **"Productos relacionados"** como carrusel horizontal de `ProductCard` (reusa el `ProductCard` de Task 4). Reusa la fuente de relacionados existente (o los del mismo `categoria`, si ya se calculan).

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual: galería + thumbnails, tallas seleccionables, agregar al carrito, relacionados; responsive.

```bash
git add components/store/ProductDetail.tsx components/store/ProductPageShell.tsx components/store/SizeGuideModal.tsx components/store/*.module.css
git commit -m "feat(tienda): detalle de producto con estilo Stitch (galeria, tallas, relacionados) (R1)"
```

---

## Task 6: Cart drawer

**Files:**
- Modify: `components/store/CartDrawer.tsx` + `CartDrawer.module.css`

**Referencia:** `docs/diseno/stitch/carrito_de_compras_hondusport/`.

- [ ] **Step 1: Estructura y estilo**

Header "Tu Carrito" + cerrar (×). **Barra de progreso de envío gratis** dorada con el mensaje "¡Estás a L. X del envío gratis!" (reusar el umbral/estado de envío gratis ya disponible en la tienda; si no está en el drawer, calcularlo con el subtotal y el threshold existente — sin cambiar la lógica de negocio). Líneas: thumbnail, nombre, talla, **−/+ compactos**, precio de línea, **basurero dorado**. Campo **"Código de descuento" + "Aplicar"** (pill dorado outline) que usa el flujo de cupón existente. Pie fijo: **Subtotal** grande + **"Ir a pagar" negro** (abre el `CheckoutModal`) + nota "Los impuestos y gastos de envío se calculan en el checkout". Conservar `CartProvider`/handlers.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual: drawer con progreso, líneas con −/+ y basurero, código de descuento, subtotal y CTA.

```bash
git add components/store/CartDrawer.tsx components/store/CartDrawer.module.css
git commit -m "feat(tienda): cart drawer con estilo Stitch (progreso, codigo de descuento) (R1)"
```

---

## Task 7: Filtros

**Files:**
- Modify: `components/store/FilterSidebar.tsx` + `FilterSidebar.module.css`
- Modify: `components/store/ActiveFilterChips.tsx` + `ActiveFilterChips.module.css`

- [ ] **Step 1: Estilo**

`FilterSidebar`: secciones (precio, talla, categoría, género) con controles redondeados; rail colapsable en móvil. `ActiveFilterChips`: chips **redondeados** (dorado el activo, con × para quitar). Sin cambios de lógica de filtrado.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual: filtros con chips redondeados; filtrado sigue funcionando.

```bash
git add components/store/FilterSidebar.tsx components/store/ActiveFilterChips.tsx components/store/*.module.css
git commit -m "feat(tienda): filtros y chips activos con estilo Stitch (R1)"
```

---

## Task 8: Checkout carrusel (`CheckoutModal`)

**Files:**
- Modify: `components/store/CheckoutModal.tsx`
- Modify: `components/store/CheckoutModal.module.css`

**Referencia:** `docs/diseno/stitch/finalizar_compra_hondusport/`.

**Objetivo:** convertir el formulario de una vista en un **asistente de pasos (carrusel)** con barra de progreso y **Resumen del pedido siempre visible**, SIN cambiar la lógica de emisión (`handleSubmit`/`crearPedido`/totales) ni la frontera de confianza. Se conservan el estado `delivery`, `selectedEnvioId`, `status`, `error`, la persistencia en `localStorage`, y la llamada a `crearPedido` + WhatsApp.

**Pasos del asistente (adaptados a la lógica real delivery/pickup):**
1. **Datos de contacto** — nombre, teléfono, correo.
2. **Método de envío** — los `envios` como cards seleccionables (Estándar/Express/pickup con nombre/precio/tiempo); pickup muestra su info de punto de retiro.
3. **Dirección de envío** — **solo si el envío seleccionado es `tipo: 'delivery'`**; si es `pickup`, este paso se **omite** (no se pide dirección). Campos: ciudad/departamento, dirección exacta.
4. **Confirmar** — resumen del pedido (subtotal, descuento, envío, total en L.), **aviso de confirmación por WhatsApp**, y el CTA negro **"Finalizar pedido"** (dispara el mismo `handleSubmit`).

> **No** se agregan métodos de pago reales (tarjeta/transferencia) — el app confirma por WhatsApp; el paso 4 es de confirmación. (Pago real = P futuro.) El texto/labels/inputs siguen el estilo de `finalizar_compra` (labels pequeñas, inputs redondeados, cards blancas), pero en español y con el flujo real.

- [ ] **Step 1: Agregar el state machine de pasos**

Agregar `const [step, setStep] = useState(0)` y una lista de pasos calculada según el envío (si el envío es pickup, se salta el paso de dirección). Al abrir el modal (donde ya se hace `setDelivery(readDeliveryInfo())`), resetear `setStep(0)`. Helpers `siguiente()`/`atras()` que respeten los pasos válidos.

```tsx
type Paso = 'contacto' | 'envio' | 'direccion' | 'confirmar'

function pasosActivos(tipo: 'delivery' | 'pickup' | undefined): Paso[] {
  const base: Paso[] = ['contacto', 'envio']
  if (tipo === 'delivery') base.push('direccion')
  base.push('confirmar')
  return base
}
```

En el render, `const pasos = pasosActivos(selectedEnvio?.tipo)` y `const pasoActual = pasos[Math.min(step, pasos.length - 1)]`. Clampear `step` cuando cambie el tipo de envío (si estaba en 'direccion' y pasa a pickup, retroceder).

- [ ] **Step 2: Validación por paso**

Antes de avanzar, validar solo los campos del paso actual:
- `contacto`: nombre, teléfono, correo requeridos (no vacíos).
- `envio`: `selectedEnvio` no nulo.
- `direccion`: ciudad y dirección requeridas (solo delivery).
- `confirmar`: no valida (dispara submit).
Si falta algo, `setError(...)` y no avanzar. Reusar/mover las validaciones que hoy están en `handleSubmit` a la validación por paso (y dejar `handleSubmit` como red final).

- [ ] **Step 3: Render por pasos + barra de progreso + resumen**

Reemplazar el `<form>` de una vista por: una **barra de progreso** (los N pasos con su índice/estado), el **contenido del paso actual** (solo los campos/controls de ese paso), y una fila de navegación **Atrás / Siguiente** (en `confirmar`, el botón es **"Finalizar pedido"** que hace submit). El **Resumen del pedido** (el bloque `.preview` de totales) se muestra **siempre** (lateral en desktop, arriba/colapsable en móvil). Estilos según `finalizar_compra` (cards blancas, inputs redondeados, CTA negro). Conservar `handleSubmit` tal cual para la emisión.

- [ ] **Step 4: CSS del carrusel**

En `CheckoutModal.module.css`: layout de dos columnas en desktop (pasos a la izquierda, resumen a la derecha), una columna en móvil (resumen colapsable arriba). Barra de progreso (segmentos, el activo dorado, completados dorados, pendientes gris). Botones Atrás (secundario) / Siguiente/Finalizar (negro). Inputs y cards redondeados. Transición suave entre pasos (opcional, sin `display:none` que rompa el foco).

- [ ] **Step 5: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests de la tienda verdes.
Visual (dev server): abrir el checkout desde el carrito; avanzar contacto → envío → (dirección si delivery) → confirmar; validación por paso (no avanza si faltan campos); pickup salta la dirección; el resumen se mantiene visible; **finalizar un pedido de prueba** emite igual que antes (mismo `crearPedido` + WhatsApp). Responsive.

```bash
git add components/store/CheckoutModal.tsx components/store/CheckoutModal.module.css
git commit -m "feat(tienda): checkout en carrusel de pasos (contacto/envio/direccion/confirmar) con estilo Stitch (R1)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Banner full-bleed → Task 2. ✅
- Cards/grid/categorías → Task 4. ✅
- Detalle de producto → Task 5. ✅
- Cart drawer → Task 6. ✅
- Checkout carrusel (4 pasos, modal, sin cambiar emisión) → Task 8. ✅ (adaptado a delivery/pickup; paso de pago = confirmación, sin pago real, por spec).
- Header/footer/búsqueda → Task 3. ✅
- Filtros → Task 7. ✅
- Solo tema claro (ocultar toggle) → Task 1. ✅
- Referencia Stitch, look Merlin, sin cambios de lógica → constraints + método de cada tarea. ✅

**2. Placeholder scan:** las tareas de re-skin describen cambios concretos + apuntan al `screen.png`/`code.html` de Stitch como referencia de valores exactos (color/espaciado/radio) — es la naturaleza de un re-skin, no un placeholder de lógica. La única lógica nueva (state machine de pasos del checkout) va con código concreto en Task 8.

**3. Type consistency:** Task 8 conserva las interfaces existentes de `CheckoutModal` (`DeliveryInfo`, props, `crearPedido`); el tipo `Paso`/`pasosActivos` se define en Task 8 y se usa solo ahí. `ProductCard` (Task 4) se reusa en el detalle (Task 5, relacionados) con sus props actuales. ✅

## Notas de entrega (para el controlador SDD)

- **Sin migración** (solo CSS/TSX de la tienda). No hay smoke SQL.
- La tienda es **pública** (sin login) → la verificación visual en el dev server SÍ es viable para los subagentes; pedir que verifiquen cada pantalla.
- Verificación visual final: recorrer home (banner full-bleed) → categoría/grid → detalle → carrito → checkout de 4 pasos (delivery y pickup) → finalizar un pedido de prueba; desktop + móvil; solo claro.
- Al mergear: FF a `main`, verificar deploy READY por SHA. Los diseños de Stitch quedan versionados en `docs/diseno/stitch/` como referencia para R2–R5.
