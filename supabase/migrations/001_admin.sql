-- Ejecutar en el SQL Editor de Supabase, después de restaurar tu db.sql.
-- Supuesto: zonas.id es entero. Si es uuid, cambia los casts ::int de replace_zonas.

/* 1) ¿Quién es admin? Rol en app_metadata del JWT (el usuario no puede editarlo) */
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

/* 2) RLS en todas las tablas: admin lo puede todo; el público solo lee lo del sitio */
do $$
declare t text;
begin
  foreach t in array array['user','participantes','zonas','stands','charlas','cronograma'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;

  foreach t in array array['charlas','cronograma','stands','zonas'] loop
    execute format('drop policy if exists lectura_publica on public.%I', t);
    execute format('create policy lectura_publica on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- participantes tiene correo y teléfono: NO se abre al público.
-- El sitio público debe leer esta vista, que omite los datos de contacto.
create or replace view public.participantes_publicos with (security_invoker = false) as
  select id, nombre_completo, lugar_residencia, sector_perteneciente, institucion,
         cargo_puesto, semblanza, imagen, redes, participacion_congreso, area_experiencia
  from public.participantes;
grant select on public.participantes_publicos to anon, authenticated;

/* 3) Reemplazo atómico de zonas (equivale al PUT /api/admin/zonas) */
create or replace function public.replace_zonas(p jsonb)
returns setof public.zonas
language plpgsql as $$
declare
  el   jsonb;
  zid  int;
  keep int[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  for el in select * from jsonb_array_elements(p) loop
    zid := nullif(el->>'id', '')::int;
    if zid is not null and exists (select 1 from public.zonas where id = zid) then
      -- fusiona: conserva otras claves que ya tenga data
      update public.zonas set data = coalesce(data, '{}'::jsonb) || (el->'data') where id = zid;
    else
      insert into public.zonas (data) values (el->'data') returning id into zid;
    end if;
    keep := keep || zid;
  end loop;

  -- stands.zona_id queda en NULL (ON DELETE SET NULL) para zonas borradas
  delete from public.zonas where id <> all(keep);
  return query select * from public.zonas order by id;
end $$;

revoke execute on function public.replace_zonas(jsonb) from public, anon;
grant  execute on function public.replace_zonas(jsonb) to authenticated;

/* 4) Bitácora de envíos (auditoría) */
create table if not exists public.mensajes_enviados (
  id        bigint generated always as identity primary key,
  canal     text not null check (canal in ('email','sms')),
  asunto    text,
  cuerpo    text not null,
  total     int  not null,
  enviados  int  not null,
  fallidos  jsonb not null default '[]',
  usuario   uuid references auth.users(id),
  creado    timestamptz not null default now()
);
alter table public.mensajes_enviados enable row level security;
drop policy if exists admin_all on public.mensajes_enviados;
create policy admin_all on public.mensajes_enviados
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

/* 5) Tiempo real para el sitio público (reemplaza LISTEN/NOTIFY + /ws).
      participantes queda fuera a propósito: Realtime respeta RLS y de todos modos
      el público no puede leer esa tabla. */
alter publication supabase_realtime add table public.charlas, public.cronograma, public.stands, public.zonas;

/* 6) Convertir a tu usuario en admin (cierra sesión y vuelve a entrar para renovar el JWT):
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
 where email = 'tu@correo.mx';
*/
