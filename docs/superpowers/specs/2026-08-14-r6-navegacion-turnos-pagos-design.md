# R6 — Navegación del admin, pantalla de Turnos y pago a proveedor — Diseño

**Fecha:** 2026-08-14
**Serie:** Continúa el rediseño Hondusport. Estado previo: R1 tienda ✅ · R2a empresa ✅ ·
R2b descuentos ✅ · R3 shell+dashboard ✅ · R4 POS ✅ · R5a pantallas admin ✅ ·
R5b tablas genéricas ✅ (rama `feature/rediseno-r5b-tablas`, pendiente de mezclar).
**Estado:** aprobado para plan.

## Objetivo

Tres cambios que salieron del pase visual de R5b y que ya no son re-skin:

1. **Reorganizar la navegación del admin** para que refleje cómo se trabaja (punto de
   venta, ingresos, egresos, inventario, tienda) en vez de cómo creció el sistema.
2. **Sacar los turnos de caja del modal a una pantalla propia**, con historial y detalle.
3. **Arreglar el flujo de pago a proveedor**: hoy obliga a teclear el monto dos veces.

## 1. Reorganización de la navegación

### Principio: se mueve el menú, no las rutas

Ninguna pantalla cambia de URL. `/admin/pedidos` sigue siendo `/admin/pedidos` aunque
pase del grupo INGRESOS al grupo TIENDA. Esto mantiene válidos los enlaces internos, los
marcadores del usuario y los `revalidatePath()` de los Server Actions, y hace el cambio
reversible con una sola edición. La única ruta nueva es la de Turnos (sección 2).

### Estructura destino

Definida en `NAV_GROUPS` de `components/admin/Sidebar.tsx`:

| Grupo | Entradas |
|---|---|
| *(suelta)* | Inicio → `/admin` |
| **PUNTO DE VENTA** | POS → `/admin/pos` · Turnos → `/admin/pos/turnos` |
| **INGRESOS** | Documentos → `/admin/pos/documentos` · Cotizaciones → `/admin/cotizaciones` · Cuentas por cobrar → `/admin/cuentas-por-cobrar` |
| **EGRESOS** | Compras → `/admin/compras` · Cuentas por pagar → `/admin/cuentas-por-pagar` |
| **INVENTARIO** | Productos → `/admin/productos` · Inventario físico → `/admin/inventario` · Movimientos → `/admin/movimientos` |
| **TIENDA** | Pedidos → `/admin/pedidos` *(conserva su badge)* · Categorías → `/admin/categorias` · Banners → `/admin/banners` · Cupones → `/admin/cupones` · Envíos → `/admin/envios` |
| *(suelta)* | Clientes → `/admin/clientes` |
| *(suelta)* | Reportes → `/admin/reportes` |
| *(pie)* | Configuración → `/admin/configuracion` *(sin cambios)* |

**Clientes y Reportes van sueltos**, no como grupo de un solo hijo: un grupo colapsable
con una única entrada solo agrega un clic. El componente ya soporta entradas sueltas —
así se pinta hoy `INICIO`.

**Gastos** no se construye en esta ola. El grupo EGRESOS queda como su lugar natural
para cuando exista.

**Proveedores** no se mueve: sigue dentro de `/admin/clientes` (la pantalla es
"Clientes y proveedores", con `es_proveedor` como atributo, no como pantalla aparte).
En el menú la entrada se llama **Clientes**.

### Colapso por defecto

Hoy los grupos arrancan expandidos. El destino es: **todos colapsados salvo PUNTO DE
VENTA**. Se mantienen las dos reglas que ya existen:

- El grupo que contiene la ruta activa siempre se muestra expandido, sin importar el
  estado guardado.
- El estado que el usuario elige se persiste en `localStorage`.

**Trampa a resolver:** el estado vive en `localStorage` bajo `hs_admin_nav_groups`, con
las etiquetas de grupo como clave. Como las etiquetas cambian (`INGRESOS` ya no contiene
lo mismo) y el valor por defecto se invierte, un navegador con estado guardado seguiría
aplicando el mapa viejo y el usuario no vería el cambio. Se **renombra la clave**
(`hs_admin_nav_v2`), de modo que el primer render tras el despliegue parte del nuevo
valor por defecto. La clave vieja se deja morir sola; no se migra (el estado de colapso
de un menú no vale una migración).

Se conserva el patrón de hidratación que ya tiene el componente: el primer render pinta
el estado por defecto y el valor guardado se aplica en un efecto, para no desincronizar
el HTML del servidor con el del cliente.

## 2. Pantalla de Turnos

Hoy abrir y cerrar turno se hace desde modales del mostrador, y el historial es otro
modal (`HistorialModal`) que solo muestra los últimos 30 turnos cerrados que `page.tsx`
ya carga. No hay pantalla donde consultar un turno pasado.

### Rutas nuevas

- **`/admin/pos/turnos`** — turno actual + historial.
- **`/admin/pos/turnos/[id]`** — detalle de un turno.

### `/admin/pos/turnos`

- **Card de turno actual.** Caja, usuario, hora de apertura y monto inicial, con la
  acción de cerrar turno (el arqueo que hoy hace `CierreModal`). Si no hay turno abierto,
  la misma card sirve para abrirlo (caja + monto inicial).
- **Historial** en tabla, con filtros por rango de fechas, caja y usuario. Por turno se
  muestran las columnas que ya expone `sesiones_caja` y que `HistorialModal` pinta hoy:
  caja, usuario, apertura y cierre, `monto_inicial`, `monto_esperado`, `monto_contado` y
  `diferencia`. La diferencia se colorea como en el modal (faltante en `--danger`,
  sobrante en `--success`, cero en neutro).

### `/admin/pos/turnos/[id]`

Documentos emitidos durante el turno, movimientos de efectivo y el arqueo de cierre
(esperado vs. contado y su diferencia). El desglose por método de pago se calcula con
`esperadoCaja()` de `lib/pos/emision.ts` — la misma función que usa `CierreModal`, no
una segunda cuenta.

### El modal del POS se conserva

Cerrar turno desde el mostrador sin abandonar la venta es el camino rápido durante la
jornada; quitarlo sería un retroceso. **Ambos caminos usan exactamente los mismos Server
Actions** (`abrirSesion`/`cerrarSesion` de `app/admin/pos/actions.ts`) — la pantalla es
una vista nueva sobre la misma lógica, no una segunda implementación. Si algún día se
retira el modal, la pantalla ya es la canónica.

### Datos

Todo sale de lo que ya existe: la tabla `sesiones_caja` (con `estado` `abierta`/`cerrada`,
`caja_id`, `cerrada_at`), la tabla `cajas` para resolver nombres, y los documentos y
movimientos de efectivo asociados al turno. **No hay migración.**

El listado del historial debe traer un `.limit()` explícito y suficientemente alto: un
listado sin límite explícito recibe el tope por defecto de PostgREST y trunca en silencio
(ya ocurrió una vez en esta serie, en un reporte).

## 3. Pago a proveedor

En `PagoModal` (`app/admin/cuentas-por-pagar/PagoModal.tsx`), modo global.

### 3.1 Distribución automática: mostrar el saldo pendiente total

Al elegir "distribuir automáticamente" se muestra el **saldo pendiente total del
proveedor seleccionado** — la suma de los saldos de sus compras con saldo > 0. Sin él,
el usuario teclea un monto a ciegas y solo descubre que se pasó cuando el servidor
responde *"El monto supera el total adeudado del proveedor"*.

El dato ya está en el cliente: `filas` trae las compras con saldo y el modal ya las
filtra por proveedor (`comprasProveedor`).

### 3.2 Elegir compras: el total se calcula solo

**Hoy:** hay un campo de monto general y, además, un monto por compra; una validación
exige que la suma iguale el monto general. El usuario teclea las mismas cifras dos veces.

**Destino:** en modo manual **desaparece el campo de monto general**. El usuario escribe
cuánto aplica a cada compra y el total del pago es la suma, mostrada en vivo. Se retira
también la validación "la suma de los abonos debe igualar el monto", que deja de tener
sentido.

Las validaciones que **se conservan**, porque protegen dinero:

- Ningún monto negativo (un monto negativo invalida todo el formulario, no solo su línea).
- Ningún abono puede exceder el saldo de su compra.
- Al menos una aplicación mayor que cero.

El campo de monto general **sigue existiendo** en los otros dos casos, donde sí es el
único dato: el modo *abono* (botón "Abonar" de una fila, una sola compra) y el modo
global con distribución automática.

### Frontera de confianza: no se toca

La RPC `registrar_pago_proveedor` recibe **solo `aplicaciones`**; el total nunca viaja
desde el cliente, se deriva en el servidor a partir de lo aplicado. Quitar el campo de
monto general en modo manual no cambia nada de eso: hoy ese valor ya se descarta. El
Server Action sigue validando y la RPC sigue siendo atómica.

### Lógica pura

La suma de aplicaciones y las reglas de validez del formulario van a `lib/cxp/` como
funciones puras **con test**, junto a `distribuirPago`, que ya vive ahí. Es dinero: la
regla no se queda embebida en el componente.

## Alcance

**Dentro:** la reorganización del menú, el colapso por defecto, la pantalla de Turnos con
su detalle, y los dos cambios de `PagoModal` con su lógica pura y tests.

**Fuera:**
- Gastos (el grupo queda preparado, la pantalla no se construye).
- Mover Proveedores fuera de Clientes.
- Cambios en cómo se calculan saldos, costeo, kardex o el arqueo de caja.
- Retirar los modales de turno del mostrador.
- Migraciones de base de datos: esta ola no lleva ninguna.
- Re-skin de pantallas ya entregadas.

## Principios

- **Rutas estables.** La reorganización es de menú; ninguna pantalla cambia de URL.
- **Dinero.** Todo importe se muestra con el `formatPrice()` existente, 2 decimales,
  Lempiras `L.`. Ningún total se recalcula fuera de la lógica pura testeada.
- **Reutilizar, no reimplementar.** Turnos consume los Server Actions del POS; el patrón
  visual sale de `app/admin/tabla-admin.module.css` (R5b) y las cards de sección del
  editor de producto.
- **Especificidad CSS.** La regla global de `app/globals.css` sobre `input[type=...]`,
  `textarea` y `select` (0,1,1) pisa una clase de módulo sola (0,1,0): todo cambio de
  fondo, borde, padding o tamaño en un campo usa selector compuesto de dos clases.
- Tokens Merlin; UI, dominio y commits en español.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run lint` verdes al cierre de
  cada tarea.
- Tests unitarios obligatorios para la lógica pura nueva de `lib/cxp/`.
- Verificación manual del menú: cada entrada abre su pantalla, el grupo activo se
  resalta y se expande, y el estado de colapso sobrevive a una recarga.
- Verificación de Turnos contra un turno real: abrir, cerrar y consultar el detalle.
- Verificación de CxP contra datos reales: que un pago manual registre exactamente la
  suma de lo aplicado, y que el saldo del proveedor quede igual que con el flujo anterior.
- **Pase visual final del usuario** con el chrome agent.
