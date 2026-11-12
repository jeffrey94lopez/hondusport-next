# Diseño — Camisas: Versión × Temporada × Talla en una sola ficha

**Fecha:** 2026-11-11
**Objetivo:** eliminar la duplicación de productos por temporada en Camisas
Deportivas (ej. "REAL MADRID LOCAL TEMP. 24/25", "...25/26", "...26/27" como 3
filas separadas) y convertirla en **una sola ficha por club+kit** con tres
selectores combinables — Versión (Fan/Jugador) → Temporada → Talla — cada
combinación con su propio precio, stock e imágenes.

## Contexto y problema

- **115 productos activos**, 481 filas en `producto_variantes` cubriendo 77
  productos (talla ya funciona como variante en la mayoría); 38 productos de
  Camisas Deportivas todavía tienen la talla suelta en `productos.tallas`
  sin fila de variante.
- **Duplicación real por temporada**, confirmada: `REAL MADRID LOCAL TEMP.
  24/25` (L.550), `...25/26` (L.750), `...26/27` (L.1265) son 3 filas de
  `productos` distintas. Mismo patrón en Barcelona, Francia, Inter Miami, etc.
  La temporada viene pegada como texto en `nombre`; no existe como columna ni
  como tipo de categoría. El Excel de origen (`Productos_2026-6-3.xlsx`)
  tampoco la tenía — la duplicación nació en el import original.
- **`categorias`** (51 filas): tipos `cat`/`subcat`/`talla`. Jerarquía 6 `cat`
  → `subcat` por categoría padre → `talla` colgada de la subcat. No hay tipo
  `temporada`.

## Enfoques considerados

Se investigó cómo resuelven esto 90mas5.store, la tienda oficial del Real
Madrid, Nike, Adidas, Fanatics y Classic Football Shirts (el más parecido:
vende temporadas retro de un mismo club desde hace décadas). **Ninguno agrupa
varias temporadas dentro de una sola ficha con selector** — en todos,
temporada = producto/URL propia; lo que sí es variante real ahí: talla y
versión Fan/Jugador.

- **Opción B (estándar del rubro):** cada temporada sigue siendo su propio
  producto, con nombre limpio y campo temporada propio, agrupados solo
  visualmente en catálogo. Migración de bajo riesgo, pero no resuelve lo que
  pidió el dueño: las temporadas seguirían siendo ítems separados.
- **Opción A (elegida):** un producto por club+kit, con variantes en tres
  ejes combinables (Versión × Temporada × Talla) en una sola ficha. Más
  ambicioso que cualquier líder del sector investigado, pero es lo que el
  dueño pidió explícitamente ("ir más allá"), y es construible reutilizando
  casi entero el mecanismo de `producto_variantes` que ya existe para talla.
  Se validó con un mockup interactivo (ficha única con los 3 selectores vs.
  catálogo agrupado con página por temporada); el dueño confirmó A.

## Alcance

- **Incluye:** dos columnas nuevas en `producto_variantes` (`version`,
  `temporada_id`), tipo `temporada` en `categorias`, selectores encadenados
  Versión → Temporada → Talla en la ficha de tienda, sección de variantes
  rediseñada en el admin para Camisas Deportivas, extensión de
  `sync_producto_variantes` e `importar_productos_variantes`, pestaña
  "Variantes" del round-trip Excel con las 2 columnas nuevas, migración
  revisada y aprobada grupo por grupo de los productos ya duplicados, y
  terminar de migrar a `producto_variantes` los 38 productos de Camisas
  Deportivas que hoy tienen la talla suelta en `tallas text[]`.
- **No incluye:** cambios al modelo de variantes de Tenis, Tacos, Accesorios
  o Personalizados (siguen con el eje único de talla que ya tienen); redirects
  automáticos de SEO desde las URLs de los productos fusionados-fuera;
  cambios a `crear_pedido`, RLS, o a la forma en que se calcula el kardex —
  ninguno de los tres se toca (ver "Por qué no toca el backend crítico").

## Decisiones tomadas

1. **Nueva variante = combinación, no nueva tabla.** `producto_variantes`
   gana dos columnas nullable: `version` (`'fan'`/`'jugador'`) y
   `temporada_id` (FK a `categorias`, tipo nuevo `'temporada'`). La talla
   sigue viviendo en la columna `nombre` que ya existe — exactamente como
   hoy. Una variante de camisa queda identificada por
   `(producto_id, version, temporada_id, nombre)`.
2. **Temporada es un tipo de `categorias`, no una tabla nueva.** Reutiliza el
   patrón que ya existe (`orden`, `activo`) para que las temporadas tengan un
   orden canónico (23/24 antes que 24/25) y una sola fuente de verdad en vez
   de texto libre repetido en cada producto.
3. **Versión NO usa `categorias`** (es un enum fijo de 2 valores, con
   `check` directo en la columna; no se espera que crezca).
4. **Precio e imágenes siguen siendo por variante hoja** (la combinación
   completa), igual que hoy: `precio` null hereda el del producto, `imagenes`
   vacío hereda las del producto. No hay un nivel intermedio que fije precio
   por versión o por temporada — el admin aplica el mismo precio a todas las
   tallas de una temporada/versión por convención de captura, no por regla de
   base de datos (igual de manual que hoy).
5. **No hace falta que existan todas las combinaciones.** Si una temporada
   vieja ya no tiene talla S, simplemente no hay fila para esa combinación;
   el chip de esa talla no aparece cuando se selecciona esa temporada (igual
   de simple que "agotado" hoy, pero a nivel de combinación en vez de fila).
6. **Alcance: solo Camisas Deportivas.** El selector de 3 ejes y los campos
   nuevos del admin solo se muestran para productos de esa categoría; Tenis,
   Tacos, Accesorios y Personalizados no cambian.
7. **Migración de los duplicados existentes: con aprobación, grupo por
   grupo.** Un reporte (no un script que fusiona solo) agrupa candidatos por
   nombre normalizado (quitando `TEMP. NN/NN` y patrones de año) +
   categoría/subcategoría igual; el dueño aprueba cada grupo antes de tocar
   producción. Los productos fusionados-fuera se **desactivan**
   (`activo = false`), nunca se borran — conservan su historial de pedidos.
8. **Nombres limpios.** Al fusionar, el producto sobreviviente se renombra
   sin la temporada pegada (ej. "Real Madrid Local"), y temporada/versión
   pasan a vivir en sus variantes.

## Por qué no toca el backend crítico

Este diseño deja intactos `crear_pedido`, `pedido_items`, RLS y las reglas de
kardex (`movimientos_inventario`, `registrar_entrada`, costeo) porque siguen
operando sobre `variante_id` exactamente como hoy — para la RPC, una variante
de camisa con `version`/`temporada_id` es indistinguible de una variante de
talla simple. Los únicos cambios de backend son aditivos y de bajo riesgo,
en el mismo estilo que ya se usó para sumar `imagenes` a variantes
(migración `2026-09-24-variante-imagenes.sql`): columnas nuevas nullable +
el mismo patrón en los dos RPCs de sincronización/import.

## Modelo de datos

### `categorias`

- El `check` de `tipo` gana `'temporada'`: `check (tipo in ('cat','subcat','talla','genero','temporada'))`.
- Filas de ejemplo: `{tipo:'temporada', valor:'24/25', orden:1}`,
  `{tipo:'temporada', valor:'25/26', orden:2}`, etc. — compartidas por todos
  los clubes/kits, sin jerarquía de padre.

### `producto_variantes`

| Columna | Tipo | Notas |
|---|---|---|
| `version` | text null | `check (version in ('fan','jugador'))`; null = producto sin eje de versión (todo lo que no es camisa de temporada, igual que hoy) |
| `temporada_id` | uuid null | FK → `categorias(id)`; null = sin eje de temporada |

- **Índice único:** el `unique (producto_id, nombre)` actual se reemplaza por
  uno que incluya los ejes nuevos (vía `coalesce`, porque Postgres no
  considera iguales dos `null`): el builder resuelve la expresión exacta al
  escribir la migración.
- `nombre` sigue siendo la talla cuando `version`/`temporada_id` están
  presentes (ej. `"M"`), igual que en el modelo de un eje.

### RPCs

- `sync_producto_variantes` e `importar_productos_variantes`: agregan
  `version` y `temporada_id` al insert/upsert, mismo patrón que la columna
  `imagenes`. Sin cambios de firma visibles para `crear_pedido` ni para el
  checkout.

## Tipos y lógica pura (`lib/store/`)

- `ProductoVariante` (en `types/index.ts`) gana `version: 'fan' | 'jugador' | null` y `temporada_id: string | null`.
- `StoreVariante` (en `types/store.ts`) gana los mismos dos campos, más una
  `temporada: { id, etiqueta, orden } | null` ya resuelta (join con
  `categorias`) para no repetir el join en cada componente.
- **Nuevas funciones puras en `lib/store/variantes.ts`, con tests:**
  - `tieneEjesTemporada(variantes)` → true si alguna variante trae
    `version`/`temporada_id` (decide si la ficha usa el selector de 3 ejes o
    el dropdown plano de hoy).
  - `versionesDisponibles(variantes)` y `temporadasDisponibles(variantes, version)`
    → valores únicos presentes, ordenados por `categorias.orden`.
  - `tallasDisponibles(variantes, version, temporadaId)` → tallas de esa
    combinación exacta.
  - `resolverVariante(variantes, version, temporadaId, talla)` → la fila
    exacta o `undefined` si esa combinación no existe (no todas tienen que
    existir — ver decisión 5).

## Tienda pública (`components/store/ProductDetail.tsx`)

- Si `tieneEjesTemporada` es true: tres filas de chips (Versión, Temporada,
  Talla) en vez del dropdown/botonera actual. Elegir Versión o Temporada
  recalcula qué Tallas están disponibles (y oculta las que no existen para
  esa combinación, no solo las agotadas). Precio e imagen grande se
  actualizan con `resolverVariante` al vuelo, sin recargar — el mockup
  aprobado por el dueño (artifact de la conversación) es la referencia visual
  exacta.
- Si es false (cualquier otra categoría, o una camisa sin migrar todavía):
  la ficha se comporta exactamente igual que hoy.
- `ProductCard` / listados: sin cambios de lógica — `stockEfectivo` y
  "Desde L. X" ya operan sobre el array de variantes sin que les importe de
  dónde salió cada una.

## Admin de categorías (`app/admin/categorias/CategoriasClient.tsx` / `actions.ts`)

- El array `TIPOS` hardcodeado (`['cat','subcat','talla','genero']`) gana
  `'temporada'` — la pantalla ya es dinámica sobre ese array, así que no hace
  falta ninguna pestaña o vista nueva, solo este valor. Las temporadas
  iniciales conocidas (23/24, 24/25, 25/26, 26/27...) se insertan una vez por
  SQL en la fase de BD; de ahí en adelante se agregan desde esta misma
  pantalla (una vez al año, cuando sale la temporada nueva).

## Admin (`app/admin/productos/[id]/ProductoFichaView.tsx`)

- Para productos de categoría Camisas Deportivas, la sección "Variantes"
  gana dos columnas editables (Versión, Temporada — esta última como select
  contra `categorias` tipo `temporada`) junto a las columnas existentes
  (talla en `nombre`, sku, precio, stock, imágenes, activo).
- Atajo de captura: botón "aplicar precio/imágenes a toda la temporada" que
  solo rellena los mismos valores en las filas de esa combinación — sigue
  siendo una convención de captura, no una regla de base de datos (decisión 4).
- Para el resto de categorías, el formulario no cambia.

## Round-trip Excel (herramienta B)

- La pestaña "Variantes" gana dos columnas opcionales `version` y
  `temporada` (texto, se resuelve contra `categorias` al importar); vacío =
  no aplica ese eje, mismo contrato de "vacío = no cambia" que ya rige todo
  el round-trip.
- **Temporada que no matchea ninguna fila existente de `categorias`:** se
  **rechaza la fila** con error `{fila, motivo}` — no se auto-crea una
  temporada nueva desde un import. Mismo criterio estricto que ya usa
  `inventoryRoundtrip.ts` para el resto de referencias (todo-o-nada,
  validación atómica); una temporada nueva se da de alta primero en el admin
  de categorías.

## Migración de datos existentes

1. **Reporte de candidatos:** agrupar `productos` activos de Camisas
   Deportivas por nombre normalizado (quitar `TEMP.\s*\d{2}/\d{2}` y
   patrones de año/temporada sueltos) + misma `categoria_id`/`subcategoria_id`.
   Salida: lista de grupos con sus productos, precios y tallas/variantes
   actuales, para revisión humana — nada se toca todavía.
2. **Aprobación por grupo:** el dueño confirma qué grupos son de verdad
   "misma camisa, otra temporada" (fusionar) y cuáles son diseños distintos
   que deben quedarse separados.
3. **Por cada grupo aprobado:**
   - Se elige un producto sobreviviente (o se crea uno limpio) y se renombra
     sin la temporada pegada.
   - Las tallas/variantes de cada producto del grupo se migran a variantes
     del sobreviviente con `version = 'fan'` (no existía el eje antes; se
     asume Fan salvo que el dueño indique lo contrario para algún caso) y
     `temporada_id` según su temporada de origen. **Esto incluye las
     variantes que ya tuviera el propio sobreviviente antes de la fusión**
     (si venía de los 38 productos sin migrar, o si ya tenía variantes de
     talla sin eje): también se les asigna `temporada_id` (la del
     sobreviviente) y `version = 'fan'`, para que ninguna variante de la
     ficha final quede sin esos dos ejes — una variante huérfana rompería el
     selector de 3 pasos en esa misma ficha.
   - El stock que tenían se transfiere con un movimiento de
     `movimientos_inventario` (salida del producto viejo, entrada al nuevo),
     nunca escribiendo el stock directo, igual que exige CLAUDE.md.
   - Los productos del grupo que no sobreviven quedan `activo = false` (no se
     borran) — su historial de pedidos sigue íntegro.
4. **Productos de Camisas Deportivas sin variantes (38 hoy):** aparte de la
   fusión por temporada, se migran sus tallas sueltas (`tallas text[]`) a
   `producto_variantes` uno por uno (sin eje de temporada si nunca la
   tuvieron), terminando la adopción del mecanismo que ya existe.

## Manejo de errores y casos límite

- Sin esa combinación exacta en `producto_variantes` ⇒ no es un error, el
  chip de esa talla/temporada simplemente no aparece (ver decisión 5).
- Checkout: sin cambios — sigue validando por `variante_id`, que ya
  identifica la combinación completa.
- Carritos guardados en `localStorage` antes de este cambio: siguen siendo
  válidos, `normalizeStoredCart` ya los trata como "con variante" por
  `varianteId`, sin que le importen los ejes nuevos.

## Testing

- Funciones nuevas de `lib/store/variantes.ts` con tests Vitest (grupos,
  disponibilidad, resolución de combinación).
- Migración (constraint único, columnas nuevas, check de `categorias`) se
  prueba en el SQL Editor de Supabase antes del push, igual que toda
  migración de este proyecto.
- Por fase: `npm test` + `npx tsc --noEmit` (toca Server Actions/tipos) +
  build.

## Fases de entrega sugeridas

1. **BD:** columnas nuevas + tipo `temporada` en `categorias` + RPCs
   extendidos (sin tocar la tienda todavía — no rompe nada en producción).
2. **Admin:** sección de variantes con Versión/Temporada para Camisas
   Deportivas; aquí es donde se puede empezar a cargar datos reales.
3. **Reporte + migración aprobada:** grupos de duplicados fusionados uno por
   uno con aprobación explícita, más los 38 productos sin variante migrados.
4. **Tienda:** selectores de 3 ejes en `ProductDetail`.
5. **Excel round-trip:** columnas nuevas en la pestaña Variantes.

## Pendiente para quien implemente

- Expresión exacta del índice único de `producto_variantes` (con `coalesce`
  sobre los ejes nullable).
- Mecanismo concreto para generar el reporte de grupos candidatos (script
  puntual contra Supabase vs. query ad-hoc) — no requiere nueva
  infraestructura, es de un solo uso.
- Redacción exacta del selector de temporada en el admin (dropdown simple
  vs. buscable) — detalle de UI sin impacto arquitectónico.
