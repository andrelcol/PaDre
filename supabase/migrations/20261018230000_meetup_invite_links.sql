-- Convite compartilhável de um encontro.
-- O token tem 32 bytes e só existe na resposta da criação.
-- O banco guarda o SHA-256. Há no máximo um link não revogado por encontro.
-- Gerar outro revoga o anterior na mesma transação.
-- A vaga continua saindo de private.lock_meetup, a mesma trava dos convites internos.
-- anon recebe USAGE em private só para o wrapper invoker chamar o preview.
-- O PostgREST continua expondo apenas public.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

create or replace function private.protect_meetup_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.meetup_write', true) = 'on' then
    if tg_op = 'UPDATE' and tg_table_name = 'meetups' then
      if new.id is distinct from old.id
        or new.organizer_id is distinct from old.organizer_id
        or new.created_at is distinct from old.created_at then
        raise exception 'meetup timestamps are protected'
          using errcode = '42501';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    elsif tg_op = 'UPDATE' and tg_table_name = 'meetup_participants' then
      if new.id is distinct from old.id
        or new.meetup_id is distinct from old.meetup_id
        or new.user_id is distinct from old.user_id
        or new.joined_at is distinct from old.joined_at then
        raise exception 'meetup timestamps are protected'
          using errcode = '42501';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    elsif tg_op = 'UPDATE' and tg_table_name = 'meetup_invitations' then
      if new.id is distinct from old.id
        or new.meetup_id is distinct from old.meetup_id
        or new.inviter_id is distinct from old.inviter_id
        or new.invitee_id is distinct from old.invitee_id
        or new.created_at is distinct from old.created_at then
        raise exception 'meetup timestamps are protected'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' and tg_table_name = 'meetup_invite_links' then
      if new.id is distinct from old.id
        or new.meetup_id is distinct from old.meetup_id
        or new.created_by is distinct from old.created_by
        or new.token_hash is distinct from old.token_hash
        or new.created_at is distinct from old.created_at
        or (
          old.revoked_at is not null
          and new.revoked_at is distinct from old.revoked_at
        ) then
        raise exception 'meetup timestamps are protected'
          using errcode = '42501';
      end if;
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct meetup writes are not allowed'
    using errcode = '42501';
end;
$$;

create table public.meetup_invite_links (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint meetup_invite_links_hash_check check (octet_length(token_hash) = 32),
  constraint meetup_invite_links_revoke_check check (
    revoked_at is null or revoked_at >= created_at
  ),
  constraint meetup_invite_links_hash_unique unique (token_hash)
);

create unique index meetup_invite_links_one_open
on public.meetup_invite_links (meetup_id)
where revoked_at is null;

create index meetup_invite_links_meetup_idx
on public.meetup_invite_links (meetup_id);

create trigger meetup_invite_links_protect_write
before insert or update or delete on public.meetup_invite_links
for each row
execute function private.protect_meetup_write();

alter table public.meetup_invite_links enable row level security;
alter table public.meetup_invite_links force row level security;

revoke all on table public.meetup_invite_links from public, anon, authenticated;

create or replace function private.invite_token_hash(raw text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(raw, 'utf8'), 'sha256');
$$;

create or replace function private.invite_token_matches(raw text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select raw is not null
    and char_length(raw) = 43
    and raw ~ '^[A-Za-z0-9_-]{43}$';
$$;

create or replace function private.preview_meetup_invite(raw text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.meetup_invite_links%rowtype;
  meetup public.meetups%rowtype;
  actor uuid := auth.uid();
  participation text;
  sport_label text;
  format_label text;
  spots integer;
  payload jsonb;
begin
  if not private.invite_token_matches(raw) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select *
  into link
  from public.meetup_invite_links
  where meetup_invite_links.token_hash = private.invite_token_hash(raw);

  if link.id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select *
  into meetup
  from public.meetups
  where meetups.id = link.meetup_id;

  if actor is not null then
    select meetup_participants.status
    into participation
    from public.meetup_participants
    where meetup_participants.meetup_id = meetup.id
      and meetup_participants.user_id = actor;
  end if;

  if participation is distinct from 'confirmed'
    and link.revoked_at is not null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select sports.name, sport_formats.name
  into sport_label, format_label
  from public.sport_formats
  join public.sports on sports.id = sport_formats.sport_id
  where sport_formats.id = meetup.sport_format_id;

  spots := meetup.max_participants - private.confirmed_count(meetup.id);
  if spots < 0 then
    spots := 0;
  end if;

  payload := jsonb_build_object(
    'title', meetup.title,
    'sport_name', sport_label,
    'format_name', format_label,
    'starts_at', meetup.starts_at,
    'ends_at', meetup.ends_at,
    'time_zone', meetup.time_zone,
    'location_name', meetup.location_name,
    'open_spots', spots,
    'participation', participation,
    'meetup_id', case
      when participation = 'confirmed' then meetup.id
      else null
    end
  );

  if participation = 'confirmed' then
    return payload || jsonb_build_object('status', 'confirmed');
  end if;
  if meetup.status <> 'scheduled' then
    return payload || jsonb_build_object('status', 'cancelled');
  end if;
  if link.expires_at <= pg_catalog.now()
    or meetup.starts_at <= pg_catalog.now() then
    return payload || jsonb_build_object('status', 'expired');
  end if;

  return payload || jsonb_build_object('status', 'open');
end;
$$;

create or replace function private.join_meetup_by_invite(raw text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  target uuid;
  link public.meetup_invite_links%rowtype;
  locked public.meetups%rowtype;
  participation text;
  invitation public.meetup_invitations%rowtype;
begin
  actor := private.require_actor();
  if not private.invite_token_matches(raw) then
    raise exception 'invite unavailable'
      using errcode = 'P0001';
  end if;

  select meetup_invite_links.meetup_id
  into target
  from public.meetup_invite_links
  where meetup_invite_links.token_hash = private.invite_token_hash(raw);

  if target is null then
    raise exception 'invite unavailable'
      using errcode = 'P0001';
  end if;

  locked := private.lock_meetup(target);

  select *
  into link
  from public.meetup_invite_links
  where meetup_invite_links.token_hash = private.invite_token_hash(raw)
  for update;

  select meetup_participants.status
  into participation
  from public.meetup_participants
  where meetup_participants.meetup_id = locked.id
    and meetup_participants.user_id = actor
  for update;

  if participation = 'confirmed' then
    return locked.id;
  end if;
  if participation in ('left', 'removed') then
    raise exception 'participation cannot be reopened'
      using errcode = 'P0001';
  end if;
  if link.revoked_at is not null
    or link.expires_at <= pg_catalog.now()
    or locked.starts_at <= pg_catalog.now() then
    raise exception 'invite unavailable'
      using errcode = 'P0001';
  end if;
  if locked.status <> 'scheduled' then
    raise exception 'meetup cancelled'
      using errcode = 'P0001';
  end if;
  if private.confirmed_count(locked.id) >= locked.max_participants then
    raise exception 'meetup is full'
      using errcode = 'P0001';
  end if;

  select *
  into invitation
  from public.meetup_invitations
  where meetup_invitations.meetup_id = locked.id
    and meetup_invitations.invitee_id = actor
  for update;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetup_participants (meetup_id, user_id, status)
  values (locked.id, actor, 'confirmed');
  if invitation.id is not null
    and invitation.status in ('pending', 'declined', 'cancelled') then
    update public.meetup_invitations
    set status = 'accepted',
        responded_at = pg_catalog.now()
    where meetup_invitations.id = invitation.id;
  end if;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return locked.id;
end;
$$;

create or replace function private.create_meetup_invite_link(p_meetup_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor uuid;
  locked public.meetups%rowtype;
  issued text;
  valid_until timestamptz;
begin
  actor := private.require_actor();
  locked := private.lock_meetup(p_meetup_id);
  if locked.organizer_id <> actor then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;
  if locked.status <> 'scheduled' then
    raise exception 'meetup cancelled'
      using errcode = 'P0001';
  end if;
  if locked.starts_at <= pg_catalog.now() then
    raise exception 'meetup already started'
      using errcode = 'P0001';
  end if;

  issued := pg_catalog.rtrim(
    pg_catalog.translate(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
      '+/',
      '-_'
    ),
    '='
  );
  valid_until := least(
    pg_catalog.now() + interval '7 days',
    locked.starts_at
  );

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetup_invite_links
  set revoked_at = pg_catalog.now()
  where meetup_invite_links.meetup_id = locked.id
    and meetup_invite_links.revoked_at is null;
  insert into public.meetup_invite_links (
    meetup_id,
    created_by,
    token_hash,
    expires_at
  )
  values (
    locked.id,
    actor,
    private.invite_token_hash(issued),
    valid_until
  );
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return query
  select issued, valid_until;
end;
$$;

create or replace function private.revoke_meetup_invite_link(p_meetup_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.meetups%rowtype;
  revoked_id uuid;
begin
  actor := private.require_actor();
  locked := private.lock_meetup(p_meetup_id);
  if locked.organizer_id <> actor then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetup_invite_links
  set revoked_at = pg_catalog.now()
  where meetup_invite_links.meetup_id = locked.id
    and meetup_invite_links.revoked_at is null
  returning meetup_invite_links.id into revoked_id;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  if revoked_id is not null then
    return 'revoked';
  end if;
  if exists (
    select 1
    from public.meetup_invite_links
    where meetup_invite_links.meetup_id = locked.id
  ) then
    return 'revoked';
  end if;
  return 'none';
end;
$$;

create or replace function private.meetup_invite_link(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  link public.meetup_invite_links%rowtype;
  state text;
begin
  actor := private.require_actor();
  if not exists (
    select 1
    from public.meetups
    where meetups.id = p_meetup_id
      and meetups.organizer_id = actor
  ) then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  select *
  into link
  from public.meetup_invite_links
  where meetup_invite_links.meetup_id = p_meetup_id
  order by meetup_invite_links.created_at desc
  limit 1;

  if link.id is null then
    return jsonb_build_object(
      'state', 'none',
      'expires_at', null,
      'revoked_at', null,
      'created_at', null
    );
  end if;

  if link.revoked_at is not null then
    state := 'revoked';
  elsif link.expires_at <= pg_catalog.now() then
    state := 'expired';
  else
    state := 'active';
  end if;

  return jsonb_build_object(
    'state', state,
    'expires_at', link.expires_at,
    'revoked_at', link.revoked_at,
    'created_at', link.created_at
  );
end;
$$;

revoke all on function private.invite_token_hash(text) from public, anon, authenticated;
revoke all on function private.invite_token_matches(text) from public, anon, authenticated;
revoke all on function private.preview_meetup_invite(text) from public, anon, authenticated;
revoke all on function private.join_meetup_by_invite(text) from public, anon, authenticated;
revoke all on function private.create_meetup_invite_link(uuid) from public, anon, authenticated;
revoke all on function private.revoke_meetup_invite_link(uuid) from public, anon, authenticated;
revoke all on function private.meetup_invite_link(uuid) from public, anon, authenticated;

grant usage on schema private to anon;
grant execute on function private.preview_meetup_invite(text) to anon, authenticated;
grant execute on function private.join_meetup_by_invite(text) to authenticated;
grant execute on function private.create_meetup_invite_link(uuid) to authenticated;
grant execute on function private.revoke_meetup_invite_link(uuid) to authenticated;
grant execute on function private.meetup_invite_link(uuid) to authenticated;

create function public.preview_meetup_invite(token text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.preview_meetup_invite(token);
$$;

create function public.join_meetup_by_invite(token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.join_meetup_by_invite(token);
$$;

create function public.create_meetup_invite_link(meetup_id uuid)
returns table (token text, expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select result.token, result.expires_at
  from private.create_meetup_invite_link(meetup_id) as result;
$$;

create function public.revoke_meetup_invite_link(meetup_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_meetup_invite_link(meetup_id);
$$;

create function public.meetup_invite_link(meetup_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.meetup_invite_link(meetup_id);
$$;

revoke all on function public.preview_meetup_invite(text) from public, anon, authenticated;
revoke all on function public.join_meetup_by_invite(text) from public, anon, authenticated;
revoke all on function public.create_meetup_invite_link(uuid) from public, anon, authenticated;
revoke all on function public.revoke_meetup_invite_link(uuid) from public, anon, authenticated;
revoke all on function public.meetup_invite_link(uuid) from public, anon, authenticated;

grant execute on function public.preview_meetup_invite(text) to anon, authenticated;
grant execute on function public.join_meetup_by_invite(text) to authenticated;
grant execute on function public.create_meetup_invite_link(uuid) to authenticated;
grant execute on function public.revoke_meetup_invite_link(uuid) to authenticated;
grant execute on function public.meetup_invite_link(uuid) to authenticated;
