# Diseño — POS P2.1: Mejoras de UX del mostrador

**Fecha:** 2026-08-07
**Serie:** POS Honduras — mejora de P2 (P1 catálogos/costeo/kardex y P2 mostrador/caja/emisión
fiscal DESPLEGADOS). Siguiente sub-proyecto de la serie: P3 Cotizaciones CRM.
**Objetivo:** hacer usable la pantalla de venta con el mostrador real — catálogo navegable por
categorías y anclados, carrito legible con edición en modal, cobro por chips con la tasa a la
vista, totales grandes, impresión sin salir del POS, alta rápida de clientes y botones
consistentes con Merlin.

**Origen:** 9 observaciones del usuario tras usar el POS en producción. Verificadas en código:
el carrito usa una grilla de 6 columnas con inputs de 42–72px, el botón Cobrar está en el flujo
que crece con los ítems, los totales están a 0.78rem, la tasa USD no se muestra en ningún lado,
el catálogo solo filtra por texto, y `app/admin/pos/PosClient.tsx` tiene **1815 líneas con 6
componentes** en un archivo.

## Alcance

- **Incluye:** separación de `PosClient.tsx` en componentes + extracción de la lógica de carrito
  a `lib/pos/carrito.ts` con tests; filtro por categoría/subcategoría; productos anclados
  (`favorito_pos`); rediseño de la fila del carrito + modal de edición de línea; totales y pie
  fijos y más grandes; chips de método de pago con autocompletado del restante; tasa USD visible;
  modal de documento tras cobrar con interruptor en configuración; alta de clientes desde el POS;
  dos variantes nuevas de botón Merlin y sustitución de las clases locales del POS y del documento.
- **No incluye:** ningún cambio en la matemática fiscal, la emisión (`emitir_documento`), el
  kardex, el arqueo ni los documentos ya emitidos. Tampoco cotizaciones (P3), devoluciones (P5)
  ni reportes (P6). No se toca la tienda pública.

## Decisiones tomadas

1. **Opción 1 aprobada:** primero se parte el archivo y se extrae la lógica pura; las mejoras se
   construyen sobre esa base. La separación es un commit de movimiento sin cambio de comportamiento.
2. **Anclados = campo del producto** (`productos.favorito_pos`): compartidos por todas las cajas y
   dispositivos, marcables con una estrella desde el POS.
3. **Edición de línea:** la fila conserva −/+ de cantidad (lo frecuente queda rápido); precio,
   descuento, y para ítems libres descripción e ISV, se editan en un modal con campos amplios.
4. **Chips de pago:** el primer método toma el total; al agregar otro, el nuevo se llena con el
   restante y el anterior queda editable. Volver a tocar un chip quita ese pago.
5. **Modal de documento solo tras cobrar.** El listado de documentos sigue abriendo la página
   completa (mantiene la URL directa para reimprimir o compartir). Interruptor
   `pos_documento_modal` (default `true`) en Configuración → POS.
6. **Cliente nuevo:** formulario completo con los campos principales a la vista y el resto en una
   sección plegable opcional. El mantenimiento posterior sigue siendo `/admin/clientes` (P1).
7. Se añaden al sistema Merlin las variantes que faltaban (`btnMerlinIcon`, `btnMerlinChip`) en vez
   de seguir inventando clases locales por pantalla.

## Estructura de archivos

`app/admin/pos/`:

- `PosClient.tsx` — orquestador: máquina de estados (elegir caja → abrir sesión → vender), header
  y composición de paneles/modales. Sin JSX de catálogo/carrito.
- `components/CatalogoPanel.tsx` — buscador, chips de categoría/subcategoría, sección de anclados,
  grid de productos, selector rápido de variante, estrella de anclado.
- `components/CarritoPanel.tsx` — filas del carrito, pie fijo (totales + Cobrar), cliente, vendedor,
  descuento global, botón de ítem libre.
- `components/LineaEditorModal.tsx` — **nuevo**: edición amplia de una línea.
- `components/ItemLibreModal.tsx`, `components/CobroModal.tsx`, `components/EsperaModal.tsx`,
  `components/CierreModal.tsx`, `components/HistorialModal.tsx` — movidos tal cual (con los cambios
  de cobro descritos abajo en `CobroModal`).
- `components/ClienteNuevoModal.tsx` — **nuevo**.
- `components/DocumentoModal.tsx` — **nuevo**: envuelve la hoja compartida del documento.
- `app/admin/pos/documento/[id]/DocumentoHoja.tsx` — **nuevo**: la hoja imprimible extraída de
  `DocumentoView.tsx`, usada por la página y por el modal (mismo papel en ambos caminos).
  `DocumentoView.tsx` queda como la toolbar + `DocumentoHoja`.

`lib/pos/carrito.ts` (**nuevo**, con `lib/pos/tests/carrito.test.ts`): mueve desde `PosClient` las
funciones puras `brutoLinea`, `clampDescuentoLinea`, `brutoTotalLineas`, `clampDescuentoGlobal`, y
añade `montosPagoAlAgregar(pagos, total, nuevoMetodo)` para la regla de autocompletado de chips.

## Modelo de datos (migración — aplicar ANTES del push)

```sql
alter table productos add column if not exists favorito_pos boolean not null default false;
create index if not exists productos_favorito_pos on productos (favorito_pos) where favorito_pos;
insert into configuracion (key, value) values ('pos_documento_modal', 'true')
  on conflict (key) do nothing;
```

Sin cambios en `documentos`, `sesiones_caja`, `metodos_pago`, `clientes` ni en ninguna RPC.
`supabase/schema.sql` se mantiene en sync (columna + índice + seed de la clave).

## Catálogo (puntos 1 y 2)

- **Chips de categoría:** fila de chips con las `categorias` de `tipo = 'cat'` activas (más "Todos").
  Al elegir una, debajo aparecen sus subcategorías: las activas de `tipo = 'subcat'` cuyo
  `categorias_padre` (array de **ids** de categoría, verificado en `app/admin/categorias/`) incluye
  el id de la categoría elegida. El filtro se combina con el buscador y se aplica con
  `filtrarInventario` de `lib/store/inventoryFilters.ts` — que ya filtra por `categoriaIds` y
  `subcategoriaIds` comparando contra `producto.categoria_id` / `subcategoria_id` — sin lógica de
  filtrado nueva.
  `page.tsx` gana el fetch de categorías activas y las pasa como prop.
- **Anclados:** sección con encabezado "Anclados" sobre los chips, siempre visible, con los
  productos `favorito_pos = true`. Respetan el buscador e **ignoran** el filtro de categoría (existen
  para no filtrar). Cada tarjeta del catálogo lleva una estrella: alterna `favorito_pos` vía server
  action `toggleFavoritoPos(productoId, favorito)` en `app/admin/pos/actions.ts` +
  `revalidatePath('/admin/pos')`. Errores → mensaje en español en el banner del POS.

## Carrito y totales (puntos 3 y 7)

- **Fila:** descripción (variante en segunda línea si aplica) · cantidad con botones − / + táctiles
  (44px) y el número legible entre ellos · subtotal · **Editar** · **Quitar**. Un descuento aplicado
  se muestra como etiqueta bajo la descripción (`−L. 50.00`), no como input. Sin inputs de precio ni
  descuento en la fila.
- **`LineaEditorModal`:** campos amplios con etiqueta — cantidad, precio unitario, descuento con
  selector L./%, y para ítems libres también descripción e ISV (15/18/exento). Muestra el subtotal
  resultante en vivo. Respeta los topes vigentes: cantidad ≤ stock disponible (contando lo ya en
  el carrito) y descuento ≤ bruto de la línea (`lib/pos/carrito.ts`). Guardar aplica; cancelar descarta.
- **Pie fijo:** el panel de totales y el botón Cobrar quedan `position: sticky; bottom: 0` dentro de
  la columna del carrito; la lista de líneas scrollea por dentro. El pie no se desplaza al agregar ítems.
- **Escala:** filas del desglose ~0.95rem; **TOTAL** ~1.6rem/800; el botón Cobrar incluye el importe
  ("Cobrar L. 1,234.56"). El desglose sigue calculándose con las puras de `lib/pos/desglose.ts`.

## Cobro (puntos 5, 6 y 7)

- **Chips de método** (`btnMerlinChip`) con los métodos activos en su orden configurado, en lugar del
  `<select>`. Primer chip → su monto = total. Al seleccionar otro, su monto = restante
  (`montosPagoAlAgregar`, con test). Tocar un chip activo elimina ese pago. Debajo de cada chip
  seleccionado: campo de monto grande y etiquetado, y campo de referencia cuando el tipo es `tarjeta`
  o `transferencia`.
- **Efectivo USD:** el bloque muestra la tasa explícita — `Tasa: L. <tasa> × USD 1.00` — con el input
  en dólares y el equivalente en Lempiras al lado. Si la tasa es 0 o inválida, el chip queda
  deshabilitado con el aviso actual.
- **Resumen:** **Total** y **Restante** en tamaño grande (restante en `--danger` mientras falte,
  **Cambio** en `--success` cuando sobre); filas secundarias legibles. La validación sigue siendo
  `validarPagos` / `cambioPago` / `validarEmision` de `lib/pos/emision.ts` — sin lógica nueva ni
  duplicada. Los campos de identificación por la regla de L.10,000 se mantienen tal como están.

## Impresión (punto 9)

- `DocumentoHoja` es la única fuente del papel; la página y el modal la comparten, así que ambos
  imprimen idéntico.
- **`DocumentoModal`:** tras emitir, se abre sobre el POS con selector 80mm / Carta (default el
  `formato_impresion` de la caja), **Imprimir** y **Nueva venta** (cierra y deja el carrito limpio).
- **Reglas de impresión:** el contenedor del modal se neutraliza en `@media print`
  (`position: static; overflow: visible`) y el POS de fondo se oculta, con el mismo criterio que se
  aplicó al overlay de `/admin/pos` en P2 (un contenedor `fixed` trunca la impresión a una página).
  Verificación obligatoria en el checkpoint del usuario con una factura de varios ítems, en ambos
  formatos.
- **Interruptor:** clave `pos_documento_modal` en Configuración → POS ("Abrir el documento en modal
  tras cobrar", encendida por defecto). Apagada → `router.push` a la página del documento, como hoy.
  El listado de documentos no cambia.

## Cliente nuevo desde el POS (punto 4)

Botón **+ Nuevo** junto al selector de cliente → `ClienteNuevoModal`. Visibles: nombre (requerido),
RTN, identidad, teléfono, tipo (final / revendedor). Plegable "Más datos" (opcional): dirección,
correo, exonerado con constancia y registro SAG, notas. Reutiliza `createCliente` de
`app/admin/clientes/actions.ts` (valida RTN de 14 dígitos con `validarRtn`; RTN duplicado → mensaje
con el nombre del cliente que ya lo tiene). Al guardar, el cliente queda creado **y seleccionado**
en la venta (los precios se recalculan si es revendedor, con la regla vigente de no tocar precios
editados a mano). El mantenimiento posterior es `/admin/clientes`.

## Botones Merlin (punto 8)

Se añaden a `app/merlin.css` dos variantes semánticas:

- **`btnMerlinIcon`** — botón compacto de ícono (cuadrado con esquinas del sistema), para − / + de
  cantidad, quitar línea y la estrella de anclado.
- **`btnMerlinChip`** — pastilla con estado activo/inactivo (el activo usa `--cta` + texto sobre
  acento), para chips de categoría, métodos de pago, tipo de documento y formato de impresión.

Se sustituyen las clases locales por las del sistema en el POS y en la vista del documento:
`.btnGhost`, `.btnCancel`, `.btnQuitar`, `.btnItemLibre`, `.qtyBtn`, `.tipoDocBtn`, `.formatoBtn`,
`.backLink`. Las clases locales que sobrevivan quedan solo para posición y tamaño, nunca para
color, radio ni tipografía (que salen de los tokens).

## Manejo de errores

- `toggleFavoritoPos` y `createCliente` devuelven el `ActionResult` del repo; los errores se muestran
  en español en el banner/modal correspondiente y no rompen la venta en curso.
- El modal de documento nunca bloquea: si algo falla al cargarlo, se ofrece el enlace a la página
  del documento (el documento ya está emitido y no debe perderse de vista).
- Los clamps de carrito viven en `lib/pos/carrito.ts`: el modal de edición no puede dejar cantidad
  sobre el stock ni descuento sobre el bruto.

## Testing

- `lib/pos/tests/carrito.test.ts`: `brutoLinea`, `clampDescuentoLinea` (monto y %),
  `brutoTotalLineas`, `clampDescuentoGlobal` (incluye re-clamp al bajar cantidad/precio) y
  `montosPagoAlAgregar` (primer método = total; segundo = restante; tercer método con restante 0).
- La suite existente permanece verde (368 tests al inicio de este proyecto); `npx tsc --noEmit`;
  `npm run lint` sin errores; `npm run build`.
- Nota de entorno: los worktrees bajo `.claude/worktrees/` duplican la suite —
  verificar con `npx vitest run --exclude "**/.claude/**"`.
- Smoke SQL corto antes del push: la columna `favorito_pos` existe con default `false` y la clave
  `pos_documento_modal` está sembrada.
- Checkpoint visual del usuario: POS en la pantalla del mostrador (catálogo con chips y anclados,
  edición de línea, pie fijo, chips de pago con tasa USD) y **vista previa de impresión de una
  factura con varios ítems en 80mm y en carta** desde el modal.

## Entrega

Rama `feature/pos-p2-1-ux-mostrador`. Migración en el SQL Editor ANTES del push; smoke; confirmación
del usuario para fusionar (deploy = producción). P3 (cotizaciones) reutiliza los componentes
separados y `lib/pos/carrito.ts`.
