do $$
begin
  if to_regprocedure('public.dashboard_resumen(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta dashboard_resumen'; end if;
  if to_regprocedure('public.dashboard_ventas_por_dia(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta dashboard_ventas_por_dia'; end if;
  if to_regprocedure('public.dashboard_top_items(timestamptz, timestamptz, integer)') is null
    then raise exception 'FALLO: falta dashboard_top_items'; end if;
  if to_regprocedure('public.dashboard_top_clientes(timestamptz, timestamptz, integer)') is null
    then raise exception 'FALLO: falta dashboard_top_clientes'; end if;
  -- Llamada de ejemplo (semana): no debe lanzar error.
  perform * from dashboard_resumen(now() - interval '7 days', now());
  perform * from dashboard_ventas_por_dia(now() - interval '7 days', now());
  perform * from dashboard_top_items(now() - interval '7 days', now(), 10);
  perform * from dashboard_top_clientes(now() - interval '7 days', now(), 10);
  raise notice 'Smoke P6 dashboard: 4 funciones OK';
end $$;
select 'Success: dashboard P6 OK' as resultado;
