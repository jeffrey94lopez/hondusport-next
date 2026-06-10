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
  subcategoria_id  uuid references categorias(id) on delete set null,
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

create index if not exists productos_subcategoria_id_idx
  on productos (subcategoria_id);

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
