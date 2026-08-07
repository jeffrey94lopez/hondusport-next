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

-- ── CLIENTES ──
create table if not exists clientes (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  rtn                  text,
  identidad            text,
  tipo_cliente         text not null default 'final' check (tipo_cliente in ('final','revendedor')),
  exonerado            boolean not null default false,
  constancia_exonerado text,
  registro_sag         text,
  direccion            text,
  telefono             text,
  correo               text,
  notas                text,
  activo               boolean not null default true,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create unique index if not exists clientes_rtn_unico on clientes (rtn) where rtn is not null;
drop trigger if exists clientes_updated_at on clientes;
create trigger clientes_updated_at before update on clientes
  for each row execute function update_updated_at();

-- ── CAI_AUTORIZACIONES ──
create table if not exists cai_autorizaciones (
  id                 uuid primary key default gen_random_uuid(),
  cai                text not null,
  establecimiento    text not null default '000' check (establecimiento ~ '^[0-9]{3}$'),
  punto_emision      text not null default '001' check (punto_emision ~ '^[0-9]{3}$'),
  tipo_documento     text not null default '01' check (tipo_documento ~ '^[0-9]{2}$'),
  rango_desde        integer not null check (rango_desde >= 1),
  rango_hasta        integer not null,
  correlativo_actual integer not null,
  fecha_limite       date not null,
  activo             boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  check (rango_hasta >= rango_desde),
  check (correlativo_actual >= rango_desde - 1 and correlativo_actual <= rango_hasta)
);
create unique index if not exists cai_activo_unico
  on cai_autorizaciones (establecimiento, punto_emision, tipo_documento) where activo = true;
drop trigger if exists cai_autorizaciones_updated_at on cai_autorizaciones;
create trigger cai_autorizaciones_updated_at before update on cai_autorizaciones
  for each row execute function update_updated_at();

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
  canal            text not null default 'ambas' check (canal in ('tienda','mostrador','ambas')),
  isv              text not null default '15' check (isv in ('15','18','exento')),
  costo            numeric check (costo is null or costo >= 0),
  precio_revendedor numeric check (precio_revendedor is null or precio_revendedor > 0),
  stock_minimo     integer check (stock_minimo is null or stock_minimo >= 0),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── PRODUCTO_VARIANTES ──
create table if not exists producto_variantes (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references productos(id) on delete cascade,
  nombre            text not null,
  sku               text,
  precio            numeric check (precio is null or precio > 0),
  stock             integer check (stock is null or stock >= 0),
  costo             numeric check (costo is null or costo >= 0),
  precio_revendedor numeric check (precio_revendedor is null or precio_revendedor > 0),
  activo            boolean not null default true,
  orden             integer not null default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (producto_id, nombre)
);

-- ── MOVIMIENTOS_INVENTARIO ──
create table if not exists movimientos_inventario (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references productos(id) on delete restrict,
  variante_id      uuid references producto_variantes(id) on delete restrict,
  tipo             text not null check (tipo in ('entrada','ajuste','venta_web','reposicion_cancelacion','venta_pos','devolucion','compra')),
  cantidad         integer not null check (cantidad <> 0),
  costo_unitario   numeric check (costo_unitario is null or costo_unitario >= 0),
  costo_resultante numeric,
  referencia       text,
  usuario          text,
  notas            text,
  created_at       timestamptz default now()
);
create index if not exists movimientos_producto_idx on movimientos_inventario (producto_id, created_at desc);

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
  imagen_url           text,
  variante_id          uuid references producto_variantes(id) on delete set null,
  variante_nombre      text
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

create index if not exists producto_variantes_producto_id_idx
  on producto_variantes (producto_id);
create unique index if not exists producto_variantes_sku_unico
  on producto_variantes (sku) where sku is not null;

create trigger productos_updated_at
  before update on productos
  for each row execute function update_updated_at();

create trigger producto_variantes_updated_at
  before update on producto_variantes
  for each row execute function update_updated_at();

create trigger pedidos_updated_at
  before update on pedidos
  for each row execute function update_updated_at();

-- ── RLS ──
alter table clientes enable row level security;
alter table cai_autorizaciones enable row level security;
alter table movimientos_inventario enable row level security;
alter table productos enable row level security;
alter table categorias enable row level security;
alter table producto_variantes enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table envios enable row level security;
alter table cupones enable row level security;
alter table banners enable row level security;
alter table configuracion enable row level security;

-- Lectura pública para la tienda
create policy "public_read_productos" on productos for select using (activo = true);
create policy "public_read_categorias" on categorias for select using (activo = true);
create policy "public_read_variantes" on producto_variantes for select
  using (
    activo = true
    and exists (select 1 from productos p where p.id = producto_id and p.activo = true)
  );
create policy "public_read_envios" on envios for select using (activo = true);
create policy "public_read_cupones" on cupones for select using (activo = true);
create policy "public_read_banners" on banners for select using (activo = true);
create policy "public_read_config" on configuracion for select using (true);

-- Escritura de pedidos desde la tienda
create policy "public_insert_pedidos" on pedidos for insert with check (true);
create policy "public_insert_pedido_items" on pedido_items for insert with check (true);

-- Admin: acceso completo para usuarios autenticados
create policy "admin_all_clientes" on clientes for all using (auth.role() = 'authenticated');
create policy "admin_all_cai" on cai_autorizaciones for all using (auth.role() = 'authenticated');
create policy "admin_select_movimientos" on movimientos_inventario for select using (auth.role() = 'authenticated');
create policy "admin_insert_movimientos" on movimientos_inventario for insert with check (auth.role() = 'authenticated');
create policy "admin_all_productos" on productos for all using (auth.role() = 'authenticated');
create policy "admin_all_categorias" on categorias for all using (auth.role() = 'authenticated');
create policy "admin_all_variantes" on producto_variantes for all using (auth.role() = 'authenticated');
create policy "admin_all_pedidos" on pedidos for all using (auth.role() = 'authenticated');
create policy "admin_all_pedido_items" on pedido_items for all using (auth.role() = 'authenticated');
create policy "admin_all_envios" on envios for all using (auth.role() = 'authenticated');
create policy "admin_all_cupones" on cupones for all using (auth.role() = 'authenticated');
create policy "admin_all_banners" on banners for all using (auth.role() = 'authenticated');
create policy "admin_all_config" on configuracion for all using (auth.role() = 'authenticated');

-- Storage buckets (ejecutar después de crear los buckets en UI)
-- Bucket: productos (público)
-- Bucket: banners (público)
