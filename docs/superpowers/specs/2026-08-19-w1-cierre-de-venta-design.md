# W1 — Cierre de venta: del checkout al documento — Diseño

**Fecha:** 2026-08-19
**Serie:** W (WhatsApp / cierre de venta), **primera de tres olas**.
W2 (ventana de confirmación de datos en el checkout) y W3 (enviar el documento
por WhatsApp) quedan para después y reutilizan el aviso a n8n que esta ola crea.
**Estado:** aprobado para plan.

## El problema

Hoy una venta en línea nace sin decir cómo se paga y muere sin cuadrar contra
la caja.

### 1. El cliente no sabe dónde transferir, y la tienda no sabe con qué le pagaron

El checkout no pregunta el método de pago. El cliente confirma, se abre un
WhatsApp hacia la tienda con el resumen, y a partir de ahí todo se acuerda a
mano por chat. Si va a transferir, tiene que pedir los datos bancarios y
teclearlos desde una conversación.

### 2. Un documento emitido desde un pedido no pertenece a ningún turno ni
registra ningún pago

`emitirDesdePedido` ya existe y está conectada a un modal en `/admin/pedidos`
que deja elegir tipo, caja y cliente. Pero envía `pagos: []` fijo, y la RPC
`emitir_documento` **exime deliberadamente** a los documentos de pedido de
tener sesión abierta y de que los pagos cubran el total
(`2026-08-07-pos-p2-rpcs.sql`, la rama `if v_pedido_id is null then`).

Comprobado contra datos reales: el único documento emitido así, un comprobante
de **L. 3,290**, tiene `sesion_id` nulo y cero pagos. El dinero de esa venta no
aparece en el arqueo de ninguna caja y no se atribuye a ningún método. No es
una carencia de interfaz: es un agujero contable.

### 3. Datos del cliente que se piden y se tiran

El checkout exige un correo válido (`app/(store)/checkout/actions.ts`) y
**nunca lo guarda**: `pedidos` no tiene columna de correo. La dirección
tampoco: se mete dentro de `notas`, mezclada con cualquier otra anotación.

### 4. Un pedido de prueba retiene inventario real

`crear_pedido` **valida y descuenta stock atómicamente** al crear el pedido.
Un pedido que nadie va a pagar no es una fila de más: es mercancía apartada que
deja de poder venderse.

## Objetivo

Que el método de pago que el cliente declara viaje del checkout al documento
fiscal, que la tienda le dé los datos para transferir sin que los pida, que el
comprobante de la transferencia quede guardado y visible, y que un pedido sin
pagar libere su inventario solo.

## Alcance por bloques

### 1 · Configuración de pagos de la tienda

**`metodos_pago` gana `visible_tienda boolean not null default false`.** Una
sola fuente de verdad: los mismos métodos que usa el POS, marcando cuáles se
ofrecen en la tienda. Efectivo USD, Crédito y Saldo a favor no se marcarían.
Esto es lo que cierra el círculo: el método que el cliente declara es
literalmente el mismo registro que después lleva el documento.

**Tabla nueva `cuentas_bancarias`:** `id`, `banco` (texto), `tipo_cuenta`
(texto, p. ej. «Cuenta de Ahorros»), `numero` (texto — nunca numérico: los
números de cuenta llevan ceros a la izquierda), `titular`, `activo`, `orden`.

Ambas cosas se administran en `/admin/configuracion`: una casilla por método
para marcar visibilidad en tienda, y un CRUD de cuentas bancarias.

### 2 · Checkout

El método de pago es **un bloque más del formulario**, no un paso aparte. Se
listan los métodos con `visible_tienda` y `activo`, en su `orden`.

El checkout **relee el método de la base** y rechaza cualquiera que no esté
activo y visible en tienda. Es la misma frontera de confianza que ya rige los
precios: nunca se acepta lo que manda el navegador.

**Los datos bancarios NO se muestran aquí.** Ver el bloque 3 y su motivo.

### 3 · Pantalla de pedido confirmado

Es donde aparecen los datos para transferir, **después** de que el pedido
exista. El motivo es concreto: si se muestran antes, alguien copia el número,
transfiere, cierra la pestaña y llega dinero sin pedido detrás — imposible de
conciliar. Mostrándolos después, **todo dinero recibido tiene un pedido con
nombre, teléfono y monto**.

La pantalla lleva, en este orden:

1. **Confirmación y número de pedido.** `pedidos.numero` ya es un entero corto
   y legible; sirve tal cual para citarlo por WhatsApp. No hace falta inventar
   otro código.
2. **Instrucciones numeradas**: haz la transferencia, guarda el comprobante,
   súbelo aquí o mándalo por WhatsApp citando tu número de pedido, y en cuánto
   se procesa.
3. **Una tarjeta por cuenta bancaria activa**, con banco y tipo de cuenta como
   encabezado y dentro: titular, número de cuenta y **monto a transferir**.
4. **Botón de subir comprobante** (bloque 4).
5. **Botón de compartir por WhatsApp** (bloque 6).

**Los botones de copiar van solo en el número de cuenta y en el monto.** No en
el titular: ese dato se lee para verificar, no se pega. Son los dos campos que
el cliente pega en la app de su banco, y repetir el monto dentro de cada
tarjeta le ahorra calcularlo.

Cada botón es de icono, con etiqueta accesible (`aria-label`) y confirmación
visible al copiar («Copiado»), porque sin respuesta el usuario pulsa dos veces
sin saber si funcionó.

### 4 · Comprobante de pago

El cliente sube una imagen o PDF del comprobante desde la pantalla de
confirmación. Se guarda en Supabase Storage, en un bucket propio
`comprobantes`, siguiendo el patrón que ya usa `components/admin/ImageUpload.tsx`
para los banners.

`pedidos` guarda `comprobante_url`. **El bucket NO es público**: a diferencia
de los banners, un comprobante bancario lleva datos personales del cliente.
Se lee desde el panel con URL firmada de vigencia corta.

En `/admin/pedidos`, el pedido muestra el comprobante para verlo cuando se
concilie el pago.

### 5 · El pedido

Migración sobre `pedidos`:

| Columna | Para qué |
|---|---|
| `metodo_pago_id` | El método declarado, apuntando a `metodos_pago` |
| `cuenta_bancaria_id` | A qué cuenta dijo que transferiría (nulo si no aplica) |
| `referencia_pago` | Número de referencia, si lo aporta |
| `comprobante_url` | Ruta del archivo subido |
| `email` | Se pide desde siempre y hoy se descarta |
| `direccion` | Hoy vive dentro de `notas` |
| `expira_at` | Cuándo caduca si nadie paga (bloque 7) |

`direccion` **no migra** el contenido histórico de `notas`: separarlos a
posteriori exigiría adivinar qué parte de una nota libre era dirección. Los
pedidos viejos conservan su `notas` tal cual y los nuevos usan la columna.

### 6 · Aviso a n8n

Al crearse el pedido, el servidor publica un evento a un webhook de n8n, que
dispara el flujo hacia Evolution API para notificar **al administrador y al
cliente desde el mismo número**.

- **Sobre genérico y versionado**: `{ evento, version, datos }`. W2 y W3 añaden
  tipos de evento sin rediseñar nada. Esta ola emite `pedido.creado`.
- **Firmado con HMAC** sobre el cuerpo, con secreto compartido, para que n8n
  verifique el origen y nadie pueda inyectar pedidos falsos en el flujo.
- **Nunca bloquea la venta.** Si el webhook falla, tarda o no responde, el
  pedido se crea igual y el fallo se registra. Un aviso caído no puede costar
  una venta.
- **Configuración por variables de entorno**: URL del webhook y secreto. Si
  falta la URL, el aviso se omite en silencio y el resto funciona — así el
  entorno de desarrollo no necesita n8n levantado.

Además, la pantalla de confirmación lleva un **botón de compartir por
WhatsApp** que abre `wa.me` con un mensaje prerrellenado hacia el número de la
tienda, citando el número de pedido y el monto. Es cliente contra cliente, sin
API, y complementa el aviso automático: el cliente adjunta el comprobante a
mano en su propio WhatsApp, cosa que `wa.me` no puede hacer por él.

Dos defectos concretos que hay que evitar, observados en una implementación
ajena de este mismo botón: **el texto debe codificarse entero con
`encodeURIComponent`** (un emoji mal codificado sale como `�`), y **el monto
del mensaje debe ser el mismo que la tarjeta pide transferir**, no otro.

### 7 · Higiene de pedidos: que un pedido sin pagar no retenga mercancía

Como `crear_pedido` descuenta stock, un pedido que nadie paga aparta inventario
real. Tres medidas, de menos a más fricción:

1. **Campo trampa (honeypot)** en el formulario: un campo invisible que una
   persona nunca rellena y un bot sí. Si viene con valor, se rechaza. Cuesta
   nada y no molesta a nadie.
2. **Límite de frecuencia** por teléfono: un mismo número no puede crear
   pedidos en ráfaga. Frena el doble envío accidental y el juego deliberado.
3. **Caducidad con devolución de stock.** El pedido nace con `expira_at` (por
   defecto 48 horas, configurable en `configuracion`). Pasado el plazo sin
   comprobante ni confirmación, se cancela y **el stock vuelve solo**, usando
   la RPC `cambiar_estado_pedido` que ya hace el ajuste atómico de inventario.
   El disparo lo hace **n8n**, llamando a una ruta de API dedicada — se está
   montando de todos modos y evita añadir un programador de tareas nuevo. Esa
   ruta se protege con el mismo secreto compartido del webhook.

En `/admin/pedidos`, un pedido próximo a caducar y uno ya caducado se
distinguen a simple vista, y el operador puede cancelarlo o ampliarle el plazo
a mano.

### 8 · Emisión del documento

**Emitir es siempre una acción manual del operador.** Nada se factura solo: el
pedido entra, llega el aviso, alguien revisa que la transferencia llegó y
entonces emite.

El modal de emisión de `/admin/pedidos` pasa a:

- **Mostrar lo que el cliente declaró**: método, cuenta, referencia y el
  comprobante subido.
- **Precargar el método de pago** con lo declarado, dejando que el operador lo
  confirme o lo corrija. Se precarga, no se impone: quien verifica que el
  dinero entró es la tienda, no el cliente.
- **Exigir turno abierto** en la caja elegida, y decirlo con esas palabras
  cuando no lo haya, en vez de un error críptico.
- Emitir el documento **con pagos reales y con `sesion_id`**.

Migración a `emitir_documento`: resolver la sesión también para documentos de
pedido y exigir que los pagos cubran el total. **Los pagos no necesitan cambio
en la RPC** — el `insert into documento_pagos` ya está fuera de la rama
condicional y guarda lo que reciba; lo que falta es que la aplicación se los
mande. Solo la sesión y la validación del total requieren tocarla.

**Consecuencia que hay que asumir:** un pedido que entra de madrugada no se
podrá facturar hasta que se abra un turno. Como emitir ya era manual, en la
práctica se factura por la mañana.

## Principios

- **Ningún importe se recalcula en un componente.** Toda cifra derivada sale de
  una función pura de `lib/` con test.
- **Frontera de confianza en el checkout**: método de pago y cuenta se releen
  de la base; nunca se acepta lo que manda el navegador. Igual que ya se hace
  con los precios.
- **El aviso nunca bloquea la venta.**
- **Reutilizar:** `metodos_pago` (no crear un catálogo paralelo para la
  tienda), `cambiar_estado_pedido` para el stock, el patrón de subida de
  `ImageUpload.tsx`, y `hayTruncamiento` si alguna lectura nueva puede truncar.
- **Zona horaria:** toda fecha formateada en servidor lleva
  `timeZone: 'America/Tegucigalpa'`; Vercel corre en UTC. La caducidad se
  calcula en instantes absolutos, no en días de calendario.
- **Botones:** las clases globales `btnMerlin*` solo aportan color, radio y
  tipografía — sin padding ni display; se combinan siempre con una clase de
  layout del módulo.
- **Datos personales:** el bucket de comprobantes no es público y se sirve con
  URL firmada de vigencia corta.
- Tokens Merlin; UI, dominio y commits en español; moneda con `formatPrice()`.

## Fuera de alcance

- **Verificación del teléfono con código por WhatsApp (OTP).** Es la medida más
  fuerte contra pedidos falsos y sería casi gratis una vez Evolution API esté
  en marcha, pero añade un paso a **todos** los compradores y depende de que el
  flujo de n8n ya esté en producción. Queda como decisión consciente para una
  ola posterior, cuando el canal esté probado.
- **Anticipo del 50 %.** Cobrar la mitad para confirmar y el resto al entregar
  es un cambio de modelo de negocio, no de pantalla. No se incluye.
- **Departamento y municipio como listas dependientes** con envío calculado por
  municipio. Es una mejora real de captura frente a la «ciudad» de texto libre
  actual, pero es su propia ola.
- **Pago con tarjeta en línea.**
- W2 (ventana de confirmación de datos previa) y W3 (enviar el documento
  fiscal por WhatsApp).
- Cambios en las reglas de anulación, devolución o costeo.

## Migraciones

Esta ola **sí** lleva migración, en tres piezas:

1. `metodos_pago.visible_tienda` y la tabla `cuentas_bancarias` con su RLS.
2. Las columnas nuevas de `pedidos` y el bucket `comprobantes` (privado).
3. `emitir_documento`: resolver `sesion_id` y exigir cobertura de pagos también
   para documentos de pedido.

La tercera toca la RPC fiscal más delicada del sistema y debe revisarse aparte
del resto.

## Riesgos conocidos

- **La migración de `emitir_documento` afecta a la emisión de mostrador**, que
  hoy funciona. Cualquier cambio debe dejar intacto el camino sin pedido.
- **Exigir turno abierto rompe el flujo actual de facturación de pedidos**, que
  hoy funciona sin turno. Es el objetivo de la ola, pero cambia una costumbre:
  quien facture pedidos tendrá que abrir caja primero.
- **Documentos de pedido ya emitidos sin sesión** (existe al menos uno) siguen
  sin ella. Esta ola impide que vuelva a ocurrir; **no repara lo pasado** ni lo
  intenta.
- **La caducidad devuelve stock automáticamente.** Un plazo mal configurado
  cancelaría pedidos legítimos. Por eso el plazo es configurable, el operador
  puede ampliarlo, y los pedidos con comprobante subido no caducan.
- **Evolution API no es la API oficial de WhatsApp**: conduce WhatsApp Web y el
  bloqueo del número es un riesgo documentado en envíos automatizados. La
  arquitectura lo acota: la aplicación solo publica un evento y no sabe nada de
  WhatsApp, así que cambiar de proveedor no toca el código de la tienda.
- **El comprobante lo aporta el cliente y no prueba nada por sí solo.** Es una
  ayuda para conciliar, no una confirmación de pago: quien confirma es el
  operador contra el estado de cuenta del banco.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm test`, `npm run build` y `npx eslint` verdes al
  cierre de cada tarea.
- **Tests unitarios obligatorios** para: la validación del método declarado
  (activo y visible en tienda), la construcción y firma del sobre del evento,
  el cálculo de la caducidad, y el armado del texto de WhatsApp (que debe
  codificarse entero y llevar el mismo monto que la tarjeta).
- **Verificación funcional con datos reales**, ejecutada o declarada como no
  ejecutada — nunca supuesta:
  - Un pedido con transferencia: la pantalla de confirmación muestra las
    cuentas, los botones copian número y monto, y el pedido guarda el método.
  - Subir un comprobante y verlo después en `/admin/pedidos`.
  - Un método de pago desactivado o no visible en tienda **no** se puede usar
    aunque se fuerce la petición.
  - Emitir el documento de ese pedido **con turno abierto**: el documento sale
    con pagos reales y con `sesion_id`, y aparece en el arqueo del turno.
  - Intentar emitirlo **sin turno abierto**: se explica con esas palabras.
  - Una venta de mostrador normal sigue funcionando igual que antes.
  - Un pedido caducado se cancela y **el stock vuelve** al producto.
  - Con la URL del webhook sin configurar, todo el checkout funciona igual.
