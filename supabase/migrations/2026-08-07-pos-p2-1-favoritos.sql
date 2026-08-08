-- POS P2.1: productos anclados en el POS + interruptor del modal de documento.
alter table productos add column if not exists favorito_pos boolean not null default false;
create index if not exists productos_favorito_pos on productos (favorito_pos) where favorito_pos;

insert into configuracion (key, value) values ('pos_documento_modal', 'true')
  on conflict (key) do nothing;
