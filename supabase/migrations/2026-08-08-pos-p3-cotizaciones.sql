-- POS P3: cotizaciones CRM (kanban configurable, no fiscal, no reserva stock).

create table if not exists cotizacion_etapas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       text not null check (tipo in ('abierta','ganada','perdida')),
  color      text not null default '#c9a84c',
  orden      int not null default 0,
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create sequence if not exists cotizacion_numero_seq;

-- PostgREST no expone nextval directo; se envuelve en una función security definer
-- (la acción guardarCotizacion la llama vía rpc para asignar el número al crear).
create or replace function nextval_cotizacion()
returns bigint language sql security definer set search_path = public as $$
  select nextval('cotizacion_numero_seq');
$$;
revoke all on function nextval_cotizacion() from public, anon;
grant execute on function nextval_cotizacion() to authenticated;

create table if not exists cotizaciones (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  etapa_id         uuid not null references cotizacion_etapas(id) on delete restrict,
  cliente_id       uuid references clientes(id) on delete set null,
  cliente_nombre   text,
  cliente_rtn      text,
  vendedor_id      uuid references vendedores(id) on delete set null,
  descuento_global numeric(12,2) not null default 0 check (descuento_global >= 0),
  validez_dias     int not null default 15 check (validez_dias >= 0),
  valido_hasta     date not null,
  condiciones      text,
  notas            text,
  total            numeric(12,2) not null default 0,
  documento_id     uuid references documentos(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists cotizaciones_etapa_idx on cotizaciones (etapa_id);

create table if not exists cotizacion_items (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references cotizaciones(id) on delete cascade,
  producto_id    uuid references productos(id) on delete set null,
  variante_id    uuid references producto_variantes(id) on delete set null,
  descripcion    text not null,
  cantidad       numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  descuento      numeric(12,2) not null default 0 check (descuento >= 0),
  isv            text not null check (isv in ('15','18','exento')),
  precio_manual  boolean not null default false,
  orden          int not null default 0
);
create index if not exists cotizacion_items_cotizacion_idx on cotizacion_items (cotizacion_id);
-- Idempotente por si la tabla ya existiera de un despliegue previo sin esta columna.
alter table cotizacion_items add column if not exists precio_manual boolean not null default false;

-- RLS: todo es dato del admin (patrón de P1/P2)
alter table cotizacion_etapas enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
do $$ begin
  create policy cotizacion_etapas_admin on cotizacion_etapas for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy cotizaciones_admin on cotizaciones for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy cotizacion_items_admin on cotizacion_items for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

-- Triggers updated_at (update_updated_at ya existe en la BD)
drop trigger if exists cotizacion_etapas_updated_at on cotizacion_etapas;
create trigger cotizacion_etapas_updated_at before update on cotizacion_etapas
  for each row execute function update_updated_at();
drop trigger if exists cotizaciones_updated_at on cotizaciones;
create trigger cotizaciones_updated_at before update on cotizaciones
  for each row execute function update_updated_at();

-- Seeds de etapas (idempotentes por nombre)
insert into cotizacion_etapas (nombre, tipo, color, orden)
select v.nombre, v.tipo, v.color, v.orden
from (values
  ('Borrador','abierta','#8a8a8a',0),
  ('Enviada','abierta','#c9a84c',1),
  ('En negociación','abierta','#2f6fed',2),
  ('Aceptada','ganada','#1b8959',3),
  ('Rechazada','perdida','#910022',4)
) as v(nombre,tipo,color,orden)
where not exists (select 1 from cotizacion_etapas e where e.nombre = v.nombre);

-- Config (idempotente)
insert into configuracion (key, value) values
  ('cotizacion_validez_dias','15'),
  ('cotizacion_formato_default','ejecutivo'),
  ('cotizacion_condiciones_default','Precios en Lempiras, ISV incluido. Cotización sujeta a existencias.')
on conflict (key) do nothing;
