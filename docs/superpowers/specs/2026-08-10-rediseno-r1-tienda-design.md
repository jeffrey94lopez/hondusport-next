# Rediseño R1 — Tienda (storefront) — Diseño

**Fecha:** 2026-08-10
**Serie:** Rediseño Hondusport (adopción de los diseños de Google Stitch), **Ola 1 de 5** (R1 Tienda → R2 Config/empresa/descuentos → R3 Shell+Dashboard → R4 POS → R5 módulos admin).
**Estado:** aprobado para plan.

## Objetivo

Re-estilizar el storefront público (`app/(store)` + `components/store/*`) para adoptar
los diseños de Stitch (en `docs/diseno/stitch/`), manteniendo intactas la lógica, los
datos y los Server Actions. Incluye dos cambios de comportamiento acordados: el
**banner del home a pantalla completa siempre** (full-bleed) y el **checkout en modo
carrusel** (asistente de 4 pasos, dentro del modal actual). Solo **tema claro**.

## Fuente de verdad visual

Las capturas + código de Stitch en `docs/diseno/stitch/`:
- `hondusport_inicio_tienda/` — home (banner, categorías, grid).
- `detalle_de_producto_hondusport/` — detalle de producto.
- `carrito_de_compras_hondusport/` — cart drawer.
- `finalizar_compra_hondusport/` — checkout (se adapta a carrusel).

Cada carpeta trae `screen.png` (diseño) y `code.html` (HTML/Tailwind de referencia). El
implementador replica el **layout/espaciado/estilo** en los componentes React reales
(CSS Modules), NO copia el HTML de Stitch ni su markup.

## Alcance

**Dentro:** re-skin visual de home, cards/grid, detalle de producto, cart drawer,
header/footer/búsqueda/filtros; banner full-bleed; checkout carrusel (4 pasos, en el
modal). Solo tema claro.

**Fuera:** cambios de lógica de negocio, datos o Server Actions (checkout sigue
recalculando en el servidor con `crear_pedido`); el tema oscuro (se congela/omite en
R1 — ver §7); el resto de las olas (R2–R5); nuevas integraciones (WhatsApp real es otro P).

## Principios

- **Solo estilo + el flujo de pasos del checkout.** Ningún cambio a la frontera de
  confianza del checkout ni a `app/(store)/checkout/actions.ts`.
- **Merlin/tienda:** dorado `#c9a84c` como acento, CTA negro `#000`, cards blancas,
  fondo de página claro, Poppins, radios redondeados (pills), tags redondeados. Se
  reusa la capa de tokens que ya usa la tienda (scoped bajo `.storeRoot` en
  `store-globals.css`), alineada al look de Stitch.
- **Responsive** (los diseños de Stitch son desktop; el implementador adapta a móvil
  con el patrón existente: `MobileNav`/`BottomNav`).
- **Sin regresiones funcionales:** carrito, wishlist, filtros, búsqueda, tallas y
  checkout siguen funcionando igual; solo cambia su apariencia (y el checkout, su
  disposición en pasos).

---

## 1. Home (`app/(store)/page.tsx` + `StoreClient.tsx`)

### 1.1 Banner full-bleed (`HeroCarousel`)
- El hero pasa a **ancho total del viewport, sin márgenes ni esquinas redondeadas**
  (hoy está contenido con margen/radio). Imagen real de fondo a sangre, overlay
  gold→negro (usar `--gradient-*` o un overlay), contenido a la izquierda: eyebrow
  opcional, título grande con **acento dorado** en una palabra ("Desata tu
  <span dorado>Potencial</span>"), subtítulo, y dos CTAs — pill dorado "Comprar ahora"
  + pill negro-outline "Ver catálogo". Mantiene el comportamiento de carrusel si hay
  varios banners (los banners vienen de la tabla `banners`), pero cada slide ocupa el
  ancho completo. Altura amplia (p. ej. `min-height: 70vh` en desktop, menos en móvil).

### 1.2 Categorías
- Sección "Explorar por categoría": 3 cards grandes (imagen de fondo, nombre en
  blanco, "Ver todo →" dorado), grid responsivo. Sale de `CategoryBar`/las categorías
  existentes o de una sección nueva en el home; el implementador decide reusar
  `CategoryBar` o una grilla de cards en `StoreClient` según lo que ya exista.

### 1.3 Grid de productos
- `ProductGrid` + `ProductCard` con el estilo nuevo (ver §2). Footer negro con
  columnas (Empresa, Soporte, Redes) — `Footer` re-estilizado.

## 2. Cards de producto (`ProductCard`)

Según `detalle_de_producto` (relacionados) y el home:
- Card blanca redondeada; imagen; **tag** superior-izquierda "NUEVO" (dorado) o
  "-20%" (rojo) cuando aplique (descuento = `precio_original` presente); **corazón**
  de wishlist superior-derecha; rating con estrellas doradas + conteo; nombre;
  categoría (muted); **precio en L.** y, si hay descuento, el **precio original
  tachado**; botón **"+" negro** (o "Agregar") para añadir al carrito. Estado
  "Agotado" con tag rojo. Reusa la lógica de wishlist/carrito existente.

## 3. Detalle de producto (`ProductDetail` + `ProductPageShell`)

Según `detalle_de_producto_hondusport`:
- **Galería** a la izquierda (imagen principal grande + fila de thumbnails; el activo
  con borde dorado), tag "NUEVO" si aplica.
- **Panel** a la derecha (card blanca): eyebrow de categoría en mayúsculas doradas,
  **título grande**, rating dorado + "(N reseñas)", **precio L.**, descripción,
  **selector de tallas** (chips redondos, dorado al seleccionar; "Guía de tallas"
  abre `SizeGuideModal`), **stepper de cantidad + "Agregar al carrito" negro (pill con
  flecha) + corazón outline**, y una caja de info (envío gratis sobre L.X,
  devoluciones 30 días).
- Abajo: **"Productos relacionados"** como carrusel de `ProductCard`.
- Las tallas siguen saliendo de `getTallas()` (no un campo directo). Sin cambios de
  lógica.

## 4. Cart drawer (`CartDrawer`)

Según `carrito_de_compras_hondusport`:
- Header "Tu Carrito" + cerrar. **Barra de progreso de envío gratis** dorada ("¡Estás
  a L. X del envío gratis!"). Líneas: thumbnail, nombre, talla, **−/+ compactos**,
  precio de línea, **basurero dorado**. Campo **"Código de descuento" + "Aplicar"**
  (dorado outline). Pie fijo: **Subtotal** grande + **"Ir a pagar" negro** + nota
  "Los impuestos y gastos de envío se calculan en el checkout". Reusa `CartProvider`.

## 5. Checkout carrusel (`CheckoutModal`) — nuevo flujo de pasos

El checkout **sigue siendo un modal** (`CheckoutModal`), pero se reorganiza como un
**asistente de 4 pasos (carrusel)** con **barra de progreso** y el **Resumen del
pedido** siempre visible (lateral en desktop, colapsable arriba en móvil):

1. **Datos de contacto** — correo, teléfono.
2. **Dirección de envío** — nombre completo, dirección exacta, ciudad, departamento.
3. **Método de envío** — cards seleccionables (Estándar/Express con precio y tiempo).
4. **Método de pago + Finalizar** — opciones (tarjeta/transferencia), botón negro
   **"Finalizar pedido"**, y el **aviso de confirmación por WhatsApp**.

- Navegación **Atrás/Siguiente**; **validación por paso** (no avanza si faltan campos
  requeridos de ese paso). El estado del formulario se mantiene entre pasos (no se
  pierde al ir/volver).
- El **Resumen del pedido** muestra ítems, subtotal, envío, ISV (15%) y total en L.,
  recalculados con la misma lógica actual del modal.
- **No cambia** la emisión: al finalizar se llama al mismo Server Action de checkout
  (`app/(store)/checkout/actions.ts`, que relee productos y recalcula en el servidor
  vía `crear_pedido`). Solo cambia la UI de captura (una página → 4 pasos).
- Estilo de los inputs/cards según Stitch (`finalizar_compra`): labels pequeñas, inputs
  redondeados, cards blancas, CTA negro.

## 6. Header / footer / búsqueda / filtros

- **Header** (`Nav`/`StoreHeader`/`MobileNav`): logo "Hondusport" (gold), links de
  nav (Hombre/Mujer/Accesorios/Ofertas), barra de búsqueda prominente, iconos de
  cuenta y **carrito con badge de conteo** (dorados). En móvil, `MobileNav`/`BottomNav`.
- **Búsqueda** (`MegaSearch`): mismo estilo de input redondeado + icono dorado.
- **Filtros** (`FilterSidebar` + `ActiveFilterChips`): chips redondeados (dorado al
  activo), rail colapsable en móvil. Sin cambios de lógica de filtrado.
- **Footer** (`Footer`): fondo negro, logo, columnas de links, nota de copyright +
  "Precios en Lempiras (L.)".

## 7. Tema oscuro

R1 se enfoca en el **tema claro** (los diseños de Stitch son claros). El
`ThemeToggle`/tema oscuro **no se rediseña** en R1: se deja como está funcionalmente,
o —si estorba visualmente— se puede ocultar el toggle en R1 y decidir el futuro del
tema oscuro aparte. **Decisión R1: ocultar el `ThemeToggle` y renderizar la tienda en
claro** (no se borra la infraestructura de tema, solo se oculta el control y se fija
el claro), para no arrastrar un tema oscuro sin rediseñar. Reversible.

## 8. Restricciones globales

- Idioma español (Honduras); moneda en Lempiras `L. 1,234.56` con el formateo existente.
- **Solo estilo + el flujo de pasos del checkout.** Nada de lógica/datos/Server Actions.
- Merlin: dorado acento, CTA negro, cards blancas, Poppins, radios redondeados; reusar
  la capa de tokens de la tienda (`.storeRoot`).
- Responsive (adaptar los diseños desktop a móvil con los componentes móviles
  existentes).
- Solo tema claro en R1.
- Los diseños de Stitch (`docs/diseno/stitch/`) son la referencia visual; NO se copia
  su HTML/markup — se re-estiliza el componente React real.

## 9. Verificación

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (los tests de la
  tienda deben seguir verdes; no se cambia lógica).
- **Visual (dev server, la tienda es pública — sin login):** home con banner
  full-bleed; cards con tags/rating/precio tachado; detalle con galería + tallas +
  agregar; cart drawer con progreso + código de descuento; **checkout de 4 pasos** que
  avanza/retrocede, valida por paso y finaliza un pedido de prueba; responsive
  (desktop + móvil); solo tema claro.

## Fuera de alcance

R2–R5; WhatsApp real; cambios de lógica/datos; tema oscuro rediseñado; nuevas
integraciones de pago.
