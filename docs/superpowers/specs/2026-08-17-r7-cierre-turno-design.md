# R7 — Cierre de turno: modo a ciegas configurable y comprobante desglosado — Diseño

**Fecha:** 2026-08-17
**Antecedente:** R6 (`ec77687`) sacó los turnos de caja a pantalla propia. Al usarla,
el usuario pidió tres cosas: botones que se vean como botones (bug, ya arreglado en
`e7294ad`, fuera de este spec), poder **habilitar o deshabilitar el cierre a ciegas**, y
un **comprobante desglosado del turno imprimible en tirilla**.
**Estado:** aprobado para plan.

## Objetivo

Que el cierre de turno deje de ser una decisión implícita y produzca un documento.
Hoy el arqueo se confirma sin dejar constancia legible, y los dos caminos de cierre se
comportan distinto sin que nadie lo haya decidido.

## 1. Cierre a ciegas configurable

### El problema actual

Hay **dos caminos para cerrar un turno y muestran información distinta**:

- El modal del mostrador (`CierreModal`) muestra el efectivo esperado y su desglose
  **antes** de que el cajero teclee el conteo.
- La pantalla de Turnos (R6) pide el conteo y revela esperado y diferencia **después**
  de confirmar.

Esa divergencia se introdujo sin decidirse: la revisión final de R6 la señaló como
"decisión de control interno tomada implícitamente". Son dos controles internos
distintos — conteo informado y conteo a ciegas — y cuál se quiere es del negocio, no
del código.

### Destino

Un **interruptor global** en Configuración → POS, con la clave `pos_cierre_ciegas` en la
tabla `configuracion`. **Gobierna los dos caminos por igual**: con él activo, ninguno
muestra el esperado antes del conteo; con él inactivo, ambos lo muestran.

**Valor por defecto: activo (cierre a ciegas).** Es el control interno más estricto y es
el comportamiento que la pantalla de Turnos ya tiene hoy. Se sigue el criterio de
"ausente = valor por defecto" que ya usa `pos_documento_modal`, para que la clave pueda
no existir todavía en `configuracion` sin romper nada.

El interruptor **solo controla qué se muestra antes de confirmar**. El arqueo posterior
—esperado, contado, diferencia— se muestra siempre: es el resultado, no una pista.

### Lo que NO cambia

`cerrarSesion` sigue calculando el esperado en el servidor con `esperadoCaja` y
congelando `monto_esperado`, `monto_contado` y `diferencia` en `sesiones_caja`. El
interruptor es de presentación: **no toca el cálculo ni lo que se persiste**.

## 2. Comprobante de cierre de turno

### Contenido

| Bloque | Detalle |
|---|---|
| **Encabezado** | Nombre comercial de la empresa (resolvers de `lib/empresa/perfil.ts`), caja, usuario |
| **Turno** | Fecha y hora de apertura, fecha y hora de cierre |
| **Arqueo** | Monto inicial, efectivo esperado, contado, y la diferencia rotulada `Cuadra exacto` / `Sobrante` / `Faltante` |
| **Ingresos por método de pago** | Una línea por método con monto (de `porMetodo`) |
| **Créditos otorgados en el turno** | Detalle línea por línea: cliente, documento y monto. Es mercadería que salió sin entrar dinero a caja |
| **Cobros de CxC recibidos** | Detalle línea por línea: cliente, documento abonado, método y monto. Este sí entró a caja |
| **Devoluciones / reembolsos** | Por método, si hubo |

**Fuera:** totales agrupados por cliente y saldo pendiente resultante. El saldo pendiente
se descartó a propósito: es un dato **vivo**, no del turno — si al cliente se le cobra
después, una tirilla reimpresa mostraría un número distinto al de la original y dejaría
de ser un comprobante.

### Dónde aparece

1. **Al confirmar el cierre**, en los dos caminos (pantalla de Turnos y modal del
   mostrador), con el botón de imprimir a la mano.
2. **En el detalle del turno** (`/admin/pos/turnos/[id]`, ya existe), para consultarlo y
   reimprimirlo cuando se quiera.

### Impresión en tirilla

Se reutiliza la infraestructura que ya existe para documentos: la clase `.hoja80`
(80 mm) de `app/admin/pos/documento/documento.module.css` con sus reglas `@media print`,
y `window.print()`. **No se construye un motor de impresión nuevo.**

El comprobante es un **componente propio** (no se mete dentro de `DocumentoHoja`, que
imprime documentos fiscales y es inmutable). Fondo blanco y tinta fija como el resto de
las hojas imprimibles: simulan papel, no siguen el tema de la app.

### Reimpresión y consistencia

Una tirilla reimpresa **debe decir exactamente lo mismo** que la original. Por eso:

- El arqueo sale de los valores **congelados** en `sesiones_caja`, nunca de un recálculo.
- El detalle de créditos y cobros se reconstruye filtrando por `sesion_id`, que no cambia.
- **Riesgo conocido, heredado:** `esperadoCaja` salta los documentos con
  `estado !== 'emitido'`. Si un comprobante del turno se anula **después** del cierre, el
  desglose por método deja de incluirlo mientras el esperado congelado sí lo incluía. El
  comprobante debe llevar la **fecha y hora de impresión** para que dos copias distintas
  sean explicables. Corregirlo de raíz (persistir el desglose al cerrar) queda fuera.

### El desglose no suma exacto, y el comprobante lo dice

`esperadoCaja` resta el cambio entregado del efectivo esperado pero **no lo devuelve como
línea**, así que sumar el desglose no da el esperado. En una pantalla de auditoría ya se
mitigó con una nota (R6); en un comprobante impreso, que alguien va a cuadrar a mano,
hace falta la línea. **`esperadoCaja` pasa a devolver también el cambio acumulado** y el
comprobante lo muestra como línea propia. Es un campo nuevo en el retorno: los tres
consumidores actuales (`CierreModal`, `cerrarSesion`, detalle de turno) siguen
funcionando sin cambios, y la nota que R6 puso en el detalle se retira.

## Alcance

**Dentro:** el interruptor y su sección en Configuración; que gobierne los dos caminos de
cierre; el componente del comprobante con su impresión en tirilla; su aparición en los
tres puntos; el campo de cambio acumulado en `esperadoCaja` con sus tests; y las
consultas de detalle de créditos otorgados y cobros del turno.

**Fuera:**
- Totales por cliente y saldo pendiente en el comprobante.
- Persistir el desglose al cerrar (arregla la reimpresión tras una anulación posterior).
- Cambiar el cálculo del arqueo, la emisión fiscal, el costeo o el kardex.
- Impresión térmica directa (ESC/POS). Se imprime por el diálogo del navegador, como
  todo lo demás en la app.
- Permisos o roles: el interruptor lo ve y cambia cualquiera que entre a Configuración.

## Principios

- **Dinero:** el arqueo sale de los valores congelados. Todo importe con `formatPrice()`,
  2 decimales, Lempiras `L.`. Ninguna cuenta paralela: el desglose sale de `esperadoCaja`.
- **Lógica pura con test en `lib/`**, no embebida en componentes.
- **Reutilizar:** `esperadoCaja`, los Server Actions de cierre, los resolvers de empresa,
  `.hoja80` y el patrón de interruptor de `pos_documento_modal`.
- **Listados con `.limit()` explícito**: sin él PostgREST trunca en silencio.
- Tokens Merlin; los botones combinan la clase global `btnMerlin*` **con una clase de
  layout propia** (sin ella se pintan como texto suelto: fue el bug de R6).
- Idioma español; UI y commits.

## Migración

**Ninguna.** `pos_cierre_ciegas` vive en `configuracion`, que es clave/valor, y se crea
sola al guardarla por primera vez. El criterio "ausente = a ciegas" hace que la app
funcione antes de que exista.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm test`, `npm run build` verdes al cierre de cada tarea.
- Tests unitarios del cambio acumulado en `esperadoCaja` y de cualquier agregación nueva.
- **Verificación funcional con un turno real:** cerrar con el interruptor activo y con
  él inactivo, y comprobar que el arqueo congelado es idéntico en ambos casos — el
  interruptor no puede alterar el resultado.
- Comprobar que el comprobante reimpreso desde el detalle coincide con el que se emitió
  al cerrar.
- Vista previa de impresión a 80 mm: que no se corte contenido a lo ancho.
