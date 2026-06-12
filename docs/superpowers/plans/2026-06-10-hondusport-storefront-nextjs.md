# Hondusport — Tienda Pública (Storefront) Next.js + Supabase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la tienda pública de Hondusport (`index.html` + `app.js` 1844 líneas + `styles.css` 2801 líneas, una SPA vanilla-JS que consume un webhook n8n) a componentes Next.js dentro de `hondusport-next/`, sirviéndose en la ruta `/`, leyendo de las mismas tablas Supabase que el admin ya gestiona (`productos`, `categorias`, `banners`, `cupones`, `envios`, `configuracion`) y escribiendo en `pedidos` + `pedido_items` en el checkout.

**Architecture:** Next.js 16 App Router. Server Components para SSR del catálogo (productos, categorías, banners, config) vía `await createClient()`. Estado de carrito/wishlist en Client Components con `localStorage`. Checkout = Server Action que inserta en `pedidos`/`pedido_items`, seguido de redirect client-side a `wa.me/...`. Tema dark/light vía atributo `data-theme` + variables CSS. Route group `app/(store)` separado de `app/admin`, con su propio layout. CSS Modules por componente (igual que el admin).

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, @supabase/ssr, fuse.js (nuevo dep), CSS Modules, Vitest.

---

## Scope

Cubre **la tienda pública completa**: catálogo SSR, filtros, búsqueda fuzzy, carrito, wishlist, página de producto, checkout WhatsApp-híbrido, tema dark/light, SEO dinámico. NO cubre cutover de DNS (cubierto en FASE 12 del plan admin). El admin ya está desplegado y funcionando; este plan solo añade rutas bajo `(store)` y NO toca `app/admin/**`.

### Restricciones heredadas del código existente
- `middleware.ts` solo protege `matcher: ['/admin/:path*']` → las rutas de la tienda son públicas por defecto. **No modificar el middleware.**
- `app/layout.tsx` actual tiene `metadata.title = 'Hondusport Admin'` y carga `globals.css` (variables del admin: `--bg:#0f0f0f`, `--accent:#C9A84C`). El storefront necesita su propio set de variables (`--primary`, `--bg-light/dark`, etc.) y fuentes (Inter + Bebas Neue + Font Awesome). Solución: el route group `(store)` recibe su propio `layout.tsx` con `<html>`/`<body data-theme>` y `store-globals.css`. Para evitar dos `<html>`, ver Task 1.
- RLS ya permite lectura pública (`activo=true`) de productos/categorias/envios/cupones/banners/config e `insert` público en `pedidos`/`pedido_items`. No se requieren cambios de schema.

---

## Desajuste de forma de datos (CRÍTICO — leer antes de codificar)

El viejo `app.js` consume un webhook n8n con una forma de producto **distinta** a la de Supabase. Toda la lógica portada debe pasar por una capa adaptadora (`lib/store/adapters.ts`, Task 2).

| Campo usado en `app.js` (n8n) | Campo Supabase / `types/index.ts` | Notas de mapeo |
|---|---|---|
| `p.id` (number) | `id` (uuid string) | Las URLs `?producto=` y comparaciones pasan a string uuid |
| `p.name` | `nombre` | |
| `p.desc` | `descripcion` | |
| `p.price` | `precio` | |
| `p.precio_original` | `precio_original` | |
| `p.imgs[]` | `imagenes[]` | |
| `p.cat` | `categorias.valor` (vía `categoria_id`) | join `productos.categoria_id → categorias.valor` |
| `p.subcat` | `subcategorias.valor` (vía `subcategoria_id`) | join `productos.subcategoria_id → categorias.valor` (ver nota Subcategoría) |
| `p.gender` | `genero` | |
| `p.badge` | `badge` | |
| `p.stock` | `stock` | |
| `p.rating` | `rating` | |
| `p.oferta_fin` | `oferta_fin` | |
| `p.tallas_custom` | `tallas[]` | el producto trae sus tallas directamente |
| `p.visitas` | — | No existe en schema; el badge "X personas lo vieron" se omite o se randomiza client-side |
| `data.config.*` (objeto plano) | `configuracion` (filas key/value → `ConfigMap`) | claves cambian de nombre (ver tabla abajo) |
| `data.filtros` (tipo cat/subcat/talla/genero) | `categorias` (mismo `tipo`) | misma semántica, distinto nombre de tabla |
| `data.envios` | `envios` | igual |
| `data.cupones` | `cupones` | igual |
| `data.banners` | `banners` | `b.imagen`, `b.titulo`, `b.subtitulo`, `b.btn_texto`, `b.btn_link` |

### Mapeo de claves de configuración (`app.js` → `configuracion`)
| Clave en `app.js` | Clave en `configuracion` (schema.sql) |
|---|---|
| `nombre_negocio` | `site_name` |
| `slogan` | `eslogan` |
| `logo_url` | `logo_url` |
| `whatsapp_number` | `whatsapp_principal` |
| `free_shipping_meta` | `free_shipping_minimo` |
| `free_shipping_activo` | `free_shipping_activo` |
| `free_shipping_msg` | *(nueva clave opcional — añadir a config si se desea)* |
| `cupones_popup_activo` | `cupones_popup_activo` |
| `promo_bar_texto` | `promo_bar_texto` |
| `stock_bajo_limite` | *(no existe; usar constante `STOCK_LIMITE=5` o añadir clave)* |
| `meta_descripcion` | `meta_descripcion` |
| `og_imagen` | `og_image_url` |
| `direccion` | `direccion` |
| `telefono_visible` | *(usar `whatsapp_principal` o añadir clave)* |
| `email_contacto` | `email_contacto` |
| `horario` | `horario` |
| `facebook_url`/`instagram_url`/etc. | `facebook`/`instagram`/`twitter`/`youtube`/`tiktok` |
| `color_*` (paleta dinámica) | `color_principal` (solo el acento existe en schema) |

> **Subcategoría (RESUELTO):** se agregó `productos.subcategoria_id uuid references categorias(id)` (migración `supabase/migrations/2026-06-10-add-producto-subcategoria.sql`, también reflejada en `schema.sql`). El admin (`app/admin/productos`) ya tiene el selector de subcategoría, filtrado por `categorias_padre` de la categoría elegida. La tienda debe: (a) hacer join `subcategorias:categorias!productos_subcategoria_id_fkey(valor)` al traer productos, (b) incluir `subcat` en `StoreProducto` (adapter `toStoreProducto`, Task 2), y (c) filtrar por subcategoría en `lib/store/filters.ts` (Task 8) en vez de no-op.

---

## Mapa de Archivos

| Archivo | Responsabilidad |
|---|---|
| `hondusport-next/app/(store)/layout.tsx` | Layout de tienda: `<html data-theme>`, fuentes, providers de carrito/tema, `store-globals.css` |
| `hondusport-next/app/(store)/store-globals.css` | Variables CSS de la tienda (`--primary`, `--bg-light/dark`…) + reset + fuentes |
| `hondusport-next/app/(store)/page.tsx` | Server Component home: fetch SSR de productos/categorías/banners/config/envíos/cupones |
| `hondusport-next/app/(store)/StoreClient.tsx` | Orquestador client: monta Nav, Hero, CategoryBar, ProductGrid, drawers, modales |
| `hondusport-next/app/(store)/producto/[id]/page.tsx` | Página de detalle de producto (SSR + `generateMetadata`) |
| `hondusport-next/app/(store)/checkout/actions.ts` | Server Action `crearPedido` → insert `pedidos` + `pedido_items` |
| `hondusport-next/lib/store/adapters.ts` | Adaptadores fila Supabase → forma de tienda (`StoreProducto`, `StoreConfig`) |
| `hondusport-next/lib/store/format.ts` | `formatPrice`, helpers de precio/descuento |
| `hondusport-next/lib/store/getTallas.ts` | Tallas disponibles por producto (custom o por categoría) |
| `hondusport-next/types/store.ts` | Tipos de la tienda (`StoreProducto`, `CartItem`, `StoreConfig`) |
| `hondusport-next/components/store/CartProvider.tsx` | Context de carrito (localStorage) |
| `hondusport-next/components/store/WishlistProvider.tsx` | Context de wishlist (localStorage) |
| `hondusport-next/components/store/ThemeToggle.tsx` | Toggle dark/light (data-theme + localStorage) |
| `hondusport-next/components/store/Nav.tsx` | Nav: logo, búsqueda, favoritos, carrito, tema, hamburguesa |
| `hondusport-next/components/store/HeroCarousel.tsx` | Carrusel de banners + indicadores + autoplay |
| `hondusport-next/components/store/CategoryBar.tsx` | Filtros horizontales de categoría con dropdowns de subcat |
| `hondusport-next/components/store/CategoryGallery.tsx` | Galería "Nuestras Categorías" |
| `hondusport-next/components/store/ProductGrid.tsx` | Secciones ofertas/nuevos/vendidos/todos + filtros + sort + paginación |
| `hondusport-next/components/store/ProductCard.tsx` | Card individual: badge, precio, timer, wishlist, quick-add |
| `hondusport-next/components/store/FilterSidebar.tsx` | Sidebar de filtros (género/cat/talla/subcat/precio) |
| `hondusport-next/components/store/CartDrawer.tsx` | Carrito lateral + barra envío gratis + cupón |
| `hondusport-next/components/store/WishlistDrawer.tsx` | Drawer de favoritos |
| `hondusport-next/components/store/CheckoutModal.tsx` | Modal de checkout (envío + datos + WhatsApp) |
| `hondusport-next/components/store/MegaSearch.tsx` | Overlay de búsqueda con Fuse.js |
| `hondusport-next/components/store/ExitPopup.tsx` | Popup de cupón al salir (exit-intent) |
| `hondusport-next/components/store/Footer.tsx` | Footer con columnas dinámicas + redes |
| `hondusport-next/components/store/MobileNav.tsx` | Drawer móvil + bottom-nav |
| `hondusport-next/components/store/*.module.css` | CSS Module por componente (split de `styles.css`) |
| `hondusport-next/lib/store/tests/*.test.ts` | Tests unitarios de adapters/format/getTallas/checkout |

---

## FASE S1 — Setup de la tienda (route group, layout, tema, tipos, adapters)

### Task 1: Route group `(store)`, layout y variables CSS

**Files:**
- Crear: `hondusport-next/app/(store)/layout.tsx`
- Crear: `hondusport-next/app/(store)/store-globals.css`
- Modificar: `hondusport-next/app/layout.tsx`
- Instalar: `fuse.js`

- [x] **Step 1: Instalar Fuse.js**

```bash
cd hondusport-next
npm install fuse.js
```

- [x] **Step 2: Resolver el conflicto de `<html>` raíz**

El `app/layout.tsx` actual emite `<html lang="es"><body>`. Un route group `(store)` con su propio `<html>` causaría doble `<html>`. Estrategia: convertir el root layout en un pass-through mínimo y mover `<html>/<body>` a cada grupo. Editar `hondusport-next/app/layout.tsx`:

```tsx
// Root layout: pass-through. Cada route group ((store) y admin via app/layout previo)
// define su propio <html>/<body>. Para evitar duplicados, el root NO emite <html>.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

> **Nota crítica:** Next.js exige que `<html>`/`<body>` existan en algún layout. Mover el admin a un route group `(admin)` con su propio `<html>` es lo más limpio, PERO el admin ya está desplegado y funcionando. Alternativa de menor riesgo: mantener `<html>/<body>` en el root layout (con las variables admin) y que `(store)/layout.tsx` envuelva su contenido en un `<div>` que redeclare las variables de la tienda y aplique `data-theme` a ese `<div>` (no al `<body>`). El `ThemeToggle` entonces togglea `data-theme` en ese contenedor. Elegir esta alternativa para no tocar el admin en producción. Mantener `app/layout.tsx` como está (solo cambiar metadata a genérica) y NO usar el pass-through.

Revisar/editar `app/layout.tsx` para metadata neutral:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hondusport',
  description: 'Tienda deportiva en Honduras',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```

- [x] **Step 3: Crear `store-globals.css`** con las variables y reset de la tienda (portadas de `styles.css` líneas 1-66). Aplicar al contenedor `.storeRoot` (no a `:root`) para no chocar con las variables del admin:

```css
/* Fuentes — Inter ya viene en globals.css; añadir Bebas Neue + Font Awesome */
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css');

.storeRoot {
  --primary: #C9A84C;
  --bg-light: #F5F5F3; --text-light: #0A0A0A; --card-light: #FFFFFF; --border-light: #E8E8E6;
  --bg-dark: #0A0A0A;  --text-dark: #F5F5F5;  --card-dark: #141414;  --border-dark: #2A2A2A;
  --bg: var(--bg-light); --text: var(--text-light); --card: var(--card-light); --border: var(--border-light);
  --btn-bg: #0A0A0A; --btn-text: #FFFFFF; --btn-hover: #333333;
  --transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  --max-width: 1400px;
  --qty-btn-bg: var(--primary); --qty-btn-text: #FFFFFF;
  background: var(--bg); color: var(--text);
  font-family: 'Inter', sans-serif;
  min-height: 100vh;
}
.storeRoot[data-theme="dark"] {
  --bg: var(--bg-dark); --text: var(--text-dark); --card: var(--card-dark); --border: var(--border-dark);
  --btn-bg: #FFFFFF; --btn-text: #0A0A0A; --btn-hover: #E8E8E6;
}
.storeRoot h1,.storeRoot h2,.storeRoot h3,.storeRoot h4 {
  font-family: 'Bebas Neue', sans-serif; text-transform: uppercase; letter-spacing: 1px;
}
```

- [x] **Step 4: Crear `(store)/layout.tsx`** — Server Component que lee config para colorear el acento dinámicamente y monta el contenedor con tema:

```tsx
import './store-globals.css'
import { createClient } from '@/lib/supabase-server'
import { toConfigMap } from '@/lib/store/adapters'
import ThemeRoot from '@/components/store/ThemeRoot'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.from('configuracion').select('key,value')
  const config = toConfigMap(data ?? [])
  return <ThemeRoot accent={config.color_principal}>{children}</ThemeRoot>
}
```

> `ThemeRoot` es un Client Component que renderiza `<div className="storeRoot" data-theme={theme}>`, lee `data-theme` inicial de localStorage y expone el contexto de tema. (Definir en Task 3.)

- [ ] **Step 5: Commit**

```bash
cd .. && git add hondusport-next/
git commit -m "feat(store): route group (store), variables CSS y layout base"
```

---

### Task 2: Tipos de tienda + adapters + helpers de formato

**Files:**
- Crear: `hondusport-next/types/store.ts`
- Crear: `hondusport-next/lib/store/adapters.ts`
- Crear: `hondusport-next/lib/store/format.ts`
- Crear: `hondusport-next/lib/store/getTallas.ts`
- Crear: `hondusport-next/lib/store/tests/adapters.test.ts`
- Crear: `hondusport-next/lib/store/tests/format.test.ts`

- [x] **Step 1: `types/store.ts`** — formas que consumen los componentes (puente entre Supabase y el viejo `app.js`):

```ts
import type { Producto, Categoria, Banner, Cupon, Envio, ConfigMap } from '@/types'

export interface StoreProducto {
  id: string
  nombre: string
  descripcion: string
  precio: number
  precioOriginal: number | null
  cat: string            // categorias.valor
  subcat: string | null  // subcategorias.valor (productos.subcategoria_id)
  genero: string | null
  badge: string | null
  tallas: string[]
  imagenes: string[]
  stock: number | null
  rating: number
  ofertaFin: string | null
}

export interface CartItem {
  id: string
  nombre: string
  precio: number
  imagen: string
  size: string
  custom: string
  qty: number
}

export type { Categoria, Banner, Cupon, Envio, ConfigMap }
```

- [x] **Step 2: `lib/store/adapters.ts`** — funciones puras (testables):

```ts
import type { Producto, ConfigEntry, ConfigMap } from '@/types'
import type { StoreProducto } from '@/types/store'

export function toConfigMap(rows: ConfigEntry[]): ConfigMap {
  return Object.fromEntries(rows.map(r => [r.key, r.value ?? '']))
}

export function toStoreProducto(p: Producto): StoreProducto {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    precio: Number(p.precio),
    precioOriginal: p.precio_original != null ? Number(p.precio_original) : null,
    cat: p.categorias?.valor ?? '',
    subcat: p.subcategorias?.valor ?? null,
    genero: p.genero,
    badge: p.badge,
    tallas: p.tallas ?? [],
    imagenes: (p.imagenes ?? []).filter(Boolean),
    stock: p.stock,
    rating: p.rating ?? 5,
    ofertaFin: p.oferta_fin,
  }
}
```

- [x] **Step 3: `lib/store/format.ts`** — portar `formatPrice` (app.js:816), `getBadgeColor`, cálculo de descuento:

```ts
export function formatPrice(amount: number): string {
  return 'L. ' + amount.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const BADGE_COLORS: Record<string, string> = {
  Oferta: '#E74C3C', 'Más Vendido': '#E74C3C', Nuevo: '#27AE60',
  Sustentable: '#2980B9', 'Últimas unidades': '#E67E22',
}
export function getBadgeColor(badge: string): string {
  return BADGE_COLORS[badge] ?? '#E74C3C'
}
```

- [x] **Step 4: `lib/store/getTallas.ts`** — portar `getTallas` (app.js:336) usando `categorias` de `tipo='talla'`:

```ts
import type { StoreProducto, Categoria } from '@/types/store'
export function getTallas(p: StoreProducto, tallaFiltros: Categoria[]): string[] {
  if (p.tallas.length > 0) return p.tallas
  return tallaFiltros
    .filter(f => (f.categorias_padre ?? []).map(c => c.toLowerCase()).includes(p.cat.toLowerCase()))
    .map(f => f.valor)
}
```

- [x] **Step 5: Tests (TDD — escribir antes que el código final)** Cubrir: `toConfigMap` vacío/duplicados, `toStoreProducto` con join nulo y `imagenes` nulas, `formatPrice` con 0 y decimales, `getBadgeColor` fallback. Mín. 80% de estos módulos.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(store): tipos, adapters Supabase→tienda y helpers de formato (test)"
```

---

### Task 3: Providers de carrito, wishlist y tema

**Files:**
- Crear: `hondusport-next/components/store/CartProvider.tsx`
- Crear: `hondusport-next/components/store/WishlistProvider.tsx`
- Crear: `hondusport-next/components/store/ThemeRoot.tsx`

- [x] **Step 1: `ThemeRoot.tsx`** — Client Component que envuelve la tienda, gestiona `data-theme` y aplica el acento dinámico: (implementado en Task 1; usa `useState` con inicializador perezoso en vez de `useEffect` para leer `localStorage`)

```tsx
'use client'
import { useEffect, useState } from 'react'
export default function ThemeRoot({ accent, children }: { accent?: string; children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light'|'dark'>('light')
  useEffect(() => {
    const saved = localStorage.getItem('hs_theme') as 'light'|'dark'|null
    if (saved) setTheme(saved)
  }, [])
  function toggle() {
    setTheme(t => { const n = t === 'light' ? 'dark' : 'light'; localStorage.setItem('hs_theme', n); return n })
  }
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div className="storeRoot" data-theme={theme}
           style={accent ? ({ '--primary': accent } as React.CSSProperties) : undefined}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
```
(Definir `ThemeContext` + hook `useTheme` en el mismo archivo o `lib/store/theme-context.ts`.)

- [x] **Step 2: `CartProvider.tsx`** — portar la lógica de `app.js`: `cart` desde `localStorage('hondusport_cart')`, `activeDiscount` desde `localStorage('hondusport_discount')`. Métodos: `addToCart(item)`, `removeFromCart(idx)`, `changeQty(idx, d)`, `updateCustom(idx, val)`, `applyCoupon(code)`, `clear()`. Derivados: `subtotal`, `finalTotal`, `count`. Persistir en cada cambio (portar `saveAndUpdate`, app.js:1344). Lógica de fusión de items idénticos (`id+size+custom`) de `addToCart` (app.js:1741).

- [x] **Step 3: `WishlistProvider.tsx`** — portar `hsWishlist` desde `localStorage('hs_wishlist')`. Métodos `toggle(id)`, `has(id)`, lista de ids. (app.js:1546-1575).

- [x] **Step 4: Tests** del reducer de carrito (add/merge/remove/changeQty/subtotal/descuento). AAA.

- [ ] **Step 5: Commit** `feat(store): providers de carrito, wishlist y tema (localStorage)`

---

## FASE S2 — Nav, Hero, CategoryBar, Footer (estructura visible)

### Task 4: Nav + ThemeToggle + MobileNav + bottom-nav

**Files:** `components/store/Nav.tsx` (+ `.module.css`), `components/store/ThemeToggle.tsx`, `components/store/MobileNav.tsx` (+ `.module.css`), `components/store/BottomNav.tsx`, `components/store/StoreHeader.tsx`.

- [x] **Step 1: Nav** — portar el `<nav id="main-nav">` (app.js:15-42). Props: `logoUrl`, `categorias[]`, callbacks para abrir MegaSearch/Cart/Wishlist. Badges de carrito/wishlist desde los providers. Estado `scrolled` con `useEffect` + scroll listener (portar app.js:1710). **CSS:** `styles.css` líneas **78-196** (`nav`, `.nav-cat-btn`, `.search-container`, `.nav-actions`, `.icon-btn`, `#cart-badge`) → `Nav.module.css`. La hamburguesa: líneas **1379-1404**. (Simplificado: la hamburguesa siempre abre `MobileNav`; el dropdown de escritorio del legado se omite — `.navLinks` se oculta en móvil vía `@media`)

- [x] **Step 2: ThemeToggle** — botón que llama `useTheme().toggle()`, icono sol/luna (app.js:1762).

- [x] **Step 3: MobileNav + bottom-nav** — drawer móvil (`styles.css` **2488-2570**) y bottom-nav (`styles.css` **2417-2472**). Items: Inicio, Buscar, Carrito, Favoritos (app.js:312-326). (`BottomNav.tsx` separado del drawer; `StoreHeader.tsx` añadido como componente de composición que orquesta `Nav` + `MobileNav` + `BottomNav` y el estado `mobileNavOpen`/`activeCat`)

- [x] **Step 4: Commit** `feat(store): Nav, ThemeToggle, MobileNav y bottom-nav`

### Task 5: HeroCarousel + Footer

**Files:** `components/store/HeroCarousel.tsx` (+ css), `components/store/Footer.tsx` (+ css).

- [x] **Step 1: HeroCarousel** — props `banners: Banner[]`. Portar `initHero` (app.js:1743): autoplay 5s, indicadores, scroll-hint. Cada slide usa `b.imagen`, `b.titulo`, `b.subtitulo`, `b.btn_texto`, `b.btn_link`. **CSS:** `styles.css` **198-291** (`.hero`, `.slide`, `.slide-content`, `.hero-btn-outline`, `.slide-indicators`, `.indicator`) + scroll-hint **2644-2660**.

- [x] **Step 2: Footer** — props `config: ConfigMap`, `categorias[]`, `hasOfertas?`, `onFilterClick?`. Portar el render del footer (app.js:660-718): columnas marca/tienda/contacto, redes sociales (mapeo `facebook`→`fa-facebook-f`, etc.), copyright con año. **CSS:** `styles.css` **885-958** + `.footer-grid` **1568-1596**. (Footer es Client Component por los botones de filtro interactivos)

- [x] **Step 3: Commit** `feat(store): HeroCarousel y Footer dinámicos`

### Task 6: CategoryBar + CategoryGallery

**Files:** `components/store/CategoryBar.tsx` (+ css), `components/store/CategoryGallery.tsx` (+ css).

- [x] **Step 1: CategoryBar** — props `cats: Categoria[]` (tipo `cat`), `subcats: Categoria[]`, `onSelectCat`, `onSelectSubcat`. Portar el render con dropdowns de subcat (app.js:513-554). **CSS:** `styles.css` **293-396** (`.category-bar`, `.cat-dropdown*`, `.cat-filter-btn`). (Estado `activeCat` interno con `useState`; `onSelectCat`/`onSelectSubcat` opcionales para wiring externo en Task 14. Subcats emparejadas via `categorias_padre`)

- [x] **Step 2: CategoryGallery** — "Nuestras Categorías" con imagen por categoría (app.js:626-656). **CSS:** `styles.css` **1609-1664**.

- [x] **Step 3: Commit** `feat(store): CategoryBar con dropdowns y CategoryGallery`

---

## FASE S3 — Catálogo: ProductCard, ProductGrid, FilterSidebar

### Task 7: ProductCard

**Files:** `components/store/ProductCard.tsx` (+ css).

- [x] **Step 1:** Portar `cardHTML` (app.js:922-986) a JSX. Props: `producto: StoreProducto`, `rank?`, callbacks `onQuickAdd`, `onOpen`, integración con `WishlistProvider`. Subcomponentes: badge con `getBadgeColor`, precio tachado (`precioOriginal`), stock warning (`stock <= 5`), timer de oferta (portar `startOfferTimers` app.js:1042 a un `useEffect` con `setInterval` y cleanup), botón wishlist, botones VER/+CARRITO. **CSS:** `styles.css` **514-627** (`.product-card`, `.product-img-container`, `.product-info`, `.card-btn-row`, `.price`, `.stars`, `.btn-add-main`) + badges/timer/wishlist **1496-1510, 1918-1962, 2088-2156** + `.card-mobile-add-btn` **2752**.
  - Nota: se usó `<img>` con `eslint-disable @next/next/no-img-element` (mismo patrón que CategoryGallery), no `next/image`, ya que `next.config.ts` aún no tiene `remotePatterns` configurado para los dominios de imágenes de Supabase storage. Se revisará en Task 15.
  - Nota: `STOCK_LIMITE` se dejó como constante local (5), igual al default de `app.js`; la configuración dinámica `stock_bajo_limite` no se conecta en este task.

- [x] **Step 2: Test** del cálculo de segundos del timer (`ofertaFin` futuro/pasado) extraído a `lib/store/offerTimer.ts`.

- [x] **Step 3: Commit** `feat(store): ProductCard con badge, timer de oferta y wishlist`

### Task 8: FilterSidebar + lógica de filtrado/orden

**Files:** `components/store/FilterSidebar.tsx` (+ css), `lib/store/filters.ts`, `lib/store/tests/filters.test.ts`.

- [x] **Step 1: `lib/store/filters.ts`** — funciones puras portadas de `applyFilters` (app.js:818-868): `filterProductos({ productos, maxPrice, generos, cats, tallas, subcats, search, tallaFiltros })` y `sortProductos(list, sortBy)`. La búsqueda usa Fuse.js (`keys: ['nombre','cat','descripcion']`, `threshold: 0.4`). El filtro `subcats` compara contra `producto.subcat` (ya resuelto vía `subcategoria_id`, ver nota de datos).

- [x] **Step 2: FilterSidebar** — checkboxes género/cat, botones talla/subcat, slider de precio, botón limpiar. Props desde `categorias` por tipo. **CSS:** `styles.css` **423-507** (`.sidebar`, `.filter-group`, `.talla-btn*`) + labels/checkbox **1406-1452** + responsive sidebar **1742-1758**.
  - Nota: componente autocontenido (estado interno de checkboxes/tallas/subcats/precio) que emite `FilterState` vía `onChange?` en un `useEffect`, siguiendo el patrón de Task 6. `isOpen`/`onClose?` controlan el estado mobile (`.sidebarActive`); el botón hamburguesa que lo abre se conectará en Task 14 (`StoreClient.tsx`).

- [x] **Step 3: Tests** de `filterProductos` (precio, género, cat, combinaciones, búsqueda fuzzy) y `sortProductos` (4 modos). 80%+.

- [x] **Step 4: Commit** `feat(store): FilterSidebar y lógica de filtrado/orden (test, Fuse.js)`

### Task 9: ProductGrid + paginación + carruseles de secciones

**Files:** `components/store/ProductGrid.tsx` (+ css).

- [x] **Step 1:** Portar `renderProducts` (app.js:902-1040): secciones ofertas/nuevos/más-vendidos (carruseles horizontales) cuando se muestra el catálogo completo, sección "todos" paginada (`itemsPerPage=12`, botón "MOSTRAR MÁS"). Usar estado React para `currentPage` y la lista filtrada. Botones de carrusel (portar `initCarouselBtns` app.js:1099). IntersectionObserver para fade-in (app.js:1033). **CSS:** `styles.css` **508-512, 629-797** (grids, secciones, `.carousel-wrapper`, `.carousel-btn`) + skeleton **2211-2257** + `.fade-in-up` **1598-1607** + `#load-more-btn` **2179-2195**.
  - Nota: `app/(store)/page.tsx` ahora consulta `productos` (join con `categorias` para `cat`/`subcat`) y pasa `storeProductos` a `ProductGrid`. Verificado en dev server: renderiza `SkeletonGrid` porque `productos_subcategoria_id_fkey` aún no existe (migración `2026-06-10-add-producto-subcategoria.sql` pendiente de aplicar) — comportamiento correcto para `totalProductos === 0`. Reset de `currentPage` al cambiar `productos` implementado con el patrón "ajustar estado durante el render" (evita `react-hooks/set-state-in-effect`).

- [x] **Step 2: Commit** `feat(store): ProductGrid con secciones, carruseles y paginación`

---

## FASE S4 — Carrito, Wishlist, MegaSearch, ExitPopup

### Task 10: CartDrawer

**Files:** `components/store/CartDrawer.tsx` (+ css).

- [x] **Step 1:** Portar `updateCartUI` (app.js:1129-1241): lista de items con qty controls, edición de personalización inline, barra de envío gratis (`free_shipping_minimo`), input de cupón, total con descuento, badge de descuento, botón FINALIZAR PEDIDO (abre CheckoutModal). Consume `CartProvider`. **CSS:** `styles.css` **801-883** (`#cart-drawer`, `.cart-header`, `.cart-item`, `.cart-close`) + qty/cupón/shipping **997-1095, 1046-1068, 2032-2059** + free-shipping-toast **1683-1710** + `#cart-fab` **261-264 (HTML), 1703-1710 (CSS)**.
  - Nota: `CartDrawer` es self-contained (`isOpen`/`onClose` props, igual que `FilterSidebar`), recibe `freeShippingActivo`/`freeShippingThreshold`/`cupones`/`onCheckout?`/`onOpenProduct?` como props — wiring completo con `Nav`/`BottomNav`/`StoreClient` y `CheckoutModal` (Task 12) diferido a Task 14. Añadida función pura `getShippingProgress` en `lib/store/cart.ts` (TDD, 4 tests). El botón `#cart-fab` (app.js:261-264) y su badge se reutilizan vía `BottomNav`/`Nav` ya existentes (count del `CartContext`); no se duplica aquí. Verificado con smoke test temporal en dev server: renderiza `MI CARRITO`, barra de envío gratis, mensaje "TE FALTAN...", estado vacío y `FINALIZAR PEDIDO`.

- [x] **Step 2: Commit** `feat(store): CartDrawer con barra de envío gratis y cupón`

### Task 11: WishlistDrawer + MegaSearch + ExitPopup

**Files:** `components/store/WishlistDrawer.tsx`, `components/store/MegaSearch.tsx`, `components/store/ExitPopup.tsx` (+ css c/u).

- [x] **Step 1: WishlistDrawer** — portar `renderWishlistDrawer` (app.js:1603): items con +CARRITO y ELIMINAR. **CSS:** comparte `#wishlist-drawer` (en `styles.css` **801-883**).

- [x] **Step 2: MegaSearch** — overlay con Fuse.js, portar `executeMegaSearch` (app.js:1795), tags populares. **CSS:** `styles.css` **2259-2415**.

- [x] **Step 3: ExitPopup** — exit-intent (`mouseleave`, `clientY<0`, desktop) gated por `cupones_popup_activo`, valida cupón (app.js:1335, 1767). **CSS:** `styles.css` **1305-1342** + `.exit-overlay` **1029-1044**.

- [x] **Step 4: Commit** `feat(store): WishlistDrawer, MegaSearch (Fuse.js) y ExitPopup`

> Nota: los tres componentes son self-contained (`isOpen`/`onClose`, igual que `CartDrawer`/`FilterSidebar`); wiring completo con `Nav`/`BottomNav`/`StoreClient` diferido a Task 14. `WishlistDrawer` recibe `productos`/`tallaFiltros` y consume `useWishlist()` + `useCart().addToCart` (talla por defecto vía `getTallas`, sin toast — no existe infraestructura de toasts global aún). `MegaSearch` añade nueva función pura `searchProductos` en `lib/store/search.ts` (Fuse.js sobre `nombre`/`cat`/`subcat`/`descripcion`, threshold 0.4, límite 8 resultados; TDD, 6 tests); tags populares se derivan de `categorias` tipo `cat` (en vez del `#popular-tags` vacío del legado). `ExitPopup` usa `useCart().applyCoupon`, gateado por prop `activo` (mapea a `cupones_popup_activo`), y un `useRef` para no re-disparar el exit-intent (mismo patrón que `wasFreeShippingReached` en `CartDrawer`). Verificado con smoke test temporal en dev server: renderiza `MIS FAVORITOS`/`NO TIENES FAVORITOS`, `BÚSQUEDAS POPULARES`, y el popup `¡ESPERA!`/`CANJEAR`.

---

## FASE S5 — Página de producto + Checkout (Server Action) + Home wiring

### Task 12: Página de detalle `producto/[id]`

**Files:** `app/(store)/producto/[id]/page.tsx`, `components/store/ProductDetail.tsx` (+ css).

- [x] **Step 1: Server Component** `page.tsx` — fetch del producto por id + relacionados (misma cat) + `generateMetadata` con `title = '{nombre} | {site_name}'` y OG image. Si no existe → `notFound()`.

- [x] **Step 2: ProductDetail** (client) — galería con zoom (portar `initZoomEffect` app.js:1636), selector de talla, personalización, AGREGAR AL CARRITO, share (WhatsApp/Facebook/copiar — portar app.js:1473-1505), guía de tallas (modal), reseñas estáticas, relacionados, vistos recientemente (`localStorage('hs_recent_views')`). **CSS:** `styles.css` **1147-1251** (`.modal`, `#modal-img-main`, `.thumb-*`, `.related-*`) + zoom **2158-2173** + share **1123-1145** + product-page responsive **2475-2485**.

> **Decisión de routing:** el viejo SPA usaba `?producto=ID` y ocultaba/mostraba divs. Aquí se usa una ruta real `/producto/[id]` (mejor SEO y SSR). Los enlaces de ProductCard apuntan a `/producto/${id}`. Mantener compat opcional: un redirect de `/?producto=ID` → `/producto/ID` si se desea preservar enlaces antiguos.

- [x] **Step 3: Commit** `feat(store): página de detalle de producto con SSR y generateMetadata`

> **Notas de implementación:** `getReviews(rating)` y `addRecentView(ids, id)` extraídas a `lib/store/reviews.ts` y `lib/store/recentViews.ts` con TDD (6 tests nuevos, suite `lib/store` en 72/72). Patrón "vistos recientemente" sigue la convención de `cart-context.tsx` (lazy initializer `useState(() => readFn())` + `useEffect` solo de escritura, sin `setState` dentro del effect). `<ProductDetail key={producto.id} ... />` en `page.tsx` para forzar remount y evitar estado obsoleto (talla seleccionada, imagen, vistos recientemente) al navegar entre productos vía `<Link>` (hallazgo de `code-reviewer`). `SizeGuideModal` cierra con tecla Escape. Todos los `<img>` llevan `eslint-disable` con nota "revisado en Task 15" (migración a `next/image`).
>
> **Bloqueo no relacionado detectado y resuelto:** el servidor de desarrollo devolvía 500 en todas las rutas por conflicto de rutas duplicadas preexistente entre `app/admin/{banners,categorias,configuracion,cupones,envios,pedidos,productos}` (planas) y `app/admin/(protected)/{...}`. No fue causado por esta tarea. Se resolvió como parte de la fusión `hondusport-next/` → raíz del repo (commit `fix: fusionar hondusport-next/ con la raíz del repo y resolver conflicto de rutas admin`): se eliminó el grupo de rutas `(protected)` (duplicado y desactualizado). Verificado: `npm run dev` → `/` 200, `/admin` 307, `/admin/login` 200; `npm run build` genera la tabla de rutas sin conflictos.

### Task 13: Checkout — Server Action + CheckoutModal

**Files:** `app/(store)/checkout/actions.ts`, `components/store/CheckoutModal.tsx` (+ css).

- [x] **Step 1: `checkout/actions.ts`** — `'use server'`. `crearPedido(payload)` valida (Zod) e inserta en `pedidos` (mapear: `nombre_cliente`, `telefono`, `ciudad`, `envio_id`, `envio_nombre`, `cupon_codigo`, `subtotal`, `descuento_cupon`, `costo_envio`, `total`, `estado:'recibido'`) y luego `pedido_items` (mapear cada `CartItem` → `nombre_producto`, `precio`, `cantidad`, `talla`, `personalizado_nombre`, `imagen_url`, `producto_id`). Devolver `{ pedidoId, numero }` o `{ error }`. Usar `createClient()` server-side (RLS permite insert público). Tipos consistentes con `app/admin/pedidos/actions.ts` y `types/index.ts` (`Pedido`, `PedidoItem`).

- [x] **Step 2: CheckoutModal** (client) — portar `selectShipping` (app.js:1243), `updateCheckoutPreview` (app.js:1306), formulario con auto-save a `localStorage('hs_checkout_delivery')`. Al enviar: llamar `crearPedido` (Server Action) y, con éxito, construir el texto de WhatsApp (portar `getOrderText` app.js:1368) y `window.open(wa.me/${whatsapp_principal}?text=...)`. Mostrar estado "procesando" mientras corre la action; rollback/error visible si falla. **CSS:** `styles.css` **1252-1303** (`.checkout-modal`, `.checkout-content`, `#delivery-info`) + `.delivery-option-btn` **1069-1095** + checkout responsive (líneas ~2578+).

- [x] **Step 3: Tests** del mapeo `CartItem[] → pedido_items[]` y del cálculo de totales (subtotal/descuento cupón/descuento envío/costo envío/total) extraído a `lib/store/orderTotals.ts`. 80%+.

- [x] **Step 4: Commit** `feat(store): checkout Server Action (pedidos+items) + CheckoutModal WhatsApp`

> **Nota de implementación — modelo de confianza del checkout:** `pedidos`/`pedido_items` no tienen política de SELECT pública (RLS), así que un `INSERT ... RETURNING` desde el cliente anon no devuelve la fila creada. Se creó la función `SECURITY DEFINER` `crear_pedido` (`supabase/migrations/2026-06-11-crear-pedido-rpc.sql`, `set search_path = public`) que inserta `pedidos` + `pedido_items` en una transacción y devuelve `id, numero`.
>
> Una primera versión de `actions.ts` confiaba en `cart[].precio`, `activeDiscount`, `envio.costo`/`descuento` y la config de envío gratis enviados desde el cliente para calcular los totales persistidos — el agente `code-reviewer` marcó esto como **CRITICAL** (un atacante podría forjar precios casi nulos o un descuento del 100%), más 2 hallazgos **HIGH** (errores crudos de Postgres devueltos al cliente vía la RPC; `envio_id` no validado contra la tabla `envios`) y 2 **MEDIUM** (`cuponCodigo` no validado contra `cupones`; config de envío gratis aceptada del cliente).
>
> Se rehizo `actions.ts` para que el cliente solo envíe `{ id, size, custom, qty }` por ítem (`id` validado como `z.string().uuid()`, `qty` acotado a `1..99`), `envioId` y `cuponCodigo`. El servidor re-consulta `productos` (precio/nombre/imagen autoritativos, rechaza si falta o está inactivo), `envios` (rechaza si falta o `activo=false`), `cupones` (solo aplica el descuento si `activo=true`) y `configuracion` (`free_shipping_activo`/`free_shipping_minimo` vía `toConfigMap`), y recalcula los totales con `calculateOrderTotals` a partir de estos valores. Los errores de la RPC se registran con `console.error` y al cliente se devuelve un mensaje genérico. Re-revisado por `code-reviewer`: **APPROVE** (0 CRITICAL, 0 HIGH).

### Task 14: Home — Server Component + StoreClient (wiring final)

**Files:** `app/(store)/page.tsx`, `app/(store)/StoreClient.tsx`, `app/(store)/page.module.css`.

- [x] **Step 1: `page.tsx`** Server Component — fetch SSR en paralelo (igual que el admin con `Promise.all` + `await createClient()`): productos activos con join `categorias!productos_categoria_id_fkey(valor), subcategorias:categorias!productos_subcategoria_id_fkey(valor)`, categorias por tipo, banners activos ordenados, envíos activos, cupones activos, config. Adaptar con `toStoreProducto`/`toConfigMap`. `generateMetadata` desde config (`site_name`, `eslogan`, `meta_descripcion`, `og_image_url`).

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { data } = await supabase.from('configuracion').select('key,value')
  const c = toConfigMap(data ?? [])
  const title = c.site_name + (c.eslogan ? ` | ${c.eslogan}` : '')
  return {
    title,
    description: c.meta_descripcion || undefined,
    openGraph: { title, images: c.og_image_url ? [c.og_image_url] : [] },
  }
}
```

- [x] **Step 2: `StoreClient.tsx`** — Client Component orquestador que recibe todos los datos SSR y monta: providers (Cart/Wishlist ya vienen del layout o se montan aquí), Nav, HeroCarousel, CategoryBar, CategoryGallery, FilterSidebar + ProductGrid, CartDrawer, WishlistDrawer, CheckoutModal, MegaSearch, ExitPopup, Footer, MobileNav. Estado compartido de filtros/drawers a este nivel (portar los `let` globales de `app.js` a `useState`). Promo bar (app.js:431) + social-proof toast opcional (app.js:1508).

- [x] **Step 3: Verificación visual** en `npm run dev` a 320/768/1024/1440. Verificar dark/light, carrito persistente, checkout escribe en Supabase (revisar `/admin/pedidos`).

- [x] **Step 4: Commit** `feat(store): home SSR + StoreClient (wiring completo de la tienda)`

> **Notas de implementación:** `StoreClient.tsx` recibe `productos`/`categorias`/`banners`/`envios`/`cupones`/`config` desde `page.tsx` (SSR) y centraliza el estado: `activeCat`/`activeSubcat` (navegación por categoría/subcategoría desde `StoreHeader`/`CategoryBar`/`CategoryGallery`), `filters: FilterState` (estado propio de `FilterSidebar`, emitido vía `onChange`), y los booleanos de apertura de `CartDrawer`/`WishlistDrawer`/`MegaSearch`/`CheckoutModal`/`FilterSidebar` (mobile). `effectiveCats`/`effectiveSubcats` combinan la selección de navegación (`activeCat`/`activeSubcat`, si hay una activa) con los checkboxes de `FilterSidebar` (`filters.cats`/`filters.subcats`) sin que ninguno de los dos sobrescriba al otro. `quickAdd(id)` resuelve `getTallas` y llama `useCart().addToCart` con talla/talla "Única" y "Sin personalización" por defecto; `openProduct(id)` navega a `/producto/${id}` vía `useRouter`. `freeShippingActivo`/`cuponesPopupActivo` se derivan de `config` tolerando mayúsculas/minúsculas (`isConfigActivo`, default `true` si la clave no existe); `freeShippingThreshold` valida que `config.free_shipping_minimo` sea un número finito y no vacío antes de usarlo, con fallback a `999`. La promo bar (`config.promo_bar_texto`) se renderiza como texto plano (sin `dangerouslySetInnerHTML`); el toast de "social proof" (app.js:1508) se dejó fuera de alcance (opcional según el plan). `page.module.css` define el grid `catalogLayout` (sidebar + grid, colapsa a una columna en móvil) y el botón flotante `.mobileFilterTrigger` que abre `FilterSidebar` en móvil (puerta de entrada que faltaba desde Task 8).
>
> Revisado por `code-reviewer`: 1 HIGH (estado de filtros de categoría/subcategoría duplicado entre `CategoryBar` y `FilterSidebar` podía sobrescribirse mutuamente) y 1 MEDIUM (`free_shipping_minimo` vacío o no numérico podía producir `0`/`NaN` y desactivar/forzar el envío gratis silenciosamente) — ambos corregidos (estado `activeSubcat` separado + `effectiveSubcats`; validación de `freeShippingThreshold` con `Number.isFinite`). Verificado: `npx tsc --noEmit` limpio, `npx eslint` sin errores, `npx vitest run` 86/86, `npm run dev` → `/` 200 sin errores en consola del servidor.

---

## FASE S6 — Pulido, accesibilidad, performance y verificación

### Task 15: Limpieza, a11y, performance y build

**Files:** varios `*.module.css`, componentes.

- [x] **Step 1:** Reemplazar `<img>` por `next/image` donde falte; añadir `width`/`height`, `loading="lazy"` below-the-fold, `priority` solo al hero. Configurar `images.remotePatterns` en `next.config.ts` para el dominio de Supabase Storage y URLs externas existentes.
- [x] **Step 2:** A11y: `aria-label` en botones de icono, navegación por teclado en drawers/modales (Escape para cerrar, focus trap), `prefers-reduced-motion` para animaciones.
- [x] **Step 3:** Portar bloques responsive restantes de `styles.css` **1711-2801** a los módulos correspondientes; verificar que ningún selector global quede huérfano.
- [x] **Step 4:** `npm run build` sin errores; `npm run lint` limpio; `npx vitest run` verde con 80%+ en `lib/store/**`.
- [x] **Step 5: Commit** `chore(store): a11y, next/image, responsive y verificación de build`

> **Nota de implementación (Step 3):** `styles.css` (raíz del repo) corresponde al sitio vanilla-JS legacy (`index.html`/`app.js`) y **no está importado por la app Next** (`app/`, `components/`) — se confirmó con grep. Las funcionalidades responsive reales de los bloques 1711-2801 ya tienen equivalente en los módulos CSS de los componentes nuevos, construidos y verificados visualmente (320/768/1024/1440) en la Tarea 14: `.bottom-nav*` → `MobileNav.module.css` (`.bottomNav`, `.bottomNavItem`, `.bottomBadge`), `.mobile-nav-drawer*` → `MobileNav.module.css` (`.drawer`, `.drawerOpen`, etc.), `.scroll-hint`/`@keyframes scrollBounce` → `HeroCarousel.module.css`, `.card-mobile-add-btn` → `ProductCard.module.css` (`.cardMobileAddBtn`), `.product-card h3`/`.price` y `.product-img-container` → `ProductCard.module.css`, `.gallery-container`/`.product-page-content` → `ProductDetail.module.css` (`@media max-width: 799px`), `.share-btn-container` → `ProductDetail.module.css` (`.shareGrid`/`.shareBtn`), `.mobile-filter-trigger` → `page.module.css`. El resto de clases "Nuevas clases extraídas de JS" (`.cart-item-img`, `.wishlist-btn`, `.related-item-title`, etc.) son selectores legacy del vanilla JS sin contraparte en los componentes React y quedan huérfanas únicamente dentro de `styles.css`, archivo que no se carga en la app Next. `.product-sticky-bar` y `.carousel-scroll-hint` son funcionalidades del sitio viejo no incluidas en el alcance de este rediseño (no están en el spec de diseño ni en los componentes nuevos).
>
> **Nota de implementación (Step 4):** `npm run build` compila sin errores (Turbopack, 14 rutas generadas). `npm run lint` → 0 errores, 38 warnings preexistentes en `app.js` (vanilla legacy, variables sin usar) y 2 en componentes admin (`no-img-element`), ninguno en `components/store` ni `lib/store`. `npx vitest run --coverage` → 86/86 tests verdes; `lib/store/**` con 100% statements/lines, 100% funcs, 91.81% branches (≥80%). Se agregó `@vitest/coverage-v8` como devDependency para habilitar el reporte de cobertura.

> **Nota de cutover:** este plan deja la tienda funcionando en `hondusport-next/` ruta `/`. El cambio de DNS de `hondusport.com` (que hoy sirve el viejo `index.html`/`app.js`/`styles.css`) está cubierto en FASE 12 del plan admin (`2026-06-09-hondusport-nextjs-supabase.md`) y NO se aborda aquí. Los archivos viejos en la raíz del repo (`index.html`, `app.js`, `styles.css`) pueden eliminarse en un commit posterior una vez validada la paridad.

---

## Resumen de Fases

| Fase | Tareas | Entregable |
|---|---|---|
| S1 — Setup tienda | 1-3 | Route group `(store)`, variables CSS/tema, tipos+adapters (test), providers carrito/wishlist/tema |
| S2 — Estructura | 4-6 | Nav+ThemeToggle+MobileNav, HeroCarousel, Footer, CategoryBar, CategoryGallery |
| S3 — Catálogo | 7-9 | ProductCard (timer/wishlist), FilterSidebar + filtros/orden (test, Fuse.js), ProductGrid (secciones+paginación) |
| S4 — Drawers/Search | 10-11 | CartDrawer (envío gratis+cupón), WishlistDrawer, MegaSearch, ExitPopup |
| S5 — Producto+Checkout | 12-14 | Página `/producto/[id]` SSR, Checkout Server Action (pedidos+items)+modal WhatsApp, home SSR + StoreClient |
| S6 — Pulido | 15 | a11y, next/image, responsive, build/lint/tests verdes |
