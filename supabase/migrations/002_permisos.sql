-- Ejecutar después de 001_admin.sql.
-- Modelo: app_metadata = { "role": "admin" | "editor", "permisos": ["mapa","cronograma","participantes","mensajes"] }
-- admin = todo + gestión de usuarios. editor = solo las secciones listadas en "permisos".
-- Las políticas admin_all de 001 se quedan (solo admins); estas se suman (RLS las une con OR).

/* 1) ¿Tiene permiso sobre una sección? (admin siempre) */
create or replace function public.has_permiso(p text)
returns boolean language sql stable as $$
  select public.is_admin()
      or coalesce(((auth.jwt() -> 'app_metadata') -> 'permisos') @> to_jsonb(p), false)
$$;

/* 2) Qué tabla pertenece a qué sección */
do $$
declare r record;
begin
  for r in select * from (values
      ('zonas',             'mapa'),
      ('stands',            'mapa'),
      ('charlas',           'cronograma'),
      ('cronograma',        'cronograma'),
      ('participantes',     'participantes'),
      ('mensajes_enviados', 'mensajes')
  ) as v(tabla, permiso) loop
    execute format('drop policy if exists permiso_seccion on public.%I', r.tabla);
    execute format(
      'create policy permiso_seccion on public.%I for all to authenticated
         using (public.has_permiso(%L)) with check (public.has_permiso(%L))',
      r.tabla, r.permiso, r.permiso);
  end loop;
end $$;
-- La tabla "user" (registros) sigue siendo solo de admin (política admin_all de 001).

/* 3) Quien solo tiene "mensajes" ve únicamente id, nombre, correo y teléfono (no la semblanza, etc.) */
create or replace view public.contactos_mensajes with (security_invoker = false) as
  select id, nombre_completo as nombre, contacto_email as email, telefono
  from public.participantes
  where public.has_permiso('mensajes') or public.has_permiso('participantes');
revoke all on public.contactos_mensajes from anon;
grant select on public.contactos_mensajes to authenticated;

/* 4) replace_zonas ahora exige el permiso "mapa" en vez de ser solo admin */
create or replace function public.replace_zonas(p jsonb)
returns setof public.zonas
language plpgsql as $$
declare
  el   jsonb;
  zid  int;
  keep int[] := '{}';
begin
  if not public.has_permiso('mapa') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  for el in select * from jsonb_array_elements(p) loop
    zid := nullif(el->>'id', '')::int;
    if zid is not null and exists (select 1 from public.zonas where id = zid) then
      update public.zonas set data = coalesce(data, '{}'::jsonb) || (el->'data') where id = zid;
    else
      insert into public.zonas (data) values (el->'data') returning id into zid;
    end if;
    keep := keep || zid;
  end loop;

  delete from public.zonas where id <> all(keep);
  return query select * from public.zonas order by id;
end $$;

revoke execute on function public.replace_zonas(jsonb) from public, anon;
grant  execute on function public.replace_zonas(jsonb) to authenticated;

/* 5) Fotos de participantes: bucket público (da URL directa), máx. 2 MB, solo imágenes */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('participantes', 'participantes', true, 2097152, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leer por URL pública no necesita política. Subir, listar y borrar sí: solo con permiso "participantes".
drop policy if exists fotos_participantes on storage.objects;
create policy fotos_participantes on storage.objects
  for all to authenticated
  using      (bucket_id = 'participantes' and public.has_permiso('participantes'))
  with check (bucket_id = 'participantes' and public.has_permiso('participantes'));
