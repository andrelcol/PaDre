-- Identidade do PaDre.
-- auth.users continua sendo a conta. O perfil usa o mesmo UUID.
-- profiles guarda o que outro usuário autenticado pode ver, se o perfil for público.
-- profile_preferences guarda fuso e fica restrito ao próprio usuário.
-- A visibilidade friends fica para a fase de amizades.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.normalize_username(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(value));
$$;

create or replace function private.is_iana_time_zone(value text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = value
  );
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  visibility text not null default 'private',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_visibility_check check (visibility in ('private', 'public')),
  constraint profiles_username_check check (username ~ '^[a-z][a-z0-9_]{2,29}$')
);

create table public.profile_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profile_preferences_timezone_check check (private.is_iana_time_zone(timezone))
);

create or replace function private.profile_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'profile id cannot be changed'
      using errcode = '42501';
  end if;

  new.username := private.normalize_username(new.username);

  if new.username is null or new.username !~ '^[a-z][a-z0-9_]{2,29}$' then
    raise exception 'invalid username'
      using errcode = '23514';
  end if;

  new.display_name := btrim(new.display_name);

  if new.display_name is null
    or char_length(new.display_name) < 1
    or char_length(new.display_name) > 80
    or new.display_name ~ '[[:cntrl:]]' then
    raise exception 'invalid display name'
      using errcode = '23514';
  end if;

  if new.visibility not in ('private', 'public') then
    raise exception 'invalid visibility'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

create or replace function private.preferences_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'preference owner cannot be changed'
      using errcode = '42501';
  end if;

  if not private.is_iana_time_zone(new.timezone) then
    raise exception 'invalid time zone'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

create trigger profiles_before_write
before insert or update on public.profiles
for each row
execute function private.profile_before_write();

create trigger profile_preferences_before_write
before insert or update on public.profile_preferences
for each row
execute function private.preferences_before_write();

-- O cliente não escolhe o id, o papel nem a visibilidade inicial.
-- Metadados só fornecem username e display_name, e os dois são validados.
-- visibility e timezone nascem privados e no fuso padrão.
-- O papel da conta é sempre authenticated. Metadado nenhum eleva privilégio.
create or replace function private.assign_authenticated_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.role := 'authenticated';
  return new;
end;
$$;

create trigger assign_authenticated_role
before insert on auth.users
for each row
execute function private.assign_authenticated_role();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_username text;
  chosen_display_name text;
begin
  if new.raw_user_meta_data ? 'username' then
    chosen_username := private.normalize_username(new.raw_user_meta_data ->> 'username');

    if chosen_username !~ '^[a-z][a-z0-9_]{2,29}$' then
      raise exception 'invalid username'
        using errcode = '23514';
    end if;
  else
    chosen_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  if new.raw_user_meta_data ? 'display_name' then
    chosen_display_name := btrim(new.raw_user_meta_data ->> 'display_name');

    if char_length(chosen_display_name) < 1
      or char_length(chosen_display_name) > 80
      or chosen_display_name ~ '[[:cntrl:]]' then
      raise exception 'invalid display name'
        using errcode = '23514';
    end if;
  else
    chosen_display_name := 'Atleta';
  end if;

  insert into public.profiles (id, username, display_name, visibility)
  values (new.id, chosen_username, chosen_display_name, 'private');

  insert into public.profile_preferences (user_id, timezone)
  values (new.id, 'America/Sao_Paulo');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_user();

create or replace function public.username_is_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.normalize_username(candidate) ~ '^[a-z][a-z0-9_]{2,29}$'
    and not exists (
      select 1
      from public.profiles
      where username = private.normalize_username(candidate)
    );
$$;

revoke all on function private.assign_authenticated_role() from public;
revoke all on function private.normalize_username(text) from public;
revoke all on function private.is_iana_time_zone(text) from public;
revoke all on function private.profile_before_write() from public;
revoke all on function private.preferences_before_write() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function public.username_is_available(text) from public;

grant execute on function private.normalize_username(text) to authenticated;
grant execute on function private.is_iana_time_zone(text) to authenticated;
grant execute on function private.profile_before_write() to authenticated;
grant execute on function private.preferences_before_write() to authenticated;

grant execute on function public.username_is_available(text) to anon, authenticated;

-- GoTrue recente já cria auth.uid(). No Postgres sem a imagem do Supabase, criamos a mesma leitura do JWT.
do $do$
begin
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = ''
    as $fn$
      select coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb
          ->> 'sub'
        )
      )::uuid
    $fn$;
  end if;
end
$do$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.profile_preferences enable row level security;
alter table public.profile_preferences force row level security;

create policy profiles_select_own_or_public
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or visibility = 'public'
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profile_preferences_select_own
on public.profile_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

create policy profile_preferences_update_own
on public.profile_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.profile_preferences from public, anon, authenticated;

grant select (
  id,
  username,
  display_name,
  visibility,
  created_at,
  updated_at
) on table public.profiles to authenticated;

grant update (
  username,
  display_name,
  visibility
) on table public.profiles to authenticated;

grant select (
  user_id,
  timezone,
  updated_at
) on table public.profile_preferences to authenticated;

grant update (timezone) on table public.profile_preferences to authenticated;

grant usage on schema public to anon, authenticated;

-- Se o migrador do GoTrue gravou o controle em public.schema_migrations,
-- essa tabela não é dado de produto. Sem política e com RLS forçado, o cliente não a lê.
-- Com search_path começando em auth, o controle fica em auth.schema_migrations e este bloco não age.
do $lock$
begin
  if to_regclass('public.schema_migrations') is not null then
    execute 'revoke all on table public.schema_migrations from public, anon, authenticated';
    execute 'alter table public.schema_migrations enable row level security';
    execute 'alter table public.schema_migrations force row level security';
  end if;
end
$lock$;
