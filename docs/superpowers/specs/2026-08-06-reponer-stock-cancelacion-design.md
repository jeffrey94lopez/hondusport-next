# Diseño — Reponer stock al cancelar un pedido

**Fecha:** 2026-08-06
**Objetivo:** cerrar el hueco operativo dejado por el sub-proyecto D: `crear_pedido`
descuenta stock atómicamente, pero cancelar un pedido no lo repone (ajuste manual).
Con este cambio, cancelar repone y des-cancelar re-descuenta, de forma atómica.

## Alcance

- **Incluye:** RPC transaccional `cambiar_estado_pedido(p_pedido_id uuid, p_estado
  text)` (nueva migración), y el server action `cambiarEstado`
  (`app/admin/pedidos/actions.ts`) que pasa de `.update()` directo a la RPC, con
  errores traducidos vía `traducirErrorPedido`.
- **No incluye:** cambios de UI (la vista de pedidos ya muestra el error del
  action), historial de movimientos de stock, y reposición para pedidos cancelados
  ANTES de este deploy (esos ya se ajustaron o se ajustan a mano).

## Decisiones tomadas

1. **RPC transaccional** (patrón `crear_pedido`): estado y stock cambian en la
   misma transacción o no cambia nada.
2. **Des-cancelar re-descuenta VALIDANDO:** reactivar un pedido vuelve a descontar
   el stock de cada item; si no alcanza, la reactivación falla con
   `HS_STOCK|<nombre>|<disponible>` (formato existente — `traducirErrorPedido` lo
   traduce sin cambios) y el pedido permanece cancelado.
3. **Idempotencia:** mismo estado → no-op (protege el doble clic / doble submit).

## La RPC `cambiar_estado_pedido`

Nueva migración `supabase/migrations/2026-08-06-cambiar-estado-pedido.sql`,
`security definer` + `set search_path = public` (como `crear_pedido`), **grant
solo a `authenticated`** (la usa únicamente el admin).

Comportamiento:

1. `select estado from pedidos where id = p_pedido_id for update` — si no existe,
   `raise exception 'HS_PEDIDO|<id>'`; guarda `v_estado_actual`.
2. `p_estado` debe ser uno de los 5 estados válidos (el check de la tabla lo
   garantiza al hacer update; validación temprana opcional).
3. Si `v_estado_actual = p_estado` → return (no-op).
4. **Si `p_estado = 'cancelado'` y `v_estado_actual <> 'cancelado'` (reponer):**
   por cada fila de `pedido_items` del pedido:
   - con `variante_id` no null y la variante existe con `stock` no null →
     `update producto_variantes set stock = stock + cantidad`;
   - si no, con `producto_id` no null y el producto existe con `stock` no null →
     `update productos set stock = stock + cantidad`;
   - variante/producto borrado o stock null (ilimitado) → se salta.
5. **Si `v_estado_actual = 'cancelado'` y `p_estado <> 'cancelado'` (re-descontar):**
   misma lógica de validación/descuento que `crear_pedido` (con `for update`):
   - item con `variante_id`: si la variante existe y su `stock` no es null,
     exigir `stock >= cantidad` (si no: `raise exception 'HS_STOCK|<nombre
     producto> (<nombre variante>)|<stock>'`) y descontar; variante borrada →
     se salta (registro histórico, no hay stock que descontar).
   - item sin variante: si el producto existe y `stock` no null, exigir
     suficiente (`HS_STOCK|<nombre>|<stock>`) y descontar; producto borrado → se
     salta. (Simetría exacta con la reposición: lo borrado/ilimitado se salta en
     ambas direcciones.)
   - Nota: NO se exige `activo = true` ni variante activa — reactivar un pedido
     histórico no es una compra nueva; solo importa la existencia física.
6. `update pedidos set estado = p_estado where id = p_pedido_id`.

Los nombres para mensajes salen de `pedido_items.nombre_producto` y
`variante_nombre` (snapshot del pedido), no de joins — sobreviven a renombres y
borrados.

## Server action

`cambiarEstado(id, estado)` en `app/admin/pedidos/actions.ts`:

```ts
const { error } = await supabase.rpc('cambiar_estado_pedido', {
  p_pedido_id: id,
  p_estado: estado,
})
if (error) return { error: traducirErrorPedido(error.message) ?? error.message }
```

`traducirErrorPedido` (lib/store/variantes.ts) ya maneja `HS_STOCK`/`HS_VARIANTE`;
gana un caso `HS_PEDIDO` → `'El pedido ya no existe'` (con test).

## Manejo de errores / edge cases

- Doble cancelación → no-op (nunca repone dos veces).
- Reactivar sin stock → falla limpia, pedido sigue cancelado, mensaje "Solo
  quedan N unidades de …" en el admin.
- Items huérfanos (producto/variante borrados) → reposición y re-descuento los
  saltan; la reactivación no se bloquea por ellos.
- Stock null (ilimitado) → sin cambios en ambas direcciones.
- Concurrencia (dos admins a la vez) → `for update` sobre el pedido serializa; el
  segundo ve el estado ya cambiado y hace no-op o transición desde el nuevo estado.

## Testing

- La lógica vive en SQL: **smoke test en el SQL Editor antes del push** (script
  auto-limpiante): (1) cancelar repone stock de variante y de plano; (2) doble
  cancelación no duplica; (3) des-cancelar re-descuenta; (4) des-cancelar sin
  stock falla con `HS_STOCK` y el pedido sigue cancelado; (5) ilimitados intactos.
- `traducirErrorPedido` gana el caso `HS_PEDIDO` con test Vitest.
- Suite existente (233) permanece verde; `npx tsc --noEmit` tras tocar el action.

## Entrega

Rama `feature/reponer-stock-cancelacion` (corta, 2-3 tareas). Migración aplicada
en el SQL Editor ANTES del push/merge; confirmación del usuario para fusionar
(deploy a producción); Merlin arranca después de fusionar esto.
