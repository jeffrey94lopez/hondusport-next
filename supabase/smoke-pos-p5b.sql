do $$
begin
  if to_regprocedure('public.aplicar_saldo_favor_cxc(jsonb)') is null then raise exception 'FALLO: falta aplicar_saldo_favor_cxc'; end if;
  if not exists (select 1 from information_schema.columns where table_name='saldo_favor_movimientos' and column_name='cobro_id') then raise exception 'FALLO: falta saldo_favor_movimientos.cobro_id'; end if;
  if not exists (select 1 from metodos_pago where tipo = 'saldo_favor') then raise exception 'FALLO: falta el metodo Saldo a favor'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='saldo_favor_movimientos'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%venta%' and pg_get_constraintdef(oid) like '%cobro%'
  ) then raise exception 'FALLO: el tipo del ledger no incluye venta/cobro'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='cobros'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%saldo_favor%'
  ) then raise exception 'FALLO: cobros.metodo no acepta saldo_favor'; end if;
  raise notice 'Smoke POS P5b: estructura OK';
end $$;
select 'Success: migracion POS P5b OK' as resultado,
       (select count(*) from saldo_favor_movimientos where tipo <> 'devolucion') as gastos;
