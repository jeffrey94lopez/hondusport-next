# Diseño — C: Mapeo de columnas (import de plantilla externa)

**Fecha:** 2026-07-15
**Sub-proyecto:** C (de la mejora de herramientas de inventario; A y B ya desplegados).
**Objetivo:** importar una plantilla `.xlsx` de otro programa (POS) sin depender de nombres
de columna fijos: el admin sube el archivo, se muestran sus columnas y elige qué columna
corresponde a cada campo de la plataforma; luego se agrupa, valida, previsualiza e importa
(creando/actualizando) reutilizando el motor de escritura de B.

## Alcance

- **Incluye:** wizard de importación con mapeo de columnas, auto-sugerencia de mapeo,
  recuerdo del último mapeo, agrupación por SKU, preview con resumen/errores, y aplicación
  atómica reutilizando el `upsert` de B.
- **Reemplaza y elimina el legacy:** se borran `app/api/import/route.ts` y `lib/xlsx-parser.ts`
  (el import de formato fijo). C es el nuevo import de plantillas externas.
- **No incluye:** variantes padre/hijo con stock/precio por variante → sub-proyecto D
  (aplazado). Imágenes (se gestionan en la UI).

## Decisiones tomadas

1. **Casar por SKU.** Existe un producto con ese SKU → se actualiza; si no → se crea.
2. **Estructura de la plantilla: SKU por producto.** Todas las variantes de un producto
   comparten el mismo SKU. Se **agrupa por SKU**: suma stock, une tallas/colores; para
   escalares (nombre/precio/marca/categoría…) se toma el **primer valor no vacío**.
3. **Comodidades:** auto-sugerir mapeo por nombre de columna; recordar el último mapeo (en
   `configuracion`); **preview** antes de aplicar.
4. **Obligatorio mapear:** `sku` (llave de agrupar/casar), `nombre`, `precio` (> 0). Resto opcional.
5. **Celda vacía / campo no mapeado:** en actualización = *no cambia*; en alta = null/default.
   Nunca borra.
6. **Import atómico:** si algún grupo tiene error, no se escribe nada; el preview/commit lista
   todos los errores.
7. **UI:** modal wizard desde la barra de Productos (subir → mapear → preview → confirmar).
8. **Legacy:** se borra (`app/api/import`, `lib/xlsx-parser.ts`).

## Flujo (modal wizard)

Botón **"Importar plantilla"** en `/admin/productos` → modal con pasos:

1. **Subir** `.xlsx`. El cliente lo envía a `POST /api/inventario/plantilla/columnas`, que
   devuelve los encabezados + sugerencia + último mapeo guardado.
2. **Mapear**: tabla con una fila por campo de la plataforma y un `<select>` de las columnas
   del archivo (o "— ninguna —"). Precargado con la auto-sugerencia y, por encima, el mapeo
   guardado (solo entradas cuya columna exista en este archivo).
3. **Preview**: se envía archivo + mapeo a `POST /api/inventario/plantilla/importar` con
   `confirmar=false`. Devuelve resumen (`{ crear, actualizar, conError }`), lista de errores
   `{ fila|sku, motivo }` y una muestra de grupos.
4. **Confirmar**: mismo endpoint con `confirmar=true`. Si no hay errores, aplica (atómico) y
   guarda el mapeo. Devuelve `{ success, creados, actualizados }`.

## Endpoints

- `POST /api/inventario/plantilla/columnas` (auth) → lee la primera hoja del `.xlsx`, devuelve
  `{ columnas: string[], sugerencia: Mapeo, guardado: Mapeo | null }`.
- `POST /api/inventario/plantilla/importar` (auth) → body: archivo + `mapeo` (JSON) + `confirmar`.
  Relee productos + categorías de la BD (frontera de confianza), agrupa, valida:
  - `confirmar=false` → devuelve preview (sin escribir).
  - `confirmar=true` y `errores.length === 0` → aplica en un solo `upsert` por `id` y hace
    `upsert` del mapeo en `configuracion`. Si hay errores → 422 con la lista.

## Lógica pura (`lib/store/externalImport.ts`, con tests)

- **`type Mapeo = Partial<Record<CampoPlataforma, string>>`** — campo destino → nombre de
  columna externa. `CampoPlataforma` = `sku | nombre | precio | precio_original | stock |
  descripcion | categoria | subcategoria | genero | badge | marca | talla | color |
  personalizable | activo`.
- **`sugerirMapeo(columnas: string[]): Mapeo`** — empareja por nombre normalizado contra
  alias por campo (ej. `precio_venta→precio`, `nombre_producto→nombre`, `cbarras|codigo→sku`,
  `existencia→stock`, `tamano→talla`, `is_active→activo`, `nombre_categoria→categoria`,
  `vnombresubcategoria→subcategoria`, `descripcion_producto→descripcion`).
- **`agruparPorSku(rows, mapeo): GrupoProducto[]`** — agrupa por el valor de la columna SKU
  mapeada; suma `stock` (numérico), une `talla`/`color` en conjuntos, primer no-vacío para
  escalares; conserva los números de fila origen para el reporte. Filas sin SKU → error de
  grupo. Filas totalmente vacías se ignoran.
- **`parseExternalImport(grupos, mapeo, ctx): { updates, creates, errors, resumen }`** —
  casa cada grupo por SKU contra `ctx.existentes`:
  - existe → `update` con el `id` del existente; opcionales vacíos/no-mapeados = valor actual
    (merge); `slug` se conserva.
  - no existe → `create`; `slug` con `slugify/uniqueSlug`; opcionales vacíos = null/default
    (`activo=true`, `personalizable=false`, `stock=null`).
  - valida `nombre`/`precio(>0)`; resuelve `categoria`/`subcategoria` por nombre (deben
    existir; subcat debe pertenecer a la categoría efectiva).
  - `resumen = { crear, actualizar, conError }`.
- **Refactor DRY:** extraer de `inventoryRoundtrip.ts` a helpers compartidos la resolución de
  categoría/subcat y el armado de `ProductoData`, reutilizados por B y C. Reutiliza también
  `cellText/parseNum/splitList/normNombre` y `slug`.

## Escritura y persistencia

- Aplica como B: un solo `supabase.from('productos').upsert(payload, { onConflict: 'id' })`
  con updates (id del SKU existente) + creates (UUID nuevo). Preserva columnas fuera del
  Excel (`imagenes`, `oferta_fin`, `rating`, `created_at`).
- Guarda el mapeo al confirmar: `upsert` en `configuracion` con clave `import_plantilla_mapeo`
  y `value = JSON.stringify(mapeo)`.

## UI

- Botón "Importar plantilla" en la barra de `/admin/productos`, junto a "Descargar inventario"
  e "Importar inventario".
- Componente nuevo `components/admin/ImportarPlantilla.tsx` (wizard) reutilizando `Modal`.
- Reporte de errores y resumen en el propio modal (paso preview). Tras confirmar con éxito,
  refresca la lista.

## Manejo de errores

- Sin SKU mapeado / columna SKU inexistente → error de configuración (antes de agrupar).
- Grupo sin nombre o precio inválido, categoría/subcat inexistente → error por grupo
  (`{ sku|fila, motivo }`).
- Import atómico: con ≥1 error no se escribe nada (422 en commit; preview los muestra).

## Pruebas y verificación

- Tests puros (`lib/store/tests/`) de `sugerirMapeo`, `agruparPorSku` (suma stock, unión de
  tallas/colores, primer no-vacío, filas sin sku/vacías) y `parseExternalImport` (casar por
  SKU, merge de opcionales, creación con slug, resolución de categoría/subcat, errores,
  atomicidad, resumen).
- Tests de los helpers compartidos tras el refactor DRY (que B siga verde).
- `npm test` + `npx tsc --noEmit` + `npm run build`.
- Verificación manual con el archivo real del POS (`Productos_2026-6-3.xlsx`): mapear,
  preview, y una importación acotada (con revert), como en B.

## Fuera de alcance

- Variantes padre/hijo con stock/precio por variante → sub-proyecto D.
