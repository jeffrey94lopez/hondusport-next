-- Smoke POS P4b — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if to_regclass('public.pagos_proveedor') is null then raise exception 'FALLO: falta pagos_proveedor'; end if;
  if to_regclass('public.pago_aplicaciones') is null then raise exception 'FALLO: falta pago_aplicaciones'; end if;
  if to_regclass('public.compra_saldos') is null then raise exception 'FALLO: falta la vista compra_saldos'; end if;
  if to_regclass('public.pago_numero_seq') is null then raise exception 'FALLO: falta pago_numero_seq'; end if;
  if to_regprocedure('public.registrar_pago_proveedor(jsonb)') is null then raise exception 'FALLO: falta registrar_pago_proveedor'; end if;
  if to_regprocedure('public.eliminar_pago_proveedor(uuid)') is null then raise exception 'FALLO: falta eliminar_pago_proveedor'; end if;
  if to_regprocedure('public.nextval_pago()') is null then raise exception 'FALLO: falta nextval_pago'; end if;
  raise notice 'Smoke POS P4b: estructura OK';
end $$;
select 'Success: migracion POS P4b OK' as resultado,
       (select count(*) from pagos_proveedor) as pagos;
