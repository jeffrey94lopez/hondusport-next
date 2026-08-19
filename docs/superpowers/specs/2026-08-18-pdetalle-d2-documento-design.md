# P-detalle D2 — El documento como pantalla de plataforma — Diseño

**Fecha:** 2026-08-18
**Serie:** P-detalle / trazabilidad de documentos, **segunda de tres olas**.
D1 (fichas de cliente y producto) desplegada, junto con el CSS compartido de fichas
y la unificación de `numeroDocumento`. D3 (cotización bloqueada + detalle de CxP)
queda para después.
**Estado:** aprobado para plan.

## El problema

Hoy `/admin/pos/documento/[id]` es **una hoja de papel en pantalla**: una barra de
herramientas y, debajo, la hoja imprimible tal cual saldrá por la impresora. Sirve para
imprimir y para poco más.

Eso deja tres carencias:

1. **No se puede navegar.** El cliente y los productos son texto muerto. Para ver quién
   es el cliente o qué es ese producto hay que salir a buscarlos a mano — y desde D1 ya
   existen fichas a las que ir.
2. **Los métodos de pago se leen mal.** Viven dentro del desglose de la hoja, con el
   formato del papel, cuando son de lo primero que se consulta al auditar un documento.
3. **Las acciones están repartidas.** Imprimir y devolver están aquí; **anular está solo
   en la lista**. Quien abre un documento para revisarlo y decide anularlo tiene que
   volver atrás y buscarlo en la tabla.

## Objetivo

Que `/admin/pos/documento/[id]` sea una **página de aterrizaje**: toda la información
del documento en formato de plataforma, navegable, con las acciones a mano. La hoja
imprimible deja de ser lo que se mira y pasa a ser lo que se imprime.

## Estructura de la pantalla

| Bloque | Contenido |
|---|---|
| **Cabecera** | Tipo y número (con `numeroDocumento`, que ya cubre los cuatro tipos), estado, fecha y hora de emisión, caja, vendedor y usuario que emitió. Badges de **Anulado** y de **Devuelto (parcial/total)** cuando apliquen |
| **Cliente** | Nombre, RTN, identidad, y su condición de exonerado con constancia y registro SAG. **Enlaza a su ficha** (`/admin/clientes/[id]`) cuando el documento tiene `cliente_id` |
| **Ítems** | Descripción, cantidad, precio, descuento, ISV e importe. Cada línea **enlaza a la ficha del producto** cuando tiene `producto_id` |
| **Métodos de pago** | **Card propia**, no una fila del desglose: método, referencia y monto de cada pago, más el cambio entregado si lo hubo |
| **Totales** | Exento, exonerado, gravado 15 y 18, ISV, descuento y total. El total también en letras, que es lo que exige el papel |
| **Anulación** | Solo si está anulado: motivo y fecha. Hoy solo aparecen **dentro de la hoja imprimible** (`DocumentoHoja`), así que quien revisa en pantalla no los ve sin mandar a imprimir |
| **Devoluciones** | Si el documento tiene notas de crédito o devoluciones asociadas, se listan con su número y total, enlazando a cada una |
| **Origen** | Si el documento **es** una nota de crédito o devolución: a qué documento revierte, enlazando a él |

### Acciones

- **Imprimir** — muestra la hoja y lanza la impresión. Conserva el selector 80 mm / Carta.
- **Devolver / Nota de crédito** — la que ya existe, con sus mismas condiciones
  (`puedeDevolverDocumento`).
- **Anular** — se **trae desde la lista**. Con exactamente las mismas reglas que allí, que
  no se relajan: solo `tipo === 'comprobante'` en estado `emitido` y sin devoluciones
  asociadas. **Una factura no se anula**: se revierte con nota de crédito, y la pantalla
  debe decirlo en vez de ofrecer un botón deshabilitado sin explicación. El servidor
  además rechaza si hay cobros aplicados; ese error se muestra tal cual.
- **Volver** al listado, y **Nueva venta** cuando se llega desde el mostrador.

## La frontera que no se toca

**La hoja imprimible es un documento fiscal inmutable.** `DocumentoHoja` y
`NotaCreditoHoja` **no se modifican**: ni su contenido, ni su maquetación, ni lo que
imprimen. La pantalla nueva es una lectura distinta del **mismo snapshot congelado**;
no recalcula ningún importe.

Esto no es una precaución genérica: los documentos llevan un trigger de inmutabilidad en
la base (`documentos_bloquear_edicion_trg`) y su contenido responde ante la SAR.

En pantalla, la hoja pasa a mostrarse **solo al imprimir**. Se conserva el selector de
formato porque determina qué sale por la impresora.

## Principios

- **Solo lectura.** La pantalla muestra el snapshot; las únicas escrituras son las dos
  acciones que ya existen (anular y devolver), a través de sus Server Actions actuales.
  Ninguna se reimplementa.
- **Ningún importe se recalcula.** Todos salen de las columnas del documento y se
  muestran con `formatPrice()`: 2 decimales, Lempiras `L.`.
- **Reutilizar:** `numeroDocumento` y `TIPO_DOCUMENTO_LABEL` de `lib/pos/documentos.ts`,
  `puedeDevolverDocumento` y `estadoDevolucionDocumento` de `lib/pos/devoluciones.ts`,
  el CSS compartido `app/admin/ficha.module.css`, y las acciones `anularDocumento` y
  el `DevolucionModal` que ya existen.
- **Enlaces que no mienten.** Un ítem libre no tiene `producto_id` y **no se enlaza**;
  un documento de consumidor final puede no tener `cliente_id` y tampoco. Un enlace que
  lleva a ninguna parte es peor que texto plano.
- **Zona horaria:** toda fecha formateada en código de servidor lleva
  `timeZone: 'America/Tegucigalpa'`. Vercel corre en UTC y sin eso las horas salen seis
  horas corridas, cosa que en local no se nota.
- **Botones:** las clases globales `btnMerlin*` solo aportan color, radio y tipografía —
  sin padding ni display. Todo botón las combina con una clase de layout del módulo.
- **Impresión:** lo que no debe salir por la impresora va oculto en `@media print`, y la
  hoja debe poder fragmentar entre páginas — una caja con `overflow: hidden` se recorta
  en la primera hoja en vez de continuar.
- Tokens Merlin; UI, dominio y commits en español.

## Alcance

**Dentro:** la pantalla nueva con sus bloques, sus enlaces a las fichas de D1, la card
propia de métodos de pago, el bloque de anulación que hoy no se ve, y traer la acción de
anular desde la lista.

**Fuera:**
- Cualquier cambio a `DocumentoHoja` o `NotaCreditoHoja`.
- Cambios en las reglas de anulación o devolución, o en sus RPCs.
- Quitar la acción de anular de la lista: se queda donde está, ahora en dos sitios.
- Cotización bloqueada y detalle de CxP (es D3).
- Migraciones: esta ola no lleva ninguna.

## Migración

**Ninguna.** Todo lo que la pantalla muestra ya se carga en `page.tsx` o está a un
`select` de distancia sobre tablas existentes.

## Riesgos conocidos

- **El cambio entregado no está en la base.** Se deriva de los pagos con `cambioPago` de
  `lib/pos/emision.ts`. Si se muestra, debe salir de esa función pura y no de una resta
  escrita en el componente.
- **Documentos viejos sin `cliente_id`.** Las ventas a consumidor final guardan
  `cliente_nombre` pero pueden no tener `cliente_id`. El bloque de cliente debe funcionar
  igual, solo que sin enlace.
- **Ítems libres.** `producto_id` nulo: se listan como cualquier otra línea, sin enlace.
- **Una nota de crédito no se anula ni se devuelve.** Las dos acciones deben desaparecer,
  no aparecer deshabilitadas, cuando el documento es NC o devolución.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm test`, `npm run build` verdes al cierre de cada tarea.
- Tests unitarios para cualquier agregación nueva que se extraiga a `lib/`.
- **Verificación funcional con datos reales:**
  - Un comprobante con varios métodos de pago: la card los muestra y los montos suman el
    total del documento.
  - Una factura: la pantalla explica que no se anula, en vez de ofrecer el botón inerte.
  - Un documento anulado: se ve el motivo y la fecha de anulación.
  - Una nota de crédito: enlaza a su documento origen, y no ofrece anular ni devolver.
  - Un documento con ítem libre y otro sin `cliente_id`: se ven bien y sin enlaces rotos.
  - **Imprimir**: la hoja sale idéntica a como salía antes de esta ola, y la pantalla de
    plataforma no aparece en el papel.
