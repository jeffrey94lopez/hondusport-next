do $$
begin
  if to_regprocedure('public.reporte_ganancias_items(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta reporte_ganancias_items'; end if;
  if to_regprocedure('public.reporte_contactos(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta reporte_contactos'; end if;
  perform * from reporte_ganancias_items(now() - interval '30 days', now());
  perform * from reporte_contactos(now() - interval '30 days', now());
  raise notice 'Smoke P7b reportes: 2 funciones OK';
end $$;
select 'Success: reportes P7b OK' as resultado;
