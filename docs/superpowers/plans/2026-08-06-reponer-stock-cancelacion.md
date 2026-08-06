# Reponer stock al cancelar pedido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cancelar un pedido repone el stock atómicamente y des-cancelarlo lo re-descuenta validando existencias.

**Architecture:** una RPC transaccional `cambiar_estado_pedido` (patrón `crear_pedido`: `security definer`, `for update`, errores `HS_*`) concentra toda la lógica; el server action del admin pasa de un `.update()` directo a la RPC, con errores traducidos por `traducirErrorPedido`. Spec: `docs/superpowers/specs/2026-08-06-reponer-stock-cancelacion-design.md`.

**Tech Stack:** Supabase (Postgres plpgsql + RPC), Next.js Server Actions, Vitest.

## Global Constraints

- Rama `feature/reponer-stock-cancelacion` desde `main`.
- Commits en español, formato convencional.
- Formato de errores EXACTO (contrato con `traducirErrorPedido`): `HS_STOCK|<nombre>|<disponible>` y el nuevo `HS_PEDIDO|<id>`.
- Simetría reponer/re-descontar: variante/producto borrado o `stock` null (ilimitado) se salta en AMBAS direcciones; mismo estado = no-op.
- Los nombres para mensajes salen del snapshot del pedido (`pedido_items.nombre_producto`, `variante_nombre`), nunca de joins.
- `npm test` tras tocar lib/store; `npx tsc --noEmit` tras tocar Server Actions.
- **La migración se aplica en el SQL Editor de Supabase ANTES del push/merge**; smoke test SQL obligatorio (Task 3); confirmar con el usuario antes de fusionar (push = deploy a producción).

---

### Task 1: Migración — RPC `cambiar_estado_pedido`

**Files:**
- Create: `supabase/migrations/2026-08-06-cambiar-estado-pedido.sql`

**Interfaces:**
- Consumes: tablas `pedidos`, `pedido_items`, `productos`, `producto_variantes` (existentes).
- Produces: `cambiar_estado_pedido(p_pedido_id uuid, p_estado text) returns void`, grant a `authenticated` (Task 2 la llama por RPC).

- [ ] **Step 1: Escribir la migración** (contenido completo):

```sql
-- Cambiar estado de pedido con ajuste atómico de stock:
-- a 'cancelado' repone; desde 'cancelado' re-descuenta validando (HS_STOCK).
-- Borrados/ilimitados se saltan en ambas direcciones. Mismo estado = no-op.
-- Aplicar en el SQL Editor de Supabase ANTES del push a main.

create or replace function cambiar_estado_pedido(p_pedido_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_actual text;
  v_item record;
  v_stock integer;
begin
  select p.estado into v_estado_actual
    from pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception using message = 'HS_PEDIDO|' || p_pedido_id;
  end if;
  if v_estado_actual = p_estado then
    return;
  end if;

  if p_estado = 'cancelado' then
    -- Reponer: los WHERE con "stock is not null" saltan ilimitados y,
    -- al no matchear filas, también variantes/productos borrados.
    for v_item in
      select pi.producto_id, pi.variante_id, pi.cantidad
      from pedido_items pi where pi.pedido_id = p_pedido_id
    loop
      if v_item.variante_id is not null then
        update producto_variantes pv
          set stock = pv.stock + v_item.cantidad
          where pv.id = v_item.variante_id and pv.stock is not null;
      elsif v_item.producto_id is not null then
        update productos pr
          set stock = pr.stock + v_item.cantidad
          where pr.id = v_item.producto_id and pr.stock is not null;
      end if;
    end loop;

  elsif v_estado_actual = 'cancelado' then
    -- Re-descontar validando; FOR UPDATE serializa contra crear_pedido.
    for v_item in
      select pi.producto_id, pi.variante_id, pi.cantidad,
             pi.nombre_producto, pi.variante_nombre
      from pedido_items pi where pi.pedido_id = p_pedido_id
    loop
      if v_item.variante_id is not null then
        select pv.stock into v_stock from producto_variantes pv
          where pv.id = v_item.variante_id for update;
        if found and v_stock is not null then
          if v_stock < v_item.cantidad then
            raise exception using message = 'HS_STOCK|' || v_item.nombre_producto
              || ' (' || coalesce(v_item.variante_nombre, '') || ')|' || v_stock;
          end if;
          update producto_variantes
            set stock = stock - v_item.cantidad
            where producto_variantes.id = v_item.variante_id;
        end if;
      elsif v_item.producto_id is not null then
        select pr.stock into v_stock from productos pr
          where pr.id = v_item.producto_id for update;
        if found and v_stock is not null then
          if v_stock < v_item.cantidad then
            raise exception using message = 'HS_STOCK|' || v_item.nombre_producto
              || '|' || v_stock;
          end if;
          update productos
            set stock = stock - v_item.cantidad
            where productos.id = v_item.producto_id;
        end if;
      end if;
    end loop;
  end if;

  update pedidos set estado = p_estado where pedidos.id = p_pedido_id;
end;
$$;

grant execute on function cambiar_estado_pedido(uuid, text) to authenticated;
```

(El check de la tabla `pedidos` valida `p_estado` en el update final; un estado inválido aborta la transacción entera — no hace falta validación temprana.)

- [ ] **Step 2: Verificar por lectura** — sin tests de SQL; revisar: variables `v_*` sin colisión con columnas, todas las referencias con alias, formato `HS_*` exacto, grant solo a `authenticated`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-08-06-cambiar-estado-pedido.sql
git commit -m "feat(pedidos): RPC cambiar_estado_pedido con reposicion y re-descuento de stock"
```

---

### Task 2: `traducirErrorPedido` con `HS_PEDIDO` + server action a RPC

**Files:**
- Modify: `lib/store/variantes.ts` (función `traducirErrorPedido`, switch de códigos)
- Modify: `app/admin/pedidos/actions.ts` (función `cambiarEstado`)
- Test: `lib/store/tests/variantes.test.ts` (describe `traducirErrorPedido`)

**Interfaces:**
- Consumes: RPC de Task 1; `traducirErrorPedido(message): string | null` existente.
- Produces: `cambiarEstado(id, estado)` con firma intacta (`Promise<ActionResult>`).

- [ ] **Step 1: Test que falla** (añadir al describe existente de `traducirErrorPedido`):

```ts
it('pedido inexistente', () =>
  expect(traducirErrorPedido('HS_PEDIDO|abc-123')).toBe('El pedido ya no existe'))
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run lib/store/tests/variantes.test.ts` — Expected: FAIL (devuelve null).

- [ ] **Step 3: Implementar** — en el `switch` de `traducirErrorPedido` (lib/store/variantes.ts), añadir antes del `default`:

```ts
    case 'HS_PEDIDO':
      return 'El pedido ya no existe'
```

- [ ] **Step 4: Correr el test** — Expected: PASS.

- [ ] **Step 5: Server action** — reemplazar el cuerpo de `cambiarEstado` en `app/admin/pedidos/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { traducirErrorPedido } from '@/lib/store/variantes'
import type { ActionResult, EstadoPedido } from '@/types'

export async function cambiarEstado(id: string, estado: EstadoPedido): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id: id,
    p_estado: estado,
  })
  if (error) return { error: traducirErrorPedido(error.message) ?? error.message }
  revalidatePath('/admin/pedidos')
  return {}
}
```

- [ ] **Step 6: Verificar** — `npm test` (todos) y `npx tsc --noEmit` — Expected: verdes.

- [ ] **Step 7: Commit**

```bash
git add lib/store/variantes.ts lib/store/tests/variantes.test.ts app/admin/pedidos/actions.ts
git commit -m "feat(pedidos): cambiarEstado via RPC con errores de stock traducidos"
```

---

### Task 3: Verificación integral y entrega

- [ ] **Step 1: Suite completa** — `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build` — reportar resultados reales.

- [ ] **Step 2: Revisión final whole-branch** (rama corta: la revisión puede ser una sola pasada).

- [ ] **Step 3: Migración + smoke test (requiere al usuario).** El usuario aplica la migración en el SQL Editor y luego corre este smoke auto-limpiante (debe terminar sin error; los `raise notice` son informativos):

```sql
do $$
declare
  v_prod uuid; v_var uuid; v_plano uuid; v_inf uuid; v_pedido uuid; v_stock int;
begin
  insert into productos (nombre, slug, precio, activo)
    values ('__SMOKE_CANCEL__', '__smoke-cancel__', 100, true) returning id into v_prod;
  insert into producto_variantes (producto_id, nombre, stock) values (v_prod, 'M', 5) returning id into v_var;
  insert into productos (nombre, slug, precio, activo, stock)
    values ('__SMOKE_CANCEL_PLANO__', '__smoke-cancel-plano__', 50, true, 10) returning id into v_plano;
  insert into productos (nombre, slug, precio, activo, stock)
    values ('__SMOKE_CANCEL_INF__', '__smoke-cancel-inf__', 30, true, null) returning id into v_inf;

  select id into v_pedido from crear_pedido('smoke_cancel','000','X',null,null,null,280,0,0,280,null,
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_prod, 'variante_id', v_var, 'nombre_producto', '__SMOKE_CANCEL__',
        'precio', 100, 'cantidad', 2, 'talla', '', 'personalizado_nombre', null,
        'imagen_url', '', 'variante_nombre', 'M'),
      jsonb_build_object(
        'producto_id', v_plano, 'variante_id', null, 'nombre_producto', '__SMOKE_CANCEL_PLANO__',
        'precio', 50, 'cantidad', 1, 'talla', 'Única', 'personalizado_nombre', null,
        'imagen_url', '', 'variante_nombre', null),
      jsonb_build_object(
        'producto_id', v_inf, 'variante_id', null, 'nombre_producto', '__SMOKE_CANCEL_INF__',
        'precio', 30, 'cantidad', 1, 'talla', 'Única', 'personalizado_nombre', null,
        'imagen_url', '', 'variante_nombre', null)));

  select stock into v_stock from producto_variantes where id = v_var;
  if v_stock <> 3 then raise exception 'SMOKE FALLO: variante esperaba 3 tras crear, quedo %', v_stock; end if;
  select stock into v_stock from productos where id = v_plano;
  if v_stock <> 9 then raise exception 'SMOKE FALLO: plano esperaba 9 tras crear, quedo %', v_stock; end if;

  -- 1) cancelar repone (variante y plano; ilimitado intacto)
  perform cambiar_estado_pedido(v_pedido, 'cancelado');
  select stock into v_stock from producto_variantes where id = v_var;
  if v_stock <> 5 then raise exception 'SMOKE FALLO: variante esperaba 5 tras cancelar, quedo %', v_stock; end if;
  select stock into v_stock from productos where id = v_plano;
  if v_stock <> 10 then raise exception 'SMOKE FALLO: plano esperaba 10 tras cancelar, quedo %', v_stock; end if;
  if (select stock from productos where id = v_inf) is not null then
    raise exception 'SMOKE FALLO: el ilimitado no debio cambiar';
  end if;
  raise notice 'OK 1/4: cancelar repone variante y plano; ilimitado intacto';

  -- 2) doble cancelacion no duplica
  perform cambiar_estado_pedido(v_pedido, 'cancelado');
  select stock into v_stock from producto_variantes where id = v_var;
  if v_stock <> 5 then raise exception 'SMOKE FALLO: doble cancelacion duplico, quedo %', v_stock; end if;
  raise notice 'OK 2/4: doble cancelacion es no-op';

  -- 3) des-cancelar re-descuenta (variante y plano)
  perform cambiar_estado_pedido(v_pedido, 'recibido');
  select stock into v_stock from producto_variantes where id = v_var;
  if v_stock <> 3 then raise exception 'SMOKE FALLO: variante esperaba 3 tras reactivar, quedo %', v_stock; end if;
  select stock into v_stock from productos where id = v_plano;
  if v_stock <> 9 then raise exception 'SMOKE FALLO: plano esperaba 9 tras reactivar, quedo %', v_stock; end if;
  raise notice 'OK 3/4: reactivar re-descuenta variante y plano';

  -- 4) reactivar sin stock falla con HS_STOCK y no cambia el estado
  perform cambiar_estado_pedido(v_pedido, 'cancelado');
  update producto_variantes set stock = 1 where id = v_var;
  begin
    perform cambiar_estado_pedido(v_pedido, 'recibido');
    raise exception 'SMOKE FALLO: debio fallar por stock insuficiente';
  exception when others then
    if sqlerrm like 'SMOKE FALLO%' then raise; end if;
    if sqlerrm not like 'HS_STOCK|%' then raise exception 'SMOKE FALLO: error inesperado: %', sqlerrm; end if;
  end;
  if (select estado from pedidos where id = v_pedido) <> 'cancelado' then
    raise exception 'SMOKE FALLO: el pedido no debio reactivarse';
  end if;
  raise notice 'OK 4/4: reactivar sin stock falla y el pedido sigue cancelado';

  delete from pedidos where id = v_pedido;
  delete from productos where id in (v_prod, v_plano, v_inf);
  raise notice 'SMOKE TEST OK - datos de prueba eliminados';
end $$;
```

- [ ] **Step 4: Confirmar con el usuario la fusión a `main`** (push = deploy a producción); tras el push, verificar deployment `READY` en Vercel por SHA del merge. Borrar la rama tras fusionar.
