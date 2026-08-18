# P-detalle D1 — Fichas de cliente y de producto — Diseño

**Fecha:** 2026-08-18
**Serie:** P-detalle / trazabilidad de documentos, primera de tres olas.
Estado previo: series POS (P1–P7 + pulido Merlin) y rediseño (R1–R7) desplegadas.
**Estado:** aprobado para plan.

## Por qué esta ola va primera

La ola siguiente (D2) convierte la pantalla de documento en una vista de plataforma
donde el cliente y cada ítem enlazan a su ficha. **Hoy esas fichas no existen**: el
admin tiene listas con editor en modal, y lo único por entidad son el estado de cuenta
de CxC y el kardex del producto.

Construir D2 primero dejaría enlaces apuntando a rutas inexistentes durante toda una
ola — el mismo 404 intermedio que hubo con la pantalla de Turnos en R6, esta vez
evitable invirtiendo el orden.

## Objetivo

Dos páginas nuevas que respondan, sin salir de ellas, quién es este cliente y cómo va
su cuenta, y qué es este producto y cómo se ha movido.

## Rutas

- **`/admin/clientes/[id]`** — ficha de cliente (o proveedor: la tabla `clientes` es la
  misma, con `es_cliente` / `es_proveedor` como atributos).
- **`/admin/productos/[id]`** — ficha de producto.

Ninguna ruta existente cambia. `/admin/productos/[id]/movimientos` (el kardex) sigue
donde está y la ficha enlaza a él.

## Ficha de cliente

| Bloque | Contenido |
|---|---|
| **Identidad** | Nombre, RTN, identidad, contacto, teléfono, correo, dirección, notas. Badges de rol (cliente / proveedor), tipo (final / revendedor) y estado (activo / inactivo) |
| **Condiciones** | Días de crédito, límite de crédito, exonerado con su constancia y registro SAG |
| **Saldos** | Saldo por cobrar (suma de `documento_saldos`) y saldo a favor (`saldo_favor_clientes`). Cada uno enlaza a donde se opera: estado de cuenta y CxC |
| **Documentos emitidos** | Facturas, comprobantes, notas de crédito y devoluciones del cliente, con número, fecha, estado y total. Cada fila enlaza al documento |
| **Cobros recibidos** | Cobros de CxC con fecha, método, monto y referencia |
| **Compras al proveedor** | Solo si `es_proveedor`: sus compras con número, fecha, estado y total, enlazando a cada una |

**Acciones:** editar (reutiliza el modal que ya existe en la lista, no un formulario
nuevo) y abrir el estado de cuenta.

## Ficha de producto

| Bloque | Contenido |
|---|---|
| **Identidad** | Nombre, SKU, marca, categoría y subcategoría, canal, badges de activo y favorito del POS |
| **Precios** | Precio, precio original, precio de revendedor, costo, ISV |
| **Stock** | Stock efectivo (`stockEfectivo` de `lib/store/variantes`, que ya contempla el caso null = ilimitado), stock mínimo y aviso si está por debajo |
| **Variantes** | Si tiene hijas activas: nombre, SKU, precio efectivo, stock y estado de cada una |
| **Movimientos recientes** | Últimos movimientos de `movimientos_inventario`, con enlace a la página de kardex completa |
| **Ventas recientes** | Líneas de `documento_items` de este producto, con documento, fecha, cantidad e importe, enlazando al documento |

**Acciones:** editar (el mismo modal de la lista) y abrir el kardex.

## Principios

- **Solo lectura sobre dinero.** Las dos fichas leen y muestran; no recalculan importes
  ni escriben nada. Los saldos salen de las vistas existentes (`documento_saldos`,
  `saldo_favor_clientes`), el stock de `stockEfectivo`, y todo importe se muestra con
  `formatPrice()`: 2 decimales, Lempiras `L.`.
- **Reutilizar, no reimplementar.** El editor es el modal que ya existe en cada lista.
  El patrón visual sale de `app/admin/tabla-admin.module.css` y de las cards por sección
  del editor de producto.
- **Listados con `.limit()` explícito.** Sin él PostgREST aplica su tope por defecto y
  trunca en silencio.
- **Zona horaria.** Toda fecha formateada en código de servidor lleva
  `timeZone: 'America/Tegucigalpa'`: Vercel corre en UTC y sin eso las horas salen seis
  horas corridas, cosa que en local no se nota.
- **Botones.** Las clases globales `btnMerlin*` solo aportan color, radio y tipografía —
  sin padding ni display. Todo botón las combina con una clase de layout del módulo.
- **Especificidad CSS.** La regla global de `app/globals.css` sobre `input[type=...]`,
  `textarea` y `select` (0,1,1) pisa una clase de módulo sola (0,1,0): usar selector
  compuesto de dos clases. Y una clase aplicada directo sobre un `<td>` pierde contra la
  regla `td` de la propia tabla.
- Tokens Merlin; UI, dominio y commits en español.

## Alcance

**Dentro:** las dos páginas con sus bloques, sus enlaces salientes, y las entradas
desde las listas de clientes y de productos para llegar a ellas.

**Fuera:**
- La pantalla de documento como vista de plataforma (es D2).
- Cotización bloqueada y detalle de CxP (es D3).
- El kardex como modal: **descartado por decisión del usuario**; la página dedicada se
  conserva tal cual.
- Cambios en cómo se calculan saldos, costeo, stock o kardex.
- Migraciones: esta ola no lleva ninguna.
- Editar desde la ficha con un formulario propio: se reutiliza el modal existente.

## Migración

**Ninguna.** Todos los datos existen: `clientes`, `productos`, `producto_variantes`,
`documentos`, `documento_items`, `cobros`, `compras`, `movimientos_inventario`, y las
vistas `documento_saldos` y `saldo_favor_clientes`.

## Riesgos conocidos

- **Ítems libres.** `documento_items.producto_id` es nulo en los ítems libres del POS.
  Cualquier listado que agrupe o enlace por producto debe contemplarlo y no romper.
- **Volumen.** Un cliente o un producto con mucha historia puede tener miles de
  documentos o movimientos. Los listados de la ficha se acotan a los más recientes con
  `.limit()` explícito y enlazan a la pantalla completa (estado de cuenta, kardex) para
  ver todo. La ficha es un resumen navegable, no un reporte.
- **Proveedor sin ser cliente.** Un contacto puede ser solo proveedor: la ficha no debe
  mostrar bloques de CxC vacíos como si fueran un saldo en cero, sino omitirlos.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm test`, `npm run build` verdes al cierre de cada tarea.
- Tests unitarios para cualquier agregación nueva que se extraiga a `lib/`.
- **Verificación funcional con datos reales:** abrir la ficha de un cliente con saldo
  pendiente y comprobar que la cifra coincide con la que muestra el tablero de CxC; y la
  ficha de un producto con variantes, comprobando que el stock efectivo coincide con el
  de la lista de productos.
- Un contacto que sea solo proveedor: la ficha no muestra saldos de CxC.
- Un documento con ítems libres: la ficha del producto no los lista y nada falla.
