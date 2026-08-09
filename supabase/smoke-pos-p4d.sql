do $$
begin
  if to_regclass('public.conteos_fisicos') is null then raise exception 'FALLO: falta conteos_fisicos'; end if;
  if to_regclass('public.conteo_lineas') is null then raise exception 'FALLO: falta conteo_lineas'; end if;
  if to_regclass('public.conteo_numero_seq') is null then raise exception 'FALLO: falta conteo_numero_seq'; end if;
  if to_regprocedure('public.aplicar_conteo(uuid)') is null then raise exception 'FALLO: falta aplicar_conteo'; end if;
  if to_regprocedure('public.nextval_conteo()') is null then raise exception 'FALLO: falta nextval_conteo'; end if;
  if to_regprocedure('public.fijar_stock(uuid, uuid, integer, boolean, numeric, text, text)') is null then raise exception 'FALLO: falta fijar_stock'; end if;
  if not exists (select 1 from information_schema.columns where table_name='conteo_lineas' and column_name='stock_snapshot') then raise exception 'FALLO: falta conteo_lineas.stock_snapshot'; end if;
  if not exists (select 1 from configuracion where key='inventario_conteo_ciego') then raise exception 'FALLO: falta config inventario_conteo_ciego'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='movimientos_inventario'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%conteo%' and pg_get_constraintdef(oid) like '%inicial%'
  ) then raise exception 'FALLO: el check de tipo no incluye inicial/conteo'; end if;
  raise notice 'Smoke POS P4d: estructura OK';
end $$;
select 'Success: migracion POS P4d OK' as resultado,
       (select count(*) from conteos_fisicos) as tomas;
