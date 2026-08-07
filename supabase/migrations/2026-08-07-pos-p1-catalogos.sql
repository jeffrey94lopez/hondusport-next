-- POS P1: clientes, CAIs, kardex y campos de catálogo.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

create table if not exists clientes (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  rtn                   text,
  identidad             text,
  tipo_cliente          text not null default 'final' check (tipo_cliente in ('final','revendedor')),
  exonerado             boolean not null default false,
  constancia_exonerado  text,
  registro_sag          text,
  direccion             text,
  telefono              text,
  correo                text,
  notas                 text,
  activo                boolean not null default true,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create unique index if not exists clientes_rtn_unico on clientes (rtn) where rtn is not null;
drop trigger if exists clientes_updated_at on clientes;
create trigger clientes_updated_at before update on clientes
  for each row execute function update_updated_at();
alter table clientes enable row level security;
drop policy if exists "admin_all_clientes" on clientes;
create policy "admin_all_clientes" on clientes for all using (auth.role() = 'authenticated');

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
alter table cai_autorizaciones enable row level security;
drop policy if exists "admin_all_cai" on cai_autorizaciones;
create policy "admin_all_cai" on cai_autorizaciones for all using (auth.role() = 'authenticated');

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
alter table movimientos_inventario enable row level security;
drop policy if exists "admin_select_movimientos" on movimientos_inventario;
create policy "admin_select_movimientos" on movimientos_inventario for select using (auth.role() = 'authenticated');
drop policy if exists "admin_insert_movimientos" on movimientos_inventario;
create policy "admin_insert_movimientos" on movimientos_inventario for insert with check (auth.role() = 'authenticated');
-- Sin políticas de update/delete: el kardex es append-only.

alter table productos add column if not exists canal text not null default 'ambas'
  check (canal in ('tienda','mostrador','ambas'));
alter table productos add column if not exists isv text not null default '15'
  check (isv in ('15','18','exento'));
alter table productos add column if not exists costo numeric check (costo is null or costo >= 0);
alter table productos add column if not exists precio_revendedor numeric
  check (precio_revendedor is null or precio_revendedor > 0);
alter table productos add column if not exists stock_minimo integer
  check (stock_minimo is null or stock_minimo >= 0);
alter table producto_variantes add column if not exists costo numeric
  check (costo is null or costo >= 0);
alter table producto_variantes add column if not exists precio_revendedor numeric
  check (precio_revendedor is null or precio_revendedor > 0);
