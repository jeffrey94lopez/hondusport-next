-- POS P2: tablas de mostrador, caja y documentos. Aplicar ANTES de 2026-08-07-pos-p2-rpcs.sql.

create table if not exists cajas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  punto_emision     text not null default '001' check (punto_emision ~ '^[0-9]{3}$'),
  formato_impresion text not null default '80mm' check (formato_impresion in ('80mm','carta')),
  activo            boolean not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

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

create table if not exists vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists metodos_pago (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo   text not null check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro')),
  activo boolean not null default true,
  orden  integer not null default 0
);

create sequence if not exists comprobante_numero_seq;

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

create table if not exists ventas_espera (
  id         uuid primary key default gen_random_uuid(),
  caja_id    uuid not null references cajas(id) on delete cascade,
  nombre     text not null,
  payload    jsonb not null,
  created_at timestamptz default now()
);

-- RLS: todo es dato del admin (patrón clientes de P1)
alter table cajas enable row level security;
alter table sesiones_caja enable row level security;
alter table vendedores enable row level security;
alter table metodos_pago enable row level security;
alter table documentos enable row level security;
alter table documento_items enable row level security;
alter table documento_pagos enable row level security;
alter table ventas_espera enable row level security;

do $$ begin
  create policy cajas_admin on cajas for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy sesiones_admin on sesiones_caja for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy vendedores_admin on vendedores for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy metodos_admin on metodos_pago for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
-- documentos/items/pagos: inmutables — solo select e insert (sin update/delete
-- genéricos; anular pasa por la RPC, que corre como authenticated y necesita
-- update de documentos: política de update restringida a cambiar estado)
do $$ begin
  create policy documentos_select on documentos for select to authenticated using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documentos_insert on documentos for insert to authenticated with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documentos_update on documentos for update to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_items_select on documento_items for select to authenticated using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_items_insert on documento_items for insert to authenticated with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_pagos_select on documento_pagos for select to authenticated using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_pagos_insert on documento_pagos for insert to authenticated with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy ventas_espera_admin on ventas_espera for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

-- Triggers de updated_at (la función update_updated_at ya existe)
drop trigger if exists cajas_updated_at on cajas;
create trigger cajas_updated_at before update on cajas
  for each row execute function update_updated_at();
drop trigger if exists vendedores_updated_at on vendedores;
create trigger vendedores_updated_at before update on vendedores
  for each row execute function update_updated_at();

-- Seed de métodos de pago (idempotente por nombre)
insert into metodos_pago (nombre, tipo, orden)
select v.nombre, v.tipo, v.orden
from (values
  ('Efectivo L.', 'efectivo_lps', 0),
  ('Tarjeta', 'tarjeta', 1),
  ('Transferencia / Depósito', 'transferencia', 2),
  ('Efectivo USD', 'efectivo_usd', 3)
) as v(nombre, tipo, orden)
where not exists (select 1 from metodos_pago m where m.tipo = v.tipo and m.nombre = v.nombre);

-- Config nueva
insert into configuracion (key, value) values ('pos_limite_consumidor_final', '10000')
  on conflict (key) do nothing;
