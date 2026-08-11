-- R2a: consolidar datos de empresa hacia las claves canónicas.
-- No destructivo e idempotente: puebla la canónica desde la clave retirada
-- solo si la canónica falta o está vacía; NUNCA pisa un valor ya puesto; deja
-- las claves retiradas intactas (inertes) para poder revertir. Reejecutable sin
-- error: `on conflict (key) do update ... where` evita la violación de PK cuando
-- la canónica ya existe (las claves empresa_* ya existen hoy en la config).

-- site_name -> empresa_nombre_comercial
insert into configuracion (key, value)
select 'empresa_nombre_comercial', c.value
from configuracion c
where c.key = 'site_name' and coalesce(c.value, '') <> ''
on conflict (key) do update
  set value = excluded.value
  where coalesce(configuracion.value, '') = '';

-- fiscal_nombre_comercial -> empresa_nombre_comercial (si aún no hay nombre comercial)
insert into configuracion (key, value)
select 'empresa_nombre_comercial', c.value
from configuracion c
where c.key = 'fiscal_nombre_comercial' and coalesce(c.value, '') <> ''
on conflict (key) do update
  set value = excluded.value
  where coalesce(configuracion.value, '') = '';

-- fiscal_telefono -> empresa_telefono
insert into configuracion (key, value)
select 'empresa_telefono', c.value
from configuracion c
where c.key = 'fiscal_telefono' and coalesce(c.value, '') <> ''
on conflict (key) do update
  set value = excluded.value
  where coalesce(configuracion.value, '') = '';

-- SMOKE (correr aparte tras la migración; debe mostrar las canónicas pobladas
-- cuando existía el valor viejo):
--   select key, value from configuracion
--   where key in ('empresa_nombre_comercial','empresa_telefono',
--                 'site_name','fiscal_nombre_comercial','fiscal_telefono')
--   order by key;
