# Rediseño R4 — Mostrador POS completo — Diseño

**Fecha:** 2026-08-11
**Serie:** Rediseño Hondusport (adopción de los diseños de Google Stitch). Ola **R4 de 5**
(R1 tienda ✅ · R2a empresa ✅ · R2b descuentos ✅ · R3 shell+dashboard ✅ · **R4 mostrador POS** · R5 resto de módulos admin).
**Estado:** aprobado para plan.

## Objetivo

Re-estilizar **todo el mostrador POS** (`/admin/pos`) al look Stitch: el layout (barra
superior, pestañas de venta, catálogo, carrito) y todos sus modales (cobro, nuevo cliente,
ítem libre, cierre de caja, devolución, documento, historial). Solo estilo — **sin cambios**
a la lógica de venta, caja, arqueo, devoluciones ni a la emisión fiscal.

## Fuente de verdad visual

- `docs/diseno/stitch/hondusport_punto_de_venta_mostrador/` — layout del mostrador.
- `docs/diseno/stitch/hondusport_modal_de_cobro_pos/` — modal de cobro.
- `docs/diseno/stitch/hondusport_pos_agregar_nuevo_cliente/` — modal de nuevo cliente.
- `docs/diseno/stitch/hondusport_modal_editar_tem_pos/` — modal editar ítem (ya re-skineado en R2b).

(El `hondusport_modal_de_pago_carrusel` de Stitch es el checkout de la **tienda**, ya
implementado en R1; NO aplica al POS.)

## Contexto (estado actual)

- `app/admin/pos/PosClient.tsx` orquesta el mostrador (pantalla a overlay fullscreen desde
  `page.tsx`). Paneles: `CatalogoPanel`, `CarritoPanel`, `PestanasBar`. Modales:
  `CobroModal`, `ClienteNuevoModal`, `ItemLibreModal`, `LineaEditorModal` (ya re-skineado
  en R2b), `CierreModal`, `DevolucionModal`, `DocumentoModal`, `HistorialModal`.
  Estilos en `app/admin/pos/pos.module.css` (y algunos módulos propios).
- La matemática fiscal vive en `lib/pos/` (con tests); la emisión pasa por la RPC
  `emitir_documento` (correlativo + stock + kardex atómicos, snapshot inmutable).
- `CarritoPanel`/`LineaEditorModal` ya tienen los chips de descuento de R2b.

## Alcance

**Dentro:** re-skin visual del layout del mostrador y de TODOS sus modales al look Stitch,
conservando el look de los chips de descuento (R2b). Barra superior con marca + usuario +
salida + enlace a Configuración.

**Fuera:**
- Cambios de lógica de venta/caja/arqueo/devoluciones/emisión (`emitir_documento`), o a la
  matemática de `lib/pos/`.
- R5 (re-skin de las tablas/pantallas internas del resto de módulos admin: productos,
  inventario, reportes, cotizaciones, compras, CxC/CxP, etc.).

## Principios

- **Solo estilo.** Ninguna tarea toca lógica de negocio, la RPC de emisión, ni la matemática
  fiscal. La frontera de confianza del POS queda intacta.
- **Siempre 2 decimales:** todo monto se muestra con `formatPrice()` (L. X,XXX.XX); ningún
  número de dinero se renderiza crudo. Se verifica en el re-skin.
- **Merlin/Stitch:** cards blancas redondeadas, chips/pills redondeados (activo dorado o
  negro según el mockup), inputs redondeados, botón CTA negro; tokens de `app/merlin.css`.
- Idioma español; Lempiras `L.`.

## 1. Layout del mostrador

Re-skin de `PosClient.tsx` + `pos.module.css` + los tres paneles:

- **Barra superior:** marca **"Hondusport POS"** a la izquierda; a la derecha, el
  **usuario/avatar**, un **enlace a Configuración** (engranaje → `/admin/configuracion`) y la
  **salida** del POS (el control que ya existe para salir/cerrar). NO se agregan iconos
  decorativos sin función (notificaciones/ayuda del mockup).
- **Pestañas de venta** (`PestanasBar`): "Venta 1 / Venta 2 ×" + "+" con el estilo Stitch
  (tab activo resaltado, botón cerrar por venta, botón nueva venta). Sin cambios de lógica de
  multi-venta.
- **Catálogo** (`CatalogoPanel`): barra de búsqueda redondeada con icono; botón **"Ítem
  libre"** (dorado outline); chips de categoría (activo dorado); **cards de producto**
  (imagen, favorito/estrella, nombre, **precio con 2 decimales**, estado "AGOTADO" en gris).
  Conserva la búsqueda/filtro/agregar al carrito.
- **Carrito** (`CarritoPanel`): selector de **CLIENTE / CONSUMIDOR FINAL**; líneas con
  thumbnail, nombre, **stepper −/+**, total de línea (2 decimales); pie con **"Aplicar
  descuento global"** (chips de R2b, conservados), Vendedor/Caja, **Subtotal / ISV (15%) /
  Total** (2 decimales) y **"Cobrar →"** negro. Conserva toda la lógica (cliente, vendedor,
  descuento, cobrar).

## 2. Modales con diseño Stitch

- **Cobro** (`CobroModal`) → `hondusport_modal_de_cobro_pos`: "MONTO A PAGAR" grande (2
  decimales), chips de **método de pago** (Efectivo/Tarjeta/Transferencia/Crédito, activo
  negro), **MONTO RECIBIDO** + chips rápidos (L.50/100/500/Total/Restante), desglose
  (Subtotal/ISV/Total/Pagado/Restante, 2 decimales), "Cancelar" (outline) + **"Emitir
  Factura"** (negro). Re-skin puro; la emisión (`emitir_documento`) y el cálculo de
  cambio/restante NO cambian.
- **Nuevo cliente** (`ClienteNuevoModal`) → `hondusport_pos_agregar_nuevo_cliente`:
  formulario con el look Stitch (inputs redondeados, botón negro). Sin cambios de lógica ni
  de validación (RTN/identidad).

## 3. Modales secundarios (alineados al look)

Sin diseño Stitch propio; se alinean al mismo lenguaje (cards blancas, inputs/chips
redondeados, botones pill, tokens Merlin) para coherencia. Solo estilo:
- **Ítem libre** (`ItemLibreModal`).
- **Cierre de caja** (`CierreModal`) — respetando el arqueo mostrado.
- **Devolución** (`DevolucionModal`).
- **Documento** (`DocumentoModal`) — **respetando la hoja fiscal imprimible** (no re-maquetar
  el papel del documento, que es inmutable; solo el marco/controles del modal).
- **Historial** (`HistorialModal`).

## 4. Restricciones globales

- **Solo estilo.** Sin cambios a venta/caja/arqueo/devoluciones/emisión ni a `lib/pos/`.
- **Siempre 2 decimales** con `formatPrice()`; ningún monto crudo.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores que ya tienen token.
- El POS es a pantalla completa (overlay); conservar ese comportamiento y el `@media print`
  de los documentos.
- No hay migración SQL en R4.

## 5. Pruebas y verificación

- `npm test` (verdes; la matemática de `lib/pos/` no se toca, sus tests siguen verdes),
  `npx tsc --noEmit`, `npm run build`.
- **Visual (dev server, login admin, `/admin/pos`):**
  - Mostrador look Stitch (barra, pestañas, catálogo, carrito).
  - Chips de descuento (R2b) siguen funcionando.
  - **Cobro**: abrir el modal, método/monto recibido/chips rápidos, y **emitir una venta de
    prueba** que produzca un documento correcto (misma emisión, mismos totales con 2
    decimales).
  - Nuevo cliente, ítem libre, cierre, devolución, documento, historial: look coherente y
    funcionando.
  - Todos los montos con 2 decimales.

## Fuera de alcance

R5 (resto de módulos admin); cualquier cambio de lógica de venta/caja/fiscal; el checkout de
la tienda (R1).
