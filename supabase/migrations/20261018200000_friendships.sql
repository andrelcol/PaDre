-- Uma amizade é uma linha só, independente de quem pediu primeiro.
-- Escrita passa pelas funções. O cliente não atualiza status direto.
-- O bloqueio futuro entra numa tabela própria, consultada por estas funções,
-- sem transformar o bloqueio em mais um estado desta linha.

create or replace function private.protect_friendship_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.friendship_write', true) = 'on' then
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id
        or new.created_at is distinct from old.created_at then
        raise exception 'friendship timestamps are protected'
          using errcode = '42501';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct friendship writes are not allowed'
    using errcode = '42501';
end;
$$;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  pair_low uuid generated always as (least(requester_id, addressee_id)) stored,
  pair_high uuid generated always as (greatest(requester_id, addressee_id)) stored,
  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_pair_unique unique (pair_low, pair_high),
  constraint friendships_status check (
    status in ('pending', 'accepted', 'rejected', 'cancelled', 'removed')
  ),
  constraint friendships_timestamps check (
    (
      status = 'pending'
      and accepted_at is null
      and closed_at is null
    )
    or (
      status = 'accepted'
      and accepted_at is not null
      and closed_at is null
    )
    or (
      status in ('rejected', 'cancelled')
      and accepted_at is null
      and closed_at is not null
    )
    or (
      status = 'removed'
      and accepted_at is not null
      and closed_at is not null
    )
  )
);

create index friendships_requester_id_idx on public.friendships (requester_id);
create index friendships_addressee_id_idx on public.friendships (addressee_id);

create trigger friendships_protect_write
before insert or update or delete on public.friendships
for each row
execute function private.protect_friendship_write();

alter table public.friendships enable row level security;
alter table public.friendships force row level security;

create policy friendships_select_participants
on public.friendships
for select
to authenticated
using (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
);

revoke all on table public.friendships from public, anon, authenticated;

grant select (
  id,
  requester_id,
  addressee_id,
  status,
  created_at,
  updated_at,
  accepted_at,
  closed_at,
  pair_low,
  pair_high
) on table public.friendships to authenticated;

create or replace function private.request_friendship(username text)
returns table (
  id uuid,
  status text,
  other_username text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor uuid;
  normalized text;
  other_id uuid;
  other_name text;
  low_id uuid;
  high_id uuid;
  existing public.friendships%rowtype;
  pending_count integer;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  normalized := private.normalize_username(username);
  if normalized is null or normalized !~ '^[a-z][a-z0-9_]{2,29}$' then
    raise exception 'user not found'
      using errcode = 'P0001';
  end if;

  select profiles.id, profiles.username
  into other_id, other_name
  from public.profiles
  where profiles.username = normalized;

  if other_id is null then
    raise exception 'user not found'
      using errcode = 'P0001';
  end if;

  if other_id = actor then
    raise exception 'cannot friend yourself'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('friend-out'),
    pg_catalog.hashtext(actor::text)
  );

  low_id := least(actor, other_id);
  high_id := greatest(actor, other_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(low_id::text),
    pg_catalog.hashtext(high_id::text)
  );

  select count(*)
  into pending_count
  from public.friendships
  where requester_id = actor
    and status = 'pending'
    and addressee_id <> other_id;

  select *
  into existing
  from public.friendships
  where pair_low = low_id
    and pair_high = high_id
  for update;

  if existing.id is null then
    if pending_count >= 30 then
      raise exception 'too many pending requests'
        using errcode = 'P0001';
    end if;

    perform pg_catalog.set_config('padre.friendship_write', 'on', true);
    insert into public.friendships (requester_id, addressee_id, status)
    values (actor, other_id, 'pending')
    returning * into existing;
    perform pg_catalog.set_config('padre.friendship_write', 'off', true);
  elsif existing.status = 'pending' and existing.requester_id = actor then
    raise exception 'friendship already pending'
      using errcode = 'P0001';
  elsif existing.status = 'pending' then
    raise exception 'incoming friendship request'
      using errcode = 'P0001';
  elsif existing.status = 'accepted' then
    raise exception 'already friends'
      using errcode = 'P0001';
  elsif existing.closed_at is not null
    and existing.closed_at + interval '24 hours' > pg_catalog.now() then
    raise exception 'friendship cooldown'
      using errcode = 'P0001';
  else
    if pending_count >= 30 then
      raise exception 'too many pending requests'
        using errcode = 'P0001';
    end if;

    perform pg_catalog.set_config('padre.friendship_write', 'on', true);
    update public.friendships
    set requester_id = actor,
        addressee_id = other_id,
        status = 'pending',
        accepted_at = null,
        closed_at = null
    where friendships.id = existing.id
    returning * into existing;
    perform pg_catalog.set_config('padre.friendship_write', 'off', true);
  end if;

  return query
  select existing.id, existing.status, other_name;
end;
$$;

create or replace function private.respond_to_friendship(
  friendship_id uuid,
  action text
)
returns table (
  id uuid,
  status text,
  other_username text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor uuid;
  existing public.friendships%rowtype;
  other_name text;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  if action not in ('accept', 'reject', 'cancel', 'remove') then
    raise exception 'invalid friendship transition'
      using errcode = 'P0001';
  end if;

  select *
  into existing
  from public.friendships
  where friendships.id = friendship_id
  for update;

  if existing.id is null
    or actor not in (existing.requester_id, existing.addressee_id) then
    raise exception 'not a participant'
      using errcode = '42501';
  end if;

  if action = 'accept'
    and existing.status = 'pending'
    and existing.addressee_id = actor then
    perform pg_catalog.set_config('padre.friendship_write', 'on', true);
    update public.friendships
    set status = 'accepted',
        accepted_at = pg_catalog.now(),
        closed_at = null
    where friendships.id = existing.id
    returning * into existing;
    perform pg_catalog.set_config('padre.friendship_write', 'off', true);
  elsif action = 'reject'
    and existing.status = 'pending'
    and existing.addressee_id = actor then
    perform pg_catalog.set_config('padre.friendship_write', 'on', true);
    update public.friendships
    set status = 'rejected',
        accepted_at = null,
        closed_at = pg_catalog.now()
    where friendships.id = existing.id
    returning * into existing;
    perform pg_catalog.set_config('padre.friendship_write', 'off', true);
  elsif action = 'cancel'
    and existing.status = 'pending'
    and existing.requester_id = actor then
    perform pg_catalog.set_config('padre.friendship_write', 'on', true);
    update public.friendships
    set status = 'cancelled',
        accepted_at = null,
        closed_at = pg_catalog.now()
    where friendships.id = existing.id
    returning * into existing;
    perform pg_catalog.set_config('padre.friendship_write', 'off', true);
  elsif action = 'remove'
    and existing.status = 'accepted'
    and actor in (existing.requester_id, existing.addressee_id) then
    perform pg_catalog.set_config('padre.friendship_write', 'on', true);
    update public.friendships
    set status = 'removed',
        closed_at = pg_catalog.now()
    where friendships.id = existing.id
    returning * into existing;
    perform pg_catalog.set_config('padre.friendship_write', 'off', true);
  else
    raise exception 'invalid friendship transition'
      using errcode = 'P0001';
  end if;

  select profiles.username
  into other_name
  from public.profiles
  where profiles.id = case
    when existing.requester_id = actor then existing.addressee_id
    else existing.requester_id
  end;

  return query
  select existing.id, existing.status, other_name;
end;
$$;

create or replace function private.list_my_friendships()
returns table (
  id uuid,
  status text,
  side text,
  other_username text,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor uuid;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  return query
  select
    friendships.id,
    friendships.status,
    case
      when friendships.status = 'accepted' then 'friend'
      when friendships.requester_id = actor then 'outgoing'
      else 'incoming'
    end,
    profiles.username,
    friendships.created_at,
    friendships.updated_at,
    friendships.accepted_at
  from public.friendships
  join public.profiles
    on profiles.id = case
      when friendships.requester_id = actor then friendships.addressee_id
      else friendships.requester_id
    end
  where actor in (friendships.requester_id, friendships.addressee_id)
    and friendships.status in ('pending', 'accepted')
  order by
    case when friendships.status = 'pending' then 0 else 1 end,
    case
      when friendships.status = 'pending' and friendships.addressee_id = actor then 0
      else 1
    end,
    friendships.updated_at desc;
end;
$$;

revoke all on function private.protect_friendship_write() from public, anon, authenticated;
revoke all on function private.request_friendship(text) from public, anon, authenticated;
revoke all on function private.respond_to_friendship(uuid, text) from public, anon, authenticated;
revoke all on function private.list_my_friendships() from public, anon, authenticated;

create or replace function public.request_friendship(username text)
returns table (
  id uuid,
  status text,
  other_username text
)
language sql
security definer
set search_path = ''
as $$
  select result.id, result.status, result.other_username
  from private.request_friendship(username) as result;
$$;

create or replace function public.respond_to_friendship(
  friendship_id uuid,
  action text
)
returns table (
  id uuid,
  status text,
  other_username text
)
language sql
security definer
set search_path = ''
as $$
  select result.id, result.status, result.other_username
  from private.respond_to_friendship(friendship_id, action) as result;
$$;

create or replace function public.list_my_friendships()
returns table (
  id uuid,
  status text,
  side text,
  other_username text,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    result.id,
    result.status,
    result.side,
    result.other_username,
    result.created_at,
    result.updated_at,
    result.accepted_at
  from private.list_my_friendships() as result;
$$;

revoke all on function public.request_friendship(text) from public, anon, authenticated;
revoke all on function public.respond_to_friendship(uuid, text) from public, anon, authenticated;
revoke all on function public.list_my_friendships() from public, anon, authenticated;

grant execute on function public.request_friendship(text) to authenticated;
grant execute on function public.respond_to_friendship(uuid, text) to authenticated;
grant execute on function public.list_my_friendships() to authenticated;
