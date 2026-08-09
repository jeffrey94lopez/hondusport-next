-- POS P4a: compras y contacto unificado cliente/proveedor. Reusa aplicar_costeo;
-- las compras cambian el costo. NO hay tabla proveedores: se extiende clientes
-- con flags de rol; un proveedor es un clientes con es_proveedor = true.

alter table clientes add column if not exists es_cliente   boolean not null default true;
alter table clientes add column if not exists es_proveedor boolean not null default false;
alter table clientes add column if not exists contacto     text;
alter table clientes add column if not exists dias_credito int not null default 0;
-- Al menos un rol. Se agrega el check solo si no existe (idempotente).
do $$ begin
  alter table clientes add constraint clientes_rol_chk check (es_cliente or es_proveedor);
  exception when duplicate_object then null; end $$;

create sequence if not exists compra_numero_seq;
create or replace function nextval_compra()
returns bigint language sql security definer set search_path = public as $$
  select nextval('compra_numero_seq');
$$;
revoke all on function nextval_compra() from public, anon;
grant execute on function nextval_compra() to authenticated;

create table if not exists compras (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  proveedor_id      uuid not null references clientes(id) on delete restrict,
  estado            text not null default 'ordenada'
                      check (estado in ('borrador','ordenada','parcial','recibida','anulada')),
  moneda            text not null default 'L' check (moneda in ('L','USD')),
  tasa_cambio       numeric(12,4) check (tasa_cambio is null or tasa_cambio > 0),
  factura_proveedor text,
  condicion_pago    text not null default 'contado' check (condicion_pago in ('contado','credito')),
  dias_credito      int not null default 0 check (dias_credito >= 0),
  fecha             date not null default current_date,
  fecha_vencimiento date,
  notas             text,
  total             numeric(12,2) not null default 0,
  anulado_motivo    text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  constraint compras_usd_tasa_chk check (moneda <> 'USD' or tasa_cambio is not null)
);
create index if not exists compras_proveedor_idx on compras (proveedor_id);
create index if not exists compras_estado_idx on compras (estado);

create table if not exists compra_items (
  id                uuid primary key default gen_random_uuid(),
  compra_id         uuid not null references compras(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete restrict,
  variante_id       uuid references producto_variantes(id) on delete restrict,
  descripcion       text not null,
  cantidad_ordenada integer not null check (cantidad_ordenada > 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0),
  costo_unitario    numeric(12,4) not null check (costo_unitario >= 0),
  orden             int not null default 0
);
create index if not exists compra_items_compra_idx on compra_items (compra_id);

-- Recepción atómica: alimenta el kardex reusando aplicar_costeo; postea tipo 'compra'.
create or replace function recibir_compra(p jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_compra_id uuid := (p->>'compra_id')::uuid;
  v_usuario   text := p->>'usuario';
  v_estado text; v_moneda text; v_tasa numeric; v_numero text;
  r jsonb;
  v_item uuid; v_cant integer;
  v_prod uuid; v_var uuid; v_costo_unit numeric; v_ord integer; v_rec integer;
  v_costo_l numeric; v_stock integer; v_costo numeric; v_nuevo numeric;
  v_falta boolean;
begin
  select estado, moneda, tasa_cambio, numero into v_estado, v_moneda, v_tasa, v_numero
    from compras where id = v_compra_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if v_estado in ('recibida','anulada') then
    raise exception 'La compra no admite recepciones (estado %)', v_estado;
  end if;

  for r in select value from jsonb_array_elements(p->'recepciones') loop
    v_item := (r->>'compra_item_id')::uuid;
    v_cant := (r->>'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad de recepción invalida'; end if;

    select producto_id, variante_id, costo_unitario, cantidad_ordenada, cantidad_recibida
      into v_prod, v_var, v_costo_unit, v_ord, v_rec
      from compra_items where id = v_item and compra_id = v_compra_id for update;
    if not found then raise exception 'Linea de compra no encontrada'; end if;
    if v_cant > v_ord - v_rec then raise exception 'La recepcion excede lo pendiente de la linea'; end if;

    v_costo_l := round(v_costo_unit * (case when v_moneda = 'USD' then v_tasa else 1 end), 4);

    if v_var is not null then
      select stock, costo into v_stock, v_costo from producto_variantes where id = v_var for update;
    else
      select stock, costo into v_stock, v_costo from productos where id = v_prod for update;
    end if;

    v_nuevo := aplicar_costeo(v_stock, v_costo, v_cant, v_costo_l);

    if v_var is not null then
      update producto_variantes set stock = coalesce(stock,0) + v_cant, costo = v_nuevo where id = v_var;
    else
      update productos set stock = coalesce(stock,0) + v_cant, costo = v_nuevo where id = v_prod;
    end if;

    insert into movimientos_inventario
      (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario)
    values (v_prod, v_var, 'compra', v_cant, v_costo_l, v_nuevo, v_numero, v_usuario);

    update compra_items set cantidad_recibida = cantidad_recibida + v_cant where id = v_item;
  end loop;

  select bool_or(cantidad_recibida < cantidad_ordenada) into v_falta
    from compra_items where compra_id = v_compra_id;
  update compras set estado = case when coalesce(v_falta, false) then 'parcial' else 'recibida' end
    where id = v_compra_id;
end; $$;
revoke all on function recibir_compra(jsonb) from public, anon;
grant execute on function recibir_compra(jsonb) to authenticated;

-- Anular: revierte stock con movimiento compensatorio; NO recalcula costeo (append-only).
create or replace function anular_compra(p_compra_id uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_estado text; v_numero text; rec record;
begin
  select estado, numero into v_estado, v_numero from compras where id = p_compra_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if v_estado = 'anulada' then raise exception 'La compra ya esta anulada'; end if;

  if v_estado in ('parcial','recibida') then
    for rec in select producto_id, variante_id, cantidad_recibida
               from compra_items where compra_id = p_compra_id and cantidad_recibida > 0 loop
      if rec.variante_id is not null then
        update producto_variantes set stock = coalesce(stock,0) - rec.cantidad_recibida where id = rec.variante_id;
      else
        update productos set stock = coalesce(stock,0) - rec.cantidad_recibida where id = rec.producto_id;
      end if;
      insert into movimientos_inventario
        (producto_id, variante_id, tipo, cantidad, costo_unitario, costo_resultante, referencia, usuario, notas)
      values (rec.producto_id, rec.variante_id, 'devolucion', -rec.cantidad_recibida, null, null,
              v_numero || ' (anulacion)', null, p_motivo);
    end loop;
  end if;

  update compras set estado = 'anulada', anulado_motivo = p_motivo where id = p_compra_id;
end; $$;
revoke all on function anular_compra(uuid, text) from public, anon;
grant execute on function anular_compra(uuid, text) to authenticated;

-- RLS admin (patrón P1-P3). clientes ya tiene RLS; solo las 2 tablas nuevas.
alter table compras enable row level security;
alter table compra_items enable row level security;
do $$ begin
  create policy compras_admin on compras for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy compra_items_admin on compra_items for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

drop trigger if exists compras_updated_at on compras;
create trigger compras_updated_at before update on compras
  for each row execute function update_updated_at();
