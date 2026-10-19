-- Chat coletivo da comunidade. Um fio por comunidade.
-- Só integrante ativo lê e escreve. Comunidade pública não abre o chat.
-- author_id cai em cascata: conta sem histórico esportivo leva as próprias
-- mensagens, e o chat não cria um bloqueio novo de exclusão.
-- deleted_by fica nulo se a conta de quem moderou for excluída.
-- meetup_id fica nulo se o encontro for apagado; o texto permanece.

create or replace function private.protect_community_message_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.message_write', true) = 'on' then
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id
        or new.community_id is distinct from old.community_id
        or new.author_id is distinct from old.author_id
        or new.client_request_id is distinct from old.client_request_id
        or new.created_at is distinct from old.created_at then
        raise exception 'message identity is protected'
          using errcode = '42501';
      end if;
      if old.deleted_at is not null
        or (
          new.deleted_at is null
          and (
            new.body is distinct from old.body
            or new.meetup_id is distinct from old.meetup_id
            or new.deleted_by is not null
          )
        )
        or (
          new.deleted_at is not null
          and (new.body <> '' or new.meetup_id is not null)
        ) then
        raise exception 'message identity is protected'
          using errcode = '42501';
      end if;
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
    and new.meetup_id is null
    and old.meetup_id is not null
    and new.id is not distinct from old.id
    and new.community_id is not distinct from old.community_id
    and new.author_id is not distinct from old.author_id
    and new.client_request_id is not distinct from old.client_request_id
    and new.created_at is not distinct from old.created_at
    and new.deleted_by is not distinct from old.deleted_by
    and new.body is not distinct from old.body
    and new.deleted_at is not distinct from old.deleted_at then
    if old.deleted_at is null
      and pg_catalog.char_length(
        pg_catalog.regexp_replace(old.body, '[[:space:]]', '', 'g')
      ) < 1 then
      new.body := '';
      new.deleted_at := pg_catalog.statement_timestamp();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_by is not null
    and new.deleted_by is null
    and new.deleted_at is not distinct from old.deleted_at
    and new.body is not distinct from old.body
    and new.meetup_id is not distinct from old.meetup_id
    and new.id is not distinct from old.id
    and new.community_id is not distinct from old.community_id
    and new.author_id is not distinct from old.author_id
    and new.client_request_id is not distinct from old.client_request_id
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct message writes are not allowed'
    using errcode = '42501';
end;
$$;

create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  meetup_id uuid references public.meetups (id) on delete set null,
  client_request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  constraint community_messages_request_unique
    unique (community_id, author_id, client_request_id),
  constraint community_messages_body_check check (
    char_length(body) <= 2000
    and body !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ),
  constraint community_messages_live_check check (
    deleted_at is not null
    or meetup_id is not null
    or char_length(regexp_replace(body, '[[:space:]]', '', 'g')) >= 1
  ),
  constraint community_messages_removed_check check (
    deleted_at is null
    or (body = '' and meetup_id is null)
  ),
  constraint community_messages_moderator_check check (
    deleted_by is null or deleted_at is not null
  )
);

create index community_messages_history_idx
on public.community_messages (community_id, created_at desc, id desc);

create index community_messages_author_recent_idx
on public.community_messages (community_id, author_id, created_at desc);

create trigger community_messages_protect_write
before insert or update or delete on public.community_messages
for each row execute function private.protect_community_message_write();

alter table public.community_messages enable row level security;
alter table public.community_messages force row level security;
revoke all on table public.community_messages from public, anon, authenticated;

create or replace function private.community_message_body(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := pg_catalog.regexp_replace(coalesce(p_body, ''), E'\r\n?', E'\n', 'g');
  normalized := pg_catalog.regexp_replace(
    normalized,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  if normalized ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'invalid message'
      using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(normalized) > 2000 then
    raise exception 'message is too long'
      using errcode = 'P0001';
  end if;
  return normalized;
end;
$$;

create or replace function private.community_message_json(
  p_message_id uuid,
  p_viewer uuid,
  p_role text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', messages.id,
    'author_username', profiles.username,
    'body', case
      when messages.deleted_at is null then messages.body
      else ''
    end,
    'created_at', messages.created_at,
    'deleted', messages.deleted_at is not null,
    'mine', messages.author_id = p_viewer,
    'can_moderate',
      messages.deleted_at is null
      and messages.author_id <> p_viewer
      and p_role in ('owner', 'admin'),
    'meetup', case
      when messages.deleted_at is not null or meetups.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', meetups.id,
        'title', meetups.title,
        'status', meetups.status,
        'starts_at', meetups.starts_at,
        'ends_at', meetups.ends_at,
        'time_zone', meetups.time_zone,
        'location_name', meetups.location_name,
        'sport_name', sports.name,
        'format_name', sport_formats.name,
        'confirmed_count', private.confirmed_count(meetups.id),
        'max_participants', meetups.max_participants,
        'open_spots', greatest(
          0,
          meetups.max_participants - private.confirmed_count(meetups.id)
        )
      )
    end
  )
  from public.community_messages as messages
  join public.profiles on profiles.id = messages.author_id
  left join public.meetups on meetups.id = messages.meetup_id
  left join public.sport_formats on sport_formats.id = meetups.sport_format_id
  left join public.sports on sports.id = sport_formats.sport_id
  where messages.id = p_message_id
$$;

create or replace function private.send_community_message(
  p_slug text,
  p_body text,
  p_meetup_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  actor_role text;
  normalized text;
  target public.meetups%rowtype;
  existing uuid;
  recent integer;
  created uuid;
begin
  if p_client_request_id is null then
    raise exception 'invalid message'
      using errcode = 'P0001';
  end if;

  actor := private.require_actor();
  found := private.lock_community(p_slug);
  actor_role := private.reject_private_stranger(found.id, found.visibility, actor);
  if actor_role is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  perform 1
  from public.community_members
  where community_members.community_id = found.id
    and community_members.user_id = actor
    and community_members.status = 'active'
  for update;

  select messages.id
  into existing
  from public.community_messages as messages
  where messages.community_id = found.id
    and messages.author_id = actor
    and messages.client_request_id = p_client_request_id
  for update;

  if existing is not null then
    return private.community_message_json(existing, actor, actor_role);
  end if;

  normalized := private.community_message_body(p_body);
  if p_meetup_id is not null then
    select *
    into target
    from public.meetups
    where meetups.id = p_meetup_id;
    if target.id is null or target.community_id is distinct from found.id then
      raise exception 'meetup is not in community'
        using errcode = 'P0001';
    end if;
    if not private.can_read_meetup(target.id) then
      raise exception 'not allowed'
        using errcode = '42501';
    end if;
  elsif pg_catalog.char_length(
    pg_catalog.regexp_replace(normalized, '[[:space:]]', '', 'g')
  ) < 1 then
    raise exception 'empty message'
      using errcode = 'P0001';
  end if;

  select count(*)
  into recent
  from public.community_messages as messages
  where messages.community_id = found.id
    and messages.author_id = actor
    and messages.created_at > pg_catalog.now() - interval '10 seconds';

  if recent >= 5 then
    raise exception 'too many messages'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.message_write', 'on', true);
  insert into public.community_messages (
    community_id,
    author_id,
    body,
    meetup_id,
    client_request_id
  )
  values (found.id, actor, normalized, p_meetup_id, p_client_request_id)
  returning id into created;
  perform pg_catalog.set_config('padre.message_write', 'off', true);

  return private.community_message_json(created, actor, actor_role);
exception
  when unique_violation then
    select messages.id
    into existing
    from public.community_messages as messages
    where messages.community_id = found.id
      and messages.author_id = actor
      and messages.client_request_id = p_client_request_id;
    return private.community_message_json(existing, actor, actor_role);
end;
$$;

create or replace function private.list_community_messages(
  p_slug text,
  p_before_created_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  actor_role text;
  chosen integer;
begin
  actor := private.require_actor();
  if p_limit is null then
    chosen := 50;
  elsif p_limit < 1 or p_limit > 50 then
    raise exception 'invalid message'
      using errcode = 'P0001';
  else
    chosen := p_limit;
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid message'
      using errcode = 'P0001';
  end if;

  select *
  into found
  from public.communities
  where communities.slug = p_slug;

  if found.id is null then
    raise exception 'not found'
      using errcode = 'P0001';
  end if;

  actor_role := private.reject_private_stranger(found.id, found.visibility, actor);
  if actor_role is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'has_older', (
      select count(*) > chosen
      from (
        select messages.id
        from public.community_messages as messages
        where messages.community_id = found.id
          and (
            p_before_created_at is null
            or (messages.created_at, messages.id) < (p_before_created_at, p_before_id)
          )
        order by messages.created_at desc, messages.id desc
        limit chosen + 1
      ) as windowed
    ),
    'messages', coalesce((
      select pg_catalog.jsonb_agg(
        private.community_message_json(page.id, actor, actor_role)
        order by page.created_at, page.id
      )
      from (
        select picked.id, picked.created_at
        from (
          select messages.id, messages.created_at
          from public.community_messages as messages
          where messages.community_id = found.id
            and (
              p_before_created_at is null
              or (messages.created_at, messages.id)
                < (p_before_created_at, p_before_id)
            )
          order by messages.created_at desc, messages.id desc
          limit chosen
        ) as picked
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.delete_community_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.community_messages%rowtype;
  community public.communities%rowtype;
  actor_role text;
begin
  if p_message_id is null then
    raise exception 'not found'
      using errcode = 'P0001';
  end if;

  actor := private.require_actor();
  select *
  into found
  from public.community_messages
  where community_messages.id = p_message_id
  for update;

  if found.id is null then
    raise exception 'not found'
      using errcode = 'P0001';
  end if;

  select *
  into community
  from public.communities
  where communities.id = found.community_id
  for update;

  actor_role := private.reject_private_stranger(
    community.id,
    community.visibility,
    actor
  );
  if actor_role is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  if found.deleted_at is not null then
    return pg_catalog.jsonb_build_object('status', 'removed');
  end if;

  if found.author_id <> actor and actor_role not in ('owner', 'admin') then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.message_write', 'on', true);
  update public.community_messages
  set body = '',
      meetup_id = null,
      deleted_at = pg_catalog.statement_timestamp(),
      deleted_by = actor
  where community_messages.id = found.id;
  perform pg_catalog.set_config('padre.message_write', 'off', true);

  return pg_catalog.jsonb_build_object('status', 'removed');
end;
$$;

create function public.send_community_message(
  slug text,
  body text,
  meetup_id uuid,
  client_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.send_community_message(slug, body, meetup_id, client_request_id);
$$;

create function public.list_community_messages(
  slug text,
  before_created_at timestamptz,
  before_id uuid,
  page_limit integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_community_messages(
    slug,
    before_created_at,
    before_id,
    page_limit
  );
$$;

create function public.delete_community_message(message_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.delete_community_message(message_id);
$$;

revoke all on function private.protect_community_message_write() from public, anon, authenticated;
revoke all on function private.community_message_body(text) from public, anon, authenticated;
revoke all on function private.community_message_json(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.send_community_message(text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function private.list_community_messages(text, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function private.delete_community_message(uuid) from public, anon, authenticated;

revoke all on function public.send_community_message(text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_community_messages(text, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.delete_community_message(uuid) from public, anon, authenticated;

grant execute on function private.send_community_message(text, text, uuid, uuid) to authenticated;
grant execute on function private.list_community_messages(text, timestamptz, uuid, integer) to authenticated;
grant execute on function private.delete_community_message(uuid) to authenticated;
grant execute on function public.send_community_message(text, text, uuid, uuid) to authenticated;
grant execute on function public.list_community_messages(text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.delete_community_message(uuid) to authenticated;
