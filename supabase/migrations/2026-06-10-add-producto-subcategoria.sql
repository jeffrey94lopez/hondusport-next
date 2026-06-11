-- Permite enlazar un producto a una subcategoria (categorias.tipo = 'subcat')
alter table productos
  add column if not exists subcategoria_id uuid
    references categorias(id) on delete set null;

create index if not exists productos_subcategoria_id_idx
  on productos (subcategoria_id);
