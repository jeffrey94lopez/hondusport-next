-- Smoke POS P4a — correr en el SQL Editor DESPUÉS de aplicar la migración.
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_name = 'clientes' and column_name = 'es_proveedor') then
    raise exception 'FALLO: falta clientes.es_proveedor'; end if;
  if to_regclass('public.compras') is null then raise exception 'FALLO: falta compras'; end if;
  if to_regclass('public.compra_items') is null then raise exception 'FALLO: falta compra_items'; end if;
  if to_regclass('public.compra_numero_seq') is null then raise exception 'FALLO: falta compra_numero_seq'; end if;
  if to_regproc('public.recibir_compra(jsonb)') is null then raise exception 'FALLO: falta recibir_compra'; end if;
  if to_regproc('public.anular_compra(uuid, text)') is null then raise exception 'FALLO: falta anular_compra'; end if;
  if to_regproc('public.nextval_compra()') is null then raise exception 'FALLO: falta nextval_compra'; end if;
  raise notice 'Smoke POS P4a: estructura OK';
end $$;
select 'Success: migracion POS P4a OK' as resultado,
       (select count(*) from clientes where es_proveedor) as proveedores;
