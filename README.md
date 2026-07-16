# Hondusport

Tienda e-commerce (ropa y artículos deportivos) para Honduras, construida con
**Next.js 16 (App Router)** y **Supabase**. Incluye una tienda pública y un panel
de administración. El cierre de venta se realiza por **WhatsApp** (no hay pasarela
de pago en línea): el pedido se registra en la base de datos y se genera un mensaje
de WhatsApp con el resumen.

## Stack

| Área | Tecnología |
|------|-----------|
| Framework | Next.js 16.2 (App Router, React 19) |
| Lenguaje | TypeScript |
| Backend / BD | Supabase (Postgres + Auth + Storage) |
| Búsqueda | fuse.js (fuzzy search en cliente) |
| Import de productos | xlsx (carga masiva desde Excel) |
| Validación | zod |
| Tests | Vitest + Testing Library |
| Deploy | Vercel |

## Requisitos

- Node.js 20+
- Un proyecto de Supabase (con la BD del `supabase/schema.sql` aplicada)

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:3000
```

### Variables de entorno

Crea un `.env.local` en la raíz con:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # reservada para scripts fuera de la app
```

- Las dos `NEXT_PUBLIC_*` se usan en cliente y servidor (tienda + auth admin).
- `SUPABASE_SERVICE_ROLE_KEY` es **secreta**; ninguna ruta de la app la usa hoy
  (queda reservada para scripts/administración fuera de la app). Nunca la
  expongas al cliente ni a rutas sin auth.

### Base de datos

Aplica el esquema y las migraciones en el SQL editor de Supabase (o vía CLI):

```
supabase/schema.sql                              # tablas, RLS, config inicial
supabase/migrations/2026-06-10-add-producto-subcategoria.sql
supabase/migrations/2026-06-11-crear-pedido-rpc.sql   # RPC crear_pedido (checkout)
supabase/migrations/2026-06-12-storage-policies.sql   # políticas de Storage
```

Además, crea en Supabase Storage los buckets **públicos** `productos` y `banners`
(las políticas están en la migración de storage).

### Usuario admin

El panel `/admin` está protegido por `middleware.ts` con **Supabase Auth**
(email + contraseña). Crea un usuario en Authentication → Users en el dashboard de
Supabase; con eso podrás iniciar sesión en `/admin/login`.

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run start    # servir el build
npm run lint     # ESLint
npm test         # Vitest (suite de lógica de negocio)
```

## Estructura

```
app/
  (store)/              Tienda pública (route group)
    page.tsx            Home (SSR) + StoreClient
    producto/[id]/      Detalle de producto
    checkout/actions.ts Server Action: crea el pedido (RPC crear_pedido)
    layout.tsx          Providers: Theme, Cart, Wishlist
  admin/                Panel de administración (protegido por middleware)
    productos/ categorias/ banners/ cupones/ envios/ pedidos/ configuracion/
    login/              Inicio de sesión (Supabase Auth)
  api/inventario/
    plantilla/importar/ Import de plantillas externas (mapeo de columnas)
    import/              Round-trip de inventario vía Excel (.xlsx)
components/
  store/                UI de la tienda (drawers, carrusel, cards, nav…)
  admin/                UI del panel
lib/
  store/                Lógica de negocio pura + tests (carrito, totales, filtros…)
  supabase-client.ts    Cliente de navegador
  supabase-server.ts    Cliente de servidor (cookies/SSR)
types/                  Tipos compartidos (types/index.ts, types/store.ts)
supabase/               schema.sql + migraciones
middleware.ts           Protege /admin con Supabase Auth
```

## Modelo de datos (Supabase)

- **productos** — catálogo. Campos clave: `precio`, `precio_original`, `tallas[]`,
  `imagenes[]`, `categoria_id`, `subcategoria_id`, `personalizable`, `stock`, `activo`.
- **categorias** — polimórfica por `tipo`: `cat` | `subcat` | `talla` | `genero`.
- **pedidos** / **pedido_items** — pedidos y sus líneas. Se crean vía la RPC
  `crear_pedido` (transacción atómica de cabecera + items).
- **envios** — métodos de envío (`delivery` | `pickup`, con costo/descuento).
- **cupones** — códigos de descuento por porcentaje.
- **banners** — banners del hero.
- **configuracion** — clave/valor global (nombre del sitio, colores, WhatsApp,
  envío gratis, redes sociales, modo mantenimiento, etc.).

**RLS:** lectura pública de catálogo/config (solo filas `activo`), inserción
pública de pedidos, y acceso total para usuarios autenticados (admin).

## Flujo de compra

1. El cliente arma el carrito (persistido en `localStorage`).
2. En checkout, el **Server Action** `crearPedido` **vuelve a leer los productos
   de la BD** como frontera de confianza: recalcula precios y totales, y descarta
   cualquier personalización enviada para productos no personalizables.
3. Se registra el pedido con la RPC `crear_pedido` y se genera el mensaje de
   WhatsApp con el resumen.

## Tests

La lógica de negocio de `lib/store` (carrito, totales, cupones, envío gratis,
filtros, búsqueda, tallas, personalización) está cubierta con Vitest:

```bash
npm test
```

> No hay tests E2E/integración todavía: los Server Actions y la UI se validan
> manualmente.

## Deploy

Configurado para **Vercel** (`vercel.json`, framework Next.js). Define las tres
variables de entorno en el proyecto de Vercel antes de desplegar.
