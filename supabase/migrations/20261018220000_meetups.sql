-- Encontros privados, com convite entre amigos.
-- A vaga só muda dentro destas funções, com a linha do encontro travada.
-- completed fica para uma migration futura e não é preenchido sozinho.
-- Convite por link, local geográfico, comunidade e partida também ficam fora.
-- Quem saiu não volta nesta versão. A reentrada futura reabre a mesma linha
-- de participação, de novo com a trava de capacidade.

create or replace function private.bounded_text(
  value text,
  minimum integer,
  maximum integer,
  required boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
begin
  cleaned := nullif(btrim(value), '');
  if cleaned is null then
    if required then
      raise exception 'invalid meetup field'
        using errcode = 'P0001';
    end if;
    return null;
  end if;

  if char_length(cleaned) < minimum
    or char_length(cleaned) > maximum
    or cleaned ~ '[[:cntrl:]]' then
    raise exception 'invalid meetup field'
      using errcode = 'P0001';
  end if;

  return cleaned;
end;
$$;

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

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  sport_format_id uuid not null references public.sport_formats (id) on delete restrict,
  scoring_rule_version_id uuid not null references public.scoring_rule_versions (id) on delete restrict,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null,
  location_name text not null,
  location_address text,
  max_participants integer not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint meetups_status_check check (status in ('scheduled', 'cancelled')),
  constraint meetups_capacity_check check (max_participants between 2 and 64),
  constraint meetups_schedule_check check (
    ends_at > starts_at
    and ends_at <= starts_at + interval '24 hours'
  ),
  constraint meetups_title_check check (
    char_length(title) between 1 and 80
    and title !~ '[[:cntrl:]]'
  ),
  constraint meetups_description_check check (
    description is null
    or (
      char_length(description) between 1 and 500
      and description !~ '[[:cntrl:]]'
    )
  ),
  constraint meetups_location_name_check check (
    char_length(location_name) between 1 and 120
    and location_name !~ '[[:cntrl:]]'
  ),
  constraint meetups_location_address_check check (
    location_address is null
    or (
      char_length(location_address) between 1 and 200
      and location_address !~ '[[:cntrl:]]'
    )
  ),
  constraint meetups_time_zone_check check (private.is_iana_time_zone(time_zone))
);

create table public.meetup_participants (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  joined_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint meetup_participants_status_check check (
    status in ('confirmed', 'left', 'removed')
  ),
  constraint meetup_participants_unique unique (meetup_id, user_id)
);

create table public.meetup_invitations (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  responded_at timestamptz,
  constraint meetup_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint meetup_invitations_not_self check (inviter_id <> invitee_id),
  constraint meetup_invitations_unique unique (meetup_id, invitee_id)
);

create index meetups_organizer_idx on public.meetups (organizer_id);
create index meetup_participants_meetup_idx on public.meetup_participants (meetup_id);
create index meetup_invitations_invitee_idx on public.meetup_invitations (invitee_id);

create trigger meetups_protect_write
before insert or update or delete on public.meetups
for each row
execute function private.protect_meetup_write();

create trigger meetup_participants_protect_write
before insert or update or delete on public.meetup_participants
for each row
execute function private.protect_meetup_write();

create trigger meetup_invitations_protect_write
before insert or update or delete on public.meetup_invitations
for each row
execute function private.protect_meetup_write();

alter table public.meetups enable row level security;
alter table public.meetups force row level security;
alter table public.meetup_participants enable row level security;
alter table public.meetup_participants force row level security;
alter table public.meetup_invitations enable row level security;
alter table public.meetup_invitations force row level security;

create or replace function private.can_read_meetup(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meetups
    where meetups.id = target
      and meetups.organizer_id = auth.uid()
  )
  or exists (
    select 1
    from public.meetup_participants
    where meetup_participants.meetup_id = target
      and meetup_participants.user_id = auth.uid()
      and meetup_participants.status = 'confirmed'
  )
  or exists (
    select 1
    from public.meetup_invitations
    where meetup_invitations.meetup_id = target
      and meetup_invitations.invitee_id = auth.uid()
      and meetup_invitations.status = 'pending'
  );
$$;

create policy meetups_select_involved
on public.meetups
for select
to authenticated
using (private.can_read_meetup(id));

create policy meetup_participants_select_involved
on public.meetup_participants
for select
to authenticated
using (private.can_read_meetup(meetup_id));

create policy meetup_invitations_select_own
on public.meetup_invitations
for select
to authenticated
using (
  invitee_id = (select auth.uid())
  or exists (
    select 1
    from public.meetups
    where meetups.id = meetup_invitations.meetup_id
      and meetups.organizer_id = (select auth.uid())
  )
);

revoke all on table public.meetups from public, anon, authenticated;
revoke all on table public.meetup_participants from public, anon, authenticated;
revoke all on table public.meetup_invitations from public, anon, authenticated;

grant select (
  id,
  organizer_id,
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
  status,
  created_at,
  updated_at
) on table public.meetups to authenticated;

grant select (
  id,
  meetup_id,
  user_id,
  status,
  joined_at,
  updated_at
) on table public.meetup_participants to authenticated;

grant select (
  id,
  meetup_id,
  inviter_id,
  invitee_id,
  status,
  created_at,
  responded_at
) on table public.meetup_invitations to authenticated;

create or replace function private.lock_meetup(target uuid)
returns public.meetups
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.meetups%rowtype;
begin
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

create or replace function private.confirmed_count(target uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.meetup_participants
  where meetup_participants.meetup_id = target
    and meetup_participants.status = 'confirmed';
$$;

create or replace function private.require_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function private.assert_schedule(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text,
  p_must_be_future boolean
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_starts_at is null
    or p_ends_at is null
    or p_ends_at <= p_starts_at
    or p_ends_at > p_starts_at + interval '24 hours'
    or p_time_zone is null
    or not private.is_iana_time_zone(p_time_zone)
    or (p_must_be_future and p_starts_at <= pg_catalog.now()) then
    raise exception 'invalid meetup schedule'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.assert_active_format(p_sport_format_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sport_formats
    join public.sports on sports.id = sport_formats.sport_id
    where sport_formats.id = p_sport_format_id
      and sport_formats.active
      and sports.active
  ) then
    raise exception 'sport format not found'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.assert_rule_for_format(
  p_rule_id uuid,
  p_sport_format_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.scoring_rule_versions
    where scoring_rule_versions.id = p_rule_id
      and scoring_rule_versions.format_id = p_sport_format_id
  ) then
    raise exception 'scoring rule does not match format'
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
  p_max_participants integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  created_id uuid;
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

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetups (
    organizer_id,
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
begin
  actor := private.require_actor();
  locked := private.lock_meetup(p_meetup_id);
  if locked.organizer_id <> actor then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;
  if locked.status = 'cancelled' then
    return 'cancelled';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetups
  set status = 'cancelled'
  where meetups.id = locked.id;

  update public.meetup_invitations
  set status = 'cancelled',
      responded_at = pg_catalog.now()
  where meetup_invitations.meetup_id = locked.id
    and meetup_invitations.status = 'pending';
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

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

create or replace function private.respond_to_meetup_invitation(
  p_invitation_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  invitation public.meetup_invitations%rowtype;
  locked public.meetups%rowtype;
  participation text;
begin
  actor := private.require_actor();
  if p_action not in ('accept', 'decline') then
    raise exception 'invalid invitation transition'
      using errcode = 'P0001';
  end if;

  select meetup_invitations.meetup_id
  into invitation.meetup_id
  from public.meetup_invitations
  where meetup_invitations.id = p_invitation_id
    and meetup_invitations.invitee_id = actor;

  if invitation.meetup_id is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  locked := private.lock_meetup(invitation.meetup_id);

  select *
  into invitation
  from public.meetup_invitations
  where meetup_invitations.id = p_invitation_id
  for update;

  if invitation.invitee_id <> actor then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  select meetup_participants.status
  into participation
  from public.meetup_participants
  where meetup_participants.meetup_id = locked.id
    and meetup_participants.user_id = actor
  for update;

  if invitation.status = 'accepted' and p_action = 'accept' then
    if participation = 'confirmed' then
      return 'accepted';
    end if;
    raise exception 'participation cannot be reopened'
      using errcode = 'P0001';
  end if;
  if invitation.status = 'declined' and p_action = 'decline' then
    return 'declined';
  end if;
  if locked.status <> 'scheduled' and p_action = 'accept' then
    raise exception 'meetup cancelled'
      using errcode = 'P0001';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'invalid invitation transition'
      using errcode = 'P0001';
  end if;

  if p_action = 'decline' then
    perform pg_catalog.set_config('padre.meetup_write', 'on', true);
    update public.meetup_invitations
    set status = 'declined',
        responded_at = pg_catalog.now()
    where meetup_invitations.id = invitation.id;
    perform pg_catalog.set_config('padre.meetup_write', 'off', true);
    return 'declined';
  end if;

  if locked.status <> 'scheduled' then
    raise exception 'meetup cancelled'
      using errcode = 'P0001';
  end if;
  if locked.starts_at <= pg_catalog.now() then
    raise exception 'meetup already started'
      using errcode = 'P0001';
  end if;
  if private.confirmed_count(locked.id) >= locked.max_participants then
    raise exception 'meetup is full'
      using errcode = 'P0001';
  end if;
  if participation is not null then
    raise exception 'participation cannot be reopened'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetup_participants (meetup_id, user_id, status)
  values (locked.id, actor, 'confirmed');
  update public.meetup_invitations
  set status = 'accepted',
      responded_at = pg_catalog.now()
  where meetup_invitations.id = invitation.id;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return 'accepted';
end;
$$;

create or replace function private.cancel_meetup_invitation(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  invitation public.meetup_invitations%rowtype;
  locked public.meetups%rowtype;
begin
  actor := private.require_actor();
  select meetup_invitations.meetup_id
  into invitation.meetup_id
  from public.meetup_invitations
  where meetup_invitations.id = p_invitation_id;

  if invitation.meetup_id is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  locked := private.lock_meetup(invitation.meetup_id);
  if locked.organizer_id <> actor then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  select *
  into invitation
  from public.meetup_invitations
  where meetup_invitations.id = p_invitation_id
  for update;

  if invitation.status = 'cancelled' then
    return 'cancelled';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'invalid invitation transition'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetup_invitations
  set status = 'cancelled',
      responded_at = pg_catalog.now()
  where meetup_invitations.id = invitation.id;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return 'cancelled';
end;
$$;

create or replace function private.leave_meetup(p_meetup_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.meetups%rowtype;
  participation text;
begin
  actor := private.require_actor();
  locked := private.lock_meetup(p_meetup_id);
  if locked.organizer_id = actor then
    raise exception 'organizer cannot leave'
      using errcode = 'P0001';
  end if;

  select meetup_participants.status
  into participation
  from public.meetup_participants
  where meetup_participants.meetup_id = locked.id
    and meetup_participants.user_id = actor
  for update;

  if participation = 'left' then
    return 'left';
  end if;
  if participation <> 'confirmed' then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetup_participants
  set status = 'left'
  where meetup_participants.meetup_id = locked.id
    and meetup_participants.user_id = actor;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);

  return 'left';
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
  where meetups.organizer_id = actor
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
  where sport_formats.id = locked.sport_format_id;

  return payload;
end;
$$;

revoke all on function private.bounded_text(text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function private.protect_meetup_write() from public, anon, authenticated;
revoke all on function private.can_read_meetup(uuid) from public, anon, authenticated;
revoke all on function private.lock_meetup(uuid) from public, anon, authenticated;
revoke all on function private.confirmed_count(uuid) from public, anon, authenticated;
revoke all on function private.require_actor() from public, anon, authenticated;
revoke all on function private.assert_schedule(timestamptz, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function private.assert_active_format(uuid) from public, anon, authenticated;
revoke all on function private.assert_rule_for_format(uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function private.update_meetup(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function private.cancel_meetup(uuid) from public, anon, authenticated;
revoke all on function private.invite_to_meetup(uuid, text) from public, anon, authenticated;
revoke all on function private.respond_to_meetup_invitation(uuid, text) from public, anon, authenticated;
revoke all on function private.cancel_meetup_invitation(uuid) from public, anon, authenticated;
revoke all on function private.leave_meetup(uuid) from public, anon, authenticated;
revoke all on function private.list_my_meetups() from public, anon, authenticated;
revoke all on function private.get_meetup(uuid) from public, anon, authenticated;

grant execute on function private.can_read_meetup(uuid) to authenticated;
grant execute on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function private.update_meetup(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function private.cancel_meetup(uuid) to authenticated;
grant execute on function private.invite_to_meetup(uuid, text) to authenticated;
grant execute on function private.respond_to_meetup_invitation(uuid, text) to authenticated;
grant execute on function private.cancel_meetup_invitation(uuid) to authenticated;
grant execute on function private.leave_meetup(uuid) to authenticated;
grant execute on function private.list_my_meetups() to authenticated;
grant execute on function private.get_meetup(uuid) to authenticated;

create function public.create_meetup(
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
    max_participants
  );
$$;

create function public.update_meetup(
  meetup_id uuid,
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
  select private.update_meetup(
    meetup_id,
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

create function public.cancel_meetup(meetup_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_meetup(meetup_id);
$$;

create function public.invite_to_meetup(meetup_id uuid, username text)
returns table (
  id uuid,
  status text,
  invitee_username text
)
language sql
security invoker
set search_path = ''
as $$
  select result.id, result.status, result.invitee_username
  from private.invite_to_meetup(meetup_id, username) as result;
$$;

create function public.respond_to_meetup_invitation(
  invitation_id uuid,
  action text
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.respond_to_meetup_invitation(invitation_id, action);
$$;

create function public.cancel_meetup_invitation(invitation_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_meetup_invitation(invitation_id);
$$;

create function public.leave_meetup(meetup_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.leave_meetup(meetup_id);
$$;

create function public.list_my_meetups()
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
language sql
security invoker
set search_path = ''
as $$
  select
    result.id,
    result.title,
    result.status,
    result.starts_at,
    result.ends_at,
    result.time_zone,
    result.location_name,
    result.sport_name,
    result.format_name,
    result.relation,
    result.confirmed_count,
    result.max_participants,
    result.invitation_id
  from private.list_my_meetups() as result;
$$;

create function public.get_meetup(meetup_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_meetup(meetup_id);
$$;

revoke all on function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.update_meetup(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.cancel_meetup(uuid) from public, anon, authenticated;
revoke all on function public.invite_to_meetup(uuid, text) from public, anon, authenticated;
revoke all on function public.respond_to_meetup_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_meetup_invitation(uuid) from public, anon, authenticated;
revoke all on function public.leave_meetup(uuid) from public, anon, authenticated;
revoke all on function public.list_my_meetups() from public, anon, authenticated;
revoke all on function public.get_meetup(uuid) from public, anon, authenticated;

grant execute on function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function public.update_meetup(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.invite_to_meetup(uuid, text) to authenticated;
grant execute on function public.respond_to_meetup_invitation(uuid, text) to authenticated;
grant execute on function public.cancel_meetup_invitation(uuid) to authenticated;
grant execute on function public.leave_meetup(uuid) to authenticated;
grant execute on function public.list_my_meetups() to authenticated;
grant execute on function public.get_meetup(uuid) to authenticated;
