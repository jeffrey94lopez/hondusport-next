# Hondusport — Prompts para Google Stitch (rediseño completo)

**Fecha:** 2026-08-10
**Uso:** Google Stitch (stitch.withgoogle.com) genera UI pantalla por pantalla. Pegá el
**Brief maestro** una vez (o al inicio de cada pantalla) para fijar el sistema de diseño,
y luego pegá el **prompt de la pantalla** que quieras generar. Modo recomendado: **Web /
Desktop** para el admin y el POS; **Mobile + Desktop** para la tienda. Iterá con follow-ups
("make the cards more compact", "tighten spacing", "add a dark variant").

> Los prompts están en inglés (Stitch rinde mejor así) pero **todo el copy de UI debe ir en
> español de Honduras** y la moneda en **Lempiras** con formato `L. 1,234.56`. Cada bloque ya
> lo indica.

---

## 1. Brief maestro (pegar primero / como contexto)

```
You are designing "Hondusport" — a sportswear store in Honduras. Two surfaces share ONE design
system: (a) a public e-commerce storefront and (b) an internal admin + point-of-sale (POS) / ERP
used by staff. Design a cohesive, modern, premium system. Light theme only.

BRAND & DESIGN SYSTEM ("Merlin"):
- Primary/brand color: gold #c9a84c (used for icons, accents, secondary buttons, active states).
- CTA/primary action: pure black #000000, white text. Destructive: deep red #910022.
- Page background: soft cool gray #dbdce1. Cards/panels: pure white #ffffff. Hairline borders #e6e6e6.
- Text: near-black #1e1e1e (body), muted gray #606060 (secondary), disabled #969696.
- State colors: success #1b8959, warning #a16b00, info #0a53a5, error #910022 (each with a pale tint bg).
- Typography: Poppins. Big bold numbers for money/metrics. Sentence case, never ALL CAPS.
- Shape: generously rounded — inputs 12px, cards 16px, buttons pill 32px, tags/chips fully rounded (pill).
- Icons: thin line icons (feather/tabler style) rendered in GOLD, no background, no filled shapes.
- Elevation: soft, low shadows (0 4px 12px rgba(18,30,108,0.08)). Flat, clean, lots of whitespace.
- Motion: subtle. No gradients on surfaces (a gold→black gradient exists only for hero accents).

GLOBAL RULES:
- Language: ALL visible copy in Spanish (Honduras). Currency in Lempiras: "L. 1,234.56".
- The admin is data-dense and professional (tables, filters, KPIs). The storefront is energetic and
  sporty but still clean and premium.
- Fully responsive. Accessible contrast. Never let text disappear on hover (hover keeps contrast).
```

---

## 2. Tienda (storefront)

### 2.1 Home / catálogo
```
[Use the Merlin brief.] Design the STOREFRONT HOME for Hondusport, a sportswear e-commerce.
Top: slim header with gold "HS" logo, a prominent search bar, cart icon (gold, with a count
badge), and a "Iniciar sesión" link. Below: a full-width hero banner (sport imagery, a gold-to-black
gradient overlay, a headline in Spanish and a black pill CTA "Comprar ahora"). Then a horizontal row
of category chips (fully rounded pills, gold when active). Then a responsive product grid: white
cards, 16px radius, product image, name, price in Lempiras "L. 890.00", a small gold star rating,
and a black pill "Agregar" button; out-of-stock cards show a red "Agotado" tag. A left filter rail
(price range, size, category, gender) collapsible on mobile. Footer with links. Copy in Spanish.
```

### 2.2 Detalle de producto
```
[Use the Merlin brief.] Design the PRODUCT DETAIL page. Left: large image gallery with thumbnails.
Right: product name, price in Lempiras, gold star rating, short description, a SIZE selector (rounded
pill chips, gold when selected), quantity stepper, a black pill "Agregar al carrito" CTA and a
gold-outline "Favorito" heart button. Below: shipping/return info in small muted text, and a
"Productos relacionados" carousel of product cards. Sporty but premium. Copy in Spanish, currency L.
```

### 2.3 Carrito (drawer) + checkout
```
[Use the Merlin brief.] Design a slide-in CART DRAWER from the right: list of line items (thumbnail,
name, size, quantity stepper with small round −/+ buttons, line price in Lempiras, a gold trash icon),
a promo/cupón field, subtotal, a "envío gratis" progress hint, and a black pill "Ir a pagar" CTA.
Then design the CHECKOUT page: two columns — left a form (datos de contacto, dirección de envío,
método de envío as selectable cards, método de pago), right an order summary card with items, ISV,
total in Lempiras, and a confirmation note that says the order is confirmed via WhatsApp. Copy in Spanish.
```

---

## 3. Admin — shell y dashboard

### 3.1 Layout / navegación (shell)
```
[Use the Merlin brief.] Design the ADMIN SHELL for Hondusport's back office. A fixed left SIDEBAR
(white, collapsible to icons) with a gold "HS" logo, an "Inicio" item on top, then grouped nav
sections with UPPERCASE tiny gray group labels: TIENDA (Productos, Categorías, Banners, Cupones,
Envíos), INGRESOS (POS, Documentos, Cotizaciones, Pedidos [with a count badge], Cuentas por cobrar,
Reportes), EGRESOS (Compras, Cuentas por pagar), INVENTARIO (Inventario físico, Movimientos),
CLIENTES (Clientes y proveedores). Bottom: Configuración and Salir. Every nav item has a thin GOLD
line icon, no background; the active item has a pale gold pill highlight with gold text. Main content
area on a soft gray page background. Copy in Spanish.
```

### 3.2 Dashboard (Inicio)
```
[Use the Merlin brief.] Design the ADMIN DASHBOARD. Top: title "Inicio" and a date-range filter
(pill segmented control: Hoy / Semana / Mes / Año / Personalizado). Below: a responsive grid of
SEGMENT CARDS, each a white 16px-radius card with a gold line icon + title and 2–3 sub-metrics
(big bold number + small muted label):
- "Ventas": Ventas (sin ISV) · Costo de ventas · Utilidad neta (with margin %).
- "Documentos": Total · Facturas · Comprobantes.
- "Cotizaciones": Abiertas · Ganadas · Perdidas.
- "Cuentas por cobrar": Crédito nuevo · Cobrado · Acumulado.
- "Cuentas por pagar": Crédito nuevo · Pagado · Acumulado.
- "Ítems": Stock bajo (alert if >0) · Ítems nuevos.
Then a row of charts: a bar chart "Ventas por día", and two horizontal bar rankings "Ítems más
vendidos" and "Mejores clientes" with a small L./unidades toggle. Bottom: a narrow "Últimos
documentos" list. All money in Lempiras. Clean, data-dense, professional. Copy in Spanish.
```

---

## 4. Admin — POS (mostrador)

### 4.1 Pantalla de venta (POS fullscreen)
```
[Use the Merlin brief.] Design the POINT-OF-SALE "mostrador" — a FULLSCREEN two-column workspace (no
sidebar). Left column: sale tabs on top (multiple parked sales), a product search bar with a
"+ Ítem libre" button, category filter chips (fully rounded, gold when active), and a product grid of
compact cards (name, price in Lempiras, a gold star to pin favorites). Right column: the CART panel —
a customer selector at top (or "CONSUMIDOR FINAL"), a scrollable list of line items (each row: name,
a COMPACT round −/+ quantity control with a fixed-width centered quantity box, line subtotal, a gold
edit pencil, a red remove ×), then a footer with global discount, subtotal/ISV/total in big bold
Lempiras, a seller selector, and a large black pill "Cobrar" CTA. Dense but calm. Copy in Spanish.
```

### 4.2 Modal de cobro (pagos mixtos)
```
[Use the Merlin brief.] Design the PAYMENT MODAL for the POS. Title "Cobrar", total in big bold
Lempiras. A row of payment-method chips (Efectivo, Tarjeta, Transferencia, Crédito, Saldo a favor) —
fully rounded pills, and when a method is selected it turns solid black with white text (and the hover
must keep the text readable). Below: for each added payment, an amount field (plain text, no spinner
arrows) with quick-amount suggestion chips (Total, Restante, cash denominations); a running "Restante"
and "Vuelto". A black pill "Emitir" CTA and a gold-outline "Cancelar". Support splitting across
methods. Copy in Spanish, money in Lempiras.
```

### 4.3 Documento / comprobante fiscal (imprimible)
```
[Use the Merlin brief.] Design a FISCAL DOCUMENT view (Honduras SAR). A toolbar (not printed) with a
"← Documentos" back link, format toggle "80mm / Carta", and black/gold action buttons "Imprimir",
"Devolver / Nota de crédito". Below, the printable sheet on white: business header + CAI block, the
16-digit correlativo, client name + RTN, a line-items table (descripción, cantidad, precio, importe),
a tax breakdown block (Exento, Exonerado, Gravado 15%, ISV 15%, Gravado 18%, ISV 18%), total in
numbers and in words, and payment methods. A subtle "ANULADO" or "Devuelto" badge state. Clean,
formal, print-friendly. Copy in Spanish, Lempiras.
```

---

## 5. Admin — ventas, inventario, reportes

### 5.1 Cotizaciones (kanban)
```
[Use the Merlin brief.] Design a QUOTES KANBAN board ("Cotizaciones"). Configurable stage columns
(e.g. Abierta, Enviada, Ganada, Perdida) with a colored dot per column and a count. Cards (white,
rounded) show quote number, client, total in Lempiras, seller, and a red "Vencida" badge when expired.
Drag-and-drop feel; each card has a "…" menu (Mover a…, Duplicar, Facturar). A top bar with a
"+ Nueva cotización" black pill and a search. Copy in Spanish.
```

### 5.2 Productos (lista + editor)
```
[Use the Merlin brief.] Design the PRODUCTS admin. A table/grid of products (thumbnail, nombre, SKU,
categoría, precio in Lempiras, stock with a low-stock warning color, canal tienda/mostrador, a "Kardex"
link and edit action). Top: search, category filter, "Importar plantilla" and "+ Nuevo producto"
buttons. Then design the PRODUCT EDITOR panel: fields for nombre, precio, precio revendedor, costo,
categoría/subcategoría, canal, stock, imágenes, and a variants sub-table (nombre, SKU, precio, stock).
Data-dense, clean. Copy in Spanish, Lempiras.
```

### 5.3 Reportes (índice + un reporte)
```
[Use the Merlin brief.] Design the REPORTS module. First a REPORTS INDEX: a grid of report cards
(white, rounded, gold title + description + arrow): "Libro de ventas (SAR)", "Reporte de ventas",
"Ganancias por ítem", "Clientes y proveedores", "Cuentas por cobrar". Then design ONE report page —
"Ganancias por ítem": a date-range pill filter, three big summary tiles (Total ventas, Total costos,
Total ganancias + margen %), and a dense table (Código, Nombre, Variante, Categoría, Cantidad, Ventas,
Costos, Ganancia, Ganancia %) with a totals row; toolbar buttons "Exportar Excel" and "Imprimir".
All money in Lempiras. Professional, print-friendly. Copy in Spanish.
```

### 5.4 Cuentas por cobrar (cascada) + inventario físico
```
[Use the Merlin brief.] (A) Design an ACCOUNTS-RECEIVABLE "cascada" report: a searchable list where
each row is a client (name, # documents, total pendiente in Lempiras) that expands (accordion) to show
their documents (número, fecha, vencimiento, días vencido in red, saldo). Toolbar: "Exportar Excel",
"Imprimir". (B) Design a PHYSICAL INVENTORY count screen: a filterable table of products/variants with
SKU scan input, "conteo" vs "sistema" columns and a difference column (green/red), plus a "carrusel"
mode that shows one product at a time with a big count input. Copy in Spanish, Lempiras.
```

### 5.5 Configuración
```
[Use the Merlin brief.] Design a SETTINGS page with left sub-nav sections (Empresa/Facturador, CAIs,
Métodos de pago, POS, Cotizaciones/Etapas, General). Each section is a white card with labeled form
fields and toggles; a sticky "Guardar cambios" black pill. The CAIs section shows a table of fiscal
authorizations (establecimiento, punto, tipo, rango, correlativo actual, fecha límite, activo). Clean,
form-heavy, professional. Copy in Spanish.
```

---

## 6. Cómo iterar en Stitch

- Generá primero el **shell/nav** y el **dashboard**; ahí queda "aprendido" el estilo Merlin y las
  siguientes pantallas salen coherentes.
- Si una pantalla sale muy cargada: follow-up "make it more compact, tighter rows, less padding".
- Para consistencia de color: "use gold #c9a84c only for icons/accents/active; black #000 for the
  primary button; page background #dbdce1; cards white".
- Exportá a código/Figma desde Stitch y usalo como referencia visual — la implementación real sigue
  usando los tokens de `app/merlin.css`.
