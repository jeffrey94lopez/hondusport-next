-- R2a: consolidar datos de empresa hacia las claves canónicas.
-- No destructivo: solo inserta la canónica si NO existe (no pisa valores puestos);
-- deja las claves retiradas intactas (inertes) para poder revertir.

-- site_name -> empresa_nombre_comercial
insert into configuracion (key, value)
select 'empresa_nombre_comercial', c.value
from configuracion c
where c.key = 'site_name'
  and coalesce(c.value, '') <> ''
  and not exists (
    select 1 from configuracion e
    where e.key = 'empresa_nombre_comercial' and coalesce(e.value, '') <> ''
  );

-- fiscal_nombre_comercial -> empresa_nombre_comercial (si aún no hay nombre comercial)
insert into configuracion (key, value)
select 'empresa_nombre_comercial', c.value
from configuracion c
where c.key = 'fiscal_nombre_comercial'
  and coalesce(c.value, '') <> ''
  and not exists (
    select 1 from configuracion e
    where e.key = 'empresa_nombre_comercial' and coalesce(e.value, '') <> ''
  );

-- fiscal_telefono -> empresa_telefono
insert into configuracion (key, value)
select 'empresa_telefono', c.value
from configuracion c
where c.key = 'fiscal_telefono'
  and coalesce(c.value, '') <> ''
  and not exists (
    select 1 from configuracion e
    where e.key = 'empresa_telefono' and coalesce(e.value, '') <> ''
  );

-- SMOKE (correr aparte tras la migración; debe mostrar las canónicas pobladas
-- cuando existía el valor viejo):
--   select key, value from configuracion
--   where key in ('empresa_nombre_comercial','empresa_telefono',
--                 'site_name','fiscal_nombre_comercial','fiscal_telefono')
--   order by key;
