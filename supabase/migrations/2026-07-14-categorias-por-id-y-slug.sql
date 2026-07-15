-- Proyecto 2a: categorias por ID + slug estable
-- Correr UNA vez, antes de desplegar el codigo nuevo.

-- 1. Funcion de slugify equivalente a lib/store/slug.ts
create or replace function slugify_es(txt text) returns text as $$
  select trim(both '-' from
    regexp_replace(
      lower(unaccent(coalesce(txt, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$ language sql immutable;

-- Requiere la extension unaccent
create extension if not exists unaccent;

-- 2. Columna slug (nullable durante el backfill)
alter table categorias add column if not exists slug text;

-- 3. Backfill de slug unico global, resolviendo colisiones con sufijo -2, -3...
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in select id, valor from categorias where slug is null order by orden, valor loop
    base := slugify_es(r.valor);
    if base = '' then base := 'cat'; end if;
    candidate := base;
    n := 2;
    while exists (select 1 from categorias where slug = candidate) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update categorias set slug = candidate where id = r.id;
  end loop;
end $$;

-- 4. Unicidad y NOT NULL
create unique index if not exists categorias_slug_key on categorias (slug);
alter table categorias alter column slug set not null;

-- 5. Convertir categorias_padre de NOMBRES a IDs (case-insensitive), descartando sin match
update categorias c
set categorias_padre = sub.ids
from (
  select c2.id,
         array_agg(p.id::text order by p.id) as ids
  from categorias c2
  cross join lateral unnest(c2.categorias_padre) as nombre
  join categorias p on lower(p.valor) = lower(nombre)
  where c2.categorias_padre is not null
  group by c2.id
) sub
where c.id = sub.id;

-- Filas cuyos nombres no matchearon quedan con su array viejo; limpiarlas manualmente si hace falta.
