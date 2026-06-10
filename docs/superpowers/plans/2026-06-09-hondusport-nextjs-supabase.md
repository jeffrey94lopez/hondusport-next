# Hondusport — Admin Panel Next.js + Supabase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el admin panel completo de Hondusport (8 módulos) en Next.js 14 + Supabase, reemplazando n8n, PHP y Google Sheets.

**Architecture:** Next.js 14 App Router. Server Components para SSR. Server Actions para mutaciones CRUD. Middleware en `/admin/**` verifica sesión Supabase Auth. CSS Modules + variables CSS globales. Proyecto en `hondusport-next/` dentro del repo actual.

**Tech Stack:** Next.js 14.x, TypeScript, @supabase/ssr, @supabase/supabase-js, xlsx, CSS Modules, Vitest

---

## Scope

Cubre **infraestructura + admin panel completo (8 módulos)**. La tienda pública (migración de `app.js` → componentes Next.js) es Plan B separado.

---

## Mapa de Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/schema.sql` | Schema SQL completo para ejecutar en Supabase |
| `hondusport-next/types/index.ts` | Todos los tipos TypeScript compartidos |
| `hondusport-next/lib/supabase-server.ts` | Cliente Supabase para Server Components |
| `hondusport-next/lib/supabase-client.ts` | Cliente Supabase para componentes browser |
| `hondusport-next/lib/xlsx-parser.ts` | Agrupa filas XLSX → productos |
| `hondusport-next/middleware.ts` | Guard de auth: redirect a /admin/login |
| `hondusport-next/app/globals.css` | Variables CSS + reset global |
| `hondusport-next/app/layout.tsx` | Root layout (HTML, body, fuentes) |
| `hondusport-next/app/admin/layout.tsx` | Admin shell: sidebar + contenido |
| `hondusport-next/app/admin/login/page.tsx` | Login form con Supabase Auth |
| `hondusport-next/app/admin/page.tsx` | Dashboard: stats del día + pedidos recientes |
| `hondusport-next/app/admin/productos/page.tsx` | Server Component: lista de productos (SSR) |
| `hondusport-next/app/admin/productos/ProductosClient.tsx` | Client Component: búsqueda, modal CRUD |
| `hondusport-next/app/admin/productos/actions.ts` | Server Actions: crear, editar, eliminar producto |
| `hondusport-next/app/admin/pedidos/page.tsx` | Lista de pedidos con filtros |
| `hondusport-next/app/admin/pedidos/actions.ts` | Server Action: cambiar estado |
| `hondusport-next/app/admin/categorias/page.tsx` | Tabs por tipo (cat/subcat/talla/genero) |
| `hondusport-next/app/admin/categorias/actions.ts` | CRUD categorías |
| `hondusport-next/app/admin/cupones/page.tsx` | Lista de cupones con toggles |
| `hondusport-next/app/admin/cupones/actions.ts` | CRUD cupones |
| `hondusport-next/app/admin/envios/page.tsx` | Lista de opciones de envío |
| `hondusport-next/app/admin/envios/actions.ts` | CRUD envíos |
| `hondusport-next/app/admin/banners/page.tsx` | Cards de banners con preview |
| `hondusport-next/app/admin/banners/actions.ts` | CRUD banners |
| `hondusport-next/app/admin/configuracion/page.tsx` | 6 secciones de config del sitio |
| `hondusport-next/app/admin/configuracion/actions.ts` | Guardar config key-value |
| `hondusport-next/app/api/import/route.ts` | POST: parsear XLSX + upsert Supabase |
| `hondusport-next/components/admin/Sidebar.tsx` | Nav lateral con grupos y badge de pedidos |
| `hondusport-next/components/admin/Modal.tsx` | Modal genérico con overlay |
| `hondusport-next/components/admin/ImageUpload.tsx` | Upload a Supabase Storage |
| `hondusport-next/components/admin/Toggle.tsx` | Toggle switch activo/inactivo |
| `hondusport-next/lib/tests/xlsx-parser.test.ts` | Tests unitarios del parser |

---

## FASE 1 — Setup

### Task 1: Crear proyecto Next.js e instalar dependencias

**Files:**
- Crear: `hondusport-next/` (directorio raíz del proyecto)
- Crear: `hondusport-next/.env.local`

- [ ] **Step 1: Inicializar el proyecto**

Ejecutar desde `C:/Users/jeffr/OneDrive/Aplicaciones/Hondusport`:

```bash
npx create-next-app@latest hondusport-next \
  --typescript \
  --no-tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias="@/*" \
  --yes
```

Expected: directorio `hondusport-next/` creado con App Router configurado.

- [ ] **Step 2: Instalar dependencias de producción**

```bash
cd hondusport-next
npm install @supabase/ssr @supabase/supabase-js xlsx
```

Expected: packages instalados sin errores.

- [ ] **Step 3: Instalar dependencias de desarrollo**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom
```

- [ ] **Step 4: Configurar Vitest**

Crear `hondusport-next/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 5: Crear archivo `.env.local`**

Crear `hondusport-next/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

> Obtener estos valores en Supabase → Project Settings → API.

- [ ] **Step 6: Verificar que el proyecto arranca**

```bash
npm run dev
```

Expected: `✓ Ready in Xs` en `http://localhost:3000`. No errores.

- [ ] **Step 7: Commit**

```bash
cd ..
git add hondusport-next/
git commit -m "feat: inicializar proyecto Next.js 14 con TypeScript y Supabase deps"
```

---

### Task 2: Schema Supabase

**Files:**
- Crear: `supabase/schema.sql`

- [ ] **Step 1: Crear el directorio y archivo SQL**

Crear `supabase/schema.sql` con el contenido completo:

```sql
-- Extensiones
create extension if not exists "uuid-ossp";

-- ── CATEGORIAS ──
create table if not exists categorias (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('cat','subcat','talla','genero')),
  valor           text not null,
  imagen          text,
  categorias_padre text[],
  orden           integer default 0,
  activo          boolean default true
);

-- ── ENVIOS (antes de pedidos por la foreign key) ──
create table if not exists envios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  tipo        text default 'delivery' check (tipo in ('delivery','pickup')),
  costo       numeric default 0,
  descuento   numeric default 0,
  activo      boolean default true
);

-- ── PRODUCTOS ──
create table if not exists productos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  descripcion      text,
  precio           numeric not null,
  precio_original  numeric,
  categoria_id     uuid references categorias(id) on delete set null,
  stock            integer,
  genero           text,
  badge            text,
  tallas           text[],
  colores          text[],
  imagenes         text[],
  marca            text,
  sku              text,
  personalizable   boolean default false,
  oferta_fin       timestamptz,
  activo           boolean default true,
  rating           integer default 5,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── PEDIDOS ──
create table if not exists pedidos (
  id               uuid primary key default gen_random_uuid(),
  numero           serial,
  nombre_cliente   text not null,
  telefono         text not null,
  ciudad           text not null,
  envio_id         uuid references envios(id) on delete set null,
  envio_nombre     text,
  cupon_codigo     text,
  subtotal         numeric not null,
  descuento_cupon  numeric default 0,
  costo_envio      numeric default 0,
  total            numeric not null,
  estado           text default 'recibido'
                     check (estado in ('recibido','preparando','enviado','entregado','cancelado')),
  notas            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── PEDIDO_ITEMS ──
create table if not exists pedido_items (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid references pedidos(id) on delete cascade,
  producto_id          uuid references productos(id) on delete set null,
  nombre_producto      text not null,
  precio               numeric not null,
  cantidad             integer not null default 1,
  talla                text,
  color                text,
  personalizado_nombre text,
  personalizado_numero text,
  imagen_url           text
);

-- ── CUPONES ──
create table if not exists cupones (
  id         uuid primary key default gen_random_uuid(),
  codigo     text unique not null,
  descuento  numeric not null,
  tipo       text default 'porcentaje',
  activo     boolean default true,
  created_at timestamptz default now()
);

-- ── BANNERS ──
create table if not exists banners (
  id         uuid primary key default gen_random_uuid(),
  titulo     text,
  subtitulo  text,
  btn_texto  text default 'Ver más',
  btn_link   text default '#tienda',
  imagen     text,
  orden      integer default 0,
  activo     boolean default true
);

-- ── CONFIGURACION ──
create table if not exists configuracion (
  key   text primary key,
  value text
);

-- Insertar claves iniciales de config
insert into configuracion (key, value) values
  ('site_name', 'Hondusport'),
  ('site_url', 'https://hondusport.com'),
  ('logo_url', ''),
  ('eslogan', 'Elite Performance'),
  ('color_principal', '#C9A84C'),
  ('whatsapp_principal', ''),
  ('whatsapp_secundario', ''),
  ('email_contacto', ''),
  ('direccion', ''),
  ('ciudad', 'Tegucigalpa'),
  ('horario', 'Lun-Sáb 9am-6pm'),
  ('moneda', 'L.'),
  ('instagram', ''),
  ('facebook', ''),
  ('twitter', ''),
  ('youtube', ''),
  ('tiktok', ''),
  ('meta_descripcion', ''),
  ('og_image_url', ''),
  ('ga_id', ''),
  ('gtm_id', ''),
  ('free_shipping_activo', 'true'),
  ('free_shipping_minimo', '999'),
  ('cupones_popup_activo', 'true'),
  ('promo_bar_activo', 'true'),
  ('promo_bar_texto', '🔥 Envío gratis desde L. 999'),
  ('modo_mantenimiento', 'false')
on conflict (key) do nothing;

-- ── TRIGGER updated_at ──
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger productos_updated_at
  before update on productos
  for each row execute function update_updated_at();

create trigger pedidos_updated_at
  before update on pedidos
  for each row execute function update_updated_at();

-- ── RLS ──
alter table productos enable row level security;
alter table categorias enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table envios enable row level security;
alter table cupones enable row level security;
alter table banners enable row level security;
alter table configuracion enable row level security;

-- Lectura pública para la tienda
create policy "public_read_productos" on productos for select using (activo = true);
create policy "public_read_categorias" on categorias for select using (activo = true);
create policy "public_read_envios" on envios for select using (activo = true);
create policy "public_read_cupones" on cupones for select using (activo = true);
create policy "public_read_banners" on banners for select using (activo = true);
create policy "public_read_config" on configuracion for select using (true);

-- Escritura de pedidos desde la tienda
create policy "public_insert_pedidos" on pedidos for insert with check (true);
create policy "public_insert_pedido_items" on pedido_items for insert with check (true);

-- Admin: acceso completo para usuarios autenticados
create policy "admin_all_productos" on productos for all using (auth.role() = 'authenticated');
create policy "admin_all_categorias" on categorias for all using (auth.role() = 'authenticated');
create policy "admin_all_pedidos" on pedidos for all using (auth.role() = 'authenticated');
create policy "admin_all_pedido_items" on pedido_items for all using (auth.role() = 'authenticated');
create policy "admin_all_envios" on envios for all using (auth.role() = 'authenticated');
create policy "admin_all_cupones" on cupones for all using (auth.role() = 'authenticated');
create policy "admin_all_banners" on banners for all using (auth.role() = 'authenticated');
create policy "admin_all_config" on configuracion for all using (auth.role() = 'authenticated');

-- Storage buckets (ejecutar después de crear los buckets en UI)
-- Bucket: productos (público)
-- Bucket: banners (público)
```

- [ ] **Step 2: Ejecutar el schema en Supabase**

En el dashboard de Supabase → SQL Editor → New query → pegar el contenido de `supabase/schema.sql` → Run.

Expected: "Success. No rows returned" para cada statement.

- [ ] **Step 3: Crear Storage buckets**

En Supabase → Storage → New bucket:
- Nombre: `productos`, Public: ON
- Nombre: `banners`, Public: ON

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: schema SQL completo — 8 tablas, RLS, triggers, config inicial"
```

---

### Task 3: TypeScript types

**Files:**
- Crear: `hondusport-next/types/index.ts`

- [ ] **Step 1: Escribir todos los tipos del dominio**

Crear `hondusport-next/types/index.ts`:

```typescript
export interface Categoria {
  id: string
  tipo: 'cat' | 'subcat' | 'talla' | 'genero'
  valor: string
  imagen: string | null
  categorias_padre: string[] | null
  orden: number
  activo: boolean
}

export interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  precio_original: number | null
  categoria_id: string | null
  stock: number | null
  genero: string | null
  badge: string | null
  tallas: string[] | null
  colores: string[] | null
  imagenes: string[] | null
  marca: string | null
  sku: string | null
  personalizable: boolean
  oferta_fin: string | null
  activo: boolean
  rating: number
  created_at: string
  updated_at: string
  categorias?: { valor: string } | null
}

export interface ProductoForm {
  nombre: string
  descripcion: string
  precio: number
  precio_original: number | null
  categoria_id: string | null
  stock: number | null
  genero: string
  badge: string
  tallas: string
  colores: string
  marca: string
  sku: string
  personalizable: boolean
  activo: boolean
}

export type EstadoPedido = 'recibido' | 'preparando' | 'enviado' | 'entregado' | 'cancelado'

export interface Pedido {
  id: string
  numero: number
  nombre_cliente: string
  telefono: string
  ciudad: string
  envio_id: string | null
  envio_nombre: string | null
  cupon_codigo: string | null
  subtotal: number
  descuento_cupon: number
  costo_envio: number
  total: number
  estado: EstadoPedido
  notas: string | null
  created_at: string
  updated_at: string
  pedido_items?: PedidoItem[]
}

export interface PedidoItem {
  id: string
  pedido_id: string
  producto_id: string | null
  nombre_producto: string
  precio: number
  cantidad: number
  talla: string | null
  color: string | null
  personalizado_nombre: string | null
  personalizado_numero: string | null
  imagen_url: string | null
}

export interface Envio {
  id: string
  nombre: string
  descripcion: string | null
  tipo: 'delivery' | 'pickup'
  costo: number
  descuento: number
  activo: boolean
}

export interface Cupon {
  id: string
  codigo: string
  descuento: number
  tipo: string
  activo: boolean
  created_at: string
}

export interface Banner {
  id: string
  titulo: string | null
  subtitulo: string | null
  btn_texto: string
  btn_link: string
  imagen: string | null
  orden: number
  activo: boolean
}

export interface ConfigEntry {
  key: string
  value: string
}

export type ConfigMap = Record<string, string>

export interface XlsxRow {
  nombre_producto?: string
  precio_venta?: string | number
  existencia?: string | number
  tamano?: string
  color?: string
  marca?: string
  cbarras?: string
  nombre_categoria?: string
  is_active?: string
  descripcion_producto?: string
  [key: string]: unknown
}

export interface ProductoAgrupado {
  nombre: string
  precio: number
  stock: number
  tallas: string[]
  colores: string[]
  marca: string
  sku: string
  categoria: string
  activo: boolean
  descripcion: string
}

export interface ActionResult {
  error?: string
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd hondusport-next
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd ..
git add hondusport-next/types/
git commit -m "feat: tipos TypeScript para todos los modelos del dominio"
```

---

### Task 4: Clientes Supabase

**Files:**
- Crear: `hondusport-next/lib/supabase-server.ts`
- Crear: `hondusport-next/lib/supabase-client.ts`

- [ ] **Step 1: Cliente server-side**

Crear `hondusport-next/lib/supabase-server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 2: Cliente browser**

Crear `hondusport-next/lib/supabase-client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add hondusport-next/lib/
git commit -m "feat: clientes Supabase server-side y browser via @supabase/ssr"
```

---

## FASE 2 — Auth

### Task 5: Middleware de autenticación

**Files:**
- Crear: `hondusport-next/middleware.ts`

- [ ] **Step 1: Escribir el middleware**

Crear `hondusport-next/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/admin/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd hondusport-next && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd ..
git add hondusport-next/middleware.ts
git commit -m "feat: middleware Next.js — guard de auth para /admin/**"
```

---

### Task 6: Login page

**Files:**
- Crear: `hondusport-next/app/admin/login/page.tsx`
- Crear: `hondusport-next/app/admin/login/login.module.css`

- [ ] **Step 1: Escribir la página de login**

Crear `hondusport-next/app/admin/login/page.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>HS</div>
        <h1 className={styles.title}>Admin Panel</h1>
        <p className={styles.sub}>Hondusport</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={styles.input}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} className={styles.btn}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escribir el CSS del login**

Crear `hondusport-next/app/admin/login/login.module.css`:

```css
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
}

.card {
  background: #141414;
  border: 1px solid #1e1e1e;
  border-radius: 16px;
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 380px;
  text-align: center;
}

.logo {
  width: 52px;
  height: 52px;
  background: #C9A84C;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 900;
  color: #000;
  margin: 0 auto 1.2rem;
}

.title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.2rem;
}

.sub {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  margin-bottom: 2rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.input {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0.7rem 1rem;
  color: #e0e0e0;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.input:focus {
  border-color: #C9A84C;
}

.error {
  font-size: 0.8rem;
  color: #e05555;
  text-align: left;
}

.btn {
  background: #C9A84C;
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 0.75rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 0.25rem;
  transition: opacity 0.15s;
}

.btn:hover:not(:disabled) { opacity: 0.88; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Probar el login**

```bash
cd hondusport-next && npm run dev
```

Navegar a `http://localhost:3000/admin` — debe redirigir a `/admin/login`. Ingresar credenciales de Supabase Auth → debe redirigir a `/admin`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add hondusport-next/app/admin/login/
git commit -m "feat: login page con Supabase Auth — formulario, redirect y estilos"
```

---

## FASE 3 — Admin Shell

### Task 7: CSS variables globales

**Files:**
- Modificar: `hondusport-next/app/globals.css`

- [ ] **Step 1: Reemplazar globals.css con variables del admin**

Reemplazar el contenido de `hondusport-next/app/globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:           #0f0f0f;
  --bg-deep:      #0a0a0a;
  --bg-card:      #141414;
  --bg-hover:     #1a1a1a;
  --bg-input:     #1a1a1a;
  --border:       #1e1e1e;
  --border-light: #252525;
  --border-input: #2a2a2a;
  --accent:       #C9A84C;
  --accent-dim:   rgba(201, 168, 76, 0.12);
  --accent-border:rgba(201, 168, 76, 0.35);
  --text:         #e0e0e0;
  --text-muted:   rgba(255, 255, 255, 0.45);
  --text-dim:     rgba(255, 255, 255, 0.25);
  --danger:       #e05555;
  --success:      #5bbf6b;
  --warning:      #f59e0b;
  --info:         #3b8fed;
  --sidebar-w:    200px;
  --sidebar-col:  52px;
  --topbar-h:     52px;
}

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }
button { font-family: inherit; }
input, textarea, select { font-family: inherit; }

input[type="text"],
input[type="email"],
input[type="number"],
input[type="password"],
input[type="url"],
textarea,
select {
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 7px;
  color: var(--text);
  padding: 0.55rem 0.85rem;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent);
}

select option {
  background: var(--bg-card);
  color: var(--text);
}

::placeholder { color: var(--text-dim); }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add hondusport-next/app/globals.css
git commit -m "feat: variables CSS globales — dark theme gold accent"
```

---

### Task 8: Sidebar + Admin Layout

**Files:**
- Crear: `hondusport-next/components/admin/Sidebar.tsx`
- Crear: `hondusport-next/components/admin/Sidebar.module.css`
- Crear: `hondusport-next/app/admin/layout.tsx`
- Crear: `hondusport-next/app/admin/layout.module.css`
- Crear: `hondusport-next/app/admin/actions.ts`

- [ ] **Step 1: Server Action para signout**

Crear `hondusport-next/app/admin/actions.ts`:

```typescript
'use server'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/admin/login')
}
```

- [ ] **Step 2: Sidebar component**

Crear `hondusport-next/components/admin/Sidebar.tsx`:

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/app/admin/actions'
import styles from './Sidebar.module.css'

const NAV_GROUPS = [
  {
    label: 'TIENDA',
    items: [
      { href: '/admin/productos', icon: '📦', label: 'Productos' },
      { href: '/admin/categorias', icon: '🏷️', label: 'Categorías' },
      { href: '/admin/banners', icon: '🖼️', label: 'Banners' },
    ],
  },
  {
    label: 'VENTAS',
    items: [
      { href: '/admin/pedidos', icon: '📋', label: 'Pedidos', badge: true },
      { href: '/admin/cupones', icon: '🎟️', label: 'Cupones' },
      { href: '/admin/envios', icon: '🚚', label: 'Envíos' },
    ],
  },
]

interface Props {
  pendingOrders: number
}

export default function Sidebar({ pendingOrders }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>HS</div>
        {!collapsed && <span className={styles.brand}>Hondusport</span>}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} className={styles.group}>
            {!collapsed && <span className={styles.groupLabel}>{group.label}</span>}
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.item} ${isActive(item.href) ? styles.active : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className={styles.icon}>{item.icon}</span>
                {!collapsed && (
                  <span className={styles.itemLabel}>
                    {item.label}
                    {item.badge && pendingOrders > 0 && (
                      <span className={styles.badge}>{pendingOrders}</span>
                    )}
                  </span>
                )}
              </Link>
            ))}
            <div className={styles.divider} />
          </div>
        ))}
      </nav>

      <div className={styles.bottom}>
        <Link
          href="/admin/configuracion"
          className={`${styles.item} ${isActive('/admin/configuracion') ? styles.active : ''}`}
          title={collapsed ? 'Configuración' : undefined}
        >
          <span className={styles.icon}>⚙️</span>
          {!collapsed && <span className={styles.itemLabel}>Configuración</span>}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className={styles.item}
            title={collapsed ? 'Salir' : undefined}
          >
            <span className={styles.icon}>🚪</span>
            {!collapsed && <span className={styles.itemLabel}>Salir</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: CSS del Sidebar**

Crear `hondusport-next/components/admin/Sidebar.module.css`:

```css
.sidebar {
  width: var(--sidebar-w);
  background: var(--bg-deep);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  overflow: hidden;
  transition: width 0.2s ease;
}

.collapsed { width: var(--sidebar-col); }

.header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 0.7rem;
  border-bottom: 1px solid var(--border);
  min-height: 52px;
  flex-shrink: 0;
}

.logo {
  width: 32px;
  height: 32px;
  background: var(--accent);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  color: #000;
  flex-shrink: 0;
}

.brand {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--text);
  white-space: nowrap;
  flex: 1;
}

.collapseBtn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0 0.2rem;
  line-height: 1;
  flex-shrink: 0;
}
.collapseBtn:hover { color: var(--text); }

.nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.group {
  margin-bottom: 0.25rem;
}

.groupLabel {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 0.5rem 0.85rem 0.25rem;
  white-space: nowrap;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.7rem;
  margin: 0 0.4rem;
  border-radius: 7px;
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: none;
  width: calc(100% - 0.8rem);
  text-align: left;
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
  text-decoration: none;
}

.item:hover { background: var(--bg-hover); color: var(--text); }

.active {
  background: var(--accent-dim);
  color: var(--accent);
}

.icon {
  width: 20px;
  text-align: center;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.itemLabel {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
}

.badge {
  background: var(--accent);
  color: #000;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 900;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  margin-left: auto;
}

.divider {
  height: 1px;
  background: var(--border);
  margin: 0.3rem 0.7rem;
}

.bottom {
  border-top: 1px solid var(--border);
  padding: 0.4rem 0;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Admin layout**

Crear `hondusport-next/app/admin/layout.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import Sidebar from '@/components/admin/Sidebar'
import styles from './layout.module.css'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { count } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'recibido')

  return (
    <div className={styles.shell}>
      <Sidebar pendingOrders={count ?? 0} />
      <div className={styles.content}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 5: CSS del admin layout**

Crear `hondusport-next/app/admin/layout.module.css`:

```css
.shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

.content {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
}
```

- [ ] **Step 6: Probar la shell**

```bash
cd hondusport-next && npm run dev
```

Navegar a `http://localhost:3000/admin` (logueado). Expected: sidebar visible a la izquierda, área de contenido vacía a la derecha.

- [ ] **Step 7: Commit**

```bash
cd ..
git add hondusport-next/app/admin/ hondusport-next/components/admin/Sidebar.tsx hondusport-next/components/admin/Sidebar.module.css
git commit -m "feat: admin shell — sidebar colapsable con grupos de nav y badge de pedidos"
```

---

### Task 9: Componentes reutilizables (Modal + Toggle)

**Files:**
- Crear: `hondusport-next/components/admin/Modal.tsx`
- Crear: `hondusport-next/components/admin/Modal.module.css`
- Crear: `hondusport-next/components/admin/Toggle.tsx`
- Crear: `hondusport-next/components/admin/Toggle.module.css`

- [ ] **Step 1: Modal component**

Crear `hondusport-next/components/admin/Modal.tsx`:

```typescript
'use client'
import { useEffect } from 'react'
import styles from './Modal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}

export default function Modal({ title, onClose, children, maxWidth = '560px' }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ maxWidth }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} type="button">×</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modal CSS**

Crear `hondusport-next/components/admin/Modal.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.4rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-card);
  z-index: 1;
}

.title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.2rem;
}
.close:hover { color: var(--text); }

.body {
  padding: 1.4rem;
}
```

- [ ] **Step 3: Toggle component**

Crear `hondusport-next/components/admin/Toggle.tsx`:

```typescript
'use client'
import styles from './Toggle.module.css'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export default function Toggle({ checked, onChange, disabled = false, label }: Props) {
  return (
    <label className={`${styles.toggle} ${disabled ? styles.disabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className={styles.input}
      />
      <span className={styles.track}>
        <span className={styles.thumb} />
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  )
}
```

- [ ] **Step 4: Toggle CSS**

Crear `hondusport-next/components/admin/Toggle.module.css`:

```css
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.disabled { opacity: 0.5; cursor: not-allowed; }

.input { display: none; }

.track {
  width: 36px;
  height: 20px;
  background: #2a2a2a;
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.input:checked + .track { background: var(--accent); }

.thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: left 0.2s;
}

.input:checked + .track .thumb { left: 18px; }

.label {
  font-size: 0.82rem;
  color: var(--text-muted);
}
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add hondusport-next/components/admin/
git commit -m "feat: componentes Modal y Toggle reutilizables para el admin"
```

---

## FASE 4 — Módulo Productos

### Task 10: Server Component y Actions de Productos

**Files:**
- Crear: `hondusport-next/app/admin/productos/page.tsx`
- Crear: `hondusport-next/app/admin/productos/actions.ts`

- [ ] **Step 1: Server Actions CRUD**

Crear `hondusport-next/app/admin/productos/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, ProductoForm } from '@/types'

export async function createProducto(form: ProductoForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('productos').insert({
    nombre: form.nombre,
    descripcion: form.descripcion || null,
    precio: form.precio,
    precio_original: form.precio_original || null,
    categoria_id: form.categoria_id || null,
    stock: form.stock ?? null,
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    personalizable: form.personalizable,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}

export async function updateProducto(id: string, form: ProductoForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('productos').update({
    nombre: form.nombre,
    descripcion: form.descripcion || null,
    precio: form.precio,
    precio_original: form.precio_original || null,
    categoria_id: form.categoria_id || null,
    stock: form.stock ?? null,
    genero: form.genero || null,
    badge: form.badge || null,
    tallas: form.tallas ? form.tallas.split(',').map(s => s.trim()).filter(Boolean) : null,
    colores: form.colores ? form.colores.split(',').map(s => s.trim()).filter(Boolean) : null,
    marca: form.marca || null,
    sku: form.sku || null,
    personalizable: form.personalizable,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}

export async function deleteProducto(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}

export async function toggleProductoActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('productos').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/productos')
  return {}
}
```

- [ ] **Step 2: Página de productos (Server Component)**

Crear `hondusport-next/app/admin/productos/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import ProductosClient from './ProductosClient'

export default async function ProductosPage() {
  const supabase = createClient()
  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias(valor)')
      .order('nombre')
      .limit(500),
    supabase
      .from('categorias')
      .select('id, valor')
      .eq('tipo', 'cat')
      .eq('activo', true)
      .order('valor'),
  ])

  return (
    <ProductosClient
      productos={productos ?? []}
      categorias={categorias ?? []}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add hondusport-next/app/admin/productos/page.tsx hondusport-next/app/admin/productos/actions.ts
git commit -m "feat: productos — Server Component SSR + Server Actions CRUD"
```

---

### Task 11: ProductosClient — lista + modal CRUD

**Files:**
- Crear: `hondusport-next/app/admin/productos/ProductosClient.tsx`
- Crear: `hondusport-next/app/admin/productos/productos.module.css`

- [ ] **Step 1: Escribir el componente cliente**

Crear `hondusport-next/app/admin/productos/ProductosClient.tsx`:

```typescript
'use client'
import { useState, useTransition, useMemo } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Producto, Categoria, ProductoForm } from '@/types'
import {
  createProducto,
  updateProducto,
  deleteProducto,
  toggleProductoActivo,
} from './actions'
import styles from './productos.module.css'

interface Props {
  productos: Producto[]
  categorias: { id: string; valor: string }[]
}

const EMPTY_FORM: ProductoForm = {
  nombre: '',
  descripcion: '',
  precio: 0,
  precio_original: null,
  categoria_id: null,
  stock: null,
  genero: '',
  badge: '',
  tallas: '',
  colores: '',
  marca: '',
  sku: '',
  personalizable: false,
  activo: true,
}

export default function ProductosClient({ productos, categorias }: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState<ProductoForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    if (!search.trim()) return productos
    const q = search.toLowerCase()
    return productos.filter(
      p =>
        p.nombre.toLowerCase().includes(q) ||
        p.marca?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    )
  }, [productos, search])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(p: Producto) {
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: p.precio,
      precio_original: p.precio_original,
      categoria_id: p.categoria_id,
      stock: p.stock,
      genero: p.genero ?? '',
      badge: p.badge ?? '',
      tallas: p.tallas?.join(', ') ?? '',
      colores: p.colores?.join(', ') ?? '',
      marca: p.marca ?? '',
      sku: p.sku ?? '',
      personalizable: p.personalizable,
      activo: p.activo,
    })
    setFormError('')
    setEditing(p)
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setEditing(null)
  }

  function handleToggle(id: string, activo: boolean) {
    startTransition(async () => {
      await toggleProductoActivo(id, activo)
    })
  }

  function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const result = await deleteProducto(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    if (form.precio <= 0) { setFormError('El precio debe ser mayor a 0'); return }

    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateProducto(editing.id, form)
        : await createProducto(form)
      if (result.error) { setFormError(result.error); return }
      closeModal()
    })
  }

  const f = (field: keyof ProductoForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Productos</h1>
          <p className={styles.subtitle}>{filtered.length} de {productos.length} productos</p>
        </div>
        <div className={styles.actions}>
          <input
            type="text"
            placeholder="Buscar por nombre, marca o SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.search}
          />
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Nuevo producto
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Categoría</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>
                  <div className={styles.productName}>{p.nombre}</div>
                  {p.marca && <div className={styles.productMeta}>{p.marca}</div>}
                </td>
                <td>
                  <div className={styles.precio}>L. {p.precio.toLocaleString()}</div>
                  {p.precio_original && (
                    <div className={styles.precioOriginal}>L. {p.precio_original.toLocaleString()}</div>
                  )}
                </td>
                <td>
                  <span className={p.stock !== null && p.stock < 5 ? styles.stockLow : ''}>
                    {p.stock ?? '∞'}
                  </span>
                </td>
                <td>{p.categorias?.valor ?? '—'}</td>
                <td>
                  <Toggle
                    checked={p.activo}
                    onChange={checked => handleToggle(p.id, checked)}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(p)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(p.id, p.nombre)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {search ? `No hay productos que coincidan con "${search}"` : 'No hay productos aún.'}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? 'Editar producto' : 'Nuevo producto'}
          onClose={closeModal}
          maxWidth="640px"
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Nombre *
                <input type="text" value={form.nombre} onChange={f('nombre')} required />
              </label>
              <label className={styles.formLabel}>
                SKU / Código
                <input type="text" value={form.sku} onChange={f('sku')} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Precio (L.) *
                <input
                  type="number"
                  value={form.precio}
                  onChange={e => setForm(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label className={styles.formLabel}>
                Precio original (L.)
                <input
                  type="number"
                  value={form.precio_original ?? ''}
                  onChange={e => setForm(p => ({ ...p, precio_original: e.target.value ? parseFloat(e.target.value) : null }))}
                  min="0"
                  step="0.01"
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Categoría
                <select value={form.categoria_id ?? ''} onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value || null }))}>
                  <option value="">— Sin categoría —</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.valor}</option>
                  ))}
                </select>
              </label>
              <label className={styles.formLabel}>
                Stock (vacío = ilimitado)
                <input
                  type="number"
                  value={form.stock ?? ''}
                  onChange={e => setForm(p => ({ ...p, stock: e.target.value ? parseInt(e.target.value) : null }))}
                  min="0"
                />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Género
                <select value={form.genero} onChange={f('genero')}>
                  <option value="">— Sin género —</option>
                  <option value="Hombre">Hombre</option>
                  <option value="Mujer">Mujer</option>
                  <option value="Unisex">Unisex</option>
                  <option value="Niños">Niños</option>
                </select>
              </label>
              <label className={styles.formLabel}>
                Badge
                <select value={form.badge} onChange={f('badge')}>
                  <option value="">— Sin badge —</option>
                  <option value="Oferta">Oferta</option>
                  <option value="Nuevo">Nuevo</option>
                  <option value="Más Vendido">Más Vendido</option>
                </select>
              </label>
            </div>
            <label className={styles.formLabel}>
              Marca
              <input type="text" value={form.marca} onChange={f('marca')} />
            </label>
            <label className={styles.formLabel}>
              Tallas (separadas por coma)
              <input type="text" value={form.tallas} onChange={f('tallas')} placeholder="S, M, L, XL, XXL" />
            </label>
            <label className={styles.formLabel}>
              Colores (separados por coma)
              <input type="text" value={form.colores} onChange={f('colores')} placeholder="Rojo, Azul, Negro" />
            </label>
            <label className={styles.formLabel}>
              Descripción
              <textarea value={form.descripcion} onChange={f('descripcion')} rows={3} />
            </label>
            <div className={styles.formChecks}>
              <Toggle
                checked={form.personalizable}
                onChange={v => setForm(p => ({ ...p, personalizable: v }))}
                label="Personalizable"
              />
              <Toggle
                checked={form.activo}
                onChange={v => setForm(p => ({ ...p, activo: v }))}
                label="Activo"
              />
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 2: CSS de la página productos**

Crear `hondusport-next/app/admin/productos/productos.module.css`:

```css
.page {
  padding: 1.5rem;
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.title {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text);
}

.subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
}

.actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}

.search {
  width: 240px;
}

.btnPrimary {
  background: var(--accent);
  color: #000;
  border: none;
  border-radius: 7px;
  padding: 0.55rem 1rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.btnPrimary:hover:not(:disabled) { opacity: 0.88; }
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }

.tableWrap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.855rem;
}

.table th {
  text-align: left;
  padding: 0.7rem 1rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}

.table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}

.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: rgba(255,255,255,0.02); }

.productName { font-weight: 600; }
.productMeta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }

.precio { font-weight: 600; }
.precioOriginal { font-size: 0.75rem; color: var(--text-muted); text-decoration: line-through; }

.stockLow { color: var(--danger); font-weight: 600; }

.rowActions {
  display: flex;
  gap: 0.4rem;
}

.btnEdit,
.btnDelete {
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.12s;
}
.btnEdit:hover { border-color: var(--accent); color: var(--accent); }
.btnDelete:hover { border-color: var(--danger); color: var(--danger); }

.empty {
  padding: 3rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88rem;
}

/* Form */
.form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.formRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.formLabel {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.formChecks {
  display: flex;
  gap: 1.5rem;
}

.formError {
  font-size: 0.8rem;
  color: var(--danger);
}

.formFooter {
  display: flex;
  gap: 0.6rem;
  justify-content: flex-end;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
  margin-top: 0.25rem;
}

.btnCancel {
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 7px;
  padding: 0.55rem 1rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  cursor: pointer;
}
.btnCancel:hover { color: var(--text); }
```

- [ ] **Step 3: Probar el módulo de productos**

```bash
cd hondusport-next && npm run dev
```

Navegar a `http://localhost:3000/admin/productos`. Expected: tabla de productos vacía con botón "Nuevo producto". Crear un producto → aparece en la tabla. Editar → modal pre-relleno. Toggle activo → cambia sin recargar. Eliminar → confirma y desaparece.

- [ ] **Step 4: Commit**

```bash
cd ..
git add hondusport-next/app/admin/productos/
git commit -m "feat: módulo productos — lista SSR, búsqueda, CRUD modal, toggle activo"
```

---

## FASE 5 — XLSX Importer

### Task 12: Parser XLSX + tests + API route

**Files:**
- Crear: `hondusport-next/lib/xlsx-parser.ts`
- Crear: `hondusport-next/lib/tests/xlsx-parser.test.ts`
- Crear: `hondusport-next/app/api/import/route.ts`

- [ ] **Step 1: Escribir el test primero**

Crear `hondusport-next/lib/tests/xlsx-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { agruparProductos } from '../xlsx-parser'
import type { XlsxRow } from '@/types'

describe('agruparProductos', () => {
  it('agrupa filas con mismo nombre como un producto', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: 'Camiseta Nike', precio_venta: '350', existencia: '5', tamano: 'S', color: 'Rojo', marca: 'Nike', cbarras: 'ABC123', nombre_categoria: 'Camisetas', is_active: 'VERDADERO' },
      { nombre_producto: 'Camiseta Nike', precio_venta: '350', existencia: '3', tamano: 'M', color: 'Rojo', marca: 'Nike', cbarras: 'ABC123', nombre_categoria: 'Camisetas', is_active: 'VERDADERO' },
    ]
    const result = agruparProductos(rows)
    expect(result).toHaveLength(1)
    expect(result[0].tallas).toEqual(['S', 'M'])
    expect(result[0].stock).toBe(8)
    expect(result[0].precio).toBe(350)
  })

  it('deduplica tallas y colores', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: 'Shorts', precio_venta: '200', existencia: '2', tamano: 'L', color: 'Azul', marca: 'Adidas', cbarras: 'X1', nombre_categoria: 'Shorts', is_active: 'VERDADERO' },
      { nombre_producto: 'Shorts', precio_venta: '200', existencia: '2', tamano: 'L', color: 'Negro', marca: 'Adidas', cbarras: 'X1', nombre_categoria: 'Shorts', is_active: 'VERDADERO' },
    ]
    const result = agruparProductos(rows)
    expect(result[0].tallas).toEqual(['L'])
    expect(result[0].colores).toEqual(['Azul', 'Negro'])
  })

  it('excluye filas con is_active FALSO', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: 'Inactivo', precio_venta: '100', existencia: '1', is_active: 'FALSO' },
    ]
    const result = agruparProductos(rows)
    expect(result).toHaveLength(0)
  })

  it('omite filas sin nombre_producto', () => {
    const rows: XlsxRow[] = [
      { nombre_producto: '', precio_venta: '100', existencia: '1', is_active: 'VERDADERO' },
    ]
    const result = agruparProductos(rows)
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Ejecutar el test — verificar que falla**

```bash
cd hondusport-next && npx vitest run lib/tests/xlsx-parser.test.ts
```

Expected: `FAIL — Cannot find module '../xlsx-parser'`.

- [ ] **Step 3: Implementar el parser**

Crear `hondusport-next/lib/xlsx-parser.ts`:

```typescript
import type { XlsxRow, ProductoAgrupado } from '@/types'

function isActive(val: unknown): boolean {
  const s = String(val ?? '').toUpperCase().trim()
  return s === 'VERDADERO' || s === 'TRUE' || s === '1'
}

export function agruparProductos(rows: XlsxRow[]): ProductoAgrupado[] {
  const map = new Map<string, ProductoAgrupado>()

  for (const row of rows) {
    const nombre = String(row.nombre_producto ?? '').trim()
    if (!nombre) continue
    if (!isActive(row.is_active)) continue

    const precio = parseFloat(String(row.precio_venta ?? '0')) || 0
    const stock = parseInt(String(row.existencia ?? '0')) || 0
    const talla = String(row.tamano ?? '').trim()
    const color = String(row.color ?? '').trim()

    if (map.has(nombre)) {
      const p = map.get(nombre)!
      p.stock += stock
      if (talla && !p.tallas.includes(talla)) p.tallas.push(talla)
      if (color && !p.colores.includes(color)) p.colores.push(color)
    } else {
      map.set(nombre, {
        nombre,
        precio,
        stock,
        tallas: talla ? [talla] : [],
        colores: color ? [color] : [],
        marca: String(row.marca ?? '').trim(),
        sku: String(row.cbarras ?? '').trim(),
        categoria: String(row.nombre_categoria ?? '').trim(),
        activo: true,
        descripcion: String(row.descripcion_producto ?? '').trim(),
      })
    }
  }

  return Array.from(map.values())
}
```

- [ ] **Step 4: Ejecutar el test — verificar que pasa**

```bash
npx vitest run lib/tests/xlsx-parser.test.ts
```

Expected: `PASS — 4 tests passed`.

- [ ] **Step 5: API route de importación**

Crear `hondusport-next/app/api/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { agruparProductos } from '@/lib/xlsx-parser'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { XlsxRow } from '@/types'

export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(sheet)

  const productos = agruparProductos(rows)

  if (productos.length === 0) {
    return NextResponse.json({ error: 'No se encontraron productos activos en el archivo' }, { status: 400 })
  }

  const payload = productos.map(p => ({
    nombre: p.nombre,
    precio: p.precio,
    stock: p.stock,
    tallas: p.tallas.length > 0 ? p.tallas : null,
    colores: p.colores.length > 0 ? p.colores : null,
    marca: p.marca || null,
    sku: p.sku || null,
    descripcion: p.descripcion || null,
    activo: true,
  }))

  const { error, count } = await supabase
    .from('productos')
    .upsert(payload, { onConflict: 'sku', ignoreDuplicates: false })
    .select('id', { count: 'exact', head: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    imported: count ?? productos.length,
    total: productos.length,
  })
}
```

- [ ] **Step 6: Agregar botón de importación en ProductosClient**

Abrir `hondusport-next/app/admin/productos/ProductosClient.tsx` y agregar el botón y handler de importación:

Después de las importaciones existentes, agregar el handler:

```typescript
  const [importing, setImporting] = useState(false)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const json = await res.json()
      if (json.error) { alert('Error: ' + json.error); return }
      alert(`✓ Importados ${json.imported} productos`)
      window.location.reload()
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }
```

En el botón `+ Nuevo producto`, agregar antes:

```tsx
          <label className={`${styles.btnSecondary} ${importing ? styles.importing : ''}`}>
            {importing ? 'Importando…' : '↑ Importar XLSX'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              style={{ display: 'none' }}
              disabled={importing}
            />
          </label>
```

Agregar `.btnSecondary` y `.importing` al CSS:

```css
.btnSecondary {
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 7px;
  padding: 0.55rem 1rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.btnSecondary:hover { border-color: var(--accent); color: var(--accent); }
.importing { opacity: 0.6; cursor: not-allowed; }
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add hondusport-next/lib/ hondusport-next/app/api/
git commit -m "feat: XLSX importer — parser con tests, API route upsert, botón en productos"
```

---

## FASE 6 — Módulo Pedidos

### Task 13: Pedidos page + actions

**Files:**
- Crear: `hondusport-next/app/admin/pedidos/page.tsx`
- Crear: `hondusport-next/app/admin/pedidos/PedidosClient.tsx`
- Crear: `hondusport-next/app/admin/pedidos/actions.ts`
- Crear: `hondusport-next/app/admin/pedidos/pedidos.module.css`

- [ ] **Step 1: Server Action para cambiar estado**

Crear `hondusport-next/app/admin/pedidos/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, EstadoPedido } from '@/types'

export async function cambiarEstado(id: string, estado: EstadoPedido): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('pedidos').update({ estado }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos')
  return {}
}
```

- [ ] **Step 2: Server Component de pedidos**

Crear `hondusport-next/app/admin/pedidos/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import PedidosClient from './PedidosClient'

export default async function PedidosPage() {
  const supabase = createClient()
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, pedido_items(*)')
    .order('created_at', { ascending: false })
    .limit(200)

  return <PedidosClient pedidos={pedidos ?? []} />
}
```

- [ ] **Step 3: Client Component de pedidos**

Crear `hondusport-next/app/admin/pedidos/PedidosClient.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import type { Pedido, EstadoPedido } from '@/types'
import { cambiarEstado } from './actions'
import styles from './pedidos.module.css'

const ESTADOS: EstadoPedido[] = ['recibido', 'preparando', 'enviado', 'entregado', 'cancelado']
const ESTADO_LABEL: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}
const ESTADO_COLOR: Record<EstadoPedido, string> = {
  recibido: '#3b8fed',
  preparando: '#f59e0b',
  enviado: '#8b5cf6',
  entregado: '#5bbf6b',
  cancelado: '#e05555',
}

interface Props { pedidos: Pedido[] }

export default function PedidosClient({ pedidos }: Props) {
  const [filtro, setFiltro] = useState<EstadoPedido | 'todos'>('todos')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = filtro === 'todos' ? pedidos : pedidos.filter(p => p.estado === filtro)

  function handleEstado(id: string, estado: EstadoPedido) {
    startTransition(async () => { await cambiarEstado(id, estado) })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>{filtered.length} pedidos</p>
        </div>
      </div>

      <div className={styles.filtros}>
        <button
          className={`${styles.filtroBtn} ${filtro === 'todos' ? styles.filtroActive : ''}`}
          onClick={() => setFiltro('todos')}
        >
          Todos ({pedidos.length})
        </button>
        {ESTADOS.map(e => (
          <button
            key={e}
            className={`${styles.filtroBtn} ${filtro === e ? styles.filtroActive : ''}`}
            onClick={() => setFiltro(e)}
            style={filtro === e ? { borderColor: ESTADO_COLOR[e], color: ESTADO_COLOR[e] } : {}}
          >
            {ESTADO_LABEL[e]} ({pedidos.filter(p => p.estado === e).length})
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {filtered.map(pedido => (
          <div key={pedido.id} className={styles.card}>
            <div
              className={styles.cardHeader}
              onClick={() => setExpanded(expanded === pedido.id ? null : pedido.id)}
            >
              <div className={styles.cardLeft}>
                <span className={styles.numero}>#{pedido.numero}</span>
                <span className={styles.cliente}>{pedido.nombre_cliente}</span>
                <span className={styles.ciudad}>{pedido.ciudad}</span>
              </div>
              <div className={styles.cardRight}>
                <span className={styles.total}>L. {pedido.total.toLocaleString()}</span>
                <select
                  value={pedido.estado}
                  onChange={e => handleEstado(pedido.id, e.target.value as EstadoPedido)}
                  disabled={isPending}
                  className={styles.estadoSelect}
                  style={{ color: ESTADO_COLOR[pedido.estado] }}
                  onClick={e => e.stopPropagation()}
                >
                  {ESTADOS.map(e => (
                    <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                  ))}
                </select>
                <a
                  href={`https://wa.me/${pedido.telefono}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.waBtn}
                  onClick={e => e.stopPropagation()}
                >
                  WhatsApp
                </a>
                <span className={styles.chevron}>{expanded === pedido.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === pedido.id && (
              <div className={styles.cardBody}>
                {pedido.pedido_items?.map(item => (
                  <div key={item.id} className={styles.item}>
                    <span className={styles.itemNombre}>{item.nombre_producto}</span>
                    <span className={styles.itemDet}>
                      {item.talla && `Talla: ${item.talla}`}
                      {item.color && ` · Color: ${item.color}`}
                      {item.personalizado_nombre && ` · Nombre: ${item.personalizado_nombre}`}
                      {item.personalizado_numero && ` · Número: ${item.personalizado_numero}`}
                    </span>
                    <span className={styles.itemPrecio}>
                      {item.cantidad}× L. {item.precio.toLocaleString()}
                    </span>
                  </div>
                ))}
                {pedido.notas && <p className={styles.notas}>Nota: {pedido.notas}</p>}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.empty}>No hay pedidos en este estado.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: CSS de pedidos**

Crear `hondusport-next/app/admin/pedidos/pedidos.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { margin-bottom: 1rem; }
.title { font-size: 1.25rem; font-weight: 800; }
.subtitle { font-size: 0.8rem; color: var(--text-muted); }

.filtros {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.filtroBtn {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 0.35rem 0.9rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s;
}
.filtroBtn:hover { color: var(--text); }
.filtroActive { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.list { display: flex; flex-direction: column; gap: 0.5rem; }

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  cursor: pointer;
  gap: 1rem;
}
.cardHeader:hover { background: rgba(255,255,255,0.02); }

.cardLeft, .cardRight {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.numero { font-weight: 800; color: var(--accent); font-size: 0.88rem; }
.cliente { font-weight: 600; font-size: 0.9rem; }
.ciudad { font-size: 0.8rem; color: var(--text-muted); }
.total { font-weight: 700; font-size: 0.9rem; }

.estadoSelect {
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  width: auto;
}

.waBtn {
  background: #25d366;
  color: #000;
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 700;
  transition: opacity 0.15s;
}
.waBtn:hover { opacity: 0.85; }

.chevron { font-size: 0.7rem; color: var(--text-muted); }

.cardBody {
  border-top: 1px solid var(--border);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.82rem;
}
.itemNombre { font-weight: 600; flex: 1; }
.itemDet { color: var(--text-muted); }
.itemPrecio { font-weight: 700; white-space: nowrap; }

.notas {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}

.empty { padding: 3rem; text-align: center; color: var(--text-muted); }
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add hondusport-next/app/admin/pedidos/
git commit -m "feat: módulo pedidos — lista filtrable, cambio de estado inline, link WhatsApp, detalle expandible"
```

---

## FASE 7 — Módulo Categorías

### Task 14: Categorías page + actions

**Files:**
- Crear: `hondusport-next/app/admin/categorias/page.tsx`
- Crear: `hondusport-next/app/admin/categorias/CategoriasClient.tsx`
- Crear: `hondusport-next/app/admin/categorias/actions.ts`
- Crear: `hondusport-next/app/admin/categorias/categorias.module.css`

- [ ] **Step 1: Server Actions**

Crear `hondusport-next/app/admin/categorias/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

interface CategoriaForm {
  tipo: 'cat' | 'subcat' | 'talla' | 'genero'
  valor: string
  imagen: string
  categorias_padre: string
  orden: number
  activo: boolean
}

export async function createCategoria(form: CategoriaForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('categorias').insert({
    tipo: form.tipo,
    valor: form.valor.trim(),
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre
      ? form.categorias_padre.split(',').map(s => s.trim()).filter(Boolean)
      : null,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}

export async function updateCategoria(id: string, form: CategoriaForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('categorias').update({
    tipo: form.tipo,
    valor: form.valor.trim(),
    imagen: form.imagen || null,
    categorias_padre: form.categorias_padre
      ? form.categorias_padre.split(',').map(s => s.trim()).filter(Boolean)
      : null,
    orden: form.orden,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}

export async function deleteCategoria(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/categorias')
  return {}
}
```

- [ ] **Step 2: Server Component**

Crear `hondusport-next/app/admin/categorias/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import CategoriasClient from './CategoriasClient'

export default async function CategoriasPage() {
  const supabase = createClient()
  const { data: categorias } = await supabase
    .from('categorias')
    .select('*')
    .order('tipo')
    .order('orden')
    .order('valor')

  return <CategoriasClient categorias={categorias ?? []} />
}
```

- [ ] **Step 3: Client Component**

Crear `hondusport-next/app/admin/categorias/CategoriasClient.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Categoria } from '@/types'
import { createCategoria, updateCategoria, deleteCategoria } from './actions'
import styles from './categorias.module.css'

const TIPOS = ['cat', 'subcat', 'talla', 'genero'] as const
type TipoTab = typeof TIPOS[number]
const TIPO_LABEL: Record<TipoTab, string> = {
  cat: 'Categorías',
  subcat: 'Subcategorías',
  talla: 'Tallas',
  genero: 'Géneros',
}

interface Props { categorias: Categoria[] }

const EMPTY = {
  tipo: 'cat' as TipoTab,
  valor: '',
  imagen: '',
  categorias_padre: '',
  orden: 0,
  activo: true,
}

export default function CategoriasClient({ categorias }: Props) {
  const [tab, setTab] = useState<TipoTab>('cat')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Categoria | null>(null)
  const [form, setForm] = useState({ ...EMPTY, tipo: 'cat' as TipoTab })
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  const inTab = categorias.filter(c => c.tipo === tab)

  function openCreate() {
    setForm({ ...EMPTY, tipo: tab })
    setFormError('')
    setEditing(null)
    setModal('create')
  }

  function openEdit(c: Categoria) {
    setForm({
      tipo: c.tipo,
      valor: c.valor,
      imagen: c.imagen ?? '',
      categorias_padre: c.categorias_padre?.join(', ') ?? '',
      orden: c.orden,
      activo: c.activo,
    })
    setFormError('')
    setEditing(c)
    setModal('edit')
  }

  function handleDelete(id: string, valor: string) {
    if (!confirm(`¿Eliminar "${valor}"?`)) return
    startTransition(async () => {
      const result = await deleteCategoria(id)
      if (result.error) alert(result.error)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.valor.trim()) { setFormError('El valor es requerido'); return }
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateCategoria(editing.id, form)
        : await createCategoria(form)
      if (result.error) { setFormError(result.error); return }
      setModal(null)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Categorías</h1>
        <button className={styles.btnPrimary} onClick={openCreate}>+ Nueva</button>
      </div>

      <div className={styles.tabs}>
        {TIPOS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {TIPO_LABEL[t]} ({categorias.filter(c => c.tipo === t).length})
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Valor</th>
              {(tab === 'subcat' || tab === 'talla') && <th>Categorías padre</th>}
              <th>Orden</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inTab.map(c => (
              <tr key={c.id}>
                <td>{c.valor}</td>
                {(tab === 'subcat' || tab === 'talla') && (
                  <td>{c.categorias_padre?.join(', ') ?? '—'}</td>
                )}
                <td>{c.orden}</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={() => {}}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(c)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(c.id, c.valor)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {inTab.length === 0 && (
          <div className={styles.empty}>No hay {TIPO_LABEL[tab].toLowerCase()} aún.</div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal === 'edit' ? `Editar ${TIPO_LABEL[form.tipo].slice(0,-1)}` : `Nueva ${TIPO_LABEL[tab].slice(0,-1)}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Valor *
              <input
                type="text"
                value={form.valor}
                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                required
              />
            </label>
            {(form.tipo === 'subcat' || form.tipo === 'talla') && (
              <label className={styles.formLabel}>
                Categorías padre (separadas por coma)
                <input
                  type="text"
                  value={form.categorias_padre}
                  onChange={e => setForm(p => ({ ...p, categorias_padre: e.target.value }))}
                  placeholder="Camisetas, Zapatillas"
                />
              </label>
            )}
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Orden
                <input
                  type="number"
                  value={form.orden}
                  onChange={e => setForm(p => ({ ...p, orden: parseInt(e.target.value) || 0 }))}
                  min="0"
                />
              </label>
              <label className={styles.formLabel}>
                Imagen URL
                <input
                  type="url"
                  value={form.imagen}
                  onChange={e => setForm(p => ({ ...p, imagen: e.target.value }))}
                />
              </label>
            </div>
            <Toggle
              checked={form.activo}
              onChange={v => setForm(p => ({ ...p, activo: v }))}
              label="Activo"
            />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 4: CSS de categorías**

Crear `hondusport-next/app/admin/categorias/categorias.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
.title { font-size: 1.25rem; font-weight: 800; }

.tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.tab {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 7px;
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s;
}
.tab:hover { color: var(--text); }
.tabActive { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.tableWrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 0.855rem; }
.table th { text-align: left; padding: 0.7rem 1rem; font-size: 0.72rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
.table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }

.rowActions { display: flex; gap: 0.4rem; }
.btnEdit, .btnDelete { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 6px; padding: 0.3rem 0.65rem; font-size: 0.75rem; cursor: pointer; color: var(--text-muted); transition: all 0.12s; }
.btnEdit:hover { border-color: var(--accent); color: var(--accent); }
.btnDelete:hover { border-color: var(--danger); color: var(--danger); }
.btnPrimary { background: var(--accent); color: #000; border: none; border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
.btnCancel { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; color: var(--text-muted); cursor: pointer; }

.empty { padding: 3rem; text-align: center; color: var(--text-muted); }

.form { display: flex; flex-direction: column; gap: 0.9rem; }
.formRow { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.formLabel { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.formError { font-size: 0.8rem; color: var(--danger); }
.formFooter { display: flex; gap: 0.6rem; justify-content: flex-end; padding-top: 0.5rem; border-top: 1px solid var(--border); }
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add hondusport-next/app/admin/categorias/
git commit -m "feat: módulo categorías — tabs por tipo, CRUD modal, orden"
```

---

## FASE 8 — Cupones y Envíos

### Task 15: Cupones page + actions

**Files:**
- Crear: `hondusport-next/app/admin/cupones/page.tsx`
- Crear: `hondusport-next/app/admin/cupones/CuponesClient.tsx`
- Crear: `hondusport-next/app/admin/cupones/actions.ts`
- Crear: `hondusport-next/app/admin/cupones/cupones.module.css`

- [ ] **Step 1: Actions**

Crear `hondusport-next/app/admin/cupones/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export async function createCupon(codigo: string, descuento: number): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('cupones').insert({
    codigo: codigo.toUpperCase().trim(),
    descuento,
    tipo: 'porcentaje',
    activo: true,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function toggleCupon(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('cupones').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}

export async function deleteCupon(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('cupones').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cupones')
  return {}
}
```

- [ ] **Step 2: Server Component**

Crear `hondusport-next/app/admin/cupones/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import CuponesClient from './CuponesClient'

export default async function CuponesPage() {
  const supabase = createClient()
  const { data: cupones } = await supabase.from('cupones').select('*').order('created_at', { ascending: false })
  return <CuponesClient cupones={cupones ?? []} />
}
```

- [ ] **Step 3: Client Component**

Crear `hondusport-next/app/admin/cupones/CuponesClient.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import Toggle from '@/components/admin/Toggle'
import Modal from '@/components/admin/Modal'
import type { Cupon } from '@/types'
import { createCupon, toggleCupon, deleteCupon } from './actions'
import styles from './cupones.module.css'

interface Props { cupones: Cupon[] }

export default function CuponesClient({ cupones }: Props) {
  const [modal, setModal] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [descuento, setDescuento] = useState<number>(10)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) { setFormError('El código es requerido'); return }
    if (descuento <= 0 || descuento > 100) { setFormError('El descuento debe estar entre 1 y 100'); return }
    setFormError('')
    startTransition(async () => {
      const result = await createCupon(codigo, descuento)
      if (result.error) { setFormError(result.error); return }
      setCodigo('')
      setDescuento(10)
      setModal(false)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Cupones</h1>
        <button className={styles.btnPrimary} onClick={() => setModal(true)}>+ Nuevo cupón</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descuento</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cupones.map(c => (
              <tr key={c.id}>
                <td><span className={styles.code}>{c.codigo}</span></td>
                <td>{c.descuento}%</td>
                <td>
                  <Toggle
                    checked={c.activo}
                    onChange={v => startTransition(async () => { await toggleCupon(c.id, v) })}
                    disabled={isPending}
                  />
                </td>
                <td>
                  <button
                    className={styles.btnDelete}
                    onClick={() => {
                      if (!confirm(`¿Eliminar cupón "${c.codigo}"?`)) return
                      startTransition(async () => { await deleteCupon(c.id) })
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cupones.length === 0 && <div className={styles.empty}>No hay cupones aún.</div>}
      </div>

      {modal && (
        <Modal title="Nuevo cupón" onClose={() => setModal(false)} maxWidth="400px">
          <form onSubmit={handleCreate} className={styles.form}>
            <label className={styles.formLabel}>
              Código (se guarda en mayúsculas)
              <input
                type="text"
                value={codigo}
                onChange={e => setCodigo(e.target.value.toUpperCase())}
                placeholder="HONDUSPORT10"
                required
              />
            </label>
            <label className={styles.formLabel}>
              Descuento (%)
              <input
                type="number"
                value={descuento}
                onChange={e => setDescuento(parseInt(e.target.value) || 0)}
                min="1"
                max="100"
                required
              />
            </label>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Creando…' : 'Crear cupón'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 4: CSS de cupones**

Crear `hondusport-next/app/admin/cupones/cupones.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.title { font-size: 1.25rem; font-weight: 800; }
.btnPrimary { background: var(--accent); color: #000; border: none; border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.btnPrimary:disabled { opacity: 0.5; }
.btnCancel { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; color: var(--text-muted); cursor: pointer; }
.btnDelete { background: none; border: 1px solid var(--border-light); border-radius: 6px; padding: 0.3rem 0.65rem; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
.btnDelete:hover { border-color: var(--danger); color: var(--danger); }
.tableWrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 0.855rem; }
.table th { text-align: left; padding: 0.7rem 1rem; font-size: 0.72rem; font-weight: 700; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
.table tr:last-child td { border-bottom: none; }
.code { font-family: monospace; font-size: 0.95rem; color: var(--accent); font-weight: 700; letter-spacing: 0.5px; }
.empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.form { display: flex; flex-direction: column; gap: 0.9rem; }
.formLabel { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.formError { font-size: 0.8rem; color: var(--danger); }
.formFooter { display: flex; gap: 0.6rem; justify-content: flex-end; padding-top: 0.5rem; border-top: 1px solid var(--border); }
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add hondusport-next/app/admin/cupones/
git commit -m "feat: módulo cupones — CRUD, toggle activo"
```

---

### Task 16: Envíos page + actions

**Files:**
- Crear: `hondusport-next/app/admin/envios/page.tsx`
- Crear: `hondusport-next/app/admin/envios/EnviosClient.tsx`
- Crear: `hondusport-next/app/admin/envios/actions.ts`
- Crear: `hondusport-next/app/admin/envios/envios.module.css`

- [ ] **Step 1: Actions**

Crear `hondusport-next/app/admin/envios/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

interface EnvioForm {
  nombre: string
  descripcion: string
  tipo: 'delivery' | 'pickup'
  costo: number
  descuento: number
  activo: boolean
}

export async function createEnvio(form: EnvioForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('envios').insert(form)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function updateEnvio(id: string, form: EnvioForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('envios').update(form).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}

export async function deleteEnvio(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('envios').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/envios')
  return {}
}
```

- [ ] **Step 2: Server Component**

Crear `hondusport-next/app/admin/envios/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import EnviosClient from './EnviosClient'

export default async function EnviosPage() {
  const supabase = createClient()
  const { data: envios } = await supabase.from('envios').select('*').order('nombre')
  return <EnviosClient envios={envios ?? []} />
}
```

- [ ] **Step 3: Client Component**

Crear `hondusport-next/app/admin/envios/EnviosClient.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import type { Envio } from '@/types'
import { createEnvio, updateEnvio, deleteEnvio } from './actions'
import styles from './envios.module.css'

interface Props { envios: Envio[] }

const EMPTY = {
  nombre: '',
  descripcion: '',
  tipo: 'delivery' as const,
  costo: 0,
  descuento: 0,
  activo: true,
}

export default function EnviosClient({ envios }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Envio | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openEdit(e: Envio) {
    setForm({
      nombre: e.nombre,
      descripcion: e.descripcion ?? '',
      tipo: e.tipo,
      costo: e.costo,
      descuento: e.descuento,
      activo: e.activo,
    })
    setEditing(e)
    setFormError('')
    setModal('edit')
  }

  async function handleSubmit(evt: React.FormEvent) {
    evt.preventDefault()
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateEnvio(editing.id, form)
        : await createEnvio(form)
      if (result.error) { setFormError(result.error); return }
      setModal(null)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Opciones de Envío</h1>
        <button className={styles.btnPrimary} onClick={() => { setForm({ ...EMPTY }); setEditing(null); setModal('create') }}>
          + Nueva opción
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Costo</th>
              <th>Descuento</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {envios.map(e => (
              <tr key={e.id}>
                <td>
                  <div className={styles.nombre}>{e.nombre}</div>
                  {e.descripcion && <div className={styles.desc}>{e.descripcion}</div>}
                </td>
                <td><span className={`${styles.tipo} ${e.tipo === 'pickup' ? styles.pickup : ''}`}>{e.tipo}</span></td>
                <td>L. {e.costo.toLocaleString()}</td>
                <td>{e.descuento > 0 ? `${e.descuento}%` : '—'}</td>
                <td>
                  <Toggle checked={e.activo} onChange={() => {}} disabled={isPending} />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.btnEdit} onClick={() => openEdit(e)}>Editar</button>
                    <button className={styles.btnDelete} onClick={() => {
                      if (!confirm(`¿Eliminar "${e.nombre}"?`)) return
                      startTransition(async () => { await deleteEnvio(e.id) })
                    }}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {envios.length === 0 && <div className={styles.empty}>No hay opciones de envío configuradas.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar envío' : 'Nueva opción de envío'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.formLabel}>
              Nombre *
              <input type="text" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} required />
            </label>
            <label className={styles.formLabel}>
              Descripción
              <input type="text" value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Entrega en 24-48h" />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Tipo
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as 'delivery' | 'pickup' }))}>
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Pickup en tienda</option>
                </select>
              </label>
              <label className={styles.formLabel}>
                Costo (L.)
                <input type="number" value={form.costo} onChange={e => setForm(p => ({ ...p, costo: parseFloat(e.target.value) || 0 }))} min="0" />
              </label>
            </div>
            <label className={styles.formLabel}>
              Descuento sobre costo (%)
              <input type="number" value={form.descuento} onChange={e => setForm(p => ({ ...p, descuento: parseFloat(e.target.value) || 0 }))} min="0" max="100" />
            </label>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 4: CSS de envíos**

Crear `hondusport-next/app/admin/envios/envios.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.title { font-size: 1.25rem; font-weight: 800; }
.btnPrimary { background: var(--accent); color: #000; border: none; border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.btnPrimary:disabled { opacity: 0.5; }
.btnCancel { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; color: var(--text-muted); cursor: pointer; }
.btnEdit, .btnDelete { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 6px; padding: 0.3rem 0.65rem; font-size: 0.75rem; cursor: pointer; color: var(--text-muted); transition: all 0.12s; }
.btnEdit:hover { border-color: var(--accent); color: var(--accent); }
.btnDelete:hover { border-color: var(--danger); color: var(--danger); }
.tableWrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.table { width: 100%; border-collapse: collapse; font-size: 0.855rem; }
.table th { text-align: left; padding: 0.7rem 1rem; font-size: 0.72rem; font-weight: 700; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
.table tr:last-child td { border-bottom: none; }
.nombre { font-weight: 600; }
.desc { font-size: 0.75rem; color: var(--text-muted); }
.tipo { font-size: 0.75rem; font-weight: 700; background: var(--accent-dim); color: var(--accent); border-radius: 20px; padding: 0.2rem 0.6rem; text-transform: uppercase; }
.pickup { background: rgba(91,191,107,0.12); color: var(--success); }
.rowActions { display: flex; gap: 0.4rem; }
.empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.form { display: flex; flex-direction: column; gap: 0.9rem; }
.formRow { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.formLabel { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.formError { font-size: 0.8rem; color: var(--danger); }
.formFooter { display: flex; gap: 0.6rem; justify-content: flex-end; padding-top: 0.5rem; border-top: 1px solid var(--border); }
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add hondusport-next/app/admin/envios/
git commit -m "feat: módulo envíos — CRUD delivery/pickup con costo y descuento"
```

---

## FASE 9 — Banners

### Task 17: ImageUpload component + Banners module

**Files:**
- Crear: `hondusport-next/components/admin/ImageUpload.tsx`
- Crear: `hondusport-next/components/admin/ImageUpload.module.css`
- Crear: `hondusport-next/app/admin/banners/page.tsx`
- Crear: `hondusport-next/app/admin/banners/BannersClient.tsx`
- Crear: `hondusport-next/app/admin/banners/actions.ts`
- Crear: `hondusport-next/app/admin/banners/banners.module.css`

- [ ] **Step 1: ImageUpload component**

Crear `hondusport-next/components/admin/ImageUpload.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import styles from './ImageUpload.module.css'

interface Props {
  bucket: 'productos' | 'banners'
  value: string
  onChange: (url: string) => void
  label?: string
}

export default function ImageUpload({ bucket, value, onChange, label = 'Imagen' }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true })
    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.labelText}>{label}</span>
      {value && (
        <div className={styles.preview}>
          <img src={value} alt="preview" className={styles.previewImg} />
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onChange('')}
          >
            ×
          </button>
        </div>
      )}
      {!value && (
        <label className={`${styles.uploadBtn} ${uploading ? styles.uploading : ''}`}>
          {uploading ? 'Subiendo…' : '+ Subir imagen'}
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      )}
      {value && !uploading && (
        <label className={styles.changeBtn}>
          Cambiar imagen
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: CSS de ImageUpload**

Crear `hondusport-next/components/admin/ImageUpload.module.css`:

```css
.wrap { display: flex; flex-direction: column; gap: 0.5rem; }
.labelText { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }

.preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16/7;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
}

.previewImg { width: 100%; height: 100%; object-fit: cover; }

.removeBtn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0,0,0,0.7);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.uploadBtn,
.changeBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: 1px dashed var(--border-input);
  border-radius: 8px;
  padding: 0.75rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s;
  width: 100%;
}
.uploadBtn:hover, .changeBtn:hover { border-color: var(--accent); color: var(--accent); }
.uploading { opacity: 0.6; cursor: not-allowed; }

.error { font-size: 0.78rem; color: var(--danger); }
```

- [ ] **Step 3: Actions de banners**

Crear `hondusport-next/app/admin/banners/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

interface BannerForm {
  titulo: string
  subtitulo: string
  btn_texto: string
  btn_link: string
  imagen: string
  orden: number
  activo: boolean
}

export async function createBanner(form: BannerForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('banners').insert(form)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}

export async function updateBanner(id: string, form: BannerForm): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('banners').update(form).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}

export async function deleteBanner(id: string): Promise<ActionResult> {
  const supabase = createClient()
  const { error } = await supabase.from('banners').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/banners')
  return {}
}
```

- [ ] **Step 4: Server Component**

Crear `hondusport-next/app/admin/banners/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import BannersClient from './BannersClient'

export default async function BannersPage() {
  const supabase = createClient()
  const { data: banners } = await supabase.from('banners').select('*').order('orden')
  return <BannersClient banners={banners ?? []} />
}
```

- [ ] **Step 5: Client Component**

Crear `hondusport-next/app/admin/banners/BannersClient.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import Modal from '@/components/admin/Modal'
import Toggle from '@/components/admin/Toggle'
import ImageUpload from '@/components/admin/ImageUpload'
import type { Banner } from '@/types'
import { createBanner, updateBanner, deleteBanner } from './actions'
import styles from './banners.module.css'

interface Props { banners: Banner[] }

const EMPTY = {
  titulo: '',
  subtitulo: '',
  btn_texto: 'Ver más',
  btn_link: '#tienda',
  imagen: '',
  orden: 0,
  activo: true,
}

export default function BannersClient({ banners }: Props) {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  function openEdit(b: Banner) {
    setForm({
      titulo: b.titulo ?? '',
      subtitulo: b.subtitulo ?? '',
      btn_texto: b.btn_texto,
      btn_link: b.btn_link,
      imagen: b.imagen ?? '',
      orden: b.orden,
      activo: b.activo,
    })
    setEditing(b)
    setFormError('')
    setModal('edit')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = modal === 'edit' && editing
        ? await updateBanner(editing.id, form)
        : await createBanner(form)
      if (result.error) { setFormError(result.error); return }
      setModal(null)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Banners</h1>
        <button className={styles.btnPrimary} onClick={() => { setForm({ ...EMPTY }); setEditing(null); setModal('create') }}>
          + Nuevo banner
        </button>
      </div>

      <div className={styles.grid}>
        {banners.map(b => (
          <div key={b.id} className={styles.card}>
            <div className={styles.cardImg}>
              {b.imagen
                ? <img src={b.imagen} alt={b.titulo ?? ''} className={styles.img} />
                : <div className={styles.noImg}>Sin imagen</div>
              }
              <div className={styles.cardBadge}>#{b.orden}</div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}>{b.titulo || '(sin título)'}</div>
              {b.subtitulo && <div className={styles.cardSub}>{b.subtitulo}</div>}
              <div className={styles.cardFooter}>
                <Toggle checked={b.activo} onChange={() => {}} disabled={isPending} />
                <div className={styles.cardActions}>
                  <button className={styles.btnEdit} onClick={() => openEdit(b)}>Editar</button>
                  <button className={styles.btnDelete} onClick={() => {
                    if (!confirm('¿Eliminar este banner?')) return
                    startTransition(async () => { await deleteBanner(b.id) })
                  }}>Eliminar</button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && <div className={styles.empty}>No hay banners configurados.</div>}
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Editar banner' : 'Nuevo banner'} onClose={() => setModal(null)} maxWidth="600px">
          <form onSubmit={handleSubmit} className={styles.form}>
            <ImageUpload
              bucket="banners"
              value={form.imagen}
              onChange={url => setForm(p => ({ ...p, imagen: url }))}
              label="Imagen del banner"
            />
            <label className={styles.formLabel}>
              Título
              <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
            </label>
            <label className={styles.formLabel}>
              Subtítulo
              <input type="text" value={form.subtitulo} onChange={e => setForm(p => ({ ...p, subtitulo: e.target.value }))} />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Texto del botón
                <input type="text" value={form.btn_texto} onChange={e => setForm(p => ({ ...p, btn_texto: e.target.value }))} />
              </label>
              <label className={styles.formLabel}>
                Link del botón
                <input type="text" value={form.btn_link} onChange={e => setForm(p => ({ ...p, btn_link: e.target.value }))} />
              </label>
            </div>
            <label className={styles.formLabel}>
              Orden
              <input type="number" value={form.orden} onChange={e => setForm(p => ({ ...p, orden: parseInt(e.target.value) || 0 }))} min="0" />
            </label>
            <Toggle checked={form.activo} onChange={v => setForm(p => ({ ...p, activo: v }))} label="Activo" />
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={isPending}>
                {isPending ? 'Guardando…' : modal === 'edit' ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 6: CSS de banners**

Crear `hondusport-next/app/admin/banners/banners.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.title { font-size: 1.25rem; font-weight: 800; }
.btnPrimary { background: var(--accent); color: #000; border: none; border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.btnPrimary:disabled { opacity: 0.5; }
.btnCancel { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 7px; padding: 0.55rem 1rem; font-size: 0.82rem; color: var(--text-muted); cursor: pointer; }
.btnEdit, .btnDelete { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 6px; padding: 0.3rem 0.65rem; font-size: 0.75rem; cursor: pointer; color: var(--text-muted); transition: all 0.12s; }
.btnEdit:hover { border-color: var(--accent); color: var(--accent); }
.btnDelete:hover { border-color: var(--danger); color: var(--danger); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }

.cardImg { position: relative; aspect-ratio: 16/7; background: var(--bg-hover); }
.img { width: 100%; height: 100%; object-fit: cover; }
.noImg { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-size: 0.8rem; }
.cardBadge { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: var(--accent); border-radius: 6px; padding: 2px 7px; font-size: 0.72rem; font-weight: 700; }

.cardBody { padding: 0.9rem; }
.cardTitle { font-weight: 700; font-size: 0.9rem; margin-bottom: 0.2rem; }
.cardSub { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.6rem; }
.cardFooter { display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; }
.cardActions { display: flex; gap: 0.4rem; }

.empty { padding: 3rem; text-align: center; color: var(--text-muted); grid-column: 1/-1; }

.form { display: flex; flex-direction: column; gap: 0.9rem; }
.formRow { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.formLabel { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.formError { font-size: 0.8rem; color: var(--danger); }
.formFooter { display: flex; gap: 0.6rem; justify-content: flex-end; padding-top: 0.5rem; border-top: 1px solid var(--border); }
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add hondusport-next/components/admin/ImageUpload.tsx hondusport-next/components/admin/ImageUpload.module.css hondusport-next/app/admin/banners/
git commit -m "feat: módulo banners + ImageUpload a Supabase Storage"
```

---

## FASE 10 — Configuración

### Task 18: Configuración page + actions

**Files:**
- Crear: `hondusport-next/app/admin/configuracion/page.tsx`
- Crear: `hondusport-next/app/admin/configuracion/ConfigClient.tsx`
- Crear: `hondusport-next/app/admin/configuracion/actions.ts`
- Crear: `hondusport-next/app/admin/configuracion/config.module.css`

- [ ] **Step 1: Actions**

Crear `hondusport-next/app/admin/configuracion/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export async function saveConfig(updates: Record<string, string>): Promise<ActionResult> {
  const supabase = createClient()
  const rows = Object.entries(updates).map(([key, value]) => ({ key, value }))
  const { error } = await supabase.from('configuracion').upsert(rows, { onConflict: 'key' })
  if (error) return { error: error.message }
  revalidatePath('/admin/configuracion')
  return {}
}
```

- [ ] **Step 2: Server Component**

Crear `hondusport-next/app/admin/configuracion/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import ConfigClient from './ConfigClient'
import type { ConfigMap } from '@/types'

export default async function ConfiguracionPage() {
  const supabase = createClient()
  const { data } = await supabase.from('configuracion').select('key, value')
  const config: ConfigMap = {}
  data?.forEach(({ key, value }) => { config[key] = value ?? '' })
  return <ConfigClient config={config} />
}
```

- [ ] **Step 3: Client Component (6 secciones)**

Crear `hondusport-next/app/admin/configuracion/ConfigClient.tsx`:

```typescript
'use client'
import { useState, useTransition } from 'react'
import ImageUpload from '@/components/admin/ImageUpload'
import Toggle from '@/components/admin/Toggle'
import type { ConfigMap } from '@/types'
import { saveConfig } from './actions'
import styles from './config.module.css'

interface Props { config: ConfigMap }

const SECTIONS = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'contacto', label: 'Contacto & Ubicación' },
  { id: 'redes', label: 'Redes Sociales' },
  { id: 'seo', label: 'SEO' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'usuarios', label: 'Usuarios' },
] as const

type SectionId = typeof SECTIONS[number]['id']

export default function ConfigClient({ config: initial }: Props) {
  const [tab, setTab] = useState<SectionId>('identidad')
  const [cfg, setCfg] = useState<ConfigMap>({ ...initial })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function set(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCfg(c => ({ ...c, [key]: e.target.value }))
  }

  function setToggle(key: string) {
    return (checked: boolean) => setCfg(c => ({ ...c, [key]: checked ? 'true' : 'false' }))
  }

  function bool(key: string) { return cfg[key] === 'true' }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await saveConfig(cfg)
      if (result.error) { setError(result.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Configuración</h1>
        <button
          form="config-form"
          type="submit"
          className={`${styles.btnPrimary} ${saved ? styles.saved : ''}`}
          disabled={isPending}
        >
          {saved ? '✓ Guardado' : isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      <div className={styles.tabs}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            className={`${styles.tab} ${tab === s.id ? styles.tabActive : ''}`}
            onClick={() => setTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form id="config-form" onSubmit={handleSave} className={styles.form}>
        {tab === 'identidad' && (
          <div className={styles.section}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Nombre del negocio
                <input type="text" value={cfg.site_name ?? ''} onChange={set('site_name')} />
              </label>
              <label className={styles.formLabel}>
                URL del sitio
                <input type="url" value={cfg.site_url ?? ''} onChange={set('site_url')} />
              </label>
            </div>
            <label className={styles.formLabel}>
              Eslogan
              <input type="text" value={cfg.eslogan ?? ''} onChange={set('eslogan')} />
            </label>
            <label className={styles.formLabel}>
              Color principal
              <div className={styles.colorRow}>
                <input type="color" value={cfg.color_principal ?? '#C9A84C'} onChange={set('color_principal')} className={styles.colorPicker} />
                <input type="text" value={cfg.color_principal ?? ''} onChange={set('color_principal')} placeholder="#C9A84C" className={styles.colorText} />
              </div>
            </label>
            <ImageUpload
              bucket="banners"
              value={cfg.logo_url ?? ''}
              onChange={url => setCfg(c => ({ ...c, logo_url: url }))}
              label="Logo"
            />
          </div>
        )}

        {tab === 'contacto' && (
          <div className={styles.section}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                WhatsApp principal
                <input type="text" value={cfg.whatsapp_principal ?? ''} onChange={set('whatsapp_principal')} placeholder="50499999999" />
              </label>
              <label className={styles.formLabel}>
                WhatsApp secundario
                <input type="text" value={cfg.whatsapp_secundario ?? ''} onChange={set('whatsapp_secundario')} />
              </label>
            </div>
            <label className={styles.formLabel}>
              Email de contacto
              <input type="email" value={cfg.email_contacto ?? ''} onChange={set('email_contacto')} />
            </label>
            <label className={styles.formLabel}>
              Dirección
              <input type="text" value={cfg.direccion ?? ''} onChange={set('direccion')} />
            </label>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Ciudad
                <input type="text" value={cfg.ciudad ?? ''} onChange={set('ciudad')} />
              </label>
              <label className={styles.formLabel}>
                Horario
                <input type="text" value={cfg.horario ?? ''} onChange={set('horario')} placeholder="Lun-Sáb 9am-6pm" />
              </label>
            </div>
          </div>
        )}

        {tab === 'redes' && (
          <div className={styles.section}>
            {(['instagram', 'facebook', 'twitter', 'youtube', 'tiktok'] as const).map(red => (
              <label key={red} className={styles.formLabel}>
                {red.charAt(0).toUpperCase() + red.slice(1)}
                <input type="url" value={cfg[red] ?? ''} onChange={set(red)} placeholder={`https://${red}.com/...`} />
              </label>
            ))}
          </div>
        )}

        {tab === 'seo' && (
          <div className={styles.section}>
            <label className={styles.formLabel}>
              Meta descripción
              <textarea value={cfg.meta_descripcion ?? ''} onChange={set('meta_descripcion')} rows={3} />
            </label>
            <ImageUpload
              bucket="banners"
              value={cfg.og_image_url ?? ''}
              onChange={url => setCfg(c => ({ ...c, og_image_url: url }))}
              label="OG Image (imagen para redes sociales)"
            />
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Google Analytics ID
                <input type="text" value={cfg.ga_id ?? ''} onChange={set('ga_id')} placeholder="G-XXXXXXXXXX" />
              </label>
              <label className={styles.formLabel}>
                Google Tag Manager ID
                <input type="text" value={cfg.gtm_id ?? ''} onChange={set('gtm_id')} placeholder="GTM-XXXXXXX" />
              </label>
            </div>
          </div>
        )}

        {tab === 'funcionalidades' && (
          <div className={styles.section}>
            <div className={styles.toggleRow}>
              <Toggle checked={bool('free_shipping_activo')} onChange={setToggle('free_shipping_activo')} label="Barra de envío gratis" />
              <label className={styles.formLabel}>
                Mínimo para envío gratis (L.)
                <input type="number" value={cfg.free_shipping_minimo ?? ''} onChange={set('free_shipping_minimo')} min="0" />
              </label>
            </div>
            <div className={styles.toggleRow}>
              <Toggle checked={bool('cupones_popup_activo')} onChange={setToggle('cupones_popup_activo')} label="Popup de cupón al salir" />
            </div>
            <div className={styles.toggleRow}>
              <Toggle checked={bool('promo_bar_activo')} onChange={setToggle('promo_bar_activo')} label="Barra promocional superior" />
              <label className={styles.formLabel}>
                Texto de la barra
                <input type="text" value={cfg.promo_bar_texto ?? ''} onChange={set('promo_bar_texto')} />
              </label>
            </div>
            <div className={styles.toggleRow}>
              <Toggle checked={bool('modo_mantenimiento')} onChange={setToggle('modo_mantenimiento')} label="Modo mantenimiento" />
            </div>
          </div>
        )}

        {tab === 'usuarios' && (
          <div className={styles.section}>
            <p className={styles.helpText}>
              Los usuarios del admin se gestionan en el dashboard de Supabase → Authentication → Users.
              Solo el propietario puede invitar nuevos usuarios desde allí.
            </p>
          </div>
        )}

        {error && <p className={styles.formError}>{error}</p>}
      </form>
    </div>
  )
}
```

- [ ] **Step 4: CSS de configuración**

Crear `hondusport-next/app/admin/configuracion/config.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
.title { font-size: 1.25rem; font-weight: 800; }
.btnPrimary { background: var(--accent); color: #000; border: none; border-radius: 7px; padding: 0.55rem 1.2rem; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: background 0.2s, opacity 0.15s; }
.btnPrimary:disabled { opacity: 0.5; }
.saved { background: var(--success); }

.tabs { display: flex; gap: 0.4rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.tab { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 7px; padding: 0.4rem 1rem; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
.tab:hover { color: var(--text); }
.tabActive { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.form { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
.section { display: flex; flex-direction: column; gap: 1rem; }
.formRow { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.formLabel { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.colorRow { display: flex; gap: 0.5rem; align-items: center; }
.colorPicker { width: 40px; height: 34px; border: 1px solid var(--border-input); border-radius: 7px; padding: 2px; background: var(--bg-input); cursor: pointer; flex-shrink: 0; }
.colorText { flex: 1; }
.toggleRow { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.9rem; background: var(--bg-hover); border-radius: 8px; border: 1px solid var(--border); }
.formError { font-size: 0.8rem; color: var(--danger); margin-top: 0.5rem; }
.helpText { font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; }
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add hondusport-next/app/admin/configuracion/
git commit -m "feat: módulo configuración — 6 secciones, color picker, logo upload, toggles"
```

---

## FASE 11 — Dashboard

### Task 19: Dashboard page

**Files:**
- Crear: `hondusport-next/app/admin/page.tsx`
- Crear: `hondusport-next/app/admin/dashboard.module.css`

- [ ] **Step 1: Dashboard Server Component**

Crear `hondusport-next/app/admin/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase-server'
import styles from './dashboard.module.css'
import type { Pedido } from '@/types'

export default async function DashboardPage() {
  const supabase = createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [
    { count: totalPedidosHoy },
    { count: pedidosPendientes },
    { count: totalProductos },
    { count: stockBajo },
    { data: pedidosRecientes },
    ventasHoyResult,
  ] = await Promise.all([
    supabase.from('pedidos').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'recibido'),
    supabase.from('productos').select('*', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('productos').select('*', { count: 'exact', head: true }).not('stock', 'is', null).lt('stock', 5).eq('activo', true),
    supabase.from('pedidos').select('id, numero, nombre_cliente, total, estado, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('pedidos').select('total').gte('created_at', todayISO),
  ])

  const ventasHoy = (ventasHoyResult.data ?? []).reduce((sum, p) => sum + (p.total ?? 0), 0)

  const ESTADO_COLOR: Record<string, string> = {
    recibido: '#3b8fed',
    preparando: '#f59e0b',
    enviado: '#8b5cf6',
    entregado: '#5bbf6b',
    cancelado: '#e05555',
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Dashboard</h1>
        <span className={styles.date}>
          {new Date().toLocaleDateString('es-HN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statNum}>{totalPedidosHoy ?? 0}</div>
          <div className={styles.statLabel}>Pedidos hoy</div>
        </div>
        <div className={`${styles.stat} ${(pedidosPendientes ?? 0) > 0 ? styles.statAlert : ''}`}>
          <div className={styles.statNum}>{pedidosPendientes ?? 0}</div>
          <div className={styles.statLabel}>Sin procesar</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>L. {ventasHoy.toLocaleString()}</div>
          <div className={styles.statLabel}>Ventas hoy</div>
        </div>
        <div className={`${styles.stat} ${(stockBajo ?? 0) > 0 ? styles.statWarn : ''}`}>
          <div className={styles.statNum}>{stockBajo ?? 0}</div>
          <div className={styles.statLabel}>Stock bajo (&lt;5)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>{totalProductos ?? 0}</div>
          <div className={styles.statLabel}>Productos activos</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Últimos pedidos</h2>
        <div className={styles.pedidosList}>
          {(pedidosRecientes ?? []).map((p: Pedido) => (
            <div key={p.id} className={styles.pedidoRow}>
              <span className={styles.pedidoNum}>#{p.numero}</span>
              <span className={styles.pedidoCliente}>{p.nombre_cliente}</span>
              <span className={styles.pedidoTotal}>L. {p.total.toLocaleString()}</span>
              <span
                className={styles.pedidoEstado}
                style={{ color: ESTADO_COLOR[p.estado] }}
              >
                {p.estado}
              </span>
              <span className={styles.pedidoFecha}>
                {new Date(p.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {!pedidosRecientes?.length && (
            <div className={styles.empty}>No hay pedidos hoy aún.</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CSS del dashboard**

Crear `hondusport-next/app/admin/dashboard.module.css`:

```css
.page { padding: 1.5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem; }
.title { font-size: 1.25rem; font-weight: 800; }
.date { font-size: 0.8rem; color: var(--text-muted); text-transform: capitalize; }

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.1rem 1.2rem;
}

.statAlert { border-color: rgba(59,143,237,0.4); }
.statWarn { border-color: rgba(245,158,11,0.4); }

.statNum {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--accent);
  margin-bottom: 0.2rem;
}

.statLabel {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
}

.section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
.sectionTitle { font-size: 0.95rem; font-weight: 700; margin-bottom: 1rem; }

.pedidosList { display: flex; flex-direction: column; gap: 0; }

.pedidoRow {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.855rem;
}
.pedidoRow:last-child { border-bottom: none; }

.pedidoNum { font-weight: 800; color: var(--accent); width: 44px; flex-shrink: 0; }
.pedidoCliente { flex: 1; font-weight: 600; }
.pedidoTotal { font-weight: 700; white-space: nowrap; }
.pedidoEstado { font-size: 0.78rem; font-weight: 600; text-transform: capitalize; width: 90px; text-align: right; }
.pedidoFecha { font-size: 0.75rem; color: var(--text-muted); width: 50px; text-align: right; flex-shrink: 0; }

.empty { padding: 1.5rem 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
```

- [ ] **Step 3: Root layout**

Reemplazar `hondusport-next/app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hondusport Admin',
  description: 'Panel de administración Hondusport',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Verificar el admin completo**

```bash
cd hondusport-next && npm run dev
```

Navegar a cada módulo y verificar que:
- `http://localhost:3000/admin` → Dashboard con stats
- `http://localhost:3000/admin/productos` → Tabla de productos, CRUD funcional
- `http://localhost:3000/admin/pedidos` → Lista filtrable, cambio de estado
- `http://localhost:3000/admin/categorias` → Tabs, CRUD por tipo
- `http://localhost:3000/admin/cupones` → Toggle activo, crear/eliminar
- `http://localhost:3000/admin/envios` → CRUD opciones de envío
- `http://localhost:3000/admin/banners` → Grid con preview, upload imagen
- `http://localhost:3000/admin/configuracion` → 6 tabs, guardar cambios
- `http://localhost:3000/admin/login` → Redirige a /admin si ya está logueado
- Logout → redirige a /admin/login

- [ ] **Step 5: Verificar build de producción**

```bash
npm run build
```

Expected: `✓ Compiled successfully`. Corregir cualquier error de TypeScript que aparezca.

- [ ] **Step 6: Commit final**

```bash
cd ..
git add hondusport-next/
git commit -m "feat: admin panel completo — dashboard, 8 módulos, auth, Supabase Storage"
```

---

## FASE 12 — Deploy

### Task 20: Configurar Vercel

**Files:** (sin archivos de código — configuración en UI de Vercel)

- [ ] **Step 1: Crear repositorio en GitHub**

En GitHub, crear nuevo repositorio (vacío) llamado `hondusport`.

- [ ] **Step 2: Copiar el proyecto a la raíz del repo**

El directorio `hondusport-next/` debe convertirse en la raíz del proyecto que se sube a GitHub. Ejecutar desde el repo actual:

```bash
cp -r hondusport-next/. ../hondusport-vercel/
cd ../hondusport-vercel
git init
git remote add origin https://github.com/TU_USUARIO/hondusport.git
git add .
git commit -m "feat: proyecto Next.js + Supabase inicial"
git push -u origin main
```

- [ ] **Step 3: Conectar a Vercel**

En vercel.com:
1. New Project → Importar el repositorio `hondusport`
2. Framework: Next.js (detectado automáticamente)
3. En **Environment Variables**, agregar:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL de tu proyecto Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service role key
4. Deploy

Expected: `https://hondusport.vercel.app` funcionando con el admin panel.

- [ ] **Step 4: Apuntar el dominio**

En Vercel → Settings → Domains → agregar `hondusport.com`.

En el panel DNS del proveedor (Hostinger), agregar:
- `A` record: `@` → IP de Vercel (la indica Vercel)
- `CNAME`: `www` → `cname.vercel-dns.com`

---

## Resumen de Fases

| Fase | Tareas | Entregable |
|---|---|---|
| 1 — Setup | 1-4 | Proyecto Next.js, schema SQL, tipos, clientes Supabase |
| 2 — Auth | 5-6 | Login + middleware + signout |
| 3 — Shell | 7-9 | Variables CSS, sidebar, layout, Modal, Toggle |
| 4 — Productos | 10-11 | Lista SSR, CRUD modal, toggle activo/personalizable |
| 5 — XLSX | 12 | Parser testeado, API route, botón importar |
| 6 — Pedidos | 13 | Filtros por estado, cambio inline, detalle expandible |
| 7 — Categorías | 14 | Tabs por tipo, CRUD |
| 8 — Cupones + Envíos | 15-16 | Toggle activo, CRUD ambos módulos |
| 9 — Banners | 17 | Cards con preview, ImageUpload a Storage |
| 10 — Config | 18 | 6 secciones, logo/og image, toggles funcionalidades |
| 11 — Dashboard | 19 | Stats del día, últimos pedidos, alertas |
| 12 — Deploy | 20 | Vercel + Supabase + dominio |
