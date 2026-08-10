do $$
begin
  if to_regclass('public.movimientos_created_idx') is null then raise exception 'FALLO: falta movimientos_created_idx'; end if;
  raise notice 'Smoke kardex: indice OK';
end $$;
select 'Success: indice kardex OK' as resultado;
