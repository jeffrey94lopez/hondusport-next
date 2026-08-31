# Agotados, pedidos por encargo y orden comercial de la vitrina

Fecha: 2026-08-31
Estado: diseño aprobado, pendiente de plan de implementación

## 1. El problema, medido

Medido en producción (`www.hondusport.com`) el 2026-08-31, sobre la rejilla
"VER TODO" de la portada:

| | |
|---|---|
| Productos en la rejilla | 12 |
| **Agotados** | **8** |
| Disponibles | 4 |
| Pulsar "agregar" en un agotado | **lo agrega al carrito** |

Tres defectos distintos, con causas distintas:

**a) Un agotado se puede agregar al carrito.** `ProductCard` calcula `agotado`
con `estaAgotado()` pero solo lo usa para pintar la etiqueta: el botón no lo
comprueba, y `StoreClient.quickAdd` tampoco. `ProductDetail.handleAddToCart` sí
tiene la guarda (`if (agotado) return`), así que el defecto es exclusivo de la
tarjeta del catálogo. La RPC `crear_pedido` valida stock y rechazaría el pedido,
así que no hay pérdida de dinero: el cliente lo descubre en el checkout, después
de haber elegido. Además, la confirmación visual desplegada en `6d3d6a8` pinta
el botón en verde con un check para ese add, o sea que **afirma** una acción que
el sistema va a rechazar.

**b) No hay ningún orden.** La consulta de productos de `app/(store)/page.tsx`
no lleva `.order()`. El orden de la portada es el que devuelva Postgres y puede
cambiar entre recargas. No es un orden malo: es la ausencia de orden.
`sortProductos` existe en `lib/store/filters.ts:53`, no se usa en ninguna parte,
y su caso por defecto devuelve la lista sin tocar.

**c) Los agotados no están separados ni despriorizados.** Ocupan dos tercios de
la portada compitiendo en igualdad con lo que sí se puede comprar.

## 2. Decisiones tomadas

Cuatro decisiones del dueño del producto, que fijan el alcance:

1. **Un agotado se puede pedir por encargo**, por una vía aparte. No se bloquea
   del todo: el botón deja de ser "agregar al carrito" y pasa a "Pedir por
   encargo", con un flujo propio que avisa de que no hay stock inmediato.
2. **El encargo no compromete a pagar.** Es una *solicitud*: el cliente deja qué
   quiere y su contacto; el negocio confirma disponibilidad, precio y plazo, y
   solo entonces se convierte en venta. Sin anticipo.
3. **La "categoría de agotados" es derivada del stock, no un dato.** El producto
   conserva su `categoria_id` real. Se descartó cambiarle la categoría porque se
   perdería la original y al reponerlo habría que reasignarla a mano.
4. **El orden es por bandas fijas**, no un puntaje ponderado. Con 12–50 productos
   una banda es más efectiva que una fórmula: predecible, explicable y sin pesos
   que afinar.

## 3. Fase 0 — Guarda de agotado

Desplegable por sí sola, y conviene que vaya primero: hoy el defecto está vivo
en producción y la animación nueva lo refuerza.

- `ProductCard`: si `estaAgotado(producto.stock, producto.variantes)`, el botón
  queda `disabled` con `aria-label` "Agotado". No se muestra badge de unidades
  ni confirmación.
- `StoreClient.quickAdd` y `ProductDetail.quickAddRelated`: guarda equivalente
  que devuelve `false`. Defensa en profundidad — el botón no es la única vía de
  entrada al handler, y `onQuickAdd` es una interfaz pública del componente.
- No hay lógica nueva: `estaAgotado` ya vive en `lib/store/variantes.ts` y es la
  misma pura que usan `ProductDetail`, el catálogo del POS y el editor de
  cotización. Aquí solo se aplica donde falta.

**Tests:** un producto plano con `stock: 0` y un producto con todas sus variantes
agotadas no entran al carrito ni por el botón ni por el handler.

**Provisional a propósito:** en la Fase 2 ese botón deja de estar deshabilitado
y pasa a "Pedir por encargo". Se hace igual ahora porque la Fase 2 depende de una
migración y de un formulario nuevo, y no es razonable dejar el defecto vivo
mientras tanto.

## 4. Fase 1 — Orden por bandas

### 4.1 Vista de ventas reales

El único criterio de "más vendido" que no es una suposición son las ventas
registradas. Existen en dos sitios: `pedido_items` (tienda) y `documento_items`
(mostrador). Agregarlas en cada carga de la portada sería caro, así que van en
una **vista de Postgres** `producto_ventas_90d` con `producto_id` y
`unidades`, consultada como un join más.

Tres trampas de correctitud que la vista tiene que resolver, y que son la razón
de que esto sea una vista y no un `sum()` improvisado:

1. **Doble conteo.** `documentos.pedido_id` existe: una venta web facturada
   después en el mostrador está en las dos tablas. Hay que excluir de
   `pedido_items` los pedidos que ya tienen un documento emitido
   (`documentos.pedido_id is not null and documentos.estado = 'emitido'`).
2. **Documentos anulados.** `documentos.estado` es `'emitido' | 'anulado'`; solo
   cuentan los emitidos.
3. **Devoluciones.** `documentos.tipo` incluye `'nota_credito'` y `'devolucion'`,
   que son mercancía que vuelve. Sus unidades **restan**, no suman. Contarlas
   como venta invertiría el signo justo en los productos con más problemas.

Y de `pedidos`, excluir `estado = 'cancelado'`.

La ventana de 90 días queda en la definición de la vista. Si más adelante se
quiere configurable, se parametriza entonces; no se diseña para eso ahora.

**Refresco:** la vista es normal (no materializada), así que se calcula al
consultarse y no necesita cron. Si el volumen lo pidiera, se convierte en
materializada y se refresca desde el cron de n8n que ya existe para
`caducar_pedidos_vencidos`. Se empieza por la vista simple.

### 4.2 La pura del orden

`ordenarVitrina(productos, ventas)` en `lib/store/`, con tests, siguiendo el
CLAUDE.md: la regla con peso comercial vive en `lib/store/` como función pura,
no embebida en el componente.

| Banda | Contenido | Dentro se ordena por |
|---|---|---|
| 1 | Disponibles con `badge` no nulo (curación manual) | unidades vendidas desc |
| 2 | Disponibles con ventas > 0 | unidades vendidas desc |
| 3 | Disponibles nuevos | `created_at` desc |
| 4 | Disponibles con descuento real | % de descuento desc |
| 5 | Resto disponible | nombre, `localeCompare` |
| 6 | **Agotados** | unidades vendidas desc |

Precisiones que el plan tiene que respetar:

- **Todo criterio de banda desempata por `nombre`.** Sin desempate, dos
  productos con las mismas unidades vendidas (0, el caso mayoritario hoy) pueden
  salir en orden distinto en cada carga, que es el defecto (b) reaparecido por
  otra puerta. El orden tiene que ser una función total: mismas entradas, mismo
  resultado, siempre. Hay un test para eso.
- "Disponible" es `!estaAgotado(...)`, la misma pura de siempre. `stock: null`
  es ilimitado, no agotado.
- "Nuevo" de la banda 3 es por `created_at` dentro de una ventana (a definir en
  el plan, propuesta: 30 días), **no** por `badge === 'Nuevo'`. El badge es
  curación manual y ya lo captura la banda 1.
- "Descuento real" es `precio_original > precio`, calculado; no el badge
  'Oferta'.
- La banda 1 es `badge != null`, cualquiera de los valores que use el negocio
  ('Oferta', 'Nuevo', 'Más Vendido', 'Sustentable', 'Últimas unidades'). Como
  las bandas son excluyentes y la 1 gana, en la práctica un producto con badge
  'Oferta' nunca llega a la banda 4; eso es intencional — tu curación manual
  pesa más que el descuento calculado.
- La banda 6 va por ventas desc a propósito: el agotado que más se vendía es el
  mejor candidato a encargo, así que encabeza su banda.
- Un producto cae en la **primera** banda que lo acepta; las bandas son
  excluyentes.

### 4.3 Determinismo en la consulta

Añadir `.order()` a la consulta de productos de `app/(store)/page.tsx` (y a la
de `producto/[slug]/page.tsx`, que lee el catálogo completo para relacionados y
recientes). El orden de la consulta no es el orden final —lo fija
`ordenarVitrina`— pero sin él la entrada de la pura es no determinista y los
empates dentro de una banda bailarían.

### 4.4 Código muerto

`sortProductos` y su tipo `SortBy` en `lib/store/filters.ts`: o se conecta a un
selector de orden en la UI, o se borra. El plan decide una de las dos; dejarlo
como está no es opción, porque una función de orden sin usar junto a una nueva
función de orden es una trampa para quien lea el código después.

## 5. Fase 2 — Sección "Por encargo" y flujo de solicitud

### 5.1 Tienda

- **Sección derivada** al final de la portada, después de todas las bandas de
  disponibles, con su propio título ("Por encargo") y su filtro en el
  `FilterSidebar`. Sale de la banda 6; el producto conserva su categoría real y
  sigue apareciendo en su categoría cuando se filtra por ella.
- La tarjeta de un agotado cambia el botón a **"Pedir por encargo"**, sustituyendo
  el `disabled` de la Fase 0.
- Formulario corto: nombre, WhatsApp, cantidad y notas. Reutiliza el patrón de
  validación del checkout.
- Mensaje explícito de que es una solicitud sin compromiso y que el negocio
  confirmará disponibilidad, precio y plazo. Es la promesa que evita el reclamo.

### 5.2 Reutilizar `cotizaciones` en vez de una tabla nueva

Un encargo es una solicitud que alguien confirma y cotiza. Eso es exactamente
una cotización, y el subsistema existe completo desde P3:

| Lo que necesita un encargo | Lo que ya tiene `cotizaciones` |
|---|---|
| Cliente sin cuenta | `cliente_nombre` con `cliente_id` nulo |
| Línea con el producto pedido | `cotizacion_items` (`producto_id`, `variante_id`, `cantidad`) |
| Que el negocio lo confirme | Etapas Kanban con `tipo`: `abierta`/`ganada`/`perdida` |
| Convertirlo en venta | `documento_id`, ya conectado a la emisión |
| Panel para gestionarlo | El Kanban y el PDF de P3 |

No se crea tabla nueva. Se añade lo que falta para que la tienda pública pueda
escribir ahí.

### 5.3 La RPC

**`crear_solicitud_encargo`**, `security definer`, siguiendo el patrón de
`crear_pedido`. Es obligatoria, no una preferencia de estilo, por dos hechos
verificados en `supabase/migrations/2026-08-08-pos-p3-cotizaciones.sql`:

- La política es `cotizaciones_admin ... for all to authenticated` (líneas
  67–73): **`anon` no tiene ningún acceso** a `cotizaciones`,
  `cotizacion_items` ni `cotizacion_etapas`.
- El correlativo sale de `nextval_cotizacion()`, que está **revocada a `anon`**
  explícitamente (`revoke all on function nextval_cotizacion() from public,
  anon`, línea 22). La RPC tiene que generar el número por dentro.

Responsabilidades de la RPC, en una transacción:

1. Validar que el producto existe, está `activo`, tiene `canal` en
   `('tienda','ambas')` y **está agotado** — un encargo de algo disponible es un
   pedido normal mal enrutado y debe rechazarse.
2. Generar `numero` con la secuencia.
3. Insertar la `cotizacion` en la etapa configurada.
4. Insertar su `cotizacion_item` con el precio de lista como indicativo
   (`precio_manual = false`).
5. Devolver el número para mostrárselo al cliente.

Como en el checkout, **la RPC no confía en los importes del cliente**: relee el
precio del producto de la BD. El cliente solo aporta contacto, cantidad y notas.

**Etapa destino:** `configuracion.encargos_etapa_id` (la tabla `configuracion`
es clave/valor y es donde van los ajustes globales, según el CLAUDE.md). Si no
está puesta, la etapa `abierta` de menor `orden`. Si no hay ninguna etapa
`abierta`, la RPC falla con un error claro en vez de crear una cotización
huérfana.

**Origen web:** hay que poder distinguir un encargo web de una cotización hecha
en el mostrador. El plan elige entre una columna `origen` en `cotizaciones` o un
prefijo en `numero`; la columna es más limpia y no ensucia un identificador.

### 5.4 Panel

Aparece en el Kanban existente con su marca de origen. No se construye pantalla
nueva: si algo falta, es un filtro por origen en el Kanban.

## 6. Fuera de alcance

Descartado explícitamente en las decisiones, y no se diseña "por si acaso":

- Anticipos o cobro del encargo (incluido reutilizar el pago declarado de W1a).
- Lista de espera / avisar cuando vuelva a haber stock.
- Ranking por margen, aunque `costo` existe y lo haría calculable.
- Puntaje ponderado con pesos en `configuracion`.
- Mover el `categoria_id` del producto al agotarse.

## 7. Cómo se convierte esto en planes

El spec cubre tres fases de tamaño muy distinto y **no debería salir un solo
plan de aquí**:

- **Fase 0** es un arreglo de corrección de un archivo y medio. No necesita plan
  escrito: va directo por el flujo normal de desarrollo, con su test.
- **Fase 1** merece su propio plan (vista SQL + pura + tests + consulta).
- **Fase 2** merece el suyo (migración + RPC + formulario + tienda + panel), y es
  la única con migración de BD.

## 8. Riesgos y notas de entrega

- **La migración de la Fase 2 se aplica en el SQL Editor de Supabase ANTES del
  push.** No hay acceso programático a esa base desde este entorno (el MCP de
  Supabase disponible no tiene el proyecto `nrzkqcrzsqxnjbuyfpaw`), así que el
  código nuevo espera un esquema que hay que migrar a mano primero.
- **Las tres fases son desplegables por separado** y en orden. La Fase 0 no
  depende de nada; la Fase 1 no depende de la 2.
- **La Fase 2 sustituye una decisión de la Fase 0** (botón deshabilitado →
  "Pedir por encargo"). Es deuda deliberada y está anotada arriba para que quien
  ejecute la Fase 2 no lo lea como una contradicción.
- **Ocho de doce productos agotados** es el estado real hoy. Conviene comprobar
  con el dueño si eso refleja el inventario o si hay stock sin registrar, porque
  si es lo segundo, el problema de fondo es de datos y ninguna de estas fases lo
  arregla.
