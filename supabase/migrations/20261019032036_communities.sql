-- Comunidade, membros, convites e modalidades.
-- A escrita passa pelas funções. O cliente não atribui papel.
-- Há um proprietário ativo por comunidade. Ele não sai e não é removido.
-- Quem foi removido só volta com um convite aceito. Quem saiu pode entrar
-- de novo numa comunidade pública, ou aceitar um convite novo.
-- Encontro comunitário ainda não existe. meetups não ganha community_id aqui.

create or replace function private.protect_community_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.community_write', true) = 'on' then
    if tg_op = 'UPDATE' and tg_table_name = 'communities' then
      if new.id is distinct from old.id
        or new.slug is distinct from old.slug
        or new.created_by is distinct from old.created_by
        or new.created_at is distinct from old.created_at then
        raise exception 'community identity is protected'
          using errcode = '42501';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    elsif tg_op = 'UPDATE' and tg_table_name = 'community_members' then
      if new.community_id is distinct from old.community_id
        or new.user_id is distinct from old.user_id then
        raise exception 'membership identity is protected'
          using errcode = '42501';
      end if;
      if old.role = 'owner'
        and old.status = 'active'
        and (
          new.role is distinct from 'owner'
          or new.status is distinct from 'active'
        ) then
        raise exception 'owner is protected'
          using errcode = '42501';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    elsif tg_op = 'UPDATE' and tg_table_name = 'community_invitations' then
      if new.id is distinct from old.id
        or new.community_id is distinct from old.community_id
        or new.invitee_id is distinct from old.invitee_id
        or new.inviter_id is distinct from old.inviter_id
        or new.created_at is distinct from old.created_at then
        raise exception 'invitation identity is protected'
          using errcode = '42501';
      end if;
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct community writes are not allowed'
    using errcode = '42501';
end;
$$;

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  visibility text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint communities_slug_unique unique (slug),
  constraint communities_slug_check check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 1 and 48
  ),
  constraint communities_name_check check (
    char_length(btrim(name)) between 2 and 60
    and name !~ '[[:cntrl:]]'
  ),
  constraint communities_description_check check (
    char_length(description) <= 500
    and description !~ '[[:cntrl:]]'
  ),
  constraint communities_visibility_check check (
    visibility in ('public', 'private')
  )
);

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  status text not null,
  joined_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (community_id, user_id),
  constraint community_members_role_check check (
    role in ('owner', 'admin', 'member')
  ),
  constraint community_members_status_check check (
    status in ('active', 'left', 'removed')
  )
);

create unique index community_members_one_active_owner
on public.community_members (community_id)
where role = 'owner' and status = 'active';

create index community_members_user_idx
on public.community_members (user_id)
where status = 'active';

create table public.community_invitations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  responded_at timestamptz,
  constraint community_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint community_invitations_response_check check (
    (status = 'pending') = (responded_at is null)
  ),
  constraint community_invitations_not_self check (inviter_id <> invitee_id)
);

create unique index community_invitations_one_pending
on public.community_invitations (community_id, invitee_id)
where status = 'pending';

create index community_invitations_invitee_idx
on public.community_invitations (invitee_id)
where status = 'pending';

create table public.community_sports (
  community_id uuid not null references public.communities (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  primary key (community_id, sport_id)
);

create trigger communities_protect_write
before insert or update or delete on public.communities
for each row execute function private.protect_community_write();

create trigger community_members_protect_write
before insert or update or delete on public.community_members
for each row execute function private.protect_community_write();

create trigger community_invitations_protect_write
before insert or update or delete on public.community_invitations
for each row execute function private.protect_community_write();

create trigger community_sports_protect_write
before insert or update or delete on public.community_sports
for each row execute function private.protect_community_write();

alter table public.communities enable row level security;
alter table public.communities force row level security;
alter table public.community_members enable row level security;
alter table public.community_members force row level security;
alter table public.community_invitations enable row level security;
alter table public.community_invitations force row level security;
alter table public.community_sports enable row level security;
alter table public.community_sports force row level security;

revoke all on table public.communities from public, anon, authenticated;
revoke all on table public.community_members from public, anon, authenticated;
revoke all on table public.community_invitations from public, anon, authenticated;
revoke all on table public.community_sports from public, anon, authenticated;

create or replace function private.community_slug_base(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := pg_catalog.lower(pg_catalog.translate(
    p_name,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  ));
  normalized := pg_catalog.regexp_replace(normalized, '[^a-z0-9]+', '-', 'g');
  normalized := pg_catalog.btrim(normalized, '-');
  normalized := pg_catalog.left(normalized, 40);
  normalized := pg_catalog.btrim(normalized, '-');
  if normalized = '' then
    return 'comunidade';
  end if;
  return normalized;
end;
$$;

create or replace function private.community_sports_json(p_community_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', sports.id, 'name', sports.name)
      order by sports.display_order, sports.name
    )
    from public.community_sports
    join public.sports on sports.id = community_sports.sport_id
    where community_sports.community_id = p_community_id
  ), '[]'::jsonb)
$$;

create or replace function private.community_member_count(p_community_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.community_members
  where community_id = p_community_id
    and status = 'active'
$$;

create or replace function private.assert_community_sports(
  p_community_id uuid,
  p_sport_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  chosen uuid[];
begin
  if p_sport_ids is null or pg_catalog.cardinality(p_sport_ids) = 0 then
    raise exception 'sport required' using errcode = 'P0001';
  end if;

  select coalesce(pg_catalog.array_agg(distinct sport_id), '{}'::uuid[])
  into chosen
  from pg_catalog.unnest(p_sport_ids) as sport_id
  where sport_id is not null;

  if pg_catalog.cardinality(chosen) = 0
    or exists (
      select 1
      from pg_catalog.unnest(p_sport_ids) as raw_id
      where raw_id is null
    ) then
    raise exception 'unknown sport' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(chosen) as sport_id
    where not exists (
      select 1 from public.sports where sports.id = sport_id
    )
  ) then
    raise exception 'unknown sport' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(chosen) as sport_id
    join public.sports on sports.id = sport_id
    where sports.active is false
      and not exists (
        select 1
        from public.community_sports
        where community_sports.community_id = p_community_id
          and community_sports.sport_id = sports.id
      )
  ) then
    raise exception 'unknown sport' using errcode = 'P0001';
  end if;

  return chosen;
end;
$$;

create or replace function private.replace_community_sports(
  p_community_id uuid,
  p_sport_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen uuid[];
  sport_id uuid;
begin
  chosen := private.assert_community_sports(p_community_id, p_sport_ids);
  perform pg_catalog.set_config('padre.community_write', 'on', true);
  delete from public.community_sports
  where community_id = p_community_id
    and not (community_sports.sport_id = any (chosen));
  foreach sport_id in array chosen loop
    insert into public.community_sports (community_id, sport_id)
    values (p_community_id, sport_id)
    on conflict do nothing;
  end loop;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
end;
$$;

create or replace function private.allocate_community_slug(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix integer := 2;
begin
  base := private.community_slug_base(p_name);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('community-slug'),
    pg_catalog.hashtext(base)
  );
  candidate := base;
  while exists (
    select 1 from public.communities where communities.slug = candidate
  ) loop
    candidate := pg_catalog.left(base, 40) || '-' || suffix::text;
    suffix := suffix + 1;
    if suffix > 100 then
      raise exception 'slug unavailable' using errcode = 'P0001';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function private.lock_community(p_slug text)
returns public.communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.communities%rowtype;
begin
  select * into found
  from public.communities
  where communities.slug = p_slug
  for update;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  return found;
end;
$$;

create or replace function private.active_community_role(
  p_community_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select community_members.role
  from public.community_members
  where community_members.community_id = p_community_id
    and community_members.user_id = p_user_id
    and community_members.status = 'active'
$$;

create or replace function private.reject_private_stranger(
  p_community_id uuid,
  p_visibility text,
  p_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role text;
begin
  actor_role := private.active_community_role(p_community_id, p_user_id);
  if p_visibility = 'private' and actor_role is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  return actor_role;
end;
$$;

create or replace function private.require_community_manager(
  p_community_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role text;
begin
  actor_role := private.active_community_role(p_community_id, p_user_id);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return actor_role;
end;
$$;

create or replace function private.activate_community_member(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.community_members%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_community_id::text),
    pg_catalog.hashtext(p_user_id::text)
  );
  select * into existing
  from public.community_members
  where community_id = p_community_id
    and user_id = p_user_id
  for update;

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  if existing.user_id is null then
    insert into public.community_members (
      community_id, user_id, role, status
    ) values (
      p_community_id, p_user_id, 'member', 'active'
    );
  elsif existing.status = 'active' then
    null;
  else
    update public.community_members
    set role = 'member',
        status = 'active',
        joined_at = pg_catalog.now()
    where community_id = p_community_id
      and user_id = p_user_id;
  end if;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
end;
$$;

create or replace function private.create_community(
  p_name text,
  p_description text,
  p_visibility text,
  p_sport_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  clean_name text;
  clean_description text;
  chosen_slug text;
  created_id uuid;
begin
  actor := private.require_actor();
  clean_name := pg_catalog.btrim(p_name);
  clean_description := coalesce(p_description, '');
  if clean_name is null
    or pg_catalog.char_length(clean_name) < 2
    or pg_catalog.char_length(clean_name) > 60
    or clean_name ~ '[[:cntrl:]]' then
    raise exception 'invalid community name' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(clean_description) > 500
    or clean_description ~ '[[:cntrl:]]' then
    raise exception 'invalid community description' using errcode = 'P0001';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;
  perform private.assert_community_sports(null, p_sport_ids);

  chosen_slug := private.allocate_community_slug(clean_name);
  perform pg_catalog.set_config('padre.community_write', 'on', true);
  insert into public.communities (slug, name, description, visibility, created_by)
  values (chosen_slug, clean_name, clean_description, p_visibility, actor)
  returning id into created_id;
  insert into public.community_members (community_id, user_id, role, status)
  values (created_id, actor, 'owner', 'active');
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  perform private.replace_community_sports(created_id, p_sport_ids);

  return pg_catalog.jsonb_build_object('slug', chosen_slug);
end;
$$;

create or replace function private.update_community(
  p_slug text,
  p_name text,
  p_description text,
  p_visibility text
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
  clean_name text;
  clean_description text;
begin
  actor := private.require_actor();
  found := private.lock_community(p_slug);
  perform private.reject_private_stranger(found.id, found.visibility, actor);
  actor_role := private.require_community_manager(found.id, actor);
  clean_name := pg_catalog.btrim(p_name);
  clean_description := coalesce(p_description, '');
  if pg_catalog.char_length(clean_name) < 2
    or pg_catalog.char_length(clean_name) > 60
    or clean_name ~ '[[:cntrl:]]' then
    raise exception 'invalid community name' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(clean_description) > 500
    or clean_description ~ '[[:cntrl:]]' then
    raise exception 'invalid community description' using errcode = 'P0001';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility' using errcode = 'P0001';
  end if;
  if p_visibility is distinct from found.visibility and actor_role <> 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.communities
  set name = clean_name,
      description = clean_description,
      visibility = p_visibility
  where id = found.id;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('slug', found.slug);
end;
$$;

create or replace function private.set_community_sports(
  p_slug text,
  p_sport_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
begin
  actor := private.require_actor();
  found := private.lock_community(p_slug);
  perform private.reject_private_stranger(found.id, found.visibility, actor);
  perform private.require_community_manager(found.id, actor);
  perform private.replace_community_sports(found.id, p_sport_ids);
  return pg_catalog.jsonb_build_object('slug', found.slug);
end;
$$;

create or replace function private.join_public_community(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  existing_status text;
begin
  actor := private.require_actor();
  found := private.lock_community(p_slug);
  if found.visibility <> 'public' then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  select status into existing_status
  from public.community_members
  where community_id = found.id
    and user_id = actor;
  if existing_status = 'removed' then
    raise exception 'reentry requires invitation' using errcode = 'P0001';
  end if;

  perform private.activate_community_member(found.id, actor);
  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_invitations
  set status = 'accepted',
      responded_at = pg_catalog.now()
  where community_id = found.id
    and invitee_id = actor
    and status = 'pending';
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('status', 'active');
end;
$$;

create or replace function private.leave_community(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  actor_role text;
begin
  actor := private.require_actor();
  found := private.lock_community(p_slug);
  actor_role := private.reject_private_stranger(
    found.id,
    found.visibility,
    actor
  );
  if actor_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if actor_role = 'owner' then
    raise exception 'owner cannot leave' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_members
  set role = 'member',
      status = 'left'
  where community_id = found.id
    and user_id = actor;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('status', 'left');
end;
$$;

create or replace function private.invite_to_community(
  p_slug text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  invitee uuid;
  normalized text;
  membership text;
  pending_count integer;
  latest_response timestamptz;
  created_id uuid;
begin
  actor := private.require_actor();
  normalized := pg_catalog.lower(pg_catalog.btrim(p_username));
  found := private.lock_community(p_slug);
  perform private.reject_private_stranger(found.id, found.visibility, actor);
  perform private.require_community_manager(found.id, actor);

  select profiles.id into invitee
  from public.profiles
  where profiles.username = normalized;
  if invitee is null then
    raise exception 'user not found' using errcode = 'P0001';
  end if;
  if invitee = actor then
    raise exception 'cannot invite yourself' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(found.id::text),
    pg_catalog.hashtext(invitee::text)
  );

  select status into membership
  from public.community_members
  where community_id = found.id
    and user_id = invitee
  for update;
  if membership = 'active' then
    raise exception 'already a member' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.community_invitations
    where community_id = found.id
      and invitee_id = invitee
      and status = 'pending'
  ) then
    raise exception 'invitation already pending' using errcode = 'P0001';
  end if;

  select max(responded_at) into latest_response
  from public.community_invitations
  where community_id = found.id
    and invitee_id = invitee
    and status in ('declined', 'cancelled');
  if latest_response is not null
    and latest_response + interval '24 hours' > pg_catalog.now() then
    raise exception 'invitation cooldown' using errcode = 'P0001';
  end if;

  select count(*) into pending_count
  from public.community_invitations
  where inviter_id = actor
    and status = 'pending';
  if pending_count >= 30 then
    raise exception 'too many pending invitations' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  insert into public.community_invitations (
    community_id, inviter_id, invitee_id, status
  ) values (
    found.id, actor, invitee, 'pending'
  )
  returning id into created_id;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('id', created_id, 'status', 'pending');
end;
$$;

create or replace function private.respond_to_community_invitation(
  p_invitation_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  invitation public.community_invitations%rowtype;
  found public.communities%rowtype;
  membership text;
begin
  actor := private.require_actor();
  if p_action not in ('accept', 'decline') then
    raise exception 'invalid invitation transition' using errcode = 'P0001';
  end if;

  select * into invitation
  from public.community_invitations
  where id = p_invitation_id
  for update;
  if invitation.id is null
    or invitation.invitee_id <> actor
    or invitation.status <> 'pending' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into found
  from public.communities
  where id = invitation.community_id
  for update;

  if p_action = 'decline' then
    perform pg_catalog.set_config('padre.community_write', 'on', true);
    update public.community_invitations
    set status = 'declined',
        responded_at = pg_catalog.now()
    where id = invitation.id;
    perform pg_catalog.set_config('padre.community_write', 'off', true);
    return pg_catalog.jsonb_build_object('status', 'declined');
  end if;

  select status into membership
  from public.community_members
  where community_id = found.id
    and user_id = actor
  for update;
  if membership = 'active' then
    perform pg_catalog.set_config('padre.community_write', 'on', true);
    update public.community_invitations
    set status = 'accepted',
        responded_at = pg_catalog.now()
    where id = invitation.id;
    perform pg_catalog.set_config('padre.community_write', 'off', true);
    return pg_catalog.jsonb_build_object('status', 'active');
  end if;

  perform private.activate_community_member(found.id, actor);
  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_invitations
  set status = 'accepted',
      responded_at = pg_catalog.now()
  where id = invitation.id;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('status', 'active', 'slug', found.slug);
end;
$$;

create or replace function private.cancel_community_invitation(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  invitation public.community_invitations%rowtype;
begin
  actor := private.require_actor();
  select * into invitation
  from public.community_invitations
  where id = p_invitation_id
  for update;
  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.require_community_manager(invitation.community_id, actor);

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_invitations
  set status = 'cancelled',
      responded_at = pg_catalog.now()
  where id = invitation.id;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('status', 'cancelled');
end;
$$;

create or replace function private.set_community_member_role(
  p_slug text,
  p_username text,
  p_role text
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
  target uuid;
  target_role text;
  target_status text;
begin
  actor := private.require_actor();
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = 'P0001';
  end if;
  found := private.lock_community(p_slug);
  actor_role := private.reject_private_stranger(
    found.id,
    found.visibility,
    actor
  );
  if actor_role is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select profiles.id into target
  from public.profiles
  where profiles.username = pg_catalog.lower(pg_catalog.btrim(p_username));
  if target is null or target = actor then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select role, status into target_role, target_status
  from public.community_members
  where community_id = found.id
    and user_id = target
  for update;
  if target_status is distinct from 'active' or target_role = 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_members
  set role = p_role
  where community_id = found.id
    and user_id = target;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('role', p_role);
end;
$$;

create or replace function private.remove_community_member(
  p_slug text,
  p_username text
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
  target uuid;
  target_role text;
  target_status text;
begin
  actor := private.require_actor();
  found := private.lock_community(p_slug);
  actor_role := private.reject_private_stranger(
    found.id,
    found.visibility,
    actor
  );
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select profiles.id into target
  from public.profiles
  where profiles.username = pg_catalog.lower(pg_catalog.btrim(p_username));
  if target is null or target = actor then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select role, status into target_role, target_status
  from public.community_members
  where community_id = found.id
    and user_id = target
  for update;
  if target_status is distinct from 'active' or target_role = 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if actor_role = 'admin' and target_role <> 'member' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_members
  set role = 'member',
      status = 'removed'
  where community_id = found.id
    and user_id = target;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  return pg_catalog.jsonb_build_object('status', 'removed');
end;
$$;

create or replace function private.community_summary(p_community_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'slug', communities.slug,
    'name', communities.name,
    'description', communities.description,
    'visibility', communities.visibility,
    'member_count', private.community_member_count(communities.id),
    'sports', private.community_sports_json(communities.id)
  )
  from public.communities
  where communities.id = p_community_id
$$;

create or replace function private.list_public_communities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'communities',
    coalesce((
      select pg_catalog.jsonb_agg(
        private.community_summary(communities.id)
        order by communities.name, communities.slug
      )
      from public.communities
      where communities.visibility = 'public'
    ), '[]'::jsonb)
  )
$$;

create or replace function private.list_my_communities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.require_actor();
  return pg_catalog.jsonb_build_object(
    'communities',
    coalesce((
      select pg_catalog.jsonb_agg(
        private.community_summary(communities.id) ||
        pg_catalog.jsonb_build_object('role', members.role)
        order by communities.name, communities.slug
      )
      from public.community_members as members
      join public.communities on communities.id = members.community_id
      where members.user_id = actor
        and members.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.list_my_community_invitations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.require_actor();
  return pg_catalog.jsonb_build_object(
    'invitations',
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', invitations.id,
        'slug', communities.slug,
        'name', communities.name,
        'description', communities.description,
        'visibility', communities.visibility
      ) order by invitations.created_at, communities.name)
      from public.community_invitations as invitations
      join public.communities on communities.id = invitations.community_id
      where invitations.invitee_id = actor
        and invitations.status = 'pending'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.get_community(p_slug text)
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
  members jsonb;
  invitations jsonb;
begin
  actor := auth.uid();
  select * into found
  from public.communities
  where communities.slug = p_slug;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  actor_role := private.active_community_role(found.id, actor);
  if found.visibility = 'private' and actor_role is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  if actor_role is null then
    return private.community_summary(found.id) ||
      pg_catalog.jsonb_build_object(
        'my_role', null,
        'members', null,
        'invitations', null
      );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id', profiles.id,
    'username', profiles.username,
    'role', membership.role
  ) order by
    case membership.role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    profiles.username
  ), '[]'::jsonb)
  into members
  from public.community_members as membership
  join public.profiles on profiles.id = membership.user_id
  where membership.community_id = found.id
    and membership.status = 'active';

  if actor_role in ('owner', 'admin') then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', invitations_table.id,
      'username', profiles.username
    ) order by profiles.username), '[]'::jsonb)
    into invitations
    from public.community_invitations as invitations_table
    join public.profiles on profiles.id = invitations_table.invitee_id
    where invitations_table.community_id = found.id
      and invitations_table.status = 'pending';
  end if;

  return private.community_summary(found.id) ||
    pg_catalog.jsonb_build_object(
      'my_role', actor_role,
      'members', members,
      'invitations', invitations
    );
end;
$$;

revoke all on function private.protect_community_write() from public, anon, authenticated;
revoke all on function private.community_slug_base(text) from public, anon, authenticated;
revoke all on function private.community_sports_json(uuid) from public, anon, authenticated;
revoke all on function private.community_member_count(uuid) from public, anon, authenticated;
revoke all on function private.assert_community_sports(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.replace_community_sports(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.allocate_community_slug(text) from public, anon, authenticated;
revoke all on function private.lock_community(text) from public, anon, authenticated;
revoke all on function private.active_community_role(uuid, uuid) from public, anon, authenticated;
revoke all on function private.reject_private_stranger(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.require_community_manager(uuid, uuid) from public, anon, authenticated;
revoke all on function private.activate_community_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.community_summary(uuid) from public, anon, authenticated;
revoke all on function private.create_community(text, text, text, uuid[]) from public, anon, authenticated;
revoke all on function private.update_community(text, text, text, text) from public, anon, authenticated;
revoke all on function private.set_community_sports(text, uuid[]) from public, anon, authenticated;
revoke all on function private.join_public_community(text) from public, anon, authenticated;
revoke all on function private.leave_community(text) from public, anon, authenticated;
revoke all on function private.invite_to_community(text, text) from public, anon, authenticated;
revoke all on function private.respond_to_community_invitation(uuid, text) from public, anon, authenticated;
revoke all on function private.cancel_community_invitation(uuid) from public, anon, authenticated;
revoke all on function private.set_community_member_role(text, text, text) from public, anon, authenticated;
revoke all on function private.remove_community_member(text, text) from public, anon, authenticated;
revoke all on function private.list_public_communities() from public, anon, authenticated;
revoke all on function private.list_my_communities() from public, anon, authenticated;
revoke all on function private.list_my_community_invitations() from public, anon, authenticated;
revoke all on function private.get_community(text) from public, anon, authenticated;

grant execute on function private.list_public_communities() to anon, authenticated;
grant execute on function private.get_community(text) to anon, authenticated;
grant execute on function private.create_community(text, text, text, uuid[]) to authenticated;
grant execute on function private.update_community(text, text, text, text) to authenticated;
grant execute on function private.set_community_sports(text, uuid[]) to authenticated;
grant execute on function private.join_public_community(text) to authenticated;
grant execute on function private.leave_community(text) to authenticated;
grant execute on function private.invite_to_community(text, text) to authenticated;
grant execute on function private.respond_to_community_invitation(uuid, text) to authenticated;
grant execute on function private.cancel_community_invitation(uuid) to authenticated;
grant execute on function private.set_community_member_role(text, text, text) to authenticated;
grant execute on function private.remove_community_member(text, text) to authenticated;
grant execute on function private.list_my_communities() to authenticated;
grant execute on function private.list_my_community_invitations() to authenticated;

create function public.list_public_communities()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.list_public_communities(); $$;

create function public.get_community(slug text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.get_community(slug); $$;

create function public.list_my_communities()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.list_my_communities(); $$;

create function public.list_my_community_invitations()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.list_my_community_invitations(); $$;

create function public.create_community(
  name text,
  description text,
  visibility text,
  sport_ids uuid[]
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_community(name, description, visibility, sport_ids); $$;

create function public.update_community(
  slug text,
  name text,
  description text,
  visibility text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_community(slug, name, description, visibility); $$;

create function public.set_community_sports(slug text, sport_ids uuid[])
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_community_sports(slug, sport_ids); $$;

create function public.join_public_community(slug text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.join_public_community(slug); $$;

create function public.leave_community(slug text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.leave_community(slug); $$;

create function public.invite_to_community(slug text, username text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.invite_to_community(slug, username); $$;

create function public.respond_to_community_invitation(
  invitation_id uuid,
  action text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.respond_to_community_invitation(invitation_id, action); $$;

create function public.cancel_community_invitation(invitation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.cancel_community_invitation(invitation_id); $$;

create function public.set_community_member_role(
  slug text,
  username text,
  role text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_community_member_role(slug, username, role); $$;

create function public.remove_community_member(slug text, username text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.remove_community_member(slug, username); $$;

revoke all on function public.list_public_communities() from public, anon, authenticated;
revoke all on function public.get_community(text) from public, anon, authenticated;
revoke all on function public.list_my_communities() from public, anon, authenticated;
revoke all on function public.list_my_community_invitations() from public, anon, authenticated;
revoke all on function public.create_community(text, text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.update_community(text, text, text, text) from public, anon, authenticated;
revoke all on function public.set_community_sports(text, uuid[]) from public, anon, authenticated;
revoke all on function public.join_public_community(text) from public, anon, authenticated;
revoke all on function public.leave_community(text) from public, anon, authenticated;
revoke all on function public.invite_to_community(text, text) from public, anon, authenticated;
revoke all on function public.respond_to_community_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_community_invitation(uuid) from public, anon, authenticated;
revoke all on function public.set_community_member_role(text, text, text) from public, anon, authenticated;
revoke all on function public.remove_community_member(text, text) from public, anon, authenticated;

grant execute on function public.list_public_communities() to anon, authenticated;
grant execute on function public.get_community(text) to anon, authenticated;
grant execute on function public.list_my_communities() to authenticated;
grant execute on function public.list_my_community_invitations() to authenticated;
grant execute on function public.create_community(text, text, text, uuid[]) to authenticated;
grant execute on function public.update_community(text, text, text, text) to authenticated;
grant execute on function public.set_community_sports(text, uuid[]) to authenticated;
grant execute on function public.join_public_community(text) to authenticated;
grant execute on function public.leave_community(text) to authenticated;
grant execute on function public.invite_to_community(text, text) to authenticated;
grant execute on function public.respond_to_community_invitation(uuid, text) to authenticated;
grant execute on function public.cancel_community_invitation(uuid) to authenticated;
grant execute on function public.set_community_member_role(text, text, text) to authenticated;
grant execute on function public.remove_community_member(text, text) to authenticated;
