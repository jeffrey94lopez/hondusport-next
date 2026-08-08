-- Smoke POS P3 — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if to_regclass('public.cotizacion_etapas') is null then raise exception 'FALLÓ: falta cotizacion_etapas'; end if;
  if to_regclass('public.cotizaciones') is null then raise exception 'FALLÓ: falta cotizaciones'; end if;
  if to_regclass('public.cotizacion_items') is null then raise exception 'FALLÓ: falta cotizacion_items'; end if;
  if to_regclass('public.cotizacion_numero_seq') is null then raise exception 'FALLÓ: falta la secuencia cotizacion_numero_seq'; end if;
  if not exists (select 1 from cotizacion_etapas where tipo = 'ganada') then raise exception 'FALLÓ: no hay etapa de tipo ganada'; end if;
  if not exists (select 1 from cotizacion_etapas where tipo = 'perdida') then raise exception 'FALLÓ: no hay etapa de tipo perdida'; end if;
  if not exists (select 1 from configuracion where key = 'cotizacion_validez_dias') then raise exception 'FALLÓ: falta config cotizacion_validez_dias'; end if;
  if not exists (select 1 from configuracion where key = 'cotizacion_formato_default') then raise exception 'FALLÓ: falta config cotizacion_formato_default'; end if;
  raise notice 'Smoke POS P3: estructura OK';
end $$;
select 'Success: migración POS P3 OK' as resultado,
       (select count(*) from cotizacion_etapas) as etapas,
       (select value from configuracion where key = 'cotizacion_formato_default') as formato_default;
