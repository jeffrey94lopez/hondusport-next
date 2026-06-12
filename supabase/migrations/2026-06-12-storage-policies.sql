-- Permite a usuarios autenticados (admin) subir, actualizar y eliminar archivos
-- en los buckets de Storage "productos" y "banners", y lectura pública para ambos.
-- Sin estas políticas, storage.objects bloquea cualquier insert/update/delete
-- por RLS aunque el bucket sea público (el flag "public" solo afecta lectura
-- vía URL directa, no las operaciones de escritura desde el cliente).

create policy "Lectura publica productos"
on storage.objects for select
to public
using (bucket_id = 'productos');

create policy "Lectura publica banners"
on storage.objects for select
to public
using (bucket_id = 'banners');

create policy "Admin sube imagenes productos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'productos');

create policy "Admin actualiza imagenes productos"
on storage.objects for update
to authenticated
using (bucket_id = 'productos');

create policy "Admin elimina imagenes productos"
on storage.objects for delete
to authenticated
using (bucket_id = 'productos');

create policy "Admin sube imagenes banners"
on storage.objects for insert
to authenticated
with check (bucket_id = 'banners');

create policy "Admin actualiza imagenes banners"
on storage.objects for update
to authenticated
using (bucket_id = 'banners');

create policy "Admin elimina imagenes banners"
on storage.objects for delete
to authenticated
using (bucket_id = 'banners');
