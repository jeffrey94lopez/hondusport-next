# Hondusport — Rediseño CMS y Estructura de Datos

**Fecha:** 2026-05-18  
**Estado:** Aprobado  
**Stack:** Google Sheets + n8n + Vanilla JS + PHP (Hostinger cPanel)

---

## Contexto y Problemas a Resolver

1. **Organización de productos en Sheets**: demasiadas columnas confusas, campos usados en el frontend que el n8n no mapea (`precio_original`, `oferta_fin`, `personalizable`), imágenes limitadas a 3 columnas fijas.
2. **Opciones de envío**: solo 2 métodos hardcodeados (delivery/pickup), no se puede desactivar el envío gratis, no se pueden agregar más opciones (ej: envío ciudad, envío otras ciudades, retiro en tienda).
3. **Imágenes**: depende de ImageBB externo, Google Drive no funciona de forma confiable para imágenes públicas, `img/img2/img3` limita a 3 fotos por producto.
4. **Sin panel de administración**: todo se edita directamente en el sheet sin interfaz visual, se perdió el mapa de qué controla cada configuración.

**Restricciones:** Sin tecnologías nuevas. El stack se mantiene: Google Sheets, n8n, Vanilla JS, y se agrega PHP (ya disponible en Hostinger cPanel).

---

## Arquitectura General

```
Google Sheets (base de datos)
       ↕
    n8n workflows
   /            \
GET webhook      POST webhook
(leer datos)    (escribir datos)
       ↕               ↕
   Frontend JS    Panel Admin (HTML + PHP)
   hondusport      admin-hs/
                  (sube imágenes a Hostinger)
```

---

## 1. Rediseño de Hojas de Google Sheets

### 1.1 Hoja `Productos`

Reemplaza las columnas actuales. Columnas eliminadas: `img`, `img2`, `img3`, `oferta_horas`, `visitas`.

| Columna | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | Número | ✅ | Único por producto |
| `nombre` | Texto | ✅ | Nombre visible al cliente |
| `precio` | Número | ✅ | Precio actual de venta |
| `precio_original` | Número | ❌ | Dejar vacío si no hay descuento |
| `stock` | Número | ❌ | Vacío = sin límite de stock |
| `cat` | Texto | ✅ | Debe coincidir con un valor en Filtros tipo=cat |
| `genero` | Texto | ❌ | Hombre / Mujer / Unisex |
| `badge` | Texto | ❌ | Oferta / Nuevo / Más Vendido / (vacío) |
| `descripcion` | Texto | ❌ | Descripción larga del producto |
| `personalizable` | TRUE/FALSE | ❌ | TRUE = permite agregar nombre/número bordado |
| `oferta_fin` | Fecha/hora | ❌ | Fecha límite para countdown — vacío = sin countdown |
| `rating` | Número 1-5 | ❌ | Default 5 si se deja vacío |
| `imagenes` | Texto | ✅ | URLs separadas por coma, generadas por el panel admin |
| `activo` | TRUE/FALSE | ✅ | FALSE = ocultar producto sin borrarlo |

### 1.2 Hoja `Envios` (nueva)

Reemplaza las config keys `costo_envio`, `pickup_activo`, `pickup_descuento`, `pickup_direccion`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | Número | Único |
| `nombre` | Texto | Visible al cliente — ej: "Envío en Tegucigalpa" |
| `descripcion` | Texto | Texto adicional — ej: dirección de retiro, zona de cobertura |
| `tipo` | Texto | `delivery` (requiere dirección) o `pickup` (solo nombre/teléfono) |
| `costo` | Número | Costo en lempiras. 0 = gratis |
| `descuento` | Número | % de descuento extra al elegir esta opción (útil para pickup) |
| `activo` | TRUE/FALSE | Desactivar sin borrar |

**Ejemplo de filas:**
```
1 | Envío en Tegucigalpa    | Entrega en 24-48h   | delivery | 80  | 0  | TRUE
2 | Envío a otras ciudades  | Entrega en 3-5 días | delivery | 150 | 0  | TRUE
3 | Retiro en tienda        | Col. Palmira #14    | pickup   | 0   | 10 | TRUE
```

### 1.3 Hoja `Filtros` (mejorada)

Agrega columnas `categorias`, `imagen`, `orden`. El n8n actualmente no mapea estos campos — se corrige.

| Columna | Tipo | Notas |
|---|---|---|
| `tipo` | Texto | `cat`, `subcat`, `talla`, `genero` |
| `valor` | Texto | Visible al cliente — ej: S, M, 38, Camisetas |
| `categorias` | Texto | Para tallas y subcats: categorías a las que aplica (separadas por coma) |
| `imagen` | Texto | Solo para tipo=cat: URL imagen para la galería de categorías |
| `orden` | Número | Orden de aparición en página |
| `activo` | TRUE/FALSE | Desactivar sin borrar |

**Ejemplo:**
```
cat    | Camisetas      |              | https://...jpg | 1 | TRUE
cat    | Zapatillas     |              | https://...jpg | 2 | TRUE
subcat | Manga corta    | Camisetas    |                | 1 | TRUE
subcat | Running        | Zapatillas   |                | 1 | TRUE
talla  | S              | Camisetas    |                | 1 | TRUE
talla  | M              | Camisetas    |                | 2 | TRUE
talla  | 38             | Zapatillas   |                | 1 | TRUE
genero | Hombre         |              |                | 1 | TRUE
genero | Mujer          |              |                | 2 | TRUE
```

### 1.4 Hoja `Config` — keys adicionales

Agregar estas dos filas nuevas:

```
free_shipping_activo  | TRUE   ← FALSE para desactivar barra de envío gratis
cupones_popup_activo  | TRUE   ← FALSE para desactivar el popup de cupones
```

Las config keys `costo_envio`, `pickup_activo`, `pickup_descuento`, `pickup_direccion` quedan **deprecadas** — reemplazadas por la hoja `Envios`. Pueden eliminarse de la hoja Config una vez que app.js esté actualizado y verificado.

### 1.5 Hoja `📖 Guia` (nueva, solo lectura)

Hoja informativa dentro del mismo spreadsheet con una tabla de todas las config keys, su descripción y valores permitidos. Sirve como referencia permanente para no perder el mapa de configuraciones.

---

## 2. Cambios en n8n

### 2.1 Workflow existente — `hondusport-products` (GET)

**Nodo `Transform Data` — correcciones:**

- **Productos**: agregar mapeo de `precio_original`, `personalizable`, `oferta_fin`, `rating`, `activo`. Cambiar `imgs` para que se construya desde la columna `imagenes` (split por coma) en vez de `img/img2/img3`.
- **Filtros**: agregar mapeo de `categorias`, `imagen`, `orden`. Renombrar `categoria`/`parent` a `categorias` para consistencia.
- **Nuevo**: agregar fetch de hoja `Envios` y devolverlo en `data.envios`.
- **Config**: los campos deprecados de envío (`costo_envio`, etc.) siguen enviándose por compatibilidad pero el frontend los ignorará.

**Respuesta JSON final:**
```json
{
  "data": {
    "products": [...],
    "config": {...},
    "banners": [...],
    "cupones": [...],
    "filtros": [...],
    "envios": [...]
  }
}
```

### 2.2 Workflow nuevo — `hondusport-admin` (POST)

Webhook que recibe escrituras desde el panel admin y actualiza Google Sheets.

**Request format:**
```json
{
  "sheet": "Productos",
  "action": "update",
  "id": 5,
  "data": { "precio": 350, "stock": 10 }
}
```

**Acciones soportadas:**
- `create` — agrega fila nueva al sheet especificado
- `update` — encuentra la fila por `id` y actualiza los campos en `data`
- `delete` — elimina la fila con ese `id`

**Sheets soportados:** `Productos`, `Filtros`, `Envios`, `Cupones`, `Banners`

El workflow usa un nodo Switch por `sheet`, luego un nodo Google Sheets con operación Append o Update según `action`.

---

## 3. Cambios en app.js (Frontend)

### 3.1 Imágenes
- `p.imgs` se construye desde `p.imagenes.split(',').map(u => u.trim()).filter(Boolean)` en vez de `[p.img, p.img2, p.img3]`
- `p.img` (imagen principal) = `p.imgs[0]`

### 3.2 Envíos dinámicos
- Eliminar variables globales `COSTO_ENVIO`, `PICKUP_ACTIVO`, `PICKUP_DESCUENTO`, `PICKUP_DIRECCION`
- Nueva variable global `ENVIOS = []` cargada desde `data.envios`
- Los botones de selección de envío se renderizan dinámicamente desde `ENVIOS` (en vez de botones fijos en el HTML)
- `selectShipping(envioId)` reemplaza a `selectDelivery(method)`
- Si `tipo === 'delivery'` → mostrar campos de dirección. Si `tipo === 'pickup'` → mostrar solo nombre/teléfono/email
- Cálculo del total: `costo = envio.costo`, `descuento += subtotal * (envio.descuento / 100)`

### 3.3 Envío gratis
- Solo mostrar barra de envío gratis si `data.config.free_shipping_activo === 'TRUE'`
- Si está inactivo, ocultar completamente la barra y el toast

### 3.4 Popup de cupones
- Solo mostrar popup exit-intent si `data.config.cupones_popup_activo === 'TRUE'`

### 3.5 Filtros
- Usar `f.categorias` (en vez de `f.categoria || f.parent`) para relacionar tallas y subcats con categorías
- Respetar `f.orden` para ordenar los botones de filtro
- Mostrar imágenes de categorías desde `f.imagen`

---

## 4. Panel Admin CMS (`/admin-hs/`)

### 4.1 Archivos

```
/admin-hs/
├── index.html          ← login con contraseña
├── dashboard.html      ← layout principal con sidebar
├── productos.html      ← gestión de productos
├── filtros.html        ← categorías, subcategorías, tallas, géneros
├── envios.html         ← opciones de envío
├── cupones.html        ← cupones de descuento
├── banners.html        ← banners del hero
├── upload.php          ← recibe imagen, la guarda en /imgs/
├── delete.php          ← elimina imagen del servidor
├── list-imgs.php       ← lista imágenes de /imgs/{tipo}/{id}/
├── config.php          ← contraseña del panel (no expuesta al frontend)
└── /imgs/
    ├── /productos/{id}/
    └── /banners/
```

### 4.2 Autenticación

Contraseña simple almacenada en `config.php`. El login guarda una cookie de sesión. Sin sistema de usuarios — es un panel de uso personal.

### 4.3 Secciones del panel

**📦 Productos**
- Tabla con foto principal, nombre, precio, stock, badge, estado activo/inactivo
- Buscador por nombre, filtro por categoría
- Crear producto nuevo (formulario completo)
- Editar producto: todos los campos de la hoja `Productos`
- Imágenes: subir (drag & drop o file picker), ver las existentes, eliminar por foto
- Botón "Copiar URLs" — copia `imagenes` separadas por coma al portapapeles
- Botón "Guardar imágenes en sheet" — POST al webhook de n8n, actualiza columna `imagenes`
- Guardar cambios de producto → POST al webhook, actualiza todas las columnas

**🏷️ Categorías & Tallas**
- Pestañas: Categorías / Subcategorías / Tallas / Géneros
- Tabla con valor, categorías que aplica, orden, activo
- Agregar fila nueva, editar, activar/desactivar, eliminar
- Para subcats y tallas: selector de a qué categorías aplica
- Guardar → POST webhook → actualiza hoja `Filtros`

**🚚 Envíos**
- Lista de opciones con nombre, costo, tipo, descuento, estado
- Crear, editar, activar/desactivar en un clic
- Toggle separado "Envío gratis activo" → actualiza `free_shipping_activo` en Config
- Guardar → POST webhook → actualiza hoja `Envios`

**🎟️ Cupones**
- Lista con código, descuento %, estado
- Crear, desactivar, eliminar
- Toggle "Popup de cupones activo" → actualiza `cupones_popup_activo` en Config
- Guardar → POST webhook → actualiza hoja `Cupones`

**🖼️ Banners**
- Vista previa visual de cada banner con su imagen, título y subtítulo
- Editar texto, URL del botón
- Subir imagen del banner (va a `/imgs/banners/`)
- Guardar → POST webhook → actualiza hoja `Banners`

### 4.4 Imágenes — especificaciones PHP

- Formatos aceptados: JPG, PNG, WEBP
- Tamaño máximo: 2MB por archivo (configurable en `config.php`)
- Renombrado automático: `{id}-{timestamp}.{ext}` para evitar colisiones
- Ruta de almacenamiento: `/admin-hs/imgs/productos/{id}/` y `/admin-hs/imgs/banners/`
- URLs resultantes: `https://tudominio.com/admin-hs/imgs/productos/{id}/filename.jpg`

---

## 5. Secuencia de Implementación

1. Rediseñar hojas de Google Sheets (estructura nueva + hoja Envios + hoja Guia)
2. Actualizar nodo Transform Data en n8n (mapeos corregidos + envios)
3. Crear workflow n8n `hondusport-admin` (POST de escritura)
4. Actualizar `app.js`: imágenes desde `imagenes`, envíos dinámicos, toggles de envío gratis y popup
5. Construir panel admin: PHP (upload/delete/list) + HTML/JS (todas las secciones)
6. Probar flujo completo: editar producto en panel → verificar en sheet → verificar en tienda

---

## 6. Lo que NO cambia

- La URL del webhook GET (`/webhook/hondusport-products`) — sin cambios
- La estructura de `Cupones` y `Banners` (solo se agrega escritura vía panel)
- El diseño visual de la tienda — ningún cambio en `styles.css`
- El sistema de carrito, wishlist, búsqueda y checkout de la tienda
