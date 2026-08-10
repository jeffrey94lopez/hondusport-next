-- Visor de kardex: indice para el orden global por fecha (la vista por item ya
-- usa movimientos_producto_idx (producto_id, created_at desc)). Solo lectura;
-- esta es la unica escritura a BD del proyecto.
create index if not exists movimientos_created_idx
  on movimientos_inventario (created_at desc);
