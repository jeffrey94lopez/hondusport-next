# Diseño — B: Round-trip de inventario en Excel

**Fecha:** 2026-07-15
**Sub-proyecto:** B (de la mejora de herramientas de inventario; A ya desplegado).
**Objetivo:** que el admin pueda descargar todo el inventario en un `.xlsx`, editarlo
fuera de línea (actualizar existentes y dar de alta nuevos), y re-subirlo para aplicar
los cambios de forma segura.

## Alcance

- **Incluye:** descarga del inventario a `.xlsx` con 3 pestañas; re-subida que actualiza
  productos existentes y crea nuevos; validación atómica con reporte de errores.
- **Reemplaza:** el botón "Importar XLSX" legacy (formato externo de nombres fijos) se
  retira de la UI. El round-trip pasa a ser el único import del panel.
- **No incluye (fuera de alcance):**
  - Import de plantillas externas con mapeo de columnas → **sub-proyecto C** (se apoyará
    en el motor de import de B).
  - Variantes padre/hijo con stock/precio por variante → **sub-proyecto D** (cambio de
    modelo de datos mayor; aplazado).
  - Imágenes y `oferta_fin` en el Excel (se gestionan en la UI).

## Modelo de datos relevante

Un producto = **una fila** en `productos`. `tallas` y `colores` son *conjuntos* (arreglos)
de opciones; `stock` es **un solo número total** (`null` = ilimitado). No hay stock ni
precio por variante. El round-trip respeta este modelo plano: una fila por producto,
tallas/colores separados por coma, stock total.

## Formato del archivo `.xlsx`

Tres pestañas:

### `Instrucciones` (guía para el humano, solo lectura)
- Qué hace cada pestaña.
- No tocar la columna `id`.
- Celda vacía en campo opcional = no cambia; obligatorios (`nombre`, `precio`) no pueden ir vacíos.
- Para desactivar/agotar: `activo=FALSO` o `stock=0`. Borrar una fila **no** elimina nada.
- Tallas/colores separados por coma. Categoría/subcategoría por nombre exacto.

### `Actualizar` (una fila por producto existente, precargada)

| Columna | Editable | Notas |
|---|---|---|
| `id` | ❌ (llave) | UUID real; no tocar |
| `sku` | ✅ | debe seguir siendo único |
| `nombre` | ✅ obligatorio | |
| `marca` | ✅ | |
| `precio` | ✅ obligatorio | > 0 |
| `precio_original` | ✅ | vacío = sin oferta |
| `stock` | ✅ | vacío = no cambia; `0` = agotado; número = existencias. Ilimitado (∞) se fija desde la UI |
| `descripcion` | ✅ | |
| `categoria` | ✅ | por nombre (`valor`); debe existir |
| `subcategoria` | ✅ | debe existir y colgar de esa categoría |
| `genero` | ✅ | texto |
| `badge` | ✅ | |
| `tallas` | ✅ | "S, M, L" (conjunto) |
| `colores` | ✅ | "Rojo, Azul" (conjunto) |
| `personalizable` | ✅ | VERDADERO/FALSO |
| `activo` | ✅ | VERDADERO/FALSO |

### `Nuevos` (mismas columnas, sin `id`)
Cada fila con datos = alta. `id` vacío o ausente.

### Variantes
Un producto con variantes es **una sola fila**: sus tallas van en `tallas` (separadas por
coma), sus colores en `colores`, y `stock` es el total combinado. No se modela stock por
talla (ver sub-proyecto D).

## Arquitectura (Enfoque A: funciones puras + un solo upsert)

La lógica de negocio vive en `lib/store/` como funciones puras y testeadas (convención del
proyecto). Las rutas/acciones leen la BD, llaman a las funciones puras y aplican.

### Descarga
- Botón **"Descargar inventario"** en `/admin/productos` → `GET /api/inventario/export`
  (Server, con auth como el import actual).
- La ruta lee **todos** los productos + categorías, llama a `buildInventoryWorkbook(productos, categorias)`
  (pura: arma las filas de las 3 pestañas), y devuelve el `.xlsx` como
  `inventario-YYYY-MM-DD.xlsx`.
- Parte pura y testeable: armado de filas (`productoARowInventario`). El escribir el
  workbook con `XLSX.utils` es capa fina.

### Re-subida (motor de import)
- Botón **"Importar inventario"** → `POST /api/inventario/import`.
- Flujo de la ruta: auth → leer pestañas `Actualizar` y `Nuevos` → leer de BD productos
  existentes (indexados por `id` y por `sku`) + categorías → llamar a `parseInventoryUpload(...)`.
- **`parseInventoryUpload({ actualizar, nuevos }, existentes, categorias)`** (pura, testeada)
  devuelve `{ updates, creates, errors }`:
  - Valida fila por fila:
    - Obligatorios presentes (`nombre`, `precio`), `precio` > 0.
    - Números válidos (`precio`, `precio_original`, `stock`).
    - Categoría/subcategoría existen (por `valor`) y la subcat cuelga de esa cat.
    - En `Actualizar`: el `id` existe en BD.
    - SKU único entre filas del archivo y contra la BD (para altas); una fila de `Nuevos`
      con un SKU ya existente es error.
  - Opcionales vacíos en `Actualizar` → conserva el valor actual (merge con el existente).
  - Genera slug para altas (`slugify`/`uniqueSlug`, preservando slugs existentes) y un UUID
    por alta.
- La ruta, **solo si `errors.length === 0`**, aplica `updates + creates` en un **único
  `upsert` keyed on `id`** → una sola sentencia, atómica de hecho. Si hay errores, no
  escribe nada y devuelve `errors: { fila, pestaña, motivo }[]`.

### Semántica de import (todo o nada)
- **Atómico:** si una sola fila es inválida, no se aplica nada; se reportan todos los errores.
- **Nunca destructivo desde blancos:** celda vacía en opcional no borra; borrar una fila del
  Excel no elimina el producto. Desactivar/agotar se hace con `activo`/`stock`.

## UI y reporte

- Barra de `/admin/productos`: quitar "Importar XLSX" (legacy); agregar "Descargar
  inventario" e "Importar inventario".
- Resultado del import en un **modal** (no `alert`):
  - Éxito: "✓ X actualizados, Y creados"; luego refresca la tabla.
  - Error: lista de filas rechazadas con pestaña, número de fila y motivo.
- **Legacy:** se retira el botón + `handleImport` viejo de `ProductosClient.tsx`.
  `app/api/import/route.ts` y `lib/xlsx-parser.ts` quedan sin uso pero **se dejan en el
  repo** (C los retomará como base para el mapeo de columnas).

## Componentes / archivos (previsión)

- `lib/store/inventoryRoundtrip.ts` — funciones puras: `buildInventoryWorkbook` /
  `productoARowInventario`, `parseInventoryUpload`, tipos de resultado y error.
- `lib/store/tests/inventoryRoundtrip.test.ts` — tests de las puras.
- `app/api/inventario/export/route.ts` — descarga.
- `app/api/inventario/import/route.ts` — re-subida.
- `app/admin/productos/ProductosClient.tsx` — botones + modal de resultado; quitar legacy.
- Componente de modal de resultado (reusar `components/admin/Modal`).

## Manejo de errores

- Import: validación atómica; ver arriba.
- Export: errores de auth/lectura → respuesta de error estándar como en `/api/import`.
- SKU duplicado, categoría inexistente, `id` inexistente, precio inválido, obligatorio
  vacío → cada uno como fila de `errors` con motivo legible en español.

## Pruebas y verificación

- Tests (`lib/store/tests/`) de las funciones puras, con foco en `parseInventoryUpload`:
  updates, creates, merge de opcionales, unicidad de SKU (archivo y BD), resolución de
  categoría/subcategoría, todos los casos de error, y atomicidad ("si hay 1 error, 0
  cambios").
- `npm test` + `npx tsc --noEmit` + `npm run build`.
- Verificación manual del round-trip real: descargar → editar (actualizar + alta) → subir
  con éxito; y un caso con errores para ver el reporte.

## Decisiones tomadas (resumen)

1. Llave de casado: `id` (UUID, columna bloqueada) + `sku` como campo editable.
2. Campos: completo sin imágenes (incluye categoría/subcat por nombre, tallas/colores por coma).
3. Celda vacía: opcional = no cambia (incluye `stock`; ilimitado se fija en la UI); obligatorio vacío = error. Nunca borra productos desde Excel.
4. Errores: **atómico** (todo o nada) con reporte de todas las filas inválidas.
5. UI: el round-trip reemplaza al import legacy; botones en la barra de Productos.
6. Motor: funciones puras + un solo `upsert` keyed on `id` (sin migración).
7. Variantes: fuera de alcance (sub-proyecto D).
