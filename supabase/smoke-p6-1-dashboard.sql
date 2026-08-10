do $$
begin
  if to_regprocedure('public.dashboard_resumen(timestamptz, timestamptz)') is null
    then raise exception 'FALLO: falta dashboard_resumen'; end if;
  -- La firma nueva debe devolver las columnas P6.1 sin error:
  perform ventas_sin_isv, costo_ventas, facturas, comprobantes,
          cotizaciones_ganadas, cotizaciones_perdidas, cxc_nuevo, cxc_cobrado,
          cxp_nuevo, cxp_pagado, productos_nuevos
  from dashboard_resumen(now() - interval '7 days', now());
  raise notice 'Smoke P6.1 dashboard: dashboard_resumen extendida OK';
end $$;
select 'Success: dashboard P6.1 OK' as resultado;
