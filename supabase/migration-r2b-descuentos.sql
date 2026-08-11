-- R2b: presets de descuento configurables para el POS.
-- Tabla con CRUD como metodos_pago; lista para permisos futuros (se le pueden
-- agregar columnas rol_permitido/tope/requiere_autorizacion después sin migración
-- dolorosa). Sin columnas de permiso ni enforcement hoy.

create table if not exists descuentos_preset (
  id         uuid primary key default gen_random_uuid(),
  etiqueta   text not null,
  tipo       text not null check (tipo in ('porcentaje','monto')),
  valor      numeric not null check (valor >= 0 and (tipo <> 'porcentaje' or valor <= 100)),
  activo     boolean not null default true,
  orden      int not null default 0,
  created_at timestamptz default now()
);

alter table descuentos_preset enable row level security;
create policy "admin_all_descuentos_preset" on descuentos_preset
  for all using (auth.role() = 'authenticated');

-- Seed idempotente de dos presets (5%, 10%) para arrancar con chips.
insert into descuentos_preset (etiqueta, tipo, valor, orden)
select v.etiqueta, v.tipo, v.valor, v.orden
from (values ('5%','porcentaje',5,0), ('10%','porcentaje',10,1)) as v(etiqueta, tipo, valor, orden)
where not exists (select 1 from descuentos_preset);

-- SMOKE (correr aparte tras la migración; debe listar los presets sembrados):
--   select etiqueta, tipo, valor, activo, orden from descuentos_preset order by orden;
