-- POS P4c: cuentas por cobrar. El documento fiscal es la cuenta por cobrar.

-- Metodo de pago 'credito' (el check de metodos_pago.tipo es sin nombre; se recrea
-- con drop/add via ALTER, idempotente por nombre de constraint conocido, o se agrega
-- una constraint nueva). Estrategia idempotente: dropear la constraint por su nombre
-- generado si existe y recrearla incluyendo 'credito'.
do $$
declare v_con text;
begin
  select conname into v_con from pg_constraint
   where conrelid = 'metodos_pago'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%tipo%';
  if v_con is not null then execute format('alter table metodos_pago drop constraint %I', v_con); end if;
  alter table metodos_pago add constraint metodos_pago_tipo_chk
    check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro','credito'));
end $$;

insert into metodos_pago (nombre, tipo, activo, orden)
select 'Crédito', 'credito', true, 90
where not exists (select 1 from metodos_pago where tipo = 'credito');

alter table clientes add column if not exists limite_credito numeric(12,2);

insert into configuracion (key, value) values ('cxc_bloquear_limite', 'false')
on conflict (key) do nothing;

create sequence if not exists cobro_numero_seq;
create or replace function nextval_cobro()
returns bigint language sql security definer set search_path = public as $$
  select nextval('cobro_numero_seq');
$$;
revoke all on function nextval_cobro() from public, anon;
grant execute on function nextval_cobro() to authenticated;

create table if not exists cobros (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  cliente_id   uuid not null references clientes(id) on delete restrict,
  fecha        date not null default current_date,
  monto        numeric(12,2) not null check (monto > 0),
  metodo       text not null check (metodo in ('efectivo','transferencia','tarjeta','cheque','otro')),
  referencia   text,
  notas        text,
  sesion_id    uuid references sesiones_caja(id) on delete set null,
  usuario      text,
  created_at   timestamptz default now()
);
create index if not exists cobros_cliente_idx on cobros (cliente_id);
create index if not exists cobros_sesion_idx on cobros (sesion_id);

create table if not exists cobro_aplicaciones (
  id          uuid primary key default gen_random_uuid(),
  cobro_id    uuid not null references cobros(id) on delete cascade,
  documento_id uuid not null references documentos(id) on delete restrict,
  monto       numeric(12,2) not null check (monto > 0)
);
create index if not exists cobro_aplicaciones_doc_idx on cobro_aplicaciones (documento_id);
create index if not exists cobro_aplicaciones_cobro_idx on cobro_aplicaciones (cobro_id);

-- Saldos calculados. Vencimiento = created_at + cliente.dias_credito (no se persiste).
create or replace view documento_saldos as
select
  d.id                                              as documento_id,
  d.cliente_id,
  cl.nombre                                         as cliente_nombre,
  d.tipo, d.correlativo, d.numero_comprobante,
  d.created_at::date                                as fecha,
  (d.created_at::date + (coalesce(cl.dias_credito, 0) || ' days')::interval)::date as fecha_vencimiento,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0)                     as credito_total,
  coalesce(max(ca.cobrado), 0)                                                     as cobrado,
  coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) - coalesce(max(ca.cobrado), 0) as saldo
from documentos d
join clientes cl on cl.id = d.cliente_id
join documento_pagos dp on dp.documento_id = d.id
join metodos_pago m on m.id = dp.metodo_id
left join (select documento_id, sum(monto) as cobrado from cobro_aplicaciones group by documento_id) ca
  on ca.documento_id = d.id
where d.estado <> 'anulado'
group by d.id, cl.nombre, cl.dias_credito, ca.cobrado
having coalesce(sum(dp.monto) filter (where m.tipo = 'credito'), 0) > 0;
grant select on documento_saldos to authenticated;

-- Registrar cobro atomico (agrupa aplicaciones por documento antes de validar).
create or replace function registrar_cobro(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_cli uuid := (p->>'cliente_id')::uuid;
  v_fecha date := coalesce((p->>'fecha')::date, current_date);
  v_metodo text := p->>'metodo';
  v_ref text := p->>'referencia';
  v_notas text := p->>'notas';
  v_sesion uuid := nullif(p->>'sesion_id','')::uuid;
  v_usuario text := p->>'usuario';
  r record;
  v_cli_doc uuid; v_estado text; v_credito numeric; v_cobrado numeric; v_saldo numeric;
  v_suma numeric := 0; v_cobro_id uuid; v_numero text;
begin
  if v_cli is null then raise exception 'Falta el cliente'; end if;
  if jsonb_array_length(coalesce(p->'aplicaciones','[]'::jsonb)) = 0 then
    raise exception 'El cobro no tiene aplicaciones';
  end if;

  for r in
    select (e->>'documento_id')::uuid as documento_id, sum((e->>'monto')::numeric) as monto
    from jsonb_array_elements(p->'aplicaciones') e
    group by (e->>'documento_id')::uuid
    order by (e->>'documento_id')::uuid
  loop
    if r.monto is null or r.monto <= 0 then raise exception 'Monto de aplicacion invalido'; end if;
    select cliente_id, estado into v_cli_doc, v_estado from documentos where id = r.documento_id for update;
    if not found then raise exception 'Documento no encontrado'; end if;
    if v_cli_doc <> v_cli then raise exception 'El documento no pertenece al cliente'; end if;
    if v_estado = 'anulado' then raise exception 'El documento esta anulado'; end if;

    select coalesce(sum(dp.monto) filter (where m.tipo = 'credito'),0)
      into v_credito
      from documento_pagos dp join metodos_pago m on m.id = dp.metodo_id
      where dp.documento_id = r.documento_id;
    if v_credito <= 0 then raise exception 'El documento no tiene credito por cobrar'; end if;
    select coalesce(sum(monto),0) into v_cobrado from cobro_aplicaciones where documento_id = r.documento_id;
    v_saldo := v_credito - v_cobrado;
    if r.monto > v_saldo then raise exception 'El cobro excede el saldo del documento'; end if;
    v_suma := v_suma + r.monto;
  end loop;

  v_numero := 'COBRO-' || lpad(nextval('cobro_numero_seq')::text, 8, '0');
  insert into cobros (numero, cliente_id, fecha, monto, metodo, referencia, notas, sesion_id, usuario)
  values (v_numero, v_cli, v_fecha, v_suma, v_metodo, v_ref, v_notas, v_sesion, v_usuario)
  returning id into v_cobro_id;

  insert into cobro_aplicaciones (cobro_id, documento_id, monto)
  select v_cobro_id, (e->>'documento_id')::uuid, sum((e->>'monto')::numeric)
  from jsonb_array_elements(p->'aplicaciones') e
  group by (e->>'documento_id')::uuid;

  return v_cobro_id;
end; $$;
revoke all on function registrar_cobro(jsonb) from public, anon;
grant execute on function registrar_cobro(jsonb) to authenticated;

create or replace function eliminar_cobro(p_cobro_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from cobros where id = p_cobro_id;
end; $$;
revoke all on function eliminar_cobro(uuid) from public, anon;
grant execute on function eliminar_cobro(uuid) to authenticated;

alter table cobros enable row level security;
alter table cobro_aplicaciones enable row level security;
do $$ begin
  create policy cobros_admin on cobros for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy cobro_aplicaciones_admin on cobro_aplicaciones for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
