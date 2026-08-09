do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='documentos' and column_name='documento_origen_id') then raise exception 'FALLO: falta documentos.documento_origen_id'; end if;
  if not exists (select 1 from information_schema.columns where table_name='documento_items' and column_name='origen_item_id') then raise exception 'FALLO: falta documento_items.origen_item_id'; end if;
  if to_regclass('public.nota_credito_reembolsos') is null then raise exception 'FALLO: falta nota_credito_reembolsos'; end if;
  if to_regclass('public.saldo_favor_movimientos') is null then raise exception 'FALLO: falta saldo_favor_movimientos'; end if;
  if to_regclass('public.saldo_favor_clientes') is null then raise exception 'FALLO: falta la vista saldo_favor_clientes'; end if;
  if to_regclass('public.devolucion_numero_seq') is null then raise exception 'FALLO: falta devolucion_numero_seq'; end if;
  if to_regprocedure('public.emitir_nota_credito(jsonb)') is null then raise exception 'FALLO: falta emitir_nota_credito'; end if;
  if not exists (select 1 from configuracion where key='devoluciones_sin_efectivo') then raise exception 'FALLO: falta config devoluciones_sin_efectivo'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='documentos'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%nota_credito%'
  ) then raise exception 'FALLO: el check de tipo no incluye nota_credito'; end if;
  perform 1 from documento_saldos limit 0; -- la vista compila con la columna nc_cxc
  raise notice 'Smoke POS P5a: estructura OK';
end $$;
select 'Success: migracion POS P5a OK' as resultado,
       (select count(*) from nota_credito_reembolsos) as reembolsos;
