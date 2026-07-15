-- Proyecto 2b: slug estable y unico en productos.
-- Correr UNA vez, antes de desplegar el codigo nuevo.
-- Todo dentro de una transaccion: si algo falla, no queda estado parcial.

begin;

-- 1. Columna slug (nullable durante el backfill)
alter table productos add column if not exists slug text;

-- 2. Backfill de slug unico global desde el nombre, resolviendo colisiones
--    con sufijo -2, -3... slugify_es ya existe (migracion del 2a).
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in select id, nombre from productos where slug is null order by created_at, id loop
    base := slugify_es(r.nombre);
    if base = '' then base := 'producto'; end if;
    candidate := base;
    n := 2;
    while exists (select 1 from productos where slug = candidate) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update productos set slug = candidate where id = r.id;
  end loop;
end $$;

-- 3. Unicidad y NOT NULL
create unique index if not exists productos_slug_key on productos (slug);
alter table productos alter column slug set not null;

commit;
