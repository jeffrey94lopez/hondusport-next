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
  favorito_pos     boolean not null default false,
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

-- ── CAJAS (POS P2) ──
create table if not exists cajas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  punto_emision     text not null default '001' check (punto_emision ~ '^[0-9]{3}$'),
  formato_impresion text not null default '80mm' check (formato_impresion in ('80mm','carta')),
  activo            boolean not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ── SESIONES_CAJA (POS P2) ──
create table if not exists sesiones_caja (
  id             uuid primary key default gen_random_uuid(),
  caja_id        uuid not null references cajas(id) on delete restrict,
  estado         text not null default 'abierta' check (estado in ('abierta','cerrada')),
  monto_inicial  numeric not null check (monto_inicial >= 0),
  abierta_at     timestamptz not null default now(),
  cerrada_at     timestamptz,
  monto_esperado numeric,
  monto_contado  numeric,
  diferencia     numeric,
  notas          text,
  usuario        text
);
create unique index if not exists sesiones_caja_abierta_unica
  on sesiones_caja (caja_id) where estado = 'abierta';

-- ── VENDEDORES (POS P2) ──
create table if not exists vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── METODOS_PAGO (POS P2) ──
create table if not exists metodos_pago (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo   text not null check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro')),
  activo boolean not null default true,
  orden  integer not null default 0
);

-- ── COMPROBANTE_NUMERO_SEQ (POS P2) ──
create sequence if not exists comprobante_numero_seq;

-- ── DOCUMENTOS (POS P2) ──
create table if not exists documentos (
  id                   uuid primary key default gen_random_uuid(),
  tipo                 text not null check (tipo in ('factura','comprobante')),
  correlativo          text,
  numero_comprobante   integer,
  cai_id               uuid references cai_autorizaciones(id) on delete restrict,
  caja_id              uuid not null references cajas(id) on delete restrict,
  sesion_id            uuid references sesiones_caja(id) on delete restrict,
  vendedor_id          uuid references vendedores(id) on delete restrict,
  cliente_id           uuid references clientes(id) on delete restrict,
  cliente_nombre       text not null default 'CONSUMIDOR FINAL',
  cliente_rtn          text,
  cliente_identidad    text,
  exonerado            boolean not null default false,
  orden_compra_exenta  text,
  constancia_exonerado text,
  registro_sag         text,
  pedido_id            uuid references pedidos(id) on delete restrict,
  total_exento         numeric not null default 0,
  total_exonerado      numeric not null default 0,
  total_gravado15      numeric not null default 0,
  total_gravado18      numeric not null default 0,
  isv15                numeric not null default 0,
  isv18                numeric not null default 0,
  descuento_total      numeric not null default 0,
  total                numeric not null,
  total_letras         text not null,
  tasa_usd             numeric,
  estado               text not null default 'emitido' check (estado in ('emitido','anulado')),
  anulado_motivo       text,
  anulado_at           timestamptz,
  notas                text,
  usuario              text,
  created_at           timestamptz default now(),
  constraint documentos_correlativo_chk check (
    (tipo = 'factura' and correlativo is not null and cai_id is not null and numero_comprobante is null)
    or (tipo = 'comprobante' and correlativo is null and cai_id is null and numero_comprobante is not null)
  )
);
create unique index if not exists documentos_pedido_vigente
  on documentos (pedido_id) where pedido_id is not null and estado = 'emitido';
create unique index if not exists documentos_cai_correlativo
  on documentos (cai_id, correlativo) where correlativo is not null;

-- ── DOCUMENTO_ITEMS (POS P2) ──
create table if not exists documento_items (
  id              uuid primary key default gen_random_uuid(),
  documento_id    uuid not null references documentos(id) on delete restrict,
  producto_id     uuid references productos(id) on delete restrict,
  variante_id     uuid references producto_variantes(id) on delete restrict,
  descripcion     text not null,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric not null check (precio_unitario >= 0),
  descuento       numeric not null default 0 check (descuento >= 0),
  isv             text not null check (isv in ('15','18','exento')),
  importe         numeric not null,
  base            numeric not null,
  isv_monto       numeric not null default 0
);
create index if not exists documento_items_documento on documento_items (documento_id);

-- ── DOCUMENTO_PAGOS (POS P2) ──
create table if not exists documento_pagos (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  metodo_id    uuid not null references metodos_pago(id) on delete restrict,
  monto        numeric not null check (monto > 0),
  monto_usd    numeric,
  tasa         numeric,
  referencia   text,
  created_at   timestamptz default now()
);
create index if not exists documento_pagos_documento on documento_pagos (documento_id);

-- ── VENTAS_ESPERA (POS P2) ──
create table if not exists ventas_espera (
  id         uuid primary key default gen_random_uuid(),
  caja_id    uuid not null references cajas(id) on delete cascade,
  nombre     text not null,
  payload    jsonb not null,
  created_at timestamptz default now()
);

-- ── CONFIGURACION ──
create table if not exists configuracion (
  key   text primary key,
  value text
);

-- Insertar claves iniciales de config
insert into configuracion (key, value) values
  ('empresa_nombre_comercial', 'Hondusport'),
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
  ('modo_mantenimiento', 'false'),
  ('pos_limite_consumidor_final', '10000'),
  ('pos_documento_modal', 'true')
on conflict (key) do nothing;

-- Seed de métodos de pago (idempotente por tipo)
insert into metodos_pago (nombre, tipo, orden)
select v.nombre, v.tipo, v.orden
from (values
  ('Efectivo L.', 'efectivo_lps', 0),
  ('Tarjeta', 'tarjeta', 1),
  ('Transferencia / Depósito', 'transferencia', 2),
  ('Efectivo USD', 'efectivo_usd', 3)
) as v(nombre, tipo, orden)
where not exists (select 1 from metodos_pago m where m.tipo = v.tipo and m.nombre = v.nombre)
on conflict do nothing;

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

create index if not exists productos_favorito_pos
  on productos (favorito_pos) where favorito_pos;

create index if not exists producto_variantes_producto_id_idx
  on producto_variantes (producto_id);
create unique index if not exists producto_variantes_sku_unico
  on producto_variantes (sku) where sku is not null;

create trigger clientes_updated_at
  before update on clientes
  for each row execute function update_updated_at();

create trigger cai_autorizaciones_updated_at
  before update on cai_autorizaciones
  for each row execute function update_updated_at();

create trigger productos_updated_at
  before update on productos
  for each row execute function update_updated_at();

create trigger producto_variantes_updated_at
  before update on producto_variantes
  for each row execute function update_updated_at();

create trigger pedidos_updated_at
  before update on pedidos
  for each row execute function update_updated_at();

create trigger cajas_updated_at
  before update on cajas
  for each row execute function update_updated_at();

create trigger vendedores_updated_at
  before update on vendedores
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
alter table cajas enable row level security;
alter table sesiones_caja enable row level security;
alter table vendedores enable row level security;
alter table metodos_pago enable row level security;
alter table documentos enable row level security;
alter table documento_items enable row level security;
alter table documento_pagos enable row level security;
alter table ventas_espera enable row level security;

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

-- POS P2: políticas para caja y documentos (todo es dato del admin)
create policy "admin_all_cajas" on cajas for all using (auth.role() = 'authenticated');
create policy "admin_all_sesiones" on sesiones_caja for all using (auth.role() = 'authenticated');
create policy "admin_all_vendedores" on vendedores for all using (auth.role() = 'authenticated');
create policy "admin_all_metodos_pago" on metodos_pago for all using (auth.role() = 'authenticated');
-- documentos/items/pagos: inmutables — solo select e insert (sin update/delete genéricos)
create policy "admin_select_documentos" on documentos for select using (auth.role() = 'authenticated');
create policy "admin_insert_documentos" on documentos for insert with check (auth.role() = 'authenticated');
create policy "admin_update_documentos" on documentos for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Inmutabilidad fiscal real (la policy de arriba solo controla RLS, no qué
-- columnas cambian): un documento emitido no puede reescribirse; anular solo
-- puede tocar estado/anulado_motivo/anulado_at.
create or replace function documentos_bloquear_edicion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(old) - 'estado' - 'anulado_motivo' - 'anulado_at')
     <> (to_jsonb(new) - 'estado' - 'anulado_motivo' - 'anulado_at') then
    raise exception using message = 'Los documentos emitidos son inmutables; solo se permite anular.';
  end if;
  return new;
end;
$$;
drop trigger if exists documentos_bloquear_edicion_trg on documentos;
create trigger documentos_bloquear_edicion_trg before update on documentos
  for each row execute function documentos_bloquear_edicion();
create policy "admin_select_documento_items" on documento_items for select using (auth.role() = 'authenticated');
create policy "admin_insert_documento_items" on documento_items for insert with check (auth.role() = 'authenticated');
create policy "admin_select_documento_pagos" on documento_pagos for select using (auth.role() = 'authenticated');
create policy "admin_insert_documento_pagos" on documento_pagos for insert with check (auth.role() = 'authenticated');
create policy "admin_all_ventas_espera" on ventas_espera for all using (auth.role() = 'authenticated');

-- Storage buckets (ejecutar después de crear los buckets en UI)
-- Bucket: productos (público)
-- Bucket: banners (público)
