-- Encontro comunitário reutiliza meetups. community_id nulo continua privado.
-- A coluna não muda depois da criação e a comunidade não apaga o encontro.
-- Ordem de trava: communities, community_members do autor, meetups por id,
-- meetup_participants. Encontro privado trava só a própria linha.
-- Convite interno e link não ocupam vaga de encontro comunitário.
-- Sair ou ser removido libera vaga só de encontro futuro ainda agendado.
-- Quem organiza um encontro futuro precisa cancelá-lo antes de sair.
-- Apagar o perfil de proprietário ou de organizador comunitário é recusado
-- com a dependência explícita. A transferência fica para uma versão seguinte.

alter table public.communities
  drop constraint communities_created_by_fkey,
  add constraint communities_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete restrict;

alter table public.meetups
  add column community_id uuid
    references public.communities (id)
    on delete restrict;

create index meetups_community_schedule_idx
  on public.meetups (community_id, status, starts_at)
  where community_id is not null;

grant select (community_id) on table public.meetups to authenticated;

create table public.meetup_audit_logs (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint meetup_audit_logs_action_check check (action in ('cancelled'))
);

create index meetup_audit_logs_meetup_idx
  on public.meetup_audit_logs (meetup_id, created_at);

alter table public.meetup_audit_logs enable row level security;
alter table public.meetup_audit_logs force row level security;
revoke all on table public.meetup_audit_logs from public, anon, authenticated;

create or replace function private.protect_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.communities
    where communities.created_by = old.id
  ) then
    raise exception 'Esta conta é proprietária de uma comunidade. A exclusão foi recusada para preservar a comunidade, os encontros e o histórico esportivo. A transferência de propriedade ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.meetups
    where meetups.organizer_id = old.id
      and meetups.community_id is not null
  ) then
    raise exception 'Esta conta organiza encontros comunitários. A exclusão foi recusada para preservar esses encontros e o histórico esportivo. Cancele os encontros futuros ou aguarde a transferência de organização, que ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.meetup_audit_logs
    where meetup_audit_logs.actor_id = old.id
  ) then
    raise exception 'Esta conta registrou moderação de encontros. A exclusão foi recusada para preservar o autor dessa ação. A transferência ainda não existe.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists profiles_protect_delete on public.profiles;
create trigger profiles_protect_delete
before delete on public.profiles
for each row
execute function private.protect_profile_delete();

revoke all on function private.protect_profile_delete() from public, anon, authenticated;

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
        or new.community_id is distinct from old.community_id
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

create trigger meetup_audit_logs_protect_write
before insert or update or delete on public.meetup_audit_logs
for each row
execute function private.protect_meetup_write();

create or replace function private.reject_community_meetup_invite(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  community uuid;
begin
  select meetups.community_id
  into community
  from public.meetups
  where meetups.id = p_meetup_id;

  if community is null then
    return;
  end if;

  if private.active_community_role(community, auth.uid()) is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  raise exception 'community meetup has no invite'
    using errcode = 'P0001';
end;
$$;

create or replace function private.reject_community_meetup_invite_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.meetups
    where meetups.id = new.meetup_id
      and meetups.community_id is not null
  ) then
    raise exception 'community meetup has no invite'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger meetup_invitations_reject_community
before insert or update on public.meetup_invitations
for each row
execute function private.reject_community_meetup_invite_row();

create trigger meetup_invite_links_reject_community
before insert or update on public.meetup_invite_links
for each row
execute function private.reject_community_meetup_invite_row();

create or replace function private.can_read_meetup(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when meetups.community_id is not null then
        private.active_community_role(meetups.community_id, auth.uid()) is not null
      else
        meetups.organizer_id = auth.uid()
        or exists (
          select 1
          from public.meetup_participants
          where meetup_participants.meetup_id = meetups.id
            and meetup_participants.user_id = auth.uid()
            and meetup_participants.status = 'confirmed'
        )
        or exists (
          select 1
          from public.meetup_invitations
          where meetup_invitations.meetup_id = meetups.id
            and meetup_invitations.invitee_id = auth.uid()
            and meetup_invitations.status = 'pending'
        )
    end
    from public.meetups
    where meetups.id = target
  ), false);
$$;

create or replace function private.lock_meetup(target uuid)
returns public.meetups
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.meetups%rowtype;
  community uuid;
  actor uuid;
begin
  select meetups.community_id
  into community
  from public.meetups
  where meetups.id = target;

  if community is not null then
    perform 1
    from public.communities
    where communities.id = community
    for update;

    actor := auth.uid();
    perform 1
    from public.community_members
    where community_members.community_id = community
      and community_members.user_id = actor
    for update;

    if private.active_community_role(community, actor) is null then
      raise exception 'not allowed'
        using errcode = '42501';
    end if;
  end if;

  select *
  into found
  from public.meetups
  where meetups.id = target
  for update;

  if found.id is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  return found;
end;
$$;

create or replace function private.assert_community_sport(
  p_community_id uuid,
  p_sport_format_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sport_formats
    join public.community_sports
      on community_sports.sport_id = sport_formats.sport_id
     and community_sports.community_id = p_community_id
    where sport_formats.id = p_sport_format_id
  ) then
    raise exception 'sport not in community'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.create_meetup(
  p_sport_format_id uuid,
  p_scoring_rule_version_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text,
  p_location_name text,
  p_location_address text,
  p_max_participants integer,
  p_community_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  created_id uuid;
  community uuid;
begin
  actor := private.require_actor();
  if p_max_participants is null
    or p_max_participants < 2
    or p_max_participants > 64 then
    raise exception 'invalid meetup field'
      using errcode = 'P0001';
  end if;

  perform private.assert_schedule(p_starts_at, p_ends_at, p_time_zone, true);
  perform private.assert_active_format(p_sport_format_id);
  perform private.assert_rule_for_format(p_scoring_rule_version_id, p_sport_format_id);

  if p_community_id is not null then
    select communities.id
    into community
    from public.communities
    where communities.id = p_community_id
    for update;

    if community is null then
      raise exception 'not found'
        using errcode = 'P0001';
    end if;

    perform 1
    from public.community_members
    where community_members.community_id = community
      and community_members.user_id = actor
    for update;

    if private.active_community_role(community, actor) is null then
      raise exception 'not allowed'
        using errcode = '42501';
    end if;

    perform private.assert_community_sport(community, p_sport_format_id);
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetups (
    organizer_id,
    community_id,
    sport_format_id,
    scoring_rule_version_id,
    title,
    description,
    starts_at,
    ends_at,
    time_zone,
    location_name,
    location_address,
    max_participants,
    status
  ) values (
    actor,
    p_community_id,
    p_sport_format_id,
    p_scoring_rule_version_id,
    private.bounded_text(p_title, 1, 80, true),
    private.bounded_text(p_description, 1, 500, false),
    p_starts_at,
    p_ends_at,
    p_time_zone,
    private.bounded_text(p_location_name, 1, 120, true),
    private.bounded_text(p_location_address, 1, 200, false),
    p_max_participants,
    'scheduled'
  )
  returning meetups.id into created_id;

  insert into public.meetup_participants (meetup_id, user_id, status)
  values (created_id, actor, 'confirmed');
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return created_id;
end;
$$;

create or replace function public.create_meetup(
  sport_format_id uuid,
  scoring_rule_version_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  location_name text,
  location_address text,
  max_participants integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_meetup(
    sport_format_id,
    scoring_rule_version_id,
    title,
    description,
    starts_at,
    ends_at,
    time_zone,
    location_name,
    location_address,
    max_participants,
    null::uuid
  );
$$;

drop function private.create_meetup(
  uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer
);

create or replace function private.create_community_meetup(
  p_slug text,
  p_sport_format_id uuid,
  p_scoring_rule_version_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text,
  p_location_name text,
  p_location_address text,
  p_max_participants integer
)
returns uuid
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
  select *
  into found
  from public.communities
  where communities.slug = p_slug;

  if found.id is null then
    raise exception 'not found'
      using errcode = 'P0001';
  end if;

  actor_role := private.reject_private_stranger(
    found.id,
    found.visibility,
    actor
  );
  if actor_role is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  return private.create_meetup(
    p_sport_format_id,
    p_scoring_rule_version_id,
    p_title,
    p_description,
    p_starts_at,
    p_ends_at,
    p_time_zone,
    p_location_name,
    p_location_address,
    p_max_participants,
    found.id
  );
end;
$$;

create or replace function private.update_meetup(
  p_meetup_id uuid,
  p_sport_format_id uuid,
  p_scoring_rule_version_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text,
  p_location_name text,
  p_location_address text,
  p_max_participants integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.meetups%rowtype;
  structural boolean;
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
  if p_max_participants is null
    or p_max_participants < 2
    or p_max_participants > 64 then
    raise exception 'invalid meetup field'
      using errcode = 'P0001';
  end if;
  if p_max_participants < private.confirmed_count(locked.id) then
    raise exception 'capacity below confirmed'
      using errcode = 'P0001';
  end if;

  structural := p_sport_format_id is distinct from locked.sport_format_id
    or p_scoring_rule_version_id is distinct from locked.scoring_rule_version_id
    or date_trunc('milliseconds', p_starts_at) is distinct from date_trunc('milliseconds', locked.starts_at)
    or date_trunc('milliseconds', p_ends_at) is distinct from date_trunc('milliseconds', locked.ends_at)
    or p_time_zone is distinct from locked.time_zone;

  if structural and private.confirmed_count(locked.id) > 1 then
    raise exception 'structural change locked'
      using errcode = 'P0001';
  end if;

  perform private.assert_schedule(p_starts_at, p_ends_at, p_time_zone, structural);
  if structural then
    perform private.assert_active_format(p_sport_format_id);
    perform private.assert_rule_for_format(
      p_scoring_rule_version_id,
      p_sport_format_id
    );
    if locked.community_id is not null then
      perform private.assert_community_sport(
        locked.community_id,
        p_sport_format_id
      );
    end if;
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetups
  set sport_format_id = p_sport_format_id,
      scoring_rule_version_id = p_scoring_rule_version_id,
      title = private.bounded_text(p_title, 1, 80, true),
      description = private.bounded_text(p_description, 1, 500, false),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      time_zone = p_time_zone,
      location_name = private.bounded_text(p_location_name, 1, 120, true),
      location_address = private.bounded_text(p_location_address, 1, 200, false),
      max_participants = p_max_participants
  where meetups.id = locked.id;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return locked.id;
end;
$$;

create or replace function private.cancel_meetup(p_meetup_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.meetups%rowtype;
  actor_role text;
begin
  actor := private.require_actor();
  locked := private.lock_meetup(p_meetup_id);
  if locked.organizer_id <> actor then
    actor_role := private.active_community_role(locked.community_id, actor);
    if locked.community_id is null
      or actor_role is null
      or actor_role not in ('owner', 'admin') then
      raise exception 'not allowed'
        using errcode = '42501';
    end if;
  end if;
  if locked.status = 'cancelled' then
    return 'cancelled';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetups set status = 'cancelled' where meetups.id = locked.id;
  update public.meetup_invitations
  set status = 'cancelled', responded_at = pg_catalog.now()
  where meetup_invitations.meetup_id = locked.id
    and meetup_invitations.status = 'pending';
  if locked.community_id is not null then
    insert into public.meetup_audit_logs (meetup_id, actor_id, action)
    values (locked.id, actor, 'cancelled');
  end if;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  with voided as (
    update public.matches
    set status = 'voided', voided_at = pg_catalog.now()
    where matches.meetup_id = locked.id
      and matches.status in ('draft', 'pending_confirmation', 'disputed')
    returning matches.id
  )
  insert into public.match_audit_logs (match_id, actor_id, action)
  select voided.id, actor, 'voided' from voided;
  perform pg_catalog.set_config('padre.match_write', 'off', true);

  return 'cancelled';
end;
$$;

create or replace function private.invite_to_meetup(
  p_meetup_id uuid,
  p_username text
)
returns table (
  id uuid,
  status text,
  invitee_username text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor uuid;
  locked public.meetups%rowtype;
  normalized text;
  invitee uuid;
  invitee_name text;
  existing public.meetup_invitations%rowtype;
  participation text;
begin
  actor := private.require_actor();
  perform private.reject_community_meetup_invite(p_meetup_id);
  normalized := private.normalize_username(p_username);
  if normalized is null or normalized !~ '^[a-z][a-z0-9_]{2,29}$' then
    raise exception 'user not found'
      using errcode = 'P0001';
  end if;

  select profiles.id, profiles.username
  into invitee, invitee_name
  from public.profiles
  where profiles.username = normalized;

  if invitee is null then
    raise exception 'user not found'
      using errcode = 'P0001';
  end if;
  if invitee = actor then
    raise exception 'cannot invite yourself'
      using errcode = 'P0001';
  end if;

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

  if not exists (
    select 1
    from public.friendships
    where friendships.status = 'accepted'
      and friendships.pair_low = least(actor, invitee)
      and friendships.pair_high = greatest(actor, invitee)
  ) then
    raise exception 'not friends'
      using errcode = 'P0001';
  end if;

  select meetup_participants.status
  into participation
  from public.meetup_participants
  where meetup_participants.meetup_id = locked.id
    and meetup_participants.user_id = invitee
  for update;

  if participation = 'confirmed' then
    raise exception 'already participating'
      using errcode = 'P0001';
  end if;
  if participation in ('left', 'removed') then
    raise exception 'participation cannot be reopened'
      using errcode = 'P0001';
  end if;

  select *
  into existing
  from public.meetup_invitations
  where meetup_invitations.meetup_id = locked.id
    and meetup_invitations.invitee_id = invitee
  for update;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  if existing.id is null then
    insert into public.meetup_invitations (
      meetup_id,
      inviter_id,
      invitee_id,
      status
    ) values (
      locked.id,
      actor,
      invitee,
      'pending'
    )
    returning * into existing;
  elsif existing.status = 'pending' then
    null;
  elsif existing.status in ('declined', 'cancelled') then
    update public.meetup_invitations
    set status = 'pending',
        responded_at = null
    where meetup_invitations.id = existing.id
    returning * into existing;
  else
    perform pg_catalog.set_config('padre.meetup_write', 'off', true);
    raise exception 'already participating'
      using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return query
  select existing.id, existing.status, invitee_name;
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

  perform private.reject_community_meetup_invite(target);
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
  perform private.reject_community_meetup_invite(p_meetup_id);
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

create or replace function private.list_community_meetups(
  p_slug text,
  p_limit integer,
  p_offset integer
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
begin
  actor := private.require_actor();
  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_offset is null
    or p_offset < 0 then
    raise exception 'invalid meetup field'
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

  actor_role := private.reject_private_stranger(
    found.id,
    found.visibility,
    actor
  );
  if actor_role is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'total', (
      select count(*)
      from public.meetups
      where meetups.community_id = found.id
    ),
    'meetups', coalesce((
      select pg_catalog.jsonb_agg(page.item order by page.starts_at, page.id)
      from (
        select
          meetups.id,
          meetups.starts_at,
          pg_catalog.jsonb_build_object(
            'id', meetups.id,
            'title', meetups.title,
            'status', meetups.status,
            'phase', case
              when meetups.status = 'cancelled' then 'cancelled'
              when meetups.starts_at > pg_catalog.now() then 'upcoming'
              else 'past'
            end,
            'starts_at', meetups.starts_at,
            'ends_at', meetups.ends_at,
            'time_zone', meetups.time_zone,
            'location_name', meetups.location_name,
            'sport_name', sports.name,
            'format_name', sport_formats.name,
            'organizer_username', organizer.username,
            'confirmed_count', private.confirmed_count(meetups.id),
            'max_participants', meetups.max_participants,
            'open_spots', meetups.max_participants - private.confirmed_count(meetups.id)
          ) as item
        from public.meetups
        join public.sport_formats on sport_formats.id = meetups.sport_format_id
        join public.sports on sports.id = sport_formats.sport_id
        join public.profiles as organizer on organizer.id = meetups.organizer_id
        where meetups.community_id = found.id
        order by meetups.starts_at, meetups.id
        limit p_limit
        offset p_offset
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.join_community_meetup(p_meetup_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  community uuid;
  locked public.meetups%rowtype;
  participation text;
begin
  actor := private.require_actor();
  select meetups.community_id
  into community
  from public.meetups
  where meetups.id = p_meetup_id;

  if community is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  locked := private.lock_meetup(p_meetup_id);
  if locked.status <> 'scheduled' then
    raise exception 'meetup cancelled'
      using errcode = 'P0001';
  end if;
  if locked.starts_at <= pg_catalog.now() then
    raise exception 'meetup already started'
      using errcode = 'P0001';
  end if;

  select meetup_participants.status
  into participation
  from public.meetup_participants
  where meetup_participants.meetup_id = locked.id
    and meetup_participants.user_id = actor
  for update;

  if participation = 'confirmed' then
    return 'confirmed';
  end if;
  if participation in ('left', 'removed') then
    raise exception 'participation cannot be reopened'
      using errcode = 'P0001';
  end if;
  if private.confirmed_count(locked.id) >= locked.max_participants then
    raise exception 'meetup is full'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetup_participants (meetup_id, user_id, status)
  values (locked.id, actor, 'confirmed');
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);
  return 'confirmed';
end;
$$;

create or replace function private.release_future_community_seats(
  p_community_id uuid,
  p_user_id uuid,
  p_next_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  for target in
    select meetups.id
    from public.meetups
    where meetups.community_id = p_community_id
      and meetups.status = 'scheduled'
      and meetups.starts_at > pg_catalog.now()
    order by meetups.id
    for update
  loop
    update public.meetup_participants
    set status = p_next_status
    where meetup_participants.meetup_id = target
      and meetup_participants.user_id = p_user_id
      and meetup_participants.status = 'confirmed';
  end loop;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);
end;
$$;

create or replace function private.assert_no_future_organized_meetup(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.meetups
    where meetups.community_id = p_community_id
      and meetups.organizer_id = p_user_id
      and meetups.status = 'scheduled'
      and meetups.starts_at > pg_catalog.now()
  ) then
    raise exception 'cancel community meetups before leaving'
      using errcode = 'P0001';
  end if;
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

  perform 1
  from public.community_members
  where community_members.community_id = found.id
    and community_members.user_id = actor
  for update;
  perform private.assert_no_future_organized_meetup(found.id, actor);

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_members
  set role = 'member',
      status = 'left'
  where community_id = found.id
    and user_id = actor;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  perform private.release_future_community_seats(found.id, actor, 'left');
  return pg_catalog.jsonb_build_object('status', 'left');
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

  perform private.assert_no_future_organized_meetup(found.id, target);

  perform pg_catalog.set_config('padre.community_write', 'on', true);
  update public.community_members
  set role = 'member',
      status = 'removed'
  where community_id = found.id
    and user_id = target;
  perform pg_catalog.set_config('padre.community_write', 'off', true);
  perform private.release_future_community_seats(found.id, target, 'removed');
  return pg_catalog.jsonb_build_object('status', 'removed');
end;
$$;

create or replace function private.list_my_meetups()
returns table (
  id uuid,
  title text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  location_name text,
  sport_name text,
  format_name text,
  relation text,
  confirmed_count integer,
  max_participants integer,
  invitation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.require_actor();

  return query
  select
    meetups.id,
    meetups.title,
    meetups.status,
    meetups.starts_at,
    meetups.ends_at,
    meetups.time_zone,
    meetups.location_name,
    sports.name,
    sport_formats.name,
    case
      when meetups.organizer_id = actor then 'organizing'
      when exists (
        select 1
        from public.meetup_participants as parts
        where parts.meetup_id = meetups.id
          and parts.user_id = actor
          and parts.status = 'confirmed'
      ) then 'confirmed'
      else 'invited'
    end,
    private.confirmed_count(meetups.id),
    meetups.max_participants,
    (
      select invitations.id
      from public.meetup_invitations as invitations
      where invitations.meetup_id = meetups.id
        and invitations.invitee_id = actor
        and invitations.status = 'pending'
    )
  from public.meetups
  join public.sport_formats on sport_formats.id = meetups.sport_format_id
  join public.sports on sports.id = sport_formats.sport_id
  where (
    meetups.organizer_id = actor
    or exists (
      select 1
      from public.meetup_participants as parts
      where parts.meetup_id = meetups.id
        and parts.user_id = actor
        and parts.status = 'confirmed'
    )
    or exists (
      select 1
      from public.meetup_invitations as invitations
      where invitations.meetup_id = meetups.id
        and invitations.invitee_id = actor
        and invitations.status = 'pending'
    )
  )
  and (
    meetups.community_id is null
    or private.active_community_role(meetups.community_id, actor) is not null
  )
  order by meetups.starts_at;
end;
$$;

create or replace function private.get_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.meetups%rowtype;
  payload jsonb;
begin
  actor := private.require_actor();
  if not private.can_read_meetup(p_meetup_id) then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  select *
  into locked
  from public.meetups
  where meetups.id = p_meetup_id;

  select jsonb_build_object(
    'id', locked.id,
    'title', locked.title,
    'description', locked.description,
    'status', locked.status,
    'starts_at', locked.starts_at,
    'ends_at', locked.ends_at,
    'time_zone', locked.time_zone,
    'location_name', locked.location_name,
    'location_address', locked.location_address,
    'max_participants', locked.max_participants,
    'confirmed_count', private.confirmed_count(locked.id),
    'open_spots', locked.max_participants - private.confirmed_count(locked.id),
    'sport_id', sports.id,
    'sport_name', sports.name,
    'sport_format_id', sport_formats.id,
    'format_name', sport_formats.name,
    'scoring_rule_version_id', rules.id,
    'rule', jsonb_build_object(
      'id', rules.id,
      'version', rules.version,
      'rule_type', rules.rule_type,
      'origin', rules.origin,
      'config', rules.config
    ),
    'organizer_username', organizer.username,
    'is_organizer', locked.organizer_id = actor,
    'community_slug', communities.slug,
    'community_name', communities.name,
    'can_moderate', coalesce(
      locked.organizer_id = actor
      or private.active_community_role(locked.community_id, actor) in ('owner', 'admin'),
      false
    ),
    'my_participation', (
      select meetup_participants.status
      from public.meetup_participants
      where meetup_participants.meetup_id = locked.id
        and meetup_participants.user_id = actor
    ),
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object('username', profiles.username)
        order by parts.joined_at
      )
      from public.meetup_participants as parts
      join public.profiles on profiles.id = parts.user_id
      where parts.meetup_id = locked.id
        and parts.status = 'confirmed'
    ), '[]'::jsonb),
    'my_invitation', (
      select jsonb_build_object(
        'id', meetup_invitations.id,
        'status', meetup_invitations.status
      )
      from public.meetup_invitations
      where meetup_invitations.meetup_id = locked.id
        and meetup_invitations.invitee_id = actor
    ),
    'invitations', case
      when locked.organizer_id = actor then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', invitations.id,
            'username', profiles.username,
            'status', invitations.status
          )
          order by invitations.created_at
        )
        from public.meetup_invitations as invitations
        join public.profiles on profiles.id = invitations.invitee_id
        where invitations.meetup_id = locked.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  into payload
  from public.sport_formats
  join public.sports on sports.id = sport_formats.sport_id
  join public.scoring_rule_versions as rules
    on rules.id = locked.scoring_rule_version_id
  join public.profiles as organizer
    on organizer.id = locked.organizer_id
  left join public.communities
    on communities.id = locked.community_id
  where sport_formats.id = locked.sport_format_id;

  return payload;
end;
$$;

create or replace function private.meetup_participant_statistics(p_meetup_id uuid)
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
  if not private.can_read_meetup(p_meetup_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.meetup_participants
    where meetup_participants.meetup_id = p_meetup_id
      and meetup_participants.user_id = actor
      and meetup_participants.status = 'confirmed'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'participants',
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', participants.user_id,
        'username', profiles.username,
        'sports', (private.aggregate_statistics(participants.user_id) -> 'sports')
      ) order by profiles.username)
      from public.meetup_participants as participants
      join public.profiles on profiles.id = participants.user_id
      where participants.meetup_id = p_meetup_id
        and participants.status = 'confirmed'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.meetup_player_relationships(
  p_meetup_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  player_name text;
  peers uuid[];
  sport record;
  teammates jsonb;
  opponents jsonb;
  sports jsonb := '[]'::jsonb;
begin
  actor := private.require_actor();
  if not private.can_read_meetup(p_meetup_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.meetup_participants
    where meetup_participants.meetup_id = p_meetup_id
      and meetup_participants.user_id = actor
      and meetup_participants.status = 'confirmed'
  ) or not exists (
    select 1
    from public.meetup_participants
    where meetup_participants.meetup_id = p_meetup_id
      and meetup_participants.user_id = p_player_id
      and meetup_participants.status = 'confirmed'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select profiles.username into player_name
  from public.profiles
  where profiles.id = p_player_id;

  select coalesce(pg_catalog.array_agg(participants.user_id), '{}'::uuid[])
  into peers
  from public.meetup_participants as participants
  where participants.meetup_id = p_meetup_id
    and participants.status = 'confirmed'
    and participants.user_id <> p_player_id;

  for sport in
    select sports_table.id as sport_id, sports_table.name as sport_name
    from public.sports as sports_table
    where exists (
      select 1
      from public.match_player_statistics as stats
      where stats.user_id = p_player_id
        and stats.sport_id = sports_table.id
    )
    order by sports_table.name, sports_table.id
  loop
    teammates := private.list_relationships(
      p_player_id, sport.sport_id, null, 'teammate', 64, 0, peers
    ) -> 'relationships';
    opponents := private.list_relationships(
      p_player_id, sport.sport_id, null, 'opponent', 64, 0, peers
    ) -> 'relationships';
    if teammates = '[]'::jsonb and opponents = '[]'::jsonb then
      continue;
    end if;
    sports := sports || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sport_id', sport.sport_id,
        'sport_name', sport.sport_name,
        'teammates', teammates,
        'opponents', opponents,
        'highlights', private.relationship_highlights(
          p_player_id, sport.sport_id, null, peers
        )
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'player', pg_catalog.jsonb_build_object(
      'user_id', p_player_id,
      'username', player_name
    ),
    'sports', sports
  );
end;
$$;

create function public.create_community_meetup(
  community_slug text,
  sport_format_id uuid,
  scoring_rule_version_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  location_name text,
  location_address text,
  max_participants integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_community_meetup(
    community_slug,
    sport_format_id,
    scoring_rule_version_id,
    title,
    description,
    starts_at,
    ends_at,
    time_zone,
    location_name,
    location_address,
    max_participants
  );
$$;

create function public.list_community_meetups(
  community_slug text,
  result_limit integer,
  result_offset integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_community_meetups(
    community_slug,
    result_limit,
    result_offset
  );
$$;

create function public.join_community_meetup(meetup_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.join_community_meetup(meetup_id);
$$;

revoke all on function private.reject_community_meetup_invite(uuid) from public, anon, authenticated;
revoke all on function private.reject_community_meetup_invite_row() from public, anon, authenticated;
revoke all on function private.assert_community_sport(uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function private.list_community_meetups(text, integer, integer) from public, anon, authenticated;
revoke all on function private.join_community_meetup(uuid) from public, anon, authenticated;
revoke all on function private.release_future_community_seats(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.assert_no_future_organized_meetup(uuid, uuid) from public, anon, authenticated;

grant execute on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) to authenticated;
grant execute on function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function private.list_community_meetups(text, integer, integer) to authenticated;
grant execute on function private.join_community_meetup(uuid) to authenticated;

revoke all on function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.list_community_meetups(text, integer, integer) from public, anon, authenticated;
revoke all on function public.join_community_meetup(uuid) from public, anon, authenticated;

grant execute on function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function public.list_community_meetups(text, integer, integer) to authenticated;
grant execute on function public.join_community_meetup(uuid) to authenticated;
