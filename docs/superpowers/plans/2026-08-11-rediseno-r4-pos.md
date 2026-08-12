# Rediseño R4 — Mostrador POS completo — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-estilizar todo el mostrador POS (`/admin/pos`) al look Stitch —layout, pestañas, catálogo, carrito y todos los modales— sin tocar la lógica de venta/caja/emisión y mostrando siempre 2 decimales.

**Architecture:** Cada tarea re-estiliza uno o dos componentes reales del POS (JSX + CSS Modules, casi todo en `app/admin/pos/pos.module.css`) tomando como referencia visual las capturas de Stitch. Se conserva la lógica (props, handlers, estado, emisión) y los chips de descuento de R2b. `pos.module.css` es compartido por varios paneles/modales — las tareas lo editan en secuencia.

**Tech Stack:** Next.js 16 (App Router, Client Components), TypeScript, CSS Modules. Matemática fiscal en `lib/pos/` (NO se toca).

## Global Constraints

- Idioma español (Honduras); moneda Lempiras `L.`.
- **Solo estilo.** Ninguna tarea cambia lógica de venta/caja/arqueo/devoluciones, la RPC `emitir_documento`, ni la matemática de `lib/pos/`. Se conservan props/handlers/estado de cada componente.
- **Siempre 2 decimales:** todo monto se muestra con `formatPrice()` (L. X,XXX.XX). Al re-estilizar, si algún monto se renderiza crudo, envolverlo en `formatPrice()`. Ningún número de dinero sin formatear.
- Tokens Merlin (`app/merlin.css`); no hardcodear valores que ya tienen token. Chips/pills redondeados (activo dorado o negro según el mockup), cards blancas, CTA negro, inputs redondeados.
- El POS es a pantalla completa (overlay en `page.tsx`); conservar ese comportamiento y el `@media print` de los documentos.
- Se conservan los chips de descuento de R2b (`CarritoPanel`, `LineaEditorModal`).
- No hay migración SQL.
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes; la matemática de `lib/pos/` no se toca, sus tests siguen verdes).

**Referencia visual (todas las tareas):** `docs/diseno/stitch/hondusport_punto_de_venta_mostrador/` (layout), `hondusport_modal_de_cobro_pos/` (cobro), `hondusport_pos_agregar_nuevo_cliente/` (nuevo cliente). Replicar el LOOK; no copiar el HTML de Stitch. **Método de cada tarea:** leer el/los componente(s) actual(es), ajustar su JSX/CSS al look Stitch conservando props/handlers/lógica, verificar que todo monto use `formatPrice`.

---

## File Structure

- `app/admin/pos/PosClient.tsx` + `pos.module.css` (Task 1) — layout + barra superior.
- `app/admin/pos/page.tsx` (Task 1) — pasar el usuario al top bar (si se usa).
- `app/admin/pos/components/PestanasBar.tsx` (Task 2).
- `app/admin/pos/components/CatalogoPanel.tsx` (Task 3).
- `app/admin/pos/components/CarritoPanel.tsx` (Task 4).
- `app/admin/pos/components/CobroModal.tsx` (Task 5).
- `app/admin/pos/components/ClienteNuevoModal.tsx` (Task 6).
- `app/admin/pos/components/ItemLibreModal.tsx`, `CierreModal.tsx`, `DevolucionModal.tsx` (+ `DevolucionModal.module.css`) (Task 7).
- `app/admin/pos/components/DocumentoModal.tsx`, `HistorialModal.tsx` (Task 8).
- `app/admin/pos/pos.module.css` — compartido; editado por las tareas que lo usan.

---

## Task 1: Layout del mostrador + barra superior

**Files:**
- Modify: `app/admin/pos/PosClient.tsx`
- Modify: `app/admin/pos/pos.module.css`
- Modify: `app/admin/pos/page.tsx` (solo si el top bar muestra el usuario)

**Objetivo:** re-skin del marco del mostrador (dos columnas: catálogo izquierda / carrito derecha) y una **barra superior** al estilo Stitch, sin tocar la lógica de PosClient.

- [ ] **Step 1: Leer la estructura actual de `PosClient`**

Leer `app/admin/pos/PosClient.tsx` para ubicar el render del overlay, las dos columnas (`.catalogoCol`/`.ventaRoot` o equivalentes), dónde se monta `PestanasBar`, y el control de **salir** del POS (ya existe). No cambiar el estado ni los handlers.

- [ ] **Step 2: Barra superior**

Agregar una barra superior con: **"Hondusport POS"** (marca, izquierda); a la derecha, un **enlace a Configuración** (icono engranaje → `/admin/configuracion`, usando `Link`), el indicador existente de caja/sesión si aplica, y el **control de salir** del POS (reubicar el que ya existe, sin cambiar su acción). NO agregar iconos decorativos sin función (notificaciones/ayuda del mockup). Si se muestra el usuario/avatar, obtener el nombre en `page.tsx` (`supabase.auth.getUser()`, `user_metadata.nombre ?? email ?? 'Admin'`) y pasarlo como prop; si no, omitir el avatar.

- [ ] **Step 3: Re-skin del marco en CSS**

En `pos.module.css`: fondo de página gris claro; columnas con cards blancas redondeadas y sombra; barra superior blanca con la marca en negro. Tokens Merlin. Conservar el overlay fullscreen y el `@media print`.

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (login admin, `/admin/pos`): mostrador con barra superior (marca + config + salir), dos columnas al look Stitch; la venta sigue funcionando. Si no puedes autenticarte, verifica por estructura/estilos computados y dilo.

```bash
git add app/admin/pos/PosClient.tsx app/admin/pos/pos.module.css app/admin/pos/page.tsx
git commit -m "feat(pos): re-skin del layout del mostrador + barra superior (R4)"
```

---

## Task 2: Pestañas de venta (`PestanasBar`)

**Files:**
- Modify: `app/admin/pos/components/PestanasBar.tsx`
- Modify: `app/admin/pos/pos.module.css`

- [ ] **Step 1: Re-skin**

Leer `PestanasBar.tsx`. Re-estilizar las pestañas de venta ("Venta 1 / Venta 2 ×" + "+") al look Stitch: tab activo resaltado (fondo blanco/borde), botón **×** por venta, botón **+** de nueva venta. Conservar toda la lógica de multi-venta (crear/cerrar/cambiar pestaña). Tokens Merlin.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual: las pestañas se ven Stitch; crear/cerrar/cambiar venta funciona.

```bash
git add app/admin/pos/components/PestanasBar.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin de las pestañas de venta (R4)"
```

---

## Task 3: Catálogo (`CatalogoPanel`)

**Files:**
- Modify: `app/admin/pos/components/CatalogoPanel.tsx`
- Modify: `app/admin/pos/pos.module.css`

**Contexto:** `CatalogoPanel` ya usa `formatPrice` en las cards y el modal de variante. Estructura: `.searchRow` (input + "+ Ítem libre"), sección "Anclados", `.chipsRow` de categorías/subcategorías, `.catalogoGrid` de `.prodCard`, y el `Modal` de elegir variante.

- [ ] **Step 1: Re-skin**

Re-estilizar al look Stitch: barra de búsqueda redondeada con icono (placeholder "Buscar por nombre, SKU o código de barras…"); botón **"+ Ítem libre"** dorado outline; chips de categoría redondeados (activo dorado, ya `btnMerlinChip`); **cards de producto** (`.prodCard`) con imagen, estrella de anclar (arriba), nombre, **precio con 2 decimales**, estado "AGOTADO" en gris. Conservar toda la lógica (búsqueda, escáner SKU, favoritos, agregar, modal de variante). Verificar que todo precio use `formatPrice`.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual: catálogo look Stitch; buscar/filtrar/agregar/variante funcionan; precios con 2 decimales.

```bash
git add app/admin/pos/components/CatalogoPanel.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin del catálogo (busqueda, chips, cards) (R4)"
```

---

## Task 4: Carrito (`CarritoPanel`)

**Files:**
- Modify: `app/admin/pos/components/CarritoPanel.tsx`
- Modify: `app/admin/pos/pos.module.css`

**Contexto:** `CarritoPanel` ya tiene los chips de descuento de R2b (global) y el bloque de cliente/vendedor/totales/cobrar. NO tocar la lógica del descuento ni los chips; solo re-estilizar el resto al look Stitch.

- [ ] **Step 1: Re-skin**

Re-estilizar al look Stitch: selector de **CLIENTE / CONSUMIDOR FINAL** (card con dropdown); **líneas** con thumbnail, nombre, talla/variante, **stepper −/+**, total de línea (2 decimales), tag de descuento de línea; pie con **"Aplicar descuento global"** (conservar los chips de R2b tal cual), Vendedor/Caja, **Subtotal / ISV (15%) / Total** (2 decimales) y **"Cobrar →"** negro. Conservar toda la lógica (cliente, vendedor, descuento global, cantidades, editar línea, cobrar). Verificar `formatPrice` en todos los montos.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual: carrito look Stitch; chips de descuento (R2b) intactos; cliente/cantidades/cobrar funcionan; montos con 2 decimales.

```bash
git add app/admin/pos/components/CarritoPanel.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin del carrito conservando los chips de descuento (R4)"
```

---

## Task 5: Modal de cobro (`CobroModal`)

**Files:**
- Modify: `app/admin/pos/components/CobroModal.tsx`
- Modify: `app/admin/pos/pos.module.css`

**Referencia:** `docs/diseno/stitch/hondusport_modal_de_cobro_pos/`.

**Contexto:** `CobroModal` es la frontera de emisión: al confirmar llama a la RPC `emitir_documento`. NO tocar esa lógica ni el cálculo de cambio/restante — solo el estilo.

- [ ] **Step 1: Re-skin**

Leer `CobroModal.tsx`. Re-estilizar al look Stitch: **"MONTO A PAGAR"** grande (2 decimales, acento dorado); chips de **método de pago** (Efectivo/Tarjeta/Transferencia/Crédito, activo negro); **"MONTO RECIBIDO"** input + chips rápidos (L.50/100/500/Total/Restante); desglose **Subtotal/ISV/Total/Pagado/Restante** (2 decimales); pie con **"Cancelar"** (outline) + **"Emitir Factura"** (negro). Conservar TODA la lógica (métodos, pagos mixtos, cambio, emisión). Verificar `formatPrice` en todos los montos.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual (login admin): abrir el cobro; método/monto recibido/chips rápidos; **emitir una venta de prueba** que produzca un documento correcto (misma emisión, totales con 2 decimales). Si no puedes autenticarte, verifica por estructura/código y dilo.

```bash
git add app/admin/pos/components/CobroModal.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin del modal de cobro (R4)"
```

---

## Task 6: Modal de nuevo cliente (`ClienteNuevoModal`)

**Files:**
- Modify: `app/admin/pos/components/ClienteNuevoModal.tsx`
- Modify: `app/admin/pos/pos.module.css`

**Referencia:** `docs/diseno/stitch/hondusport_pos_agregar_nuevo_cliente/`.

- [ ] **Step 1: Re-skin**

Leer `ClienteNuevoModal.tsx`. Re-estilizar el formulario al look Stitch (inputs redondeados, labels, botón negro de guardar). Conservar TODA la lógica y validación (nombre, RTN/identidad, exonerado, etc.).

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual: crear un cliente de prueba funciona con el look nuevo.

```bash
git add app/admin/pos/components/ClienteNuevoModal.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin del modal de nuevo cliente (R4)"
```

---

## Task 7: Modales secundarios A (Ítem libre, Cierre de caja, Devolución)

**Files:**
- Modify: `app/admin/pos/components/ItemLibreModal.tsx`
- Modify: `app/admin/pos/components/CierreModal.tsx`
- Modify: `app/admin/pos/components/DevolucionModal.tsx` + `DevolucionModal.module.css`
- Modify: `app/admin/pos/pos.module.css` (si aplica)

**Objetivo:** alinear estos modales al mismo lenguaje (cards blancas, inputs/chips redondeados, botones pill, tokens Merlin) para coherencia. Solo estilo; NO tocar la lógica (ítem libre, arqueo de cierre, cálculo de devolución/nota de crédito).

- [ ] **Step 1: Ítem libre**

Leer `ItemLibreModal.tsx`. Re-estilizar al look nuevo (inputs redondeados, botón negro). Conservar la lógica (descripción, precio, ISV, cantidad). `formatPrice` en montos.

- [ ] **Step 2: Cierre de caja**

Leer `CierreModal.tsx`. Re-estilizar el arqueo al look nuevo (cards, montos con 2 decimales, botón de confirmar). Conservar la lógica de arqueo (esperado/contado/diferencia).

- [ ] **Step 3: Devolución**

Leer `DevolucionModal.tsx` (+ su `.module.css`). Re-estilizar al look nuevo. Conservar la lógica de devolución/nota de crédito (selección de líneas, cantidades, motivo). `formatPrice` en montos.

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual: los tres modales con el look coherente; su lógica intacta; montos con 2 decimales.

```bash
git add app/admin/pos/components/ItemLibreModal.tsx app/admin/pos/components/CierreModal.tsx app/admin/pos/components/DevolucionModal.tsx app/admin/pos/components/DevolucionModal.module.css app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin de modales item libre, cierre de caja y devolucion (R4)"
```

---

## Task 8: Modales secundarios B (Documento, Historial)

**Files:**
- Modify: `app/admin/pos/components/DocumentoModal.tsx`
- Modify: `app/admin/pos/components/HistorialModal.tsx`
- Modify: `app/admin/pos/pos.module.css` (si aplica)

- [ ] **Step 1: Documento (solo el marco)**

Leer `DocumentoModal.tsx`. Re-estilizar el **marco/controles** del modal (encabezado, botones Imprimir/Nueva venta/Cerrar) al look nuevo. **NO re-maquetar la hoja fiscal imprimible** (`DocumentoHoja`/`NotaCreditoHoja`, que es inmutable y ya tiene su `@media print`) — solo el contenedor/controles del modal.

- [ ] **Step 2: Historial**

Leer `HistorialModal.tsx`. Re-estilizar la lista/tabla del historial al look nuevo (filas, badges, montos con 2 decimales). Conservar la lógica (listado, filtros, acciones).

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: sin errores; tests verdes.
Visual: el modal de documento (marco Stitch, hoja fiscal intacta) y el historial con el look coherente; montos con 2 decimales.

```bash
git add app/admin/pos/components/DocumentoModal.tsx app/admin/pos/components/HistorialModal.tsx app/admin/pos/pos.module.css
git commit -m "feat(pos): re-skin del modal de documento (marco) e historial (R4)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Layout del mostrador + barra superior (marca + config + salir, sin iconos decorativos) → Task 1. ✅
- Pestañas de venta → Task 2. ✅
- Catálogo (búsqueda + ítem libre + chips + cards) → Task 3. ✅
- Carrito (cliente, líneas, descuento global de R2b, totales, cobrar) → Task 4. ✅
- Cobro (Stitch) → Task 5. ✅
- Nuevo cliente (Stitch) → Task 6. ✅
- Modales secundarios (Ítem libre, Cierre, Devolución, Documento, Historial) → Tasks 7–8. ✅
- Siempre 2 decimales (`formatPrice`) → constraint + verificación en cada tarea. ✅
- Sin cambios de lógica/emisión/`lib/pos/` → constraints. ✅
- Respetar la hoja fiscal imprimible → Task 8 Step 1. ✅

**2. Placeholder scan:** es un re-skin; cada tarea nombra los archivos reales + la referencia Stitch + el método (leer-actual, re-skin, conservar lógica, `formatPrice`). Los valores exactos de CSS salen del mockup, no son placeholders de lógica.

**3. Type consistency:** ninguna tarea cambia interfaces/props (solo estilo). Task 1 puede agregar `userName` a `PosClient` si el top bar muestra el usuario (opcional, decidido en la tarea); si se agrega, `page.tsx` lo pasa.

## Notas de entrega (para el controlador SDD)

- **Sin migración.** No hay smoke SQL.
- **Login admin:** toda la verificación visual (mostrador y modales) requiere sesión admin; si el subagente no puede autenticarse, verifica por estructura/estilos computados y deja constancia. La verificación de Task 5 incluye emitir una venta de prueba.
- **`pos.module.css` compartido:** varias tareas lo editan en secuencia (SDD es secuencial, sin conflicto).
- **Orden:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
- Al mergear: FF a `main`, verificar deploy READY por SHA; confirmar con el usuario antes de producción.
