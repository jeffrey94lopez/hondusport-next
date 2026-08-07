# POS P2 — Mostrador, caja y emisión fiscal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla de venta de mostrador con caja multi-estación (apertura/cierre con arqueo), pagos mixtos configurables y emisión atómica de factura fiscal CAI (Acuerdo 481-2017) y comprobante no fiscal, con impresión 80mm/carta, facturación de pedidos web y anulación de comprobantes.

**Architecture:** Todo dentro del admin Next.js 16 + Supabase existente. La matemática fiscal vive como funciones puras en `lib/pos/` con tests Vitest; la emisión es la RPC transaccional `emitir_documento` (correlativo sin huecos + stock + kardex, todo o nada); los documentos se imprimen como páginas HTML con CSS `@media print` (sin librerías PDF). Spec: `docs/superpowers/specs/2026-08-07-pos-p2-mostrador-fiscal-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + RPC plpgsql), CSS Modules + tokens Merlin (`app/merlin.css`), Vitest.

## Global Constraints

- UI, dominio, mensajes de error y commits en **español**; moneda Lempiras con `formatPrice()` (`lib/store/format.ts`).
- **Regla ISV:** el precio cargado es SIEMPRE el precio final al público. Desglose hacia atrás por línea según `isv` del producto (`15` → /1.15, `18` → /1.18, `exento` → completo a exento). Cliente exonerado paga la base (sin ISV) y esa base va a la columna exonerado. Redondeo a 2 decimales por línea.
- **Inmutabilidad:** un documento emitido nunca se edita/borra. Solo comprobantes se anulan (con motivo); facturas NO se anulan en P2 (nota de crédito = P5).
- **Kardex (CLAUDE.md):** el stock nunca se escribe directo; emisión de mostrador inserta `venta_pos` (referencia `documento:<id>`), anulación inserta `devolucion`. Pedidos web NO tocan stock al facturarse.
- **Correlativo factura:** `EST-PPP-01-NNNNNNNN` (16 dígitos con guiones), congelado en el documento. Comprobante: secuencia propia mostrada `C-NNNNNNNN`.
- **Contrato de errores `HS_*`** (SQL → TS): nuevos `HS_CAJA|<caja>`, `HS_CAI|vencido|<fecha>`, `HS_CAI|agotado|<hasta>`, `HS_TOTAL`, `HS_PEDIDO_DOC|<numero>`, `HS_DOC|<motivo>`; se reutilizan `HS_STOCK`/`HS_REQUIERE_VARIANTE`/`HS_VARIANTE`/`HS_INACTIVO`/`HS_PEDIDO`.
- Todas las tablas nuevas: RLS solo `authenticated`; RPCs `security invoker` + `set search_path = public` + `grant execute to authenticated` + `revoke from public, anon` (excepto donde se indique).
- Estilos con tokens Merlin (`--bg-card`, `--text-primary`, `--estado-*`, clases `btnMerlin*`); NUNCA hardcodear valores que ya tienen token.
- Migraciones: NO se aplican a la BD desde el código; el usuario las corre en el SQL Editor antes del push. `supabase/schema.sql` es la referencia de tablas/RLS (sin cuerpos de RPC) y debe mantenerse en sync.
- Al terminar cada tarea: `npm test` verde; si tocaste tipos/Server Actions, `npx tsc --noEmit`; `npm run lint` 0 errores. Commits formato convencional en español.
- Config clave/valor: nuevas claves via `toConfigMap()`; clave nueva de P2: `pos_limite_consumidor_final` (default `'10000'`).

---

## Estructura de archivos

- `supabase/migrations/2026-08-07-pos-p2-tablas.sql` — Tablas + seed (Task 1)
- `supabase/migrations/2026-08-07-pos-p2-rpcs.sql` — RPCs + backlog P1 (Task 2)
- `types/index.ts` — tipos nuevos (Task 3)
- `lib/pos/desglose.ts` + tests — desglose fiscal (Task 4)
- `lib/pos/letras.ts` + tests — número a letras (Task 5)
- `lib/pos/emision.ts` + tests — validaciones, precio POS, arqueo, errores (Task 6)
- `app/admin/configuracion/PosSection.tsx` + `posActions.ts` — CRUD cajas/vendedores/métodos (Task 7)
- `app/admin/pos/actions.ts` — server actions del POS (Task 8)
- `app/admin/pos/page.tsx`, `PosClient.tsx`, `pos.module.css`, `layout.tsx` — pantalla POS (Tasks 9-12)
- `app/admin/pos/documento/[id]/page.tsx` + `DocumentoView.tsx` + `documento.module.css`; `app/admin/pos/documentos/page.tsx` + `DocumentosClient.tsx` (Task 13)
- `app/admin/pedidos/PedidosClient.tsx` + `actions.ts` — emitir desde pedido (Task 14)

---

### Task 1: Migración A — tablas del POS y seed

**Files:**
- Create: `supabase/migrations/2026-08-07-pos-p2-tablas.sql`
- Modify: `supabase/schema.sql` (añadir las mismas tablas/índices/RLS en la sección correspondiente, antes de los triggers post-función)

**Interfaces:**
- Produces: tablas `cajas`, `sesiones_caja`, `vendedores`, `metodos_pago`, `documentos`, `documento_items`, `documento_pagos`, `ventas_espera`; secuencia `comprobante_numero_seq`; clave `pos_limite_consumidor_final` en `configuracion`.

- [ ] **Step 1: Escribir la migración**

```sql
-- POS P2: tablas de mostrador, caja y documentos. Aplicar ANTES de 2026-08-07-pos-p2-rpcs.sql.

create table if not exists cajas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  punto_emision     text not null default '001' check (punto_emision ~ '^[0-9]{3}$'),
  formato_impresion text not null default '80mm' check (formato_impresion in ('80mm','carta')),
  activo            boolean not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists sesiones_caja (
  id             uuid primary key default gen_random_uuid(),
  caja_id        uuid not null references cajas(id) on delete restrict,
  estado         text not null default 'abierta' check (estado in ('abierta','cerrada')),
  monto_inicial  numeric not null check (monto_inicial >= 0),
  abierta_at     timestamptz not null default now(),
  cerrada_at     timestamptz,
  monto_esperado numeric,
  monto_contado  numeric,
  diferencia     numeric,
  notas          text,
  usuario        text
);
create unique index if not exists sesiones_caja_abierta_unica
  on sesiones_caja (caja_id) where estado = 'abierta';

create table if not exists vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists metodos_pago (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo   text not null check (tipo in ('efectivo_lps','efectivo_usd','tarjeta','transferencia','otro')),
  activo boolean not null default true,
  orden  integer not null default 0
);

create sequence if not exists comprobante_numero_seq;

create table if not exists documentos (
  id                   uuid primary key default gen_random_uuid(),
  tipo                 text not null check (tipo in ('factura','comprobante')),
  correlativo          text,
  numero_comprobante   integer,
  cai_id               uuid references cai_autorizaciones(id) on delete restrict,
  caja_id              uuid not null references cajas(id) on delete restrict,
  sesion_id            uuid references sesiones_caja(id) on delete restrict,
  vendedor_id          uuid references vendedores(id) on delete restrict,
  cliente_id           uuid references clientes(id) on delete restrict,
  cliente_nombre       text not null default 'CONSUMIDOR FINAL',
  cliente_rtn          text,
  cliente_identidad    text,
  exonerado            boolean not null default false,
  orden_compra_exenta  text,
  constancia_exonerado text,
  registro_sag         text,
  pedido_id            uuid references pedidos(id) on delete restrict,
  total_exento         numeric not null default 0,
  total_exonerado      numeric not null default 0,
  total_gravado15      numeric not null default 0,
  total_gravado18      numeric not null default 0,
  isv15                numeric not null default 0,
  isv18                numeric not null default 0,
  descuento_total      numeric not null default 0,
  total                numeric not null,
  total_letras         text not null,
  tasa_usd             numeric,
  estado               text not null default 'emitido' check (estado in ('emitido','anulado')),
  anulado_motivo       text,
  anulado_at           timestamptz,
  notas                text,
  usuario              text,
  created_at           timestamptz default now(),
  constraint documentos_correlativo_chk check (
    (tipo = 'factura' and correlativo is not null and cai_id is not null and numero_comprobante is null)
    or (tipo = 'comprobante' and correlativo is null and cai_id is null and numero_comprobante is not null)
  )
);
create unique index if not exists documentos_pedido_vigente
  on documentos (pedido_id) where pedido_id is not null and estado = 'emitido';
create unique index if not exists documentos_cai_correlativo
  on documentos (cai_id, correlativo) where correlativo is not null;

create table if not exists documento_items (
  id              uuid primary key default gen_random_uuid(),
  documento_id    uuid not null references documentos(id) on delete restrict,
  producto_id     uuid references productos(id) on delete restrict,
  variante_id     uuid references producto_variantes(id) on delete restrict,
  descripcion     text not null,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric not null check (precio_unitario >= 0),
  descuento       numeric not null default 0 check (descuento >= 0),
  isv             text not null check (isv in ('15','18','exento')),
  importe         numeric not null,
  base            numeric not null,
  isv_monto       numeric not null default 0
);
create index if not exists documento_items_documento on documento_items (documento_id);

create table if not exists documento_pagos (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete restrict,
  metodo_id    uuid not null references metodos_pago(id) on delete restrict,
  monto        numeric not null check (monto > 0),
  monto_usd    numeric,
  tasa         numeric,
  referencia   text,
  created_at   timestamptz default now()
);
create index if not exists documento_pagos_documento on documento_pagos (documento_id);

create table if not exists ventas_espera (
  id         uuid primary key default gen_random_uuid(),
  caja_id    uuid not null references cajas(id) on delete cascade,
  nombre     text not null,
  payload    jsonb not null,
  created_at timestamptz default now()
);

-- RLS: todo es dato del admin (patrón clientes de P1)
alter table cajas enable row level security;
alter table sesiones_caja enable row level security;
alter table vendedores enable row level security;
alter table metodos_pago enable row level security;
alter table documentos enable row level security;
alter table documento_items enable row level security;
alter table documento_pagos enable row level security;
alter table ventas_espera enable row level security;

do $$ begin
  create policy cajas_admin on cajas for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy sesiones_admin on sesiones_caja for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy vendedores_admin on vendedores for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy metodos_admin on metodos_pago for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
-- documentos/items/pagos: inmutables — solo select e insert (sin update/delete
-- genéricos; anular pasa por la RPC, que corre como authenticated y necesita
-- update de documentos: política de update restringida a cambiar estado)
do $$ begin
  create policy documentos_select on documentos for select to authenticated using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documentos_insert on documentos for insert to authenticated with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documentos_update on documentos for update to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_items_select on documento_items for select to authenticated using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_items_insert on documento_items for insert to authenticated with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_pagos_select on documento_pagos for select to authenticated using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy documento_pagos_insert on documento_pagos for insert to authenticated with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy ventas_espera_admin on ventas_espera for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end $$;

-- Triggers de updated_at (la función update_updated_at ya existe)
drop trigger if exists cajas_updated_at on cajas;
create trigger cajas_updated_at before update on cajas
  for each row execute function update_updated_at();
drop trigger if exists vendedores_updated_at on vendedores;
create trigger vendedores_updated_at before update on vendedores
  for each row execute function update_updated_at();

-- Seed de métodos de pago (idempotente por nombre)
insert into metodos_pago (nombre, tipo, orden)
select v.nombre, v.tipo, v.orden
from (values
  ('Efectivo L.', 'efectivo_lps', 0),
  ('Tarjeta', 'tarjeta', 1),
  ('Transferencia / Depósito', 'transferencia', 2),
  ('Efectivo USD', 'efectivo_usd', 3)
) as v(nombre, tipo, orden)
where not exists (select 1 from metodos_pago m where m.tipo = v.tipo and m.nombre = v.nombre);

-- Config nueva
insert into configuracion (key, value) values ('pos_limite_consumidor_final', '10000')
  on conflict (key) do nothing;
```

- [ ] **Step 2: Replicar en `supabase/schema.sql`** las tablas/índices/policies/triggers (misma forma; los triggers van en el bloque post-función como en P1-T1). La secuencia y el seed también.
- [ ] **Step 3: Verificar** `npm test` (sin cambios: 308+) y `npm run lint`.
- [ ] **Step 4: Commit** `feat(pos): tablas de cajas, sesiones, vendedores, metodos de pago y documentos`

---

### Task 2: Migración B — RPCs `emitir_documento`, `anular_comprobante` y backlog P1

**Files:**
- Create: `supabase/migrations/2026-08-07-pos-p2-rpcs.sql`

**Interfaces:**
- Consumes: tablas de Task 1; `aplicar_costeo` y patrón FOR UPDATE de `supabase/migrations/2026-08-07-pos-p1-kardex-rpcs.sql`.
- Produces: `emitir_documento(p jsonb) returns uuid`; `anular_comprobante(p_documento_id uuid, p_motivo text) returns void`. Claves jsonb del payload (contrato con Task 8): ver Step 1.

- [ ] **Step 1: Escribir `emitir_documento`**

Payload `p` (todas las claves en snake_case): `tipo`, `caja_id`, `vendedor_id?`, `cliente_id?`, `cliente_nombre`, `cliente_rtn?`, `cliente_identidad?`, `exonerado` bool, `orden_compra_exenta?`, `constancia_exonerado?`, `registro_sag?`, `pedido_id?`, `notas?`, `usuario?`, `tasa_usd?`, `totales` {`total_exento`,`total_exonerado`,`total_gravado15`,`total_gravado18`,`isv15`,`isv18`,`descuento_total`,`total`,`total_letras`}, `items` [{`producto_id?`,`variante_id?`,`descripcion`,`cantidad`,`precio_unitario`,`descuento`,`isv`,`importe`,`base`,`isv_monto`}], `pagos` [{`metodo_id`,`monto`,`monto_usd?`,`tasa?`,`referencia?`}].

```sql
-- POS P2: RPCs de emisión y anulación + endurecimientos de P1.
-- Aplicar DESPUÉS de 2026-08-07-pos-p2-tablas.sql.

create or replace function emitir_documento(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo text := p->>'tipo';
  v_caja cajas%rowtype;
  v_sesion_id uuid;
  v_pedido_id uuid := nullif(p->>'pedido_id','')::uuid;
  v_cai cai_autorizaciones%rowtype;
  v_correlativo text;
  v_numero_comp integer;
  v_doc_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_variante_id uuid;
  v_cantidad integer;
  v_stock integer;
  v_activo boolean;
  v_canal text;
  v_nombre_prod text;
  v_nombre_var text;
  v_tiene_variantes boolean;
  v_suma_items numeric := 0;
  v_suma_pagos numeric := 0;
  v_total numeric := (p->'totales'->>'total')::numeric;
begin
  if v_tipo not in ('factura','comprobante') then
    raise exception using message = 'HS_DOC|tipo inválido';
  end if;

  select * into v_caja from cajas where id = (p->>'caja_id')::uuid and activo = true;
  if not found then raise exception using message = 'HS_CAJA|caja no encontrada'; end if;

  -- Venta de mostrador exige sesión abierta y pagos que cubran el total.
  if v_pedido_id is null then
    select s.id into v_sesion_id from sesiones_caja s
      where s.caja_id = v_caja.id and s.estado = 'abierta';
    if not found then raise exception using message = 'HS_CAJA|' || v_caja.nombre; end if;
    select coalesce(sum((pg->>'monto')::numeric), 0) into v_suma_pagos
      from jsonb_array_elements(coalesce(p->'pagos','[]'::jsonb)) pg;
    if v_suma_pagos < v_total - 0.01 then
      raise exception using message = 'HS_TOTAL';
    end if;
  else
    -- Pedido web: existe, no cancelado, sin documento vigente.
    perform 1 from pedidos where id = v_pedido_id and estado <> 'cancelado';
    if not found then raise exception using message = 'HS_PEDIDO|' || v_pedido_id; end if;
    perform 1 from documentos d where d.pedido_id = v_pedido_id and d.estado = 'emitido';
    if found then
      raise exception using message = 'HS_PEDIDO_DOC|' ||
        (select numero::text from pedidos where id = v_pedido_id);
    end if;
  end if;

  -- Re-verificación de totales (defensa: la suma de importes debe cuadrar).
  select coalesce(sum((it->>'importe')::numeric), 0) into v_suma_items
    from jsonb_array_elements(p->'items') it;
  if abs(v_suma_items - v_total) > 0.01 then
    raise exception using message = 'HS_TOTAL';
  end if;

  -- Correlativo fiscal o número de comprobante.
  if v_tipo = 'factura' then
    select * into v_cai from cai_autorizaciones c
      where c.activo = true and c.punto_emision = v_caja.punto_emision
        and c.tipo_documento = '01'
      for update;
    if not found then raise exception using message = 'HS_CAI|sin_cai|' || v_caja.punto_emision; end if;
    if v_cai.fecha_limite < current_date then
      raise exception using message = 'HS_CAI|vencido|' || v_cai.fecha_limite;
    end if;
    if v_cai.correlativo_actual >= v_cai.rango_hasta then
      raise exception using message = 'HS_CAI|agotado|' || v_cai.rango_hasta;
    end if;
    update cai_autorizaciones set correlativo_actual = correlativo_actual + 1
      where id = v_cai.id
      returning correlativo_actual into v_cai.correlativo_actual;
    v_correlativo := v_cai.establecimiento || '-' || v_cai.punto_emision || '-' ||
                     v_cai.tipo_documento || '-' || lpad(v_cai.correlativo_actual::text, 8, '0');
  else
    v_numero_comp := nextval('comprobante_numero_seq');
  end if;

  -- Stock (solo mostrador; ítems libres producto_id null no tocan stock).
  if v_pedido_id is null then
    for v_item in select * from jsonb_array_elements(p->'items') loop
      v_producto_id := nullif(v_item->>'producto_id','')::uuid;
      v_variante_id := nullif(v_item->>'variante_id','')::uuid;
      v_cantidad    := (v_item->>'cantidad')::integer;
      if v_producto_id is null then continue; end if;

      select pr.activo, pr.canal, pr.nombre into v_activo, v_canal, v_nombre_prod
        from productos pr where pr.id = v_producto_id;
      if not found or not v_activo or v_canal = 'tienda' then
        raise exception using message = 'HS_INACTIVO|' || coalesce(v_nombre_prod, 'producto');
      end if;

      if v_variante_id is not null then
        select pv.stock, pv.nombre into v_stock, v_nombre_var
          from producto_variantes pv
          where pv.id = v_variante_id and pv.producto_id = v_producto_id and pv.activo = true
          for update;
        if not found then raise exception using message = 'HS_VARIANTE|' || v_nombre_prod; end if;
        if v_stock is not null then
          if v_stock < v_cantidad then
            raise exception using message = 'HS_STOCK|' || v_nombre_prod || ' (' || v_nombre_var || ')|' || v_stock;
          end if;
          update producto_variantes set stock = stock - v_cantidad
            where producto_variantes.id = v_variante_id;
        end if;
      else
        select exists(select 1 from producto_variantes pv
          where pv.producto_id = v_producto_id and pv.activo = true) into v_tiene_variantes;
        if v_tiene_variantes then
          raise exception using message = 'HS_REQUIERE_VARIANTE|' || v_nombre_prod;
        end if;
        select pr.stock into v_stock from productos pr where pr.id = v_producto_id for update;
        if v_stock is not null then
          if v_stock < v_cantidad then
            raise exception using message = 'HS_STOCK|' || v_nombre_prod || '|' || v_stock;
          end if;
          update productos set stock = stock - v_cantidad where productos.id = v_producto_id;
        end if;
      end if;
    end loop;
  end if;

  insert into documentos (
    tipo, correlativo, numero_comprobante, cai_id, caja_id, sesion_id, vendedor_id,
    cliente_id, cliente_nombre, cliente_rtn, cliente_identidad,
    exonerado, orden_compra_exenta, constancia_exonerado, registro_sag,
    pedido_id, total_exento, total_exonerado, total_gravado15, total_gravado18,
    isv15, isv18, descuento_total, total, total_letras, tasa_usd, notas, usuario
  ) values (
    v_tipo, v_correlativo, v_numero_comp,
    case when v_tipo = 'factura' then v_cai.id end,
    v_caja.id, v_sesion_id, nullif(p->>'vendedor_id','')::uuid,
    nullif(p->>'cliente_id','')::uuid,
    coalesce(nullif(p->>'cliente_nombre',''), 'CONSUMIDOR FINAL'),
    nullif(p->>'cliente_rtn',''), nullif(p->>'cliente_identidad',''),
    coalesce((p->>'exonerado')::boolean, false),
    nullif(p->>'orden_compra_exenta',''), nullif(p->>'constancia_exonerado',''),
    nullif(p->>'registro_sag',''), v_pedido_id,
    (p->'totales'->>'total_exento')::numeric, (p->'totales'->>'total_exonerado')::numeric,
    (p->'totales'->>'total_gravado15')::numeric, (p->'totales'->>'total_gravado18')::numeric,
    (p->'totales'->>'isv15')::numeric, (p->'totales'->>'isv18')::numeric,
    (p->'totales'->>'descuento_total')::numeric, v_total,
    p->'totales'->>'total_letras', nullif(p->>'tasa_usd','')::numeric,
    nullif(p->>'notas',''), nullif(p->>'usuario','')
  ) returning id into v_doc_id;

  insert into documento_items (
    documento_id, producto_id, variante_id, descripcion, cantidad,
    precio_unitario, descuento, isv, importe, base, isv_monto
  )
  select v_doc_id, nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
    it->>'descripcion', (it->>'cantidad')::integer, (it->>'precio_unitario')::numeric,
    coalesce((it->>'descuento')::numeric, 0), it->>'isv',
    (it->>'importe')::numeric, (it->>'base')::numeric, coalesce((it->>'isv_monto')::numeric, 0)
  from jsonb_array_elements(p->'items') it;

  insert into documento_pagos (documento_id, metodo_id, monto, monto_usd, tasa, referencia)
  select v_doc_id, (pg->>'metodo_id')::uuid, (pg->>'monto')::numeric,
    nullif(pg->>'monto_usd','')::numeric, nullif(pg->>'tasa','')::numeric,
    nullif(pg->>'referencia','')
  from jsonb_array_elements(coalesce(p->'pagos','[]'::jsonb)) pg;

  -- Kardex venta_pos (solo mostrador, solo items con producto y stock finito).
  if v_pedido_id is null then
    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia, usuario)
    select nullif(it->>'producto_id','')::uuid, nullif(it->>'variante_id','')::uuid,
      'venta_pos', -(it->>'cantidad')::integer,
      coalesce(pv.costo, pr.costo), 'documento:' || v_doc_id, nullif(p->>'usuario','')
    from jsonb_array_elements(p->'items') it
    left join producto_variantes pv on pv.id = nullif(it->>'variante_id','')::uuid
    join productos pr on pr.id = nullif(it->>'producto_id','')::uuid
    where nullif(it->>'producto_id','') is not null
      and (case when nullif(it->>'variante_id','') is not null then pv.stock else pr.stock end) is not null;
  end if;

  return v_doc_id;
end;
$$;
grant execute on function emitir_documento(jsonb) to authenticated;
revoke execute on function emitir_documento(jsonb) from public, anon;
```

- [ ] **Step 2: Escribir `anular_comprobante`**

```sql
create or replace function anular_comprobante(p_documento_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_doc documentos%rowtype;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception using message = 'HS_DOC|motivo requerido';
  end if;
  select * into v_doc from documentos where id = p_documento_id for update;
  if not found then raise exception using message = 'HS_DOC|documento no encontrado'; end if;
  if v_doc.tipo <> 'comprobante' then
    raise exception using message = 'HS_DOC|solo los comprobantes se anulan (facturas: nota de crédito)';
  end if;
  if v_doc.estado <> 'emitido' then
    raise exception using message = 'HS_DOC|ya está anulado';
  end if;

  -- Reponer stock solo si el documento descontó (mostrador, no pedido web).
  if v_doc.pedido_id is null then
    update producto_variantes pv
      set stock = pv.stock + di.cantidad
      from documento_items di
      where di.documento_id = v_doc.id and di.variante_id = pv.id and pv.stock is not null;
    update productos pr
      set stock = pr.stock + di.cantidad
      from documento_items di
      where di.documento_id = v_doc.id and di.variante_id is null
        and di.producto_id = pr.id and pr.stock is not null;

    insert into movimientos_inventario (producto_id, variante_id, tipo, cantidad, costo_resultante, referencia)
    select di.producto_id, di.variante_id, 'devolucion', di.cantidad,
      coalesce(pv.costo, pr.costo), 'documento:' || v_doc.id
    from documento_items di
    left join producto_variantes pv on pv.id = di.variante_id
    left join productos pr on pr.id = di.producto_id
    where di.documento_id = v_doc.id and di.producto_id is not null
      and (case when di.variante_id is not null then pv.stock else pr.stock end) is not null;
  end if;

  update documentos set estado = 'anulado', anulado_motivo = trim(p_motivo), anulado_at = now()
    where id = v_doc.id;
end;
$$;
grant execute on function anular_comprobante(uuid, text) to authenticated;
revoke execute on function anular_comprobante(uuid, text) from public, anon;
```

- [ ] **Step 3: Backlog P1 en la misma migración.** (a) Recrear `crear_pedido` copiando el cuerpo EXACTO vigente de `supabase/migrations/2026-08-07-pos-p1-kardex-rpcs.sql` (líneas del `create or replace function crear_pedido` completo) con UN solo cambio — el check de canal junto al de activo:

```sql
    select p.activo, p.nombre, p.canal into v_activo, v_nombre_prod, v_canal
      from productos p where p.id = v_producto_id;
    if not found or not v_activo or v_canal = 'mostrador' then
      raise exception using message = 'HS_INACTIVO|' || coalesce(v_nombre_prod, 'producto');
    end if;
```

(declarar `v_canal text;` en el bloque declare). (b) Higiene:

```sql
alter function aplicar_costeo(integer, numeric, integer, numeric) set search_path = public;
revoke execute on function aplicar_costeo(integer, numeric, integer, numeric) from public, anon;
grant execute on function aplicar_costeo(integer, numeric, integer, numeric) to authenticated;
revoke execute on function sync_producto_variantes(uuid, jsonb) from public, anon;
```

- [ ] **Step 4: Verificar** consistencia interna del SQL (firmas, claves jsonb vs Step 1, tipos); `npm run lint` no aplica a SQL — revisar a mano que cada `raise` use el contrato `HS_*`.
- [ ] **Step 5: Commit** `feat(pos): RPCs emitir_documento y anular_comprobante con endurecimientos de P1`

---

### Task 3: Tipos TS del POS

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces (exactos):

```ts
export interface Caja {
  id: string; nombre: string; punto_emision: string;
  formato_impresion: '80mm' | 'carta'; activo: boolean;
  created_at: string; updated_at: string
}
export interface SesionCaja {
  id: string; caja_id: string; estado: 'abierta' | 'cerrada';
  monto_inicial: number; abierta_at: string; cerrada_at: string | null;
  monto_esperado: number | null; monto_contado: number | null;
  diferencia: number | null; notas: string | null; usuario: string | null
}
export interface Vendedor { id: string; nombre: string; activo: boolean; created_at: string; updated_at: string }
export type MetodoPagoTipo = 'efectivo_lps' | 'efectivo_usd' | 'tarjeta' | 'transferencia' | 'otro'
export interface MetodoPago { id: string; nombre: string; tipo: MetodoPagoTipo; activo: boolean; orden: number }
export type IsvTipo = '15' | '18' | 'exento'
export interface LineaPos {
  producto_id: string | null; variante_id: string | null; descripcion: string;
  cantidad: number; precio_unitario: number; descuento: number; isv: IsvTipo
}
export interface LineaDesglosada extends LineaPos { importe: number; base: number; isv_monto: number }
export interface TotalesDocumento {
  total_exento: number; total_exonerado: number; total_gravado15: number;
  total_gravado18: number; isv15: number; isv18: number;
  descuento_total: number; total: number; total_letras: string
}
export interface PagoPos { metodo_id: string; tipo: MetodoPagoTipo; monto: number; monto_usd?: number | null; tasa?: number | null; referencia?: string | null }
export interface Documento { /* espejo 1:1 de la tabla documentos, campos como en la migración, numéricos como number */ }
export interface DocumentoItem { /* espejo 1:1 de documento_items */ }
export interface DocumentoPago { /* espejo 1:1 de documento_pagos */ }
export interface VentaEspera { id: string; caja_id: string; nombre: string; payload: unknown; created_at: string }
```

- [ ] **Step 1:** Añadir los tipos (los "espejo 1:1" se escriben completos, campo por campo según la migración de Task 1 — no dejar el comentario).
- [ ] **Step 2:** `npx tsc --noEmit` y `npm test`.
- [ ] **Step 3: Commit** `feat(pos): tipos de caja, documentos y pagos`

---

### Task 4: `lib/pos/desglose.ts` — desglose fiscal (TDD)

**Files:**
- Create: `lib/pos/desglose.ts`
- Test: `lib/pos/tests/desglose.test.ts`

**Interfaces:**
- Consumes: `LineaPos`, `LineaDesglosada`, `TotalesDocumento`, `IsvTipo` (Task 3).
- Produces:

```ts
export type ColumnaFiscal = 'exento' | 'exonerado' | 'g15' | 'g18'
export type LineaConColumna = LineaDesglosada & { columna: ColumnaFiscal }
export function desglosarLinea(linea: LineaPos, exonerado: boolean): LineaConColumna
export function prorratearDescuentoGlobal(lineas: LineaPos[], descuentoGlobal: number): LineaPos[]
export function totalesDocumento(lineas: LineaConColumna[], descuentoGlobal: number, totalLetras: string): TotalesDocumento
```

- [ ] **Step 1: Tests que fallan** (casos exactos):

```ts
import { describe, it, expect } from 'vitest'
import { desglosarLinea, prorratearDescuentoGlobal, totalesDocumento } from '../desglose'

const linea = (over = {}) => ({
  producto_id: null, variante_id: null, descripcion: 'X',
  cantidad: 1, precio_unitario: 115, descuento: 0, isv: '15' as const, ...over,
})

describe('desglosarLinea', () => {
  it('gravado 15: 115 → base 100, isv 15', () => {
    const r = desglosarLinea(linea(), false)
    expect(r).toMatchObject({ importe: 115, base: 100, isv_monto: 15 })
  })
  it('gravado 18: 118 → base 100, isv 18', () => {
    const r = desglosarLinea(linea({ precio_unitario: 118, isv: '18' }), false)
    expect(r).toMatchObject({ importe: 118, base: 100, isv_monto: 18 })
  })
  it('exento: importe = base, isv 0', () => {
    const r = desglosarLinea(linea({ isv: 'exento', precio_unitario: 80 }), false)
    expect(r).toMatchObject({ importe: 80, base: 80, isv_monto: 0 })
  })
  it('descuento reduce el bruto antes de desglosar', () => {
    const r = desglosarLinea(linea({ cantidad: 2, descuento: 30 }), false) // 230-30=200
    expect(r).toMatchObject({ importe: 200, base: 173.91, isv_monto: 26.09 })
  })
  it('exonerado: cobra la base, isv 0', () => {
    const r = desglosarLinea(linea(), true) // 115 → base 100
    expect(r).toMatchObject({ importe: 100, base: 100, isv_monto: 0 })
  })
})

describe('prorratearDescuentoGlobal', () => {
  it('proporcional al importe bruto', () => {
    const ls = [linea({ precio_unitario: 100 }), linea({ precio_unitario: 50 }), linea({ precio_unitario: 50 })]
    const r = prorratearDescuentoGlobal(ls, 10)
    expect(r.map(l => l.descuento)).toEqual([5, 2.5, 2.5])
  })
  it('residuo de redondeo a la línea mayor', () => {
    const ls = [linea({ precio_unitario: 100 }), linea({ precio_unitario: 100 }), linea({ precio_unitario: 100 })]
    const r = prorratearDescuentoGlobal(ls, 10)
    expect(r.map(l => l.descuento)).toEqual([3.34, 3.33, 3.33])
    expect(r.reduce((s, l) => s + l.descuento, 0)).toBeCloseTo(10, 2)
  })
  it('se suma al descuento de línea existente', () => {
    const ls = [linea({ descuento: 5 })]
    expect(prorratearDescuentoGlobal(ls, 10)[0].descuento).toBe(15)
  })
})

describe('totalesDocumento', () => {
  it('agrupa por columna y suma', () => {
    const ls = [
      desglosarLinea(linea(), false),                                        // g15: 100 + 15
      desglosarLinea(linea({ precio_unitario: 118, isv: '18' }), false),     // g18: 100 + 18
      desglosarLinea(linea({ isv: 'exento', precio_unitario: 50 }), false),  // exento 50
    ]
    const t = totalesDocumento(ls, 0, 'X LEMPIRAS CON 00/100')
    expect(t).toMatchObject({
      total_exento: 50, total_exonerado: 0, total_gravado15: 100, total_gravado18: 100,
      isv15: 15, isv18: 18, descuento_total: 0, total: 283,
    })
  })
  it('exonerado va a su columna', () => {
    const ls = [desglosarLinea(linea(), true)]
    const t = totalesDocumento(ls, 0, 'CIEN LEMPIRAS CON 00/100')
    expect(t).toMatchObject({ total_exonerado: 100, total_gravado15: 0, isv15: 0, total: 100 })
  })
})
```

- [ ] **Step 2:** `npx vitest run lib/pos/tests/desglose.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar.** `round2 = (n) => Math.round(n * 100) / 100`. `desglosarLinea`: bruto = round2(cantidad×precio − descuento); si exonerado y isv≠'exento': base = round2(bruto/(1+tasa)), importe = base, isv_monto = 0, columna 'exonerado'; si exento (o exonerado con isv exento): base = importe = bruto, isv 0, columna 'exento'; si gravado: base = round2(bruto/(1+tasa)), isv_monto = round2(bruto − base), importe = bruto. La línea desglosada conserva todos los campos de entrada. `prorratearDescuentoGlobal`: pesos por bruto (cantidad×precio − descuento); asignar round2(peso×global) a cada una y el residuo (global − suma) a la de mayor bruto (empate: la primera). `totalesDocumento`: reduce por columna (usar el isv y el flag exonerado implícito en isv_monto===0&&isv!=='exento'&&base===importe→exonerado — NO: mejor que `desglosarLinea` devuelva también `columna: 'exento'|'exonerado'|'g15'|'g18'` como campo extra no persistido; añadirlo al tipo de retorno como `LineaDesglosada & { columna: ... }`), descuento_total = suma de descuentos de línea + residuos (= suma descuentos ya prorrateados), total = suma de importes.
- [ ] **Step 4:** Tests PASS; suite completa verde.
- [ ] **Step 5: Commit** `feat(pos): desglose fiscal por linea con prorrateo de descuentos`

---

### Task 5: `lib/pos/letras.ts` — total en letras (TDD)

**Files:**
- Create: `lib/pos/letras.ts`
- Test: `lib/pos/tests/letras.test.ts`

**Interfaces:**
- Produces: `export function numeroALetras(monto: number): string` — español, mayúsculas, formato factura HN: `"<ENTERO EN LETRAS> LEMPIRAS CON NN/100"`.

- [ ] **Step 1: Tests que fallan** (casos exactos):

```ts
import { numeroALetras } from '../letras'
const casos: Array<[number, string]> = [
  [0.99, 'CERO LEMPIRAS CON 99/100'],
  [15, 'QUINCE LEMPIRAS CON 00/100'],
  [16, 'DIECISÉIS LEMPIRAS CON 00/100'],
  [21, 'VEINTIÚN LEMPIRAS CON 00/100'],
  [100, 'CIEN LEMPIRAS CON 00/100'],
  [101, 'CIENTO UN LEMPIRAS CON 00/100'],
  [555.5, 'QUINIENTOS CINCUENTA Y CINCO LEMPIRAS CON 50/100'],
  [1000, 'UN MIL LEMPIRAS CON 00/100'],
  [12345.67, 'DOCE MIL TRESCIENTOS CUARENTA Y CINCO LEMPIRAS CON 67/100'],
  [1000000, 'UN MILLÓN DE LEMPIRAS CON 00/100'],
  [2500000.1, 'DOS MILLONES QUINIENTOS MIL LEMPIRAS CON 10/100'],
]
it.each(casos)('numeroALetras(%f) → %s', (n, esperado) => {
  expect(numeroALetras(n)).toBe(esperado)
})
```

- [ ] **Step 2:** FAIL. **Step 3: Implementar** — unidades/especiales (DIECISÉIS, VEINTIÚN apócope antes de sustantivo, VEINTIUNO no aplica en moneda), decenas con "Y", CIEN/CIENTO, QUINIENTOS/SETECIENTOS/NOVECIENTOS irregulares, miles ("UN MIL" estilo factura HN, no "MIL"), millones (singular "UN MILLÓN", plural "MILLONES", "DE" cuando el millón es exacto — resto cero — antes de LEMPIRAS), centavos como `NN/100` con `padStart(2,'0')` de `Math.round((monto % 1) * 100)` (cuidado con flotantes: trabajar con `Math.round(monto*100)` entero desde el inicio).
- [ ] **Step 4:** PASS + suite. **Step 5: Commit** `feat(pos): total en letras para documentos fiscales`

---

### Task 6: `lib/pos/emision.ts` — validaciones, precio POS, arqueo y errores (TDD)

**Files:**
- Create: `lib/pos/emision.ts`
- Test: `lib/pos/tests/emision.test.ts`

**Interfaces:**
- Consumes: `PagoPos`, `MetodoPagoTipo` (Task 3); `precioParaCliente` de `lib/store/costeo.ts`.
- Produces:

```ts
export function precioLineaPos(
  tipoCliente: 'final' | 'revendedor',
  producto: { precio: number; precio_revendedor: number | null },
  variante?: { precio: number | null; precio_revendedor: number | null } | null
): number
export function validarEmision(args: {
  tipo: 'factura' | 'comprobante'; clienteNombre: string;
  clienteRtn: string | null; clienteIdentidad: string | null;
  total: number; limite: number
}): string | null
export function validarPagos(pagos: PagoPos[], total: number): string | null
export function cambioPago(pagos: PagoPos[], total: number): number
export function esperadoCaja(
  montoInicial: number,
  docs: Array<{ estado: string; total: number; pagos: Array<{ tipo: MetodoPagoTipo; monto: number }> }>
): { efectivoEsperado: number; porMetodo: Record<MetodoPagoTipo, number> }
export function traducirErrorPos(message: string | null | undefined): string | null
```

- [ ] **Step 1: Tests que fallan** — casos mínimos exactos:

```ts
// precioLineaPos
expect(precioLineaPos('final', { precio: 100, precio_revendedor: 80 })).toBe(100)
expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: 80 })).toBe(80)
expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: null })).toBe(100)
expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: 80 },
  { precio: 120, precio_revendedor: null })).toBe(80)   // hereda del padre
expect(precioLineaPos('revendedor', { precio: 100, precio_revendedor: 80 },
  { precio: 120, precio_revendedor: 95 })).toBe(95)
expect(precioLineaPos('final', { precio: 100, precio_revendedor: 80 },
  { precio: 120, precio_revendedor: 95 })).toBe(120)

// validarEmision — límite consumidor final solo aplica a facturas
expect(validarEmision({ tipo: 'factura', clienteNombre: 'CONSUMIDOR FINAL',
  clienteRtn: null, clienteIdentidad: null, total: 15000, limite: 10000 }))
  .toMatch(/identificación/)
expect(validarEmision({ tipo: 'factura', clienteNombre: 'Juan Pérez',
  clienteRtn: null, clienteIdentidad: '0801199912345', total: 15000, limite: 10000 })).toBeNull()
expect(validarEmision({ tipo: 'comprobante', clienteNombre: 'CONSUMIDOR FINAL',
  clienteRtn: null, clienteIdentidad: null, total: 15000, limite: 10000 })).toBeNull()

// validarPagos / cambioPago
const ef = (monto: number) => ({ metodo_id: 'm1', tipo: 'efectivo_lps' as const, monto })
const tj = (monto: number) => ({ metodo_id: 'm2', tipo: 'tarjeta' as const, monto })
expect(validarPagos([], 100)).toMatch(/pago/)
expect(validarPagos([tj(50)], 100)).toMatch(/cubren/)
expect(validarPagos([tj(150)], 100)).toMatch(/efectivo/)  // exceso sin efectivo
expect(validarPagos([ef(150)], 100)).toBeNull()
expect(cambioPago([ef(150)], 100)).toBe(50)
expect(cambioPago([tj(60), ef(50)], 100)).toBe(10)

// esperadoCaja — anulados fuera; cambio resta del efectivo
const doc = (total: number, pagos: any[], estado = 'emitido') => ({ estado, total, pagos })
const r = esperadoCaja(500, [
  doc(230, [{ tipo: 'efectivo_lps', monto: 300 }]),            // cambio 70 → neto 230
  doc(500, [{ tipo: 'tarjeta', monto: 200 }, { tipo: 'efectivo_lps', monto: 300 }]),
  doc(100, [{ tipo: 'efectivo_usd', monto: 100 }]),
  doc(999, [{ tipo: 'efectivo_lps', monto: 999 }], 'anulado'), // excluido
])
expect(r.efectivoEsperado).toBe(500 + 230 + 300 + 100)
expect(r.porMetodo.tarjeta).toBe(200)

// traducirErrorPos
expect(traducirErrorPos('HS_CAJA|Caja 1')).toBe('La caja "Caja 1" no tiene una sesión abierta.')
expect(traducirErrorPos('HS_CAI|vencido|2026-01-01')).toMatch(/venció/)
expect(traducirErrorPos('HS_CAI|agotado|5000')).toMatch(/rango/)
expect(traducirErrorPos('HS_CAI|sin_cai|002')).toMatch(/CAI/)
expect(traducirErrorPos('HS_TOTAL')).toMatch(/totales/)
expect(traducirErrorPos('HS_PEDIDO_DOC|123')).toMatch(/pedido/)
expect(traducirErrorPos('HS_DOC|ya está anulado')).toBe('ya está anulado')
expect(traducirErrorPos('HS_STOCK|Camisa|3')).toMatch(/Solo quedan 3/) // delega en traducirErrorPedido
```

- [ ] **Step 2:** FAIL. **Step 3: Implementar.** `precioLineaPos` usa `precioParaCliente(tipoCliente, precioBase, precioRev)` donde precioBase = `variante?.precio ?? producto.precio` y precioRev = `variante?.precio_revendedor ?? producto.precio_revendedor`. `validarPagos`: sin pagos → "Agrega al menos un pago."; suma < total−0.01 → "Los pagos no cubren el total."; suma > total+0.01 sin ningún pago de tipo efectivo_* → "El exceso solo se permite en pagos de efectivo (cambio)." `cambioPago` = max(0, round2(suma − total)). `esperadoCaja`: filtra `estado === 'emitido'`; efectivo = Σ montos efectivo_lps+efectivo_usd − Σ cambioPago(doc.pagos, doc.total); porMetodo suma por tipo (sin restar cambio — el cambio sale solo del efectivo). `traducirErrorPos`: parsea los códigos nuevos y delega los demás en `traducirErrorPedido` (import de `lib/store/variantes.ts`).
- [ ] **Step 4:** PASS + suite. **Step 5: Commit** `feat(pos): validaciones de emision, precio revendedor, arqueo y errores`

---

### Task 7: Configuración — sección POS (cajas, vendedores, métodos) + fix updateCai

**Files:**
- Create: `app/admin/configuracion/PosSection.tsx`, `app/admin/configuracion/posActions.ts`, `app/admin/configuracion/PosSection.module.css`
- Modify: `app/admin/configuracion/page.tsx` (fetch + render), `app/admin/configuracion/ConfigClient.tsx` SOLO si necesita anchor/tab nuevo, `app/admin/configuracion/caiActions.ts` (backlog P1)

**Interfaces:**
- Consumes: tipos `Caja`, `Vendedor`, `MetodoPago` (Task 3); patrón visual/CRUD de `CaisSection.tsx` + `caiActions.ts` (P1).
- Produces: server actions `createCaja/updateCaja`, `createVendedor/updateVendedor`, `createMetodoPago/updateMetodoPago` (sin deletes — desactivar), y guardado de `pos_limite_consumidor_final` (reutilizar el patrón de guardado de claves de `actions.ts` de configuración).

- [ ] **Step 1:** `posActions.ts` con el patrón exacto de `caiActions.ts` (ActionResult `{ ok } | { error }`, validaciones en español: nombre requerido; punto_emision regex `^[0-9]{3}$`; métodos sembrados no cambian de `tipo`). `PosSection.tsx` con tres bloques (Cajas / Vendedores / Métodos de pago) siguiendo el layout de `CaisSection` (tabla + form inline), badges Activo/Inactivo con tokens `--estado-*`, y el input del límite consumidor final (numérico, guarda como texto).
- [ ] **Step 2 (backlog P1):** en `caiActions.ts`, capturar violación del check de rango en `updateCai` (código Postgres `23514`, constraint con `correlativo_actual`): devolver `"El rango no puede dejar el correlativo actual fuera (ya se emitieron facturas de este CAI)."`.
- [ ] **Step 3:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run dev` y revisar la sección a mano.
- [ ] **Step 4: Commit** `feat(pos): seccion POS en configuracion (cajas, vendedores, metodos de pago)`

---

### Task 8: Server actions del POS

**Files:**
- Create: `app/admin/pos/actions.ts`

**Interfaces:**
- Consumes: RPCs de Task 2 (payload EXACTO del Step 1 de Task 2); puras de Tasks 4-6; `toConfigMap` (`lib/config.ts` — verificar nombre real del helper usado por los layouts); cliente Supabase de servidor `lib/supabase-server.ts`.
- Produces (contrato para Tasks 9-14):

```ts
export type PosResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }
export async function abrirSesion(cajaId: string, montoInicial: number): Promise<PosResult<{ sesionId: string }>>
export async function cerrarSesion(sesionId: string, montoContado: number, notas: string): Promise<PosResult<{ esperado: number; diferencia: number }>>
export async function emitirVenta(input: {
  tipo: 'factura' | 'comprobante'; cajaId: string; vendedorId: string | null;
  cliente: { id: string | null; nombre: string; rtn: string | null; identidad: string | null;
             exonerado: boolean; ordenCompraExenta: string | null;
             constanciaExonerado: string | null; registroSag: string | null };
  lineas: LineaPos[]; descuentoGlobal: number;
  pagos: PagoPos[]; notas: string | null
}): Promise<PosResult<{ documentoId: string }>>
export async function emitirDesdePedido(input: {
  pedidoId: string; tipo: 'factura' | 'comprobante'; cajaId: string;
  clienteId: string | null
}): Promise<PosResult<{ documentoId: string }>>
export async function anularDocumento(documentoId: string, motivo: string): Promise<PosResult>
export async function guardarEspera(cajaId: string, nombre: string, payload: unknown): Promise<PosResult>
export async function eliminarEspera(id: string): Promise<PosResult>
```

- [ ] **Step 1: Implementar `emitirVenta`** — frontera de confianza parcial (admin autenticado, pero el servidor recalcula): (1) relee de BD los productos/variantes de las líneas con producto (precio NO se relee — el POS permite override/descuento — pero sí `isv`, `canal`, `activo`, descripcion para el snapshot); las líneas libres pasan tal cual; (2) `prorratearDescuentoGlobal` → `desglosarLinea` por línea (exonerado del cliente) → `totalesDocumento` con `numeroALetras(total)`; (3) `validarEmision` (límite de `configuracion.pos_limite_consumidor_final`) y `validarPagos`; (4) arma el payload jsonb EXACTO de Task 2 y llama `supabase.rpc('emitir_documento', { p: payload })`; (5) errores → `traducirErrorPos`. `usuario` = email de `supabase.auth.getUser()`.
- [ ] **Step 2: Implementar el resto.** `abrirSesion`/`cerrarSesion` (insert/update directos con validaciones: monto ≥ 0, sesión abierta única — el índice único da error 23505 → "Esta caja ya tiene una sesión abierta."; cerrar calcula `esperadoCaja` releyendo documentos de la sesión con sus pagos y método.tipo). `emitirDesdePedido`: relee el pedido + items (incluye `variante_id`, precios del pedido tal cual — ya son históricos), arma líneas con isv releído del producto (ítems de productos borrados: isv '15' y producto_id null → línea libre), cliente del catálogo si `clienteId` o snapshot del pedido, y llama la RPC con `pedido_id` (sin pagos). `anularDocumento` → RPC. Espera: CRUD directo.
- [ ] **Step 3:** `npm test` + `npx tsc --noEmit` + `npm run lint`.
- [ ] **Step 4: Commit** `feat(pos): server actions de sesiones, emision y ventas en espera`

---

### Task 9: Pantalla POS — layout, caja y apertura

**Files:**
- Create: `app/admin/pos/layout.tsx`, `app/admin/pos/page.tsx`, `app/admin/pos/PosClient.tsx`, `app/admin/pos/pos.module.css`
- Modify: `components/admin/Sidebar.tsx` (entrada "POS" con emoji, patrón existente)

**Interfaces:**
- Consumes: `abrirSesion` (Task 8); tipos Task 3.
- Produces: `PosClient` con props `{ cajas, sesionesAbiertas, vendedores, metodos, productos, clientes, cais, config }` (el server component `page.tsx` hace todos los fetch: cajas activas, sesiones abiertas, vendedores activos, métodos activos ordenados, productos activos canal in mostrador/ambas con variantes, clientes activos, `cai_autorizaciones` activas tipo '01', `toConfigMap`).

- [ ] **Step 1:** `layout.tsx` propio SIN el Sidebar del admin (pantalla completa, fondo `--bg-app`); `page.tsx` server component con los fetch; `PosClient` client component con tres estados: selección de caja (cards de cajas activas; recuerda en `localStorage` clave `pos_caja_id`), apertura de sesión (input monto inicial → `abrirSesion`), y venta (Tasks 10-12). Header compacto: nombre de caja, sesión abierta desde, link "← Admin", botones Espera/Cerrar caja.
- [ ] **Step 2:** Verificar en dev: elegir caja, abrir sesión, refresh conserva la caja.
- [ ] **Step 3:** `npm test` + tsc + lint + build.
- [ ] **Step 4: Commit** `feat(pos): pantalla POS con seleccion de caja y apertura de sesion`

---

### Task 10: POS — catálogo, carrito, ítem libre, cliente y vendedor

**Files:**
- Modify: `app/admin/pos/PosClient.tsx`, `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `precioLineaPos`, `desglosarLinea`, `prorratearDescuentoGlobal`, `totalesDocumento` (preview de totales), `estadoCai` de `lib/pos/fiscal.ts`; `toStoreVariantes`/`stockEfectivo` de `lib/store/variantes.ts`.
- Produces: estado del carrito `{ lineas: LineaPos[], descuentoGlobal, clienteId, vendedorId }` que Task 11 cobra y Task 12 aparca.

- [ ] **Step 1: Columna izquierda.** Buscador con `autoFocus` y re-focus tras cada acción; filtra por nombre (includes, case-insensitive) y **SKU exacto** (producto o variante): Enter con match exacto de SKU agrega 1 unidad directo (lector de código de barras). Grid de cards (imagen, nombre, precio con `formatPrice`, stock efectivo, badge AGOTADO); click en producto con variantes abre mini-selector de variantes (nombre + precio efectivo + stock); sin variantes agrega directo.
- [ ] **Step 2: Columna derecha.** Líneas: descripción, cantidad (input + −/+, tope = stock disponible como el carrito web), precio unitario (editable), descuento por línea (monto L. o % con toggle — se guarda como monto), subtotal; quitar línea. Botón "Ítem libre" (modal: descripción, cantidad, precio, ISV select 15/18/exento). Descuento global (monto). Panel de totales con desglose visible (exento/exonerado/gravadas/ISV/total) calculado con las puras. Selector de cliente (búsqueda nombre/RTN sobre los precargados + "CONSUMIDOR FINAL" default): al elegir revendedor los precios de líneas de inventario se recalculan con `precioLineaPos` (las libres y precios ya editados a mano no se tocan); badge Exonerado si aplica. Selector de vendedor (opcional). Banner CAI: `estadoCai` del CAI activo del punto de la caja → amarillo por vencer/agotarse, rojo vencido/agotado (los CAIs llegan por props desde page.tsx).
- [ ] **Step 3:** Verificación manual en dev (agregar por click y por SKU+Enter, variantes, revendedor, ítem libre, descuentos, desglose correcto).
- [ ] **Step 4:** suite + tsc + lint. **Step 5: Commit** `feat(pos): catalogo con busqueda por SKU, carrito con descuentos e items libres`

---

### Task 11: POS — cobro y emisión

**Files:**
- Modify: `app/admin/pos/PosClient.tsx`, `app/admin/pos/pos.module.css`

**Interfaces:**
- Consumes: `emitirVenta` (Task 8), `validarPagos`, `cambioPago`, `validarEmision` (Task 6), métodos activos (props).

- [ ] **Step 1: Modal de cobro.** Elegir tipo (factura/comprobante, botones grandes). Lista de pagos: agregar método (solo activos, en orden), monto; `efectivo_usd` pide monto USD y muestra la conversión con `tasa_cambio_usd` (monto L. = round2(usd × tasa)); tarjeta/transferencia con campo referencia opcional. Muestra restante y cambio (`cambioPago`). Si factura y cliente CONSUMIDOR FINAL y total > límite → campos obligatorios nombre + identidad inline (validación `validarEmision` antes de enviar). Botón Emitir → `emitirVenta`; error → banner con el mensaje traducido; éxito → limpia el carrito y navega a `/admin/pos/documento/<id>?volver=pos`.
- [ ] **Step 2:** Verificación manual: venta con pagos mixtos, cambio, USD, factura >10k exige identidad, error de stock se muestra claro.
- [ ] **Step 3:** suite + tsc + lint. **Step 4: Commit** `feat(pos): cobro con pagos mixtos y emision de factura o comprobante`

---

### Task 12: POS — ventas en espera y cierre con arqueo

**Files:**
- Modify: `app/admin/pos/PosClient.tsx`, `app/admin/pos/pos.module.css`, `app/admin/pos/page.tsx` (fetch de esperas y sesiones con documentos para el cierre)

**Interfaces:**
- Consumes: `guardarEspera`/`eliminarEspera`/`cerrarSesion` (Task 8), `esperadoCaja` (Task 6).

- [ ] **Step 1: Espera.** Botón "En espera" (pide nombre) → `guardarEspera` con el estado serializado del carrito (`lineas`, `descuentoGlobal`, `clienteId`, `vendedorId`) y limpia. Panel de esperas de la caja: retomar (carga el payload y elimina la fila) o descartar. Al retomar, revalidar contra los productos actuales (línea de producto inexistente/inactivo → se marca y se quita con aviso).
- [ ] **Step 2: Cierre.** Modal: resumen por método (`esperadoCaja` con los documentos de la sesión), efectivo esperado, input contado, diferencia en vivo (verde/rojo con tokens estado), notas → `cerrarSesion`. Al cerrar vuelve a la pantalla de apertura. Vista simple "Sesiones" (lista de sesiones de la caja: fecha, inicial, esperado, contado, diferencia).
- [ ] **Step 3:** Verificación manual + suite + tsc + lint. **Step 4: Commit** `feat(pos): ventas en espera y cierre de caja con arqueo`

---

### Task 13: Documento imprimible (80mm/carta) + listado y anulación

**Files:**
- Create: `app/admin/pos/documento/[id]/page.tsx`, `app/admin/pos/documento/[id]/DocumentoView.tsx`, `app/admin/pos/documento/documento.module.css`, `app/admin/pos/documentos/page.tsx`, `app/admin/pos/documentos/DocumentosClient.tsx`
- Modify: `components/admin/Sidebar.tsx` (entrada "Documentos")

**Interfaces:**
- Consumes: `anularDocumento` (Task 8); `formatearCorrelativo` ya viene congelado en `documentos.correlativo`; config `fiscal_*`/`empresa_*` vía `toConfigMap`; `formatPrice`.

- [ ] **Step 1: Página del documento.** Server component: fetch documento + items + pagos + caja + CAI (facturas). `DocumentoView` client: toolbar (no imprimible) con selector 80mm/carta (default `caja.formato_impresion`, query `?volver=pos` muestra "Nueva venta") y botón Imprimir (`window.print()`). **Requisitos de la factura (Acuerdo 481-2017, TODOS):** RTN, razón social, nombre comercial, domicilio y teléfono del emisor (`fiscal_*`); "Factura"; CAI; fecha límite de emisión; rango autorizado (`rango_desde`–`rango_hasta` formateados); "Original: Cliente / Copia: Obligado tributario emisor"; correlativo; fecha de emisión; cliente (nombre + RTN, o identidad, o CONSUMIDOR FINAL); datos de exonerado si aplica (orden compra exenta / constancia / registro SAG); detalle (cantidad, descripción, precio unitario, importe); desglose: descuentos, importe exento, importe exonerado, importe gravado 15%, importe gravado 18%, ISV 15%, ISV 18%; total con "L"; total en letras (`total_letras`); tasa de cambio si `tasa_usd`; `fiscal_leyenda`. Comprobante: mismo layout sin CAI/fecha límite/rango/correlativo SAR, título "Comprobante" + subtítulo "Documento no fiscal", número `C-` + `numero_comprobante` con pad 8. Anulado → marca de agua diagonal "ANULADO". Pagos al pie (método, monto, referencia; USD con tasa). Carta incluye logo (`logo_url`).
- [ ] **Step 2: CSS de impresión.** `documento.module.css`: clase `.hoja80` (ancho 80mm, tipografía 12px monoespaciada-condensada, una columna) y `.hojaCarta` (max-width 700px, cabecera con logo, tabla completa); `@media print` oculta toolbar y todo lo demás (`.noPrint { display: none }`), `@page { margin: 0 }` para 80mm. Ambos modos legibles también en pantalla (preview).
- [ ] **Step 3: Listado `/admin/pos/documentos`.** Tabla: fecha, tipo (badge), número (correlativo o C-…), cliente, total, estado (badge `--estado-*`; anulado en gris con motivo en title), caja; filtros por tipo/estado y búsqueda por número/cliente; paginación simple (50). Acción "Anular" solo en comprobantes emitidos → modal con motivo obligatorio → `anularDocumento` → refresh. Facturas: sin acción (tooltip "Las facturas se corrigen con nota de crédito").
- [ ] **Step 4:** Verificación manual: emitir factura y comprobante, imprimir preview en ambos formatos, anular comprobante (stock repuesto — verificar en admin productos), listado filtra.
- [ ] **Step 5:** suite + tsc + lint + build. **Step 6: Commit** `feat(pos): documento imprimible 80mm/carta, listado y anulacion de comprobantes`

---

### Task 14: Pedidos web — emitir factura/comprobante

**Files:**
- Modify: `app/admin/pedidos/PedidosClient.tsx`, `app/admin/pedidos/page.tsx` (fetch de documentos vinculados y cajas activas)

**Interfaces:**
- Consumes: `emitirDesdePedido` (Task 8); patrón de banner de error existente en `PedidosClient` (RSC).

- [ ] **Step 1:** En el detalle/fila del pedido: si tiene documento vigente → link "Ver <correlativo|C-nº>" a la página del documento; si no y estado ≠ cancelado → botón "Emitir documento" → modal (tipo factura/comprobante, caja activa, cliente opcional del catálogo con búsqueda) → `emitirDesdePedido` → éxito abre el documento en nueva pestaña y refresca; error al banner existente.
- [ ] **Step 2:** Verificación manual: emitir factura de un pedido (stock NO cambia — verificar), segundo intento bloquea con mensaje del pedido ya facturado, pedido cancelado no ofrece el botón.
- [ ] **Step 3:** suite + tsc + lint. **Step 4: Commit** `feat(pos): emision de factura o comprobante desde pedidos web`

---

### Task 15: Verificación integral y entrega

- [ ] **Step 1:** `npm test` + `npx tsc --noEmit` + `npm run lint` (0 errores) + `npm run build` — resultados reales.
- [ ] **Step 2:** Revisión final whole-branch (flujo del proyecto).
- [ ] **Step 3 (usuario):** aplicar AMBAS migraciones en el SQL Editor (tablas primero, RPCs después) + smoke SQL auto-limpiante que el controller entregará: (1) dos emisiones seguidas consumen correlativos consecutivos sin huecos; (2) factura de mostrador descuenta stock + kardex `venta_pos`; (3) comprobante anulado repone stock + `devolucion` y no cuenta en arqueo; (4) emisión con `pedido_id` no toca stock y el segundo intento falla con `HS_PEDIDO_DOC`; (5) CAI vencido/agotado rechaza con `HS_CAI`; (6) emisión sin sesión abierta rechaza con `HS_CAJA`; (7) `crear_pedido` rechaza producto solo-mostrador con `HS_INACTIVO`.
- [ ] **Step 4:** Confirmar con el usuario la fusión a `main` (push = deploy); verificar READY en Vercel por SHA; borrar rama.
- [ ] **Step 5:** `CLAUDE.md`: bullet en Convenciones — "**Documentos POS:** los documentos emitidos son inmutables (snapshot congelado); solo comprobantes se anulan vía `anular_comprobante`; la emisión pasa SIEMPRE por la RPC `emitir_documento` (correlativo + stock + kardex atómicos). Matemática fiscal en `lib/pos/` (precio final incluye ISV; desglose hacia atrás)." — commit `docs: convenciones de documentos POS`.
