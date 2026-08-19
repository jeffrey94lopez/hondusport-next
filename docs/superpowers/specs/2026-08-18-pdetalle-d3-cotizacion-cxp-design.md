# P-detalle D3 — Cotización facturada congelada y detalle de ítems en CxP — Diseño

**Fecha:** 2026-08-18
**Serie:** P-detalle / trazabilidad, **tercera y última ola**.
D1 (fichas de cliente y producto) y D2 (el documento como pantalla de
plataforma) desplegadas, junto con el CSS compartido de fichas, la unificación
de `numeroDocumento` y la extracción de `AnularModal`.
**Estado:** aprobado para plan.

## El problema

Dos huecos independientes, uno de integridad y otro de navegación.

### 1. Una cotización ya facturada se puede reescribir

`cotizaciones.documento_id` marca la cotización que ya produjo un documento
fiscal. Nada la protege:

- **`guardarCotizacion` no tiene ninguna guarda.** Actualiza la fila, hace
  `delete` de todos los `cotizacion_items` y los reinserta **releyendo los
  precios de los productos de la BD de hoy**. Abrir una cotización facturada y
  darle Guardar reescribe sus líneas con precios actuales: la cotización deja
  de coincidir con la factura que respalda.
- **`eliminarCotizacion` tampoco.** Una cotización facturada se borra entera,
  y el documento se queda apuntando a nada.
- En el editor, `puedeFacturar` sí excluye la cotización facturada, pero
  **`puedeGuardar` no**. El badge "Facturada" es decorativo.

La cotización es el respaldo comercial de la factura. Que pueda cambiar
después de facturada es el mismo tipo de fallo que el proyecto ya cerró del
lado fiscal con el trigger de inmutabilidad de `documentos`, solo que aquí no
hay nada que lo impida.

### 2. En Cuentas por pagar no se ve qué se está pagando

La pantalla lista compras con saldo y ofrece Abonar, pero **no tiene un solo
enlace** y no muestra los ítems. Para saber qué contiene la compra que se va a
pagar hay que salir a `/admin/compras/[id]` a mano y perder los filtros.
`compra_id` ya viene en cada fila; la ficha de cliente de D1 ya enlaza a
`/admin/compras/[id]`. CxP se quedó fuera de la serie.

## Objetivo

Cerrar la serie P-detalle: que una cotización facturada no pueda contradecir a
su factura, y que Cuentas por pagar responda «qué estoy pagando» sin salir de
la pantalla donde se decide el pago.

## Mitad A — La cotización facturada se congela

### Qué se congela y qué no

| Congelado | Libre |
|---|---|
| Líneas (agregar, quitar, editar) | **Etapa del kanban** |
| Precios y precio manual | |
| Descuento global | |
| Cliente y vendedor | |
| Validez, condiciones y notas | |

La etapa queda fuera del bloqueo a propósito: es organización del tablero, no
parte del respaldo de la factura — no sale en el PDF ni afecta ningún importe.
Congelarla dejaría la tarjeta clavada para siempre en la columna «ganada» a la
que la manda `marcarCotizacionFacturada`, y el tablero perdería su uso para
seguir lo ya vendido.

### La guarda vive en el Server Action

**No basta con deshabilitar en la UI.** En D2 el botón de anular estaba bien
condicionado en pantalla mientras la acción quedaba abierta; la revisión lo
dejó anotado y aquí se aplica desde el principio.

- **`guardarCotizacion`**: relee `documento_id` de la BD antes de escribir. Si
  existe, rechaza con un mensaje explícito y no toca ninguna fila. **No confía
  en lo que manda el cliente** — el mismo criterio que rige el checkout.
- **`eliminarCotizacion`**: misma relectura, mismo rechazo.
- **`moverEtapaCotizacion`**: sin cambios (la etapa queda libre).
- **`duplicarCotizacion`**: sin cambios. **Es la vía de escape** y ya crea la
  copia sin `documento_id`; el código lo documenta en el editor y en el
  tablero. El bloqueo es permanente y Duplicar es la salida, también cuando el
  documento resultante se anula después: la factura existió y su respaldo no
  debe cambiar retroactivamente.

### La regla, en `lib/` y con test

`puedeEditarCotizacion(documentoId: string | null): boolean` en
`lib/cotizaciones/cotizaciones.ts`, con test. La consumen tres sitios (las dos
acciones y el editor). Es trivial de escribir; tenerla en un solo lugar es lo
que garantiza que pantalla y servidor no puedan divergir, que es justo la
clase de fallo que la serie ha ido encontrando.

### En el editor

Una cotización facturada se muestra en **modo lectura de verdad**:

- Campos deshabilitados; sin botones de agregar, quitar ni editar línea; sin
  buscador de productos ni ítem libre.
- **Guardar desaparece**, no queda deshabilitado sin explicación. En su lugar
  va una leyenda que dice por qué está bloqueada y ofrece **Duplicar** como
  copia editable.
- **El badge «Facturada» pasa a ser enlace** al documento que produjo,
  rotulado con `TIPO_DOCUMENTO_LABEL` y `numeroDocumento` de
  `lib/pos/documentos.ts` (D2). Para eso `page.tsx` carga del documento
  enlazado solo `id, tipo, correlativo, numero_comprobante`.
- Ver PDF y Duplicar siguen disponibles con sus condiciones actuales.

En el tablero, la tarjeta facturada conserva su badge y su arrastre, y **pierde
la opción de eliminar**.

## Mitad B — Qué estoy pagando, en CxP

### La fila enlaza

El número de compra pasa a ser enlace a `/admin/compras/[id]`, con la clase
`numeroLink` del CSS compartido de fichas, igual que en D1 y D2.

### La fila despliega sus ítems

Un botón por fila despliega, **sin salir de la pantalla ni perder los
filtros**, una tabla con: descripción, cantidad ordenada, cantidad recibida,
costo unitario e importe.

- **Carga bajo demanda** con un Server Action `obtenerItemsCompra(compraId)`.
  Lo ya traído se guarda en memoria del cliente: plegar y volver a desplegar no
  repite la consulta.
- **La consulta lleva `.limit()` explícito y verificación de conteo** con
  `hayTruncamiento` de `lib/pos/truncamiento.ts`. Un listado truncado en
  silencio, en la pantalla donde se decide cuánto pagar, es exactamente el
  fallo que la ola del cierre de caja tuvo que cerrar. Si se detecta
  truncamiento, se dice en pantalla en vez de mostrar una lista incompleta que
  parece completa.
- Estados: cargando, error y compra sin ítems, cada uno con su texto.

### Los importes tienen que cuadrar con la fila de arriba

`totalCompra` suma `cantidad_ordenada × costo_unitario × factor`, donde el
factor sale de `costoEnLempiras(costo, moneda, tasa)`. En una compra en
dólares el `costo_unitario` está **en USD** mientras el total de CxP está en
Lempiras.

- El importe por línea sale de una **función pura nueva en `lib/compras/`**,
  no de una multiplicación escrita en el componente:
  `importeLineaCompra(item, moneda, tasa)`, donde `item` aporta
  `cantidad_ordenada` y `costo_unitario`.
- **`importeLineaCompra` devuelve el producto sin redondear.** Esto no es un
  descuido: `totalCompra` redondea **la suma una sola vez, al final**
  (`round2` sobre el `reduce`). Si cada línea se redondeara a dos decimales,
  la suma de las líneas dejaría de ser igual al total en cuanto hubiera
  terceros decimales — el desglose contradiría a la fila por céntimos, que es
  precisamente lo que esta mitad viene a evitar. El redondeo es de
  presentación y lo hace `formatPrice()` al pintar.
- Su test afirma la reconciliación exacta:
  **`round2(Σ importeLineaCompra(ítem)) === totalCompra(ítems)`**, con las
  mismas entradas, en Lempiras y en dólares, e incluyendo un caso con
  cantidades y costos que produzcan terceros decimales. Ese test es lo que
  impide que el desglose contradiga a la fila.
- Se usa `cantidad_ordenada`, no `cantidad_recibida`: es lo que se debe. La
  recibida se muestra como dato, porque una diferencia entre ordenada y
  recibida es justo lo que se quiere ver antes de pagar.
- En compras en dólares se muestran el **costo unitario en USD, la tasa y el
  importe en Lempiras** — el mismo tratamiento que D2 dio al pago en dólares.

## Principios

- **Ningún importe se recalcula en un componente.** Toda cifra derivada sale
  de una función pura de `lib/` con test. La única aritmética nueva de esta ola
  es `importeLineaCompra`.
- **La guarda de integridad vive en el servidor**, releyendo de la BD. La UI
  la refleja; no la sustituye.
- **Reutilizar:** `numeroDocumento` y `TIPO_DOCUMENTO_LABEL`
  (`lib/pos/documentos.ts`), `hayTruncamiento` (`lib/pos/truncamiento.ts`),
  `costoEnLempiras` y `totalCompra` (`lib/compras/compras.ts`), el CSS
  compartido `app/admin/ficha.module.css` y el de tablas
  `app/admin/tabla-admin.module.css`.
- **Enlaces que no mienten.** Un ítem de compra sin `producto_id` no se
  enlaza; una cotización sin `documento_id` no muestra el badge-enlace.
- **Botones:** las clases globales `btnMerlin*` solo aportan color, radio y
  tipografía — sin padding ni display. Todo botón las combina con una clase de
  layout del módulo, o se pinta como texto suelto.
- **Especificidad en tablas:** una clase aplicada sobre un `<td>` pierde
  contra la regla `td` de la propia tabla; hay que ganarle con
  `.tabla td.miClase`.
- **Zona horaria:** toda fecha formateada en código de servidor lleva
  `timeZone: 'America/Tegucigalpa'`. Vercel corre en UTC.
- Tokens Merlin; UI, dominio y commits en español; moneda en Lempiras con
  `formatPrice()`.

## Alcance

**Dentro:** la guarda de edición y borrado de la cotización facturada (servidor
y editor), el badge-enlace al documento, el enlace al detalle de compra desde
CxP, la fila desplegable con los ítems y la función pura de importe por línea.

**Fuera:**
- Migraciones: esta ola no lleva ninguna.
- La RPC `registrar_pago_proveedor` y las reglas de pago y aplicación.
- `/admin/compras/[id]` y su editor.
- Las hojas imprimibles (`HojaOrdenCompra`, `HojaEstadoCuenta`,
  `DocumentoHoja`, `NotaCreditoHoja`) y los PDF de cotización.
- El doble ingreso de monto en `CobroModal`/`SaldoFavorModal` de CxC, que
  sigue en el backlog.
- Desbloquear una cotización cuyo documento fue anulado: el bloqueo es
  permanente por diseño y Duplicar es la salida.

## Migración

**Ninguna.** `cotizaciones.documento_id` y `compra_items` ya existen con todo
lo que hace falta.

## Riesgos conocidos

- **Cotizaciones facturadas ya editadas.** El hueco lleva abierto desde que
  existe la función; puede haber cotizaciones que ya no coincidan con su
  factura. Esta ola **impide que siga ocurriendo, no repara lo pasado**, y no
  intenta detectarlo: la factura es la que vale y es inmutable.
- **Una compra con muchas líneas.** Es lo que motiva el `.limit()` y la
  verificación de conteo. Sin eso, el despliegue mostraría una lista incompleta
  con apariencia de completa.
- **Compras en dólares con `tasa_cambio` nula.** `costoEnLempiras` y
  `totalCompra` usan `tasa ?? 0`, así que una compra en USD sin tasa vale cero
  en ambos lados: el desglose **no contradice** a la fila, los dos muestran
  L. 0.00. El riesgo no es la divergencia sino el silencio — una compra real
  presentada como si no valiera nada. El desglose no inventa una tasa: cuando
  la moneda es USD y la tasa es nula, lo dice en pantalla.
- **El editor de cotización es un archivo grande.** El modo lectura debe
  entrar sin duplicar el árbol de campos: se deriva de una sola variable de
  bloqueo, no de una segunda versión del formulario.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm test`, `npm run build` y `npx eslint` verdes al
  cierre de cada tarea.
- **Tests unitarios obligatorios:**
  - `puedeEditarCotizacion`: con y sin `documento_id`.
  - `importeLineaCompra`: en Lempiras, en dólares con tasa, y la afirmación de
    que la suma sobre los ítems es igual a `totalCompra` con las mismas
    entradas.
- **Verificación funcional con datos reales** (la ola anterior enseñó que esto
  no puede darse por hecho: se ejecuta o se dice que no se ejecutó):
  - Una cotización facturada: el editor no deja tocar nada, Guardar no está,
    la leyenda explica y el badge enlaza al documento correcto.
  - **La acción, llamada directamente con una cotización facturada, rechaza.**
    No basta con comprobar que la UI la esconde.
  - Una cotización sin facturar: se sigue editando y guardando igual que hoy.
  - Duplicar una cotización facturada: la copia es editable y no arrastra el
    `documento_id`.
  - Arrastrar una cotización facturada en el tablero: sigue funcionando.
  - En CxP: el número enlaza al detalle correcto; el despliegue muestra los
    ítems; **la suma de los importes coincide con el total de la fila**, en una
    compra en Lempiras y en una en dólares.
  - Una compra con ítem sin `producto_id` y una sin ítems: se ven bien y sin
    enlaces rotos.
