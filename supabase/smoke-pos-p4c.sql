-- Smoke POS P4c — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if to_regclass('public.cobros') is null then raise exception 'FALLO: falta cobros'; end if;
  if to_regclass('public.cobro_aplicaciones') is null then raise exception 'FALLO: falta cobro_aplicaciones'; end if;
  if to_regclass('public.documento_saldos') is null then raise exception 'FALLO: falta la vista documento_saldos'; end if;
  if to_regclass('public.cobro_numero_seq') is null then raise exception 'FALLO: falta cobro_numero_seq'; end if;
  if to_regprocedure('public.registrar_cobro(jsonb)') is null then raise exception 'FALLO: falta registrar_cobro'; end if;
  if to_regprocedure('public.eliminar_cobro(uuid)') is null then raise exception 'FALLO: falta eliminar_cobro'; end if;
  if to_regprocedure('public.nextval_cobro()') is null then raise exception 'FALLO: falta nextval_cobro'; end if;
  if not exists (select 1 from metodos_pago where tipo = 'credito') then raise exception 'FALLO: falta el metodo Credito'; end if;
  if not exists (select 1 from information_schema.columns where table_name='clientes' and column_name='limite_credito') then raise exception 'FALLO: falta clientes.limite_credito'; end if;
  raise notice 'Smoke POS P4c: estructura OK';
end $$;
select 'Success: migracion POS P4c OK' as resultado,
       (select count(*) from cobros) as cobros;
