# Hondusport — Rediseño Completo: Next.js + Supabase

**Fecha:** 2026-06-08  
**Estado:** Aprobado para implementación

---

## 1. Contexto y Objetivo

Hondusport es una tienda deportiva en Honduras. El sistema actual usa:
- Tienda pública: HTML + vanilla JS + PHP (Google Sheets como base de datos vía webhooks n8n)
- Admin panel: 6 páginas HTML/PHP standalone con n8n como intermediario de datos
- Imágenes: upload PHP al servidor

**Problemas a resolver:**
- Dependencia de n8n: si el servicio cae, el admin deja de funcionar
- No apto para GitHub/Vercel: PHP no es compatible con Vercel
- CSS del nav duplicado en cada página admin (6 veces)
- Contraseña hardcodeada en texto plano en `config.php`
- Sin módulo de pedidos en el admin
- `app.js` con 1,800+ líneas sin estructura

**Objetivo:** Reescribir completamente en Next.js + Supabase. Un repositorio, un deploy en Vercel, cero n8n, admin robusto y escalable.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend + Admin | Next.js 14 (App Router) | Framework principal |
| Base de datos | Supabase PostgreSQL | Datos de la tienda |
| Auth | Supabase Auth | Login del equipo admin |
| Storage | Supabase Storage | Imágenes de productos y banners |
| Deploy | Vercel | Hosting automático desde GitHub |
| Repositorio | GitHub | Control de versiones |
| Estilos | CSS Modules + variables CSS | Sin frameworks de CSS |

---

## 3. Arquitectura

```
GitHub (repositorio único)
    └── Vercel (deploy automático en cada push a main)
          ├── / (Tienda pública — SSR)
          └── /admin (Panel protegido — middleware de auth)

Supabase
    ├── PostgreSQL (todas las tablas)
    ├── Auth (usuarios del equipo admin)
    └── Storage (bucket: productos/, banners/)
```

### Estructura de carpetas

```
hondusport/
├── app/
│   ├── page.tsx                    ← Tienda pública (SSR)
│   ├── admin/
│   │   ├── middleware.ts           ← Guard: redirige a /admin/login si no hay sesión
│   │   ├── login/page.tsx
│   │   ├── page.tsx                ← Dashboard
│   │   ├── productos/page.tsx
│   │   ├── pedidos/page.tsx
│   │   ├── categorias/page.tsx
│   │   ├── cupones/page.tsx
│   │   ├── envios/page.tsx
│   │   ├── banners/page.tsx
│   │   └── configuracion/page.tsx
│   └── api/
│       └── import/route.ts         ← Procesador del XLSX (server-side)
├── components/
│   ├── tienda/                     ← Carrito, ProductCard, Filtros, Checkout
│   └── admin/                      ← Sidebar, DataTable, Modal, ImageUpload
├── lib/
│   ├── supabase-server.ts          ← Cliente server-side
│   ├── supabase-client.ts          ← Cliente browser
│   └── xlsx-parser.ts              ← Lógica de agrupación de variantes
└── types/
    └── index.ts                    ← Tipos TypeScript compartidos
```

---

## 4. Modelo de Datos (Supabase)

### `productos`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
nombre        text NOT NULL
descripcion   text
precio        numeric NOT NULL
precio_original numeric
categoria_id  uuid REFERENCES categorias(id)
stock         integer  -- NULL = ilimitado
genero        text     -- Hombre | Mujer | Unisex
badge         text     -- Oferta | Nuevo | Más Vendido
tallas        text[]
colores       text[]
imagenes      text[]   -- URLs de Supabase Storage
marca         text
sku           text     -- cbarras del XLSX
personalizable boolean DEFAULT false
oferta_fin    timestamptz
activo        boolean DEFAULT true
rating        integer DEFAULT 5
created_at    timestamptz DEFAULT now()
updated_at    timestamptz DEFAULT now()
```

### `categorias`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
tipo            text NOT NULL  -- cat | subcat | talla | genero
valor           text NOT NULL
imagen          text
categorias_padre text[]
orden           integer DEFAULT 0
activo          boolean DEFAULT true
```

### `pedidos`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
numero          serial              -- #1001, #1002…
nombre_cliente  text NOT NULL
telefono        text NOT NULL
ciudad          text NOT NULL
envio_id        uuid REFERENCES envios(id)
envio_nombre    text                -- denormalizado
cupon_codigo    text
subtotal        numeric NOT NULL
descuento_cupon numeric DEFAULT 0
costo_envio     numeric DEFAULT 0
total           numeric NOT NULL
estado          text DEFAULT 'recibido'  -- recibido | preparando | enviado | entregado | cancelado
notas           text
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### `pedido_items`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
pedido_id             uuid REFERENCES pedidos(id) ON DELETE CASCADE
producto_id           uuid REFERENCES productos(id)
nombre_producto       text NOT NULL   -- guardado al momento de compra
precio                numeric NOT NULL
cantidad              integer NOT NULL DEFAULT 1
talla                 text
color                 text
personalizado_nombre  text
personalizado_numero  text
imagen_url            text
```

### `banners`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
titulo      text
subtitulo   text
btn_texto   text DEFAULT 'Ver más'
btn_link    text DEFAULT '#tienda'
imagen      text
orden       integer DEFAULT 0
activo      boolean DEFAULT true
```

### `cupones`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
codigo      text UNIQUE NOT NULL
descuento   numeric NOT NULL        -- porcentaje
tipo        text DEFAULT 'porcentaje'
activo      boolean DEFAULT true
created_at  timestamptz DEFAULT now()
```

### `envios`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
nombre      text NOT NULL
descripcion text
tipo        text DEFAULT 'delivery'  -- delivery | pickup
costo       numeric DEFAULT 0
descuento   numeric DEFAULT 0        -- % descuento sobre costo
activo      boolean DEFAULT true
```

### `configuracion`
```sql
key    text PRIMARY KEY
value  text
```

Claves iniciales: `site_name`, `site_url`, `logo_url`, `eslogan`, `color_principal`,
`whatsapp_principal`, `whatsapp_secundario`, `email_contacto`, `direccion`,
`ciudad`, `horario`, `moneda`, `instagram`, `facebook`, `twitter`, `youtube`, `tiktok`,
`meta_descripcion`, `og_image_url`, `ga_id`, `gtm_id`,
`free_shipping_activo`, `free_shipping_minimo`,
`cupones_popup_activo`, `promo_bar_activo`, `promo_bar_texto`, `modo_mantenimiento`.

---

## 5. Admin Panel

### Estilo visual
- Fondo: `#0f0f0f` / `#141414` para cards
- Acento: `#C9A84C` (dorado)
- Sidebar izquierda de 200px con grupos de navegación
- Topbar sticky por página con título y acciones contextuales

### Módulos

| Ruta | Módulo | Funcionalidades clave |
|---|---|---|
| `/admin` | Dashboard | Stats del día, pedidos recientes, alertas de stock bajo |
| `/admin/productos` | Productos | Lista/cuadrícula, búsqueda, filtros, CRUD, importar XLSX |
| `/admin/pedidos` | Pedidos | Filtros por estado, detalle expandible, cambio de estado inline, link WhatsApp |
| `/admin/categorias` | Categorías | Tabs: cat / subcat / talla / género, CRUD por tipo |
| `/admin/cupones` | Cupones | Lista, toggle activo/inactivo, toggle popup |
| `/admin/envios` | Envíos | Lista, CRUD, toggle envío gratis global |
| `/admin/banners` | Banners | Cards con preview, upload imagen, CRUD |
| `/admin/configuracion` | Configuración | 6 secciones: Identidad, Contacto & Ubicación, Redes Sociales, SEO, Funcionalidades, Usuarios |

### Sidebar — grupos de navegación
```
[Logo HS]
─────────
TIENDA
  📦 Productos
  🏷️ Categorías
  🖼️ Banners
─────────
VENTAS
  📋 Pedidos  [badge con pendientes]
  🎟️ Cupones
  🚚 Envíos
─────────
  ⚙️ Configuración
  🚪 Salir
```

---

## 6. Importador XLSX

**Origen:** archivo exportado del sistema POS actual (504 filas, 53 columnas).  
**Clave:** cada fila es una variante (color + talla), no un producto completo.

### Flujo
1. Admin sube el `.xlsx` desde `/admin/productos` → botón "Importar XLSX"
2. `POST /api/import` recibe el archivo (server-side con `xlsx` npm package)
3. El servidor agrupa filas por `nombre_producto + marca + modelo`
4. Se muestra pantalla de mapeo de columnas con vista previa de productos agrupados
5. Admin confirma → se insertan/actualizan registros en Supabase

### Mapeo de columnas XLSX → Supabase
| Columna XLSX | Campo Supabase | Notas |
|---|---|---|
| `nombre_producto` | `nombre` | |
| `precio_venta` | `precio` | |
| `existencia` | `stock` | suma por producto |
| `tamano` | `tallas[]` | array de valores únicos |
| `color` | `colores[]` | array de valores únicos |
| `marca` | `marca` | |
| `cbarras` | `sku` | del primer registro del grupo |
| `nombre_categoria` | `categoria_id` | mapeo manual si es "CAT. GENERAL" |
| `is_active` | `activo` | VERDADERO → true |
| `descripcion_producto` | `descripcion` | puede estar vacía |
| `precio_venta2…10 / dCantMinPP2…10` | — | ignorados (precios mayoristas) |
| `uuid_producto` / `uuid_producto_sucursal` | — | ignorados (IDs del POS) |

---

## 7. Tienda Pública

Migración de `app.js` + `styles.css` a componentes Next.js. Se conserva la identidad visual actual (dark/light mode, Inter + Bebas Neue, carrito lateral) pero el código se reestructura en componentes reutilizables.

### Componentes principales
- `<Nav>` — logo, búsqueda, favoritos, carrito, toggle de tema
- `<HeroCarousel>` — banners desde Supabase, countdown de ofertas
- `<CategoryBar>` — filtros horizontales de categoría
- `<ProductGrid>` — grid de productos con filtros y ordenamiento
- `<ProductCard>` — card individual con badge, precio, tallas
- `<CartDrawer>` — carrito lateral con barra de envío gratis
- `<WishlistDrawer>` — lista de favoritos
- `<CheckoutModal>` — formulario de pedido antes de WhatsApp
- `<MegaSearch>` — búsqueda con Fuse.js
- `<ExitPopup>` — popup de cupón al salir

### Flujo de pedido (WhatsApp híbrido)
1. Cliente llena el carrito
2. Abre `<CheckoutModal>` → ingresa nombre, teléfono, ciudad, elige método de envío
3. Click "Enviar pedido por WhatsApp":
   - Se guarda el pedido en `pedidos` + `pedido_items` en Supabase con estado `recibido`
   - Se redirige a `wa.me/{whatsapp}?text={resumen_del_pedido}`
4. Admin ve el pedido en `/admin/pedidos` y actualiza el estado conforme avanza

---

## 8. Autenticación Admin

- Supabase Auth (email/password)
- Middleware Next.js en `/admin/**` verifica sesión activa
- Login en `/admin/login` — sin registro público (solo el propietario invita usuarios)
- Sesión persiste en cookies HttpOnly mediante `@supabase/ssr`

---

## 9. Imágenes

- **Supabase Storage** con dos buckets:
  - `productos/` — imágenes de productos (reemplaza `upload.php`)
  - `banners/` — imágenes del hero carousel
- Upload desde el admin usando el cliente de Supabase directamente (sin PHP)
- Configuración: logo y OG image se guardan en `configuracion` como URLs (pueden ser de Storage o externas)

---

## 10. Deploy

1. Repositorio en GitHub (rama `main` = producción)
2. Proyecto conectado a Vercel — deploy automático en cada push
3. Variables de entorno en Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo server-side, para el importador)
4. Dominio `hondusport.com` apuntado a Vercel
5. `.superpowers/` agregado a `.gitignore`

---

## 11. Migración desde el sistema actual

| Dato actual | Destino |
|---|---|
| Productos (Google Sheets) | Importador XLSX → Supabase `productos` |
| Filtros/categorías (Sheet) | Migración manual + admin → Supabase `categorias` |
| Cupones (Sheet) | Migración manual → Supabase `cupones` |
| Envíos (Sheet) | Migración manual → Supabase `envios` |
| Banners (Sheet) | Migración manual → Supabase `banners` |
| Config (Sheet) | Migración manual → Supabase `configuracion` |
| Imágenes (servidor PHP) | Se mantienen URLs existentes; nuevas imágenes van a Supabase Storage |
| Pedidos | No hay datos históricos — se inicia desde cero |
| n8n webhooks | Eliminados completamente |
| PHP auth/proxy | Eliminado — reemplazado por Supabase Auth + middleware Next.js |
