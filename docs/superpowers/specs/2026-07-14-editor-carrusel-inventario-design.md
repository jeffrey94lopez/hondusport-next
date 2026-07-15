# Proyecto A — Editor carrusel de inventario

**Fecha:** 2026-07-14
**Estado:** Diseño aprobado (pendiente revisión de spec)

## Contexto y problema

El admin de productos (`app/admin/productos`) hoy edita fila por fila: abrir modal,
guardar, cerrar, buscar la siguiente. Para pasar por muchos productos —completando
los que tienen datos faltantes o repasando un subconjunto— es lento y se pierde el
hilo. Se quiere un **modo carrusel**: elegir filtros, y editar los productos que
matchean uno por uno con "guardar y siguiente" hasta terminar.

Este es el **sub-proyecto A** de la mejora de inventario. Los otros dos (B:
round-trip Excel; C: mapeo de columnas) son independientes y van después.

## Objetivo

Un editor secuencial ("carrusel") que, a partir de filtros combinables, recorra los
productos que matchean y permita editarlos uno por uno de forma ágil, guardando cada
uno con el Server Action existente.

## Decisiones (del brainstorming)

- **Uso doble:** completar items incompletos *y* repaso general. Los filtros cubren
  ambos casos.
- **Guardar explícito:** "Guardar y siguiente" persiste y avanza; "Saltar" avanza sin
  guardar; "Anterior" retrocede. Contador de progreso. Aviso al avanzar con cambios
  sin guardar.
- **Campos:** subconjunto rápido por defecto (categoría/subcat, imagen, precio, stock,
  descripción) + "Ver más" que despliega el resto. Se reutiliza el formulario del
  editor actual extrayéndolo a un componente compartido.
- **Filtros:** *Faltantes* (sin categoría/imagen/descripción/precio/SKU),
  *Categoría/subcat/género*, *Stock* (bajo/sin stock) y *estado* (activo/inactivo).
  Sin filtro por marca.
- **Escritura:** reutiliza `updateProducto` (frontera de confianza intacta). No se
  crea una ruta de escritura nueva.
- **Set estable:** la lista se congela al pulsar "Empezar" (snapshot); los guardados
  se marcan con ✓; toggle opcional "ocultar ya guardados".

## Fuera de alcance

- Edición masiva simultánea y export/import Excel (sub-proyectos B y C).
- Crear productos nuevos (el carrusel solo **actualiza** existentes; las altas siguen
  por el modal "Nuevo producto" actual).
- Filtro por marca.

## Arquitectura

### 1. Lógica pura de filtros — `lib/store/inventoryFilters.ts` (+ tests)

Funciones puras sobre `Producto` (el tipo de BD, que trae `categoria_id`,
`imagenes`, `descripcion`, `precio`, `sku`, `stock`, `activo`, `genero`,
`subcategoria_id`):

```ts
export interface CriteriosInventario {
  // Faltantes (cada uno opcional; true = exigir que falte)
  sinCategoria?: boolean
  sinImagen?: boolean
  sinDescripcion?: boolean
  sinPrecio?: boolean
  sinSku?: boolean
  // Pertenencia (arrays de IDs / valores; vacío o ausente = sin restricción)
  categoriaIds?: string[]
  subcategoriaIds?: string[]
  generos?: string[]
  // Stock / estado
  stockBajo?: boolean      // 0 < stock < UMBRAL_STOCK_BAJO
  sinStock?: boolean       // stock == 0 o null
  activo?: boolean         // true=solo activos, false=solo inactivos, undefined=ambos
}

export const UMBRAL_STOCK_BAJO = 5

export function sinCategoria(p: Producto): boolean       // !p.categoria_id
export function sinImagen(p: Producto): boolean          // (p.imagenes ?? []).filter(Boolean).length === 0
export function sinDescripcion(p: Producto): boolean     // !(p.descripcion ?? '').trim()
export function sinPrecio(p: Producto): boolean          // !p.precio || p.precio <= 0
export function sinSku(p: Producto): boolean             // !(p.sku ?? '').trim()

export function filtrarInventario(
  productos: Producto[],
  criterios: CriteriosInventario,
): Producto[]
```

Semántica de `filtrarInventario`: un producto pasa si cumple **todos** los criterios
activos (AND entre dimensiones). Dentro de "faltantes", cada flag activo se exige
(AND) — p.ej. `sinCategoria && sinImagen` = productos que no tienen ni categoría ni
imagen. Las dimensiones de pertenencia con array no vacío exigen `includes`. `stockBajo`
y `sinStock` juntos = stock bajo **o** sin stock (OR dentro de "stock"). `activo`
filtra por estado si está definido.

### 2. Componente de campos compartido — `components/admin/ProductoFields.tsx`

Extraer los campos del formulario que hoy están inline en `ProductosClient.tsx` a un
componente controlado reutilizable:

```tsx
interface ProductoFieldsProps {
  form: ProductoForm
  setForm: React.Dispatch<React.SetStateAction<ProductoForm>>
  categorias: { id: string; valor: string }[]
  subcategorias: Pick<Categoria, 'id' | 'valor' | 'categorias_padre'>[]
  modo?: 'completo' | 'rapido'  // 'rapido' muestra solo el subconjunto
}
```

- `modo='completo'`: todos los campos (comportamiento actual del modal).
- `modo='rapido'`: solo categoría/subcat, imagen, precio, stock, descripción.
- Incluye la lógica de `handleNombreChange` (autogenerar slug) y
  `subcategoriasDisponibles` (subcats del `categoria_id`), que hoy viven en
  `ProductosClient`.
- `ProductosClient` pasa a **consumir** este componente en su modal (`modo='completo'`),
  sin cambiar su comportamiento.

### 3. Ruta y pantalla del carrusel

- `app/admin/productos/carrusel/page.tsx` (server component): carga `productos`,
  `categorias`, `subcategorias` con las mismas queries que `app/admin/productos/page.tsx`,
  y renderiza `CarruselClient`.
- `app/admin/productos/CarruselClient.tsx` (client):
  - **Estado inicial:** panel de filtros (checkboxes de faltantes, selects de
    categoría/subcat/género, checkboxes de stock/estado). Botón "Empezar".
  - **Al empezar:** `const set = filtrarInventario(productos, criterios)` → snapshot en
    estado. Índice actual = 0.
  - **Tarjeta:** `ProductoFields` en `modo='rapido'` + botón "Ver más" que cambia a
    `modo='completo'` para esa tarjeta. El form se inicializa desde el producto actual
    (misma construcción que `openEdit`).
  - **Navegación:** "Guardar y siguiente" (llama `updateProducto(id, form)`, marca ✓,
    avanza), "Saltar" (avanza sin guardar), "Anterior". Si hay cambios sin guardar y se
    intenta avanzar → `confirm()` de aviso.
  - **Contador** `actual/total` y set de ids guardados (para ✓). Toggle "ocultar ya
    guardados" (filtra visualmente el recorrido).
  - **Fin:** en el último item, "Guardar y siguiente" muestra un resumen (guardados,
    saltados) con enlace de volver a `/admin/productos`.
- **Entrada:** botón "Modo carrusel" en la barra de acciones de `ProductosClient`
  (link a `/admin/productos/carrusel`).

### 4. Escritura

Se reutiliza `updateProducto(id, form)` de `app/admin/productos/actions.ts` tal cual.
No se añade Server Action nueva. Cada "Guardar y siguiente" es una llamada; se muestra
estado de guardando y errores por tarjeta (igual que el modal actual).

## Modelo de datos

Sin cambios de esquema. Solo lectura de `productos`/`categorias` y escritura vía el
Server Action existente.

## Estrategia de pruebas

- **Unitarias (Vitest, `lib/store/tests/inventoryFilters.test.ts`):**
  - Cada predicado de faltante (`sinCategoria`, `sinImagen`, `sinDescripcion`,
    `sinPrecio`, `sinSku`) con casos límite (`''`, `null`, `0`, array de strings vacíos
    `['']` para imágenes).
  - `filtrarInventario`: AND entre dimensiones; combinación de dos faltantes; filtro por
    `categoriaIds`; `stockBajo`/`sinStock` (OR); `activo` en sus tres estados.
- **Manual:** entrar al carrusel, aplicar filtros (faltantes + categoría), editar y
  "Guardar y siguiente", "Saltar", "Anterior", aviso de cambios sin guardar, y resumen
  final. Verificar que el modal de "Nuevo/Editar" del admin sigue funcionando tras
  extraer `ProductoFields`.
- El carrusel y el Server Action no se testean por convención (Server Actions/UI no
  cubiertos); se verifican con `npx tsc --noEmit` y `npm run build`.

## Riesgos

- **Regresión al extraer `ProductoFields`:** el modal actual debe seguir idéntico. Se
  mitiga con prueba manual del modal y `tsc`/`build`; el diff del refactor se revisa con
  cuidado.
- **Set desactualizado:** al guardar, un producto puede dejar de cumplir el filtro
  (p.ej. se le añadió categoría). El snapshot lo mantiene en el recorrido con ✓; no se
  recalcula el set en caliente (decisión deliberada para que el contador no salte).
