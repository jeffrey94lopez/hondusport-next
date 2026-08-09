-- POS P4b: cuentas por pagar. Pagos a proveedores aplicados a compras al credito.

create sequence if not exists pago_numero_seq;
create or replace function nextval_pago()
returns bigint language sql security definer set search_path = public as $$
  select nextval('pago_numero_seq');
$$;
revoke all on function nextval_pago() from public, anon;
grant execute on function nextval_pago() to authenticated;

create table if not exists pagos_proveedor (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  proveedor_id uuid not null references clientes(id) on delete restrict,
  fecha        date not null default current_date,
  monto        numeric(12,2) not null check (monto > 0),
  metodo       text not null check (metodo in ('efectivo','transferencia','cheque','otro')),
  referencia   text,
  notas        text,
  usuario      text,
  created_at   timestamptz default now()
);
create index if not exists pagos_proveedor_proveedor_idx on pagos_proveedor (proveedor_id);

create table if not exists pago_aplicaciones (
  id        uuid primary key default gen_random_uuid(),
  pago_id   uuid not null references pagos_proveedor(id) on delete cascade,
  compra_id uuid not null references compras(id) on delete restrict,
  monto     numeric(12,2) not null check (monto > 0)
);
create index if not exists pago_aplicaciones_compra_idx on pago_aplicaciones (compra_id);
create index if not exists pago_aplicaciones_pago_idx on pago_aplicaciones (pago_id);

-- Saldos calculados (sin cache). dias_vencido se calcula en JS con hoyHonduras.
create or replace view compra_saldos as
select
  c.id                                 as compra_id,
  c.proveedor_id,
  c.numero,
  c.fecha,
  c.fecha_vencimiento,
  c.total,
  coalesce(sum(a.monto), 0)            as pagado,
  c.total - coalesce(sum(a.monto), 0)  as saldo
from compras c
left join pago_aplicaciones a on a.compra_id = c.id
where c.condicion_pago = 'credito' and c.estado <> 'anulada'
group by c.id;

-- Registrar un pago aplicado a una o varias compras, atomico.
create or replace function registrar_pago_proveedor(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_prov uuid := (p->>'proveedor_id')::uuid;
  v_fecha date := coalesce((p->>'fecha')::date, current_date);
  v_metodo text := p->>'metodo';
  v_ref text := p->>'referencia';
  v_notas text := p->>'notas';
  v_usuario text := p->>'usuario';
  r record;
  v_total numeric; v_estado text; v_cond text; v_prov_compra uuid;
  v_pagado numeric; v_saldo numeric;
  v_suma numeric := 0;
  v_pago_id uuid; v_numero text;
begin
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then
    raise exception 'El pago no tiene aplicaciones';
  end if;

  if v_prov is null then
    raise exception 'Falta el proveedor';
  end if;

  -- Agrupar por compra (suma) y validar cada compra distinta contra su saldo real.
  for r in
    select (e->>'compra_id')::uuid as compra_id, sum((e->>'monto')::numeric) as monto
    from jsonb_array_elements(p->'aplicaciones') e
    group by (e->>'compra_id')::uuid
    order by (e->>'compra_id')::uuid
  loop
    if r.monto is null or r.monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;
    select proveedor_id, condicion_pago, estado, total
      into v_prov_compra, v_cond, v_estado, v_total
      from compras where id = r.compra_id for update;
    if not found then raise exception 'Compra no encontrada'; end if;
    if v_prov_compra <> v_prov then raise exception 'La compra no pertenece al proveedor'; end if;
    if v_cond <> 'credito' then raise exception 'La compra no es al credito'; end if;
    if v_estado = 'anulada' then raise exception 'La compra esta anulada'; end if;
    select coalesce(sum(monto),0) into v_pagado from pago_aplicaciones where compra_id = r.compra_id;
    v_saldo := v_total - v_pagado;
    if r.monto > v_saldo then raise exception 'El abono excede el saldo de la compra'; end if;
    v_suma := v_suma + r.monto;
  end loop;

  v_numero := 'PAGO-' || lpad(nextval('pago_numero_seq')::text, 8, '0');
  insert into pagos_proveedor (numero, proveedor_id, fecha, monto, metodo, referencia, notas, usuario)
  values (v_numero, v_prov, v_fecha, v_suma, v_metodo, v_ref, v_notas, v_usuario)
  returning id into v_pago_id;

  insert into pago_aplicaciones (pago_id, compra_id, monto)
  select v_pago_id, (e->>'compra_id')::uuid, sum((e->>'monto')::numeric)
  from jsonb_array_elements(p->'aplicaciones') e
  group by (e->>'compra_id')::uuid;

  return v_pago_id;
end; $$;
revoke all on function registrar_pago_proveedor(jsonb) from public, anon;
grant execute on function registrar_pago_proveedor(jsonb) to authenticated;

create or replace function eliminar_pago_proveedor(p_pago_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from pagos_proveedor where id = p_pago_id;
end; $$;
revoke all on function eliminar_pago_proveedor(uuid) from public, anon;
grant execute on function eliminar_pago_proveedor(uuid) to authenticated;

-- RLS admin (patron P1-P4a). La vista hereda de las tablas base; se le da select.
alter table pagos_proveedor enable row level security;
alter table pago_aplicaciones enable row level security;
do $$ begin
  create policy pagos_proveedor_admin on pagos_proveedor for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy pago_aplicaciones_admin on pago_aplicaciones for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
grant select on compra_saldos to authenticated;
