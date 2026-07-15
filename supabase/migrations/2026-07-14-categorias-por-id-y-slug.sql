-- Proyecto 2a: categorias por ID + slug estable
-- Correr UNA vez, antes de desplegar el codigo nuevo.
-- Todo dentro de una transaccion: si algo falla, no queda estado parcial.

begin;

-- 0. Extension unaccent PRIMERO (la funcion slugify_es la referencia).
create extension if not exists unaccent;

-- 1. Funcion de slugify equivalente a lib/store/slug.ts
--    'stable' (no 'immutable') porque unaccent depende de la config de texto.
create or replace function slugify_es(txt text) returns text as $$
  select trim(both '-' from
    regexp_replace(
      lower(unaccent(coalesce(txt, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$ language sql stable;

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

-- 5. Convertir categorias_padre de NOMBRES a IDs.
--    - Los padres son siempre tipo 'cat' (join restringido) -> evita cruces con otros tipos.
--    - Un nombre resuelve a UN solo id (order by id, limit 1) -> nunca hace "fan-out".
--    - Preserva IDs ya convertidos (idempotente en re-runs).
--    - Loggea con RAISE NOTICE los nombres de padre que no matchearon (se descartan).
do $$
declare
  r record;
  nombre text;
  padre_id text;
  nuevos text[];
  faltantes text[];
begin
  for r in select id, categorias_padre from categorias where categorias_padre is not null loop
    nuevos := '{}';
    faltantes := '{}';
    foreach nombre in array r.categorias_padre loop
      -- match por nombre contra categorias 'cat'
      select p.id::text into padre_id
        from categorias p
        where p.tipo = 'cat' and lower(p.valor) = lower(nombre)
        order by p.id
        limit 1;

      if padre_id is not null then
        if not (padre_id = any(nuevos)) then nuevos := array_append(nuevos, padre_id); end if;
      elsif exists (select 1 from categorias p2 where p2.id::text = nombre) then
        -- ya era un id (re-run): conservarlo
        if not (nombre = any(nuevos)) then nuevos := array_append(nuevos, nombre); end if;
      else
        faltantes := array_append(faltantes, nombre);
      end if;
    end loop;

    if array_length(faltantes, 1) is not null then
      raise notice 'categoria %: padres sin match, descartados: %', r.id, faltantes;
    end if;

    update categorias
      set categorias_padre = case when array_length(nuevos, 1) is null then null else nuevos end
      where id = r.id;
  end loop;
end $$;

commit;
