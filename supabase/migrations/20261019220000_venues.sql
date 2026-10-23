-- Locais reutilizáveis. O nome não identifica o lugar.
-- O encontro guarda venue_id e uma cópia do nome, endereço e detalhes.
-- Mudar o cadastro depois não reescreve o encontro.
-- Sem mapa, sem geocodificação e sem local público global.

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  community_id uuid references public.communities (id) on delete restrict,
  name text not null,
  address text not null,
  details text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  status text not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint venues_name_check check (
    char_length(name) between 2 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint venues_address_check check (
    char_length(address) between 1 and 200
    and address !~ '[[:cntrl:]]'
  ),
  constraint venues_details_check check (
    details is null
    or (
      char_length(details) between 1 and 500
      and details !~ '[[:cntrl:]]'
    )
  ),
  constraint venues_status_check check (status in ('active', 'archived')),
  constraint venues_coordinates_check check (
    (
      latitude is null
      and longitude is null
    )
    or (
      latitude between -90 and 90
      and longitude between -180 and 180
    )
  )
);

create index venues_owner_idx
  on public.venues (created_by, created_at desc)
  where community_id is null;

create index venues_community_idx
  on public.venues (community_id, created_at desc)
  where community_id is not null;

alter table public.meetups
  add column venue_id uuid references public.venues (id) on delete restrict,
  add column location_details text,
  add constraint meetups_location_details_check check (
    location_details is null
    or (
      char_length(location_details) between 1 and 500
      and location_details !~ '[[:cntrl:]]'
    )
  );

create index meetups_venue_idx
  on public.meetups (venue_id, starts_at desc)
  where venue_id is not null;

alter table public.venues enable row level security;
alter table public.venues force row level security;
revoke all on table public.venues from public, anon, authenticated;

create function private.venue_text(
  p_value text,
  p_minimum integer,
  p_maximum integer,
  p_required boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
begin
  cleaned := nullif(pg_catalog.btrim(p_value), '');
  if cleaned is null then
    if p_required then
      raise exception 'invalid venue' using errcode = 'P0001';
    end if;
    return null;
  end if;
  if pg_catalog.char_length(cleaned) < p_minimum
    or pg_catalog.char_length(cleaned) > p_maximum
    or cleaned ~ '[[:cntrl:]]' then
    raise exception 'invalid venue' using errcode = 'P0001';
  end if;
  return cleaned;
end;
$$;

create function private.assert_coordinates(
  p_latitude numeric,
  p_longitude numeric
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_latitude is null and p_longitude is null then
    return;
  end if;
  if p_latitude is null
    or p_longitude is null
    or p_latitude < -90
    or p_latitude > 90
    or p_longitude < -180
    or p_longitude > 180 then
    raise exception 'invalid coordinates' using errcode = 'P0001';
  end if;
end;
$$;

create function private.protect_venue_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.venue_write', true) = 'on' then
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id
        or new.created_by is distinct from old.created_by
        or new.community_id is distinct from old.community_id
        or new.address is distinct from old.address
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
        or new.created_at is distinct from old.created_at then
        raise exception 'venue identity is protected' using errcode = '42501';
      end if;
      if old.status = 'archived' and new.status is distinct from 'archived' then
        raise exception 'venue archived' using errcode = 'P0001';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
    and old.created_by is not null
    and new.created_by is null
    and new.id is not distinct from old.id
    and new.community_id is not distinct from old.community_id
    and new.name is not distinct from old.name
    and new.address is not distinct from old.address
    and new.details is not distinct from old.details
    and new.latitude is not distinct from old.latitude
    and new.longitude is not distinct from old.longitude
    and new.status is not distinct from old.status
    and new.created_at is not distinct from old.created_at
    and new.updated_at is not distinct from old.updated_at then
    return new;
  end if;

  if tg_op = 'DELETE' and session_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct venue writes are not allowed' using errcode = '42501';
end;
$$;

create trigger venues_protect
  before insert or update or delete on public.venues
  for each row execute function private.protect_venue_write();

create function private.venue_json(p_venue public.venues)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_venue.id,
    'name', p_venue.name,
    'address', p_venue.address,
    'details', p_venue.details,
    'latitude', p_venue.latitude,
    'longitude', p_venue.longitude,
    'status', p_venue.status,
    'scope', case
      when p_venue.community_id is null then 'personal'
      else 'community'
    end,
    'created_at', p_venue.created_at,
    'updated_at', p_venue.updated_at
  );
$$;

create function private.lock_usable_venue(
  p_venue_id uuid,
  p_actor uuid,
  p_community_id uuid
)
returns public.venues
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.venues%rowtype;
begin
  select * into found
  from public.venues
  where id = p_venue_id
  for update;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if found.status <> 'active' then
    raise exception 'venue archived' using errcode = 'P0001';
  end if;
  if p_community_id is null then
    if found.community_id is not null or found.created_by is distinct from p_actor then
      raise exception 'not found' using errcode = 'P0001';
    end if;
  elsif found.community_id is distinct from p_community_id
    or private.active_community_role(p_community_id, p_actor) is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  return found;
end;
$$;

create function private.create_venue(
  p_name text,
  p_address text,
  p_details text,
  p_latitude numeric,
  p_longitude numeric,
  p_community_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  community public.communities%rowtype;
  role text;
  created public.venues%rowtype;
begin
  actor := private.require_actor();
  perform private.assert_coordinates(p_latitude, p_longitude);
  if p_community_slug is not null and pg_catalog.btrim(p_community_slug) <> '' then
    community := private.lock_community(p_community_slug);
    select member.role into role
    from public.community_members member
    where member.community_id = community.id
      and member.user_id = actor
      and member.status = 'active'
    for update;
    if role is null or role not in ('owner', 'admin') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;

  perform pg_catalog.set_config('padre.venue_write', 'on', true);
  insert into public.venues (
    created_by, community_id, name, address, details, latitude, longitude, status
  ) values (
    actor,
    community.id,
    private.venue_text(p_name, 2, 80, true),
    private.venue_text(p_address, 1, 200, true),
    private.venue_text(p_details, 1, 500, false),
    p_latitude,
    p_longitude,
    'active'
  )
  returning * into created;
  perform pg_catalog.set_config('padre.venue_write', 'off', true);
  return private.venue_json(created);
end;
$$;

create function private.update_venue(
  p_venue_id uuid,
  p_name text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.venues%rowtype;
  role text;
begin
  actor := private.require_actor();
  select * into found from public.venues where id = p_venue_id for update;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if found.community_id is null then
    if found.created_by is distinct from actor then
      raise exception 'not found' using errcode = 'P0001';
    end if;
  else
    role := private.active_community_role(found.community_id, actor);
    if role is null then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    if role not in ('owner', 'admin') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  if found.status <> 'active' then
    raise exception 'venue archived' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.venue_write', 'on', true);
  update public.venues
  set name = private.venue_text(p_name, 2, 80, true),
      details = private.venue_text(p_details, 1, 500, false)
  where id = found.id
  returning * into found;
  perform pg_catalog.set_config('padre.venue_write', 'off', true);
  return private.venue_json(found);
end;
$$;

create function private.archive_venue(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.venues%rowtype;
  role text;
begin
  actor := private.require_actor();
  select * into found from public.venues where id = p_venue_id for update;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if found.community_id is null then
    if found.created_by is distinct from actor then
      raise exception 'not found' using errcode = 'P0001';
    end if;
  else
    role := private.active_community_role(found.community_id, actor);
    if role is null then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    if role not in ('owner', 'admin') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  if found.status = 'archived' then
    return private.venue_json(found);
  end if;

  perform pg_catalog.set_config('padre.venue_write', 'on', true);
  update public.venues set status = 'archived' where id = found.id returning * into found;
  perform pg_catalog.set_config('padre.venue_write', 'off', true);
  return private.venue_json(found);
end;
$$;

create function private.list_my_venues()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  actor := private.require_actor();
  return coalesce((
    select pg_catalog.jsonb_agg(private.venue_json(venue) order by venue.created_at desc)
    from public.venues venue
    where venue.created_by = actor
      and venue.community_id is null
  ), '[]'::jsonb);
end;
$$;

create function private.list_community_venues(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  community public.communities%rowtype;
  role text;
begin
  actor := private.require_actor();
  select * into community from public.communities where slug = p_slug;
  if community.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  role := private.reject_private_stranger(community.id, community.visibility, actor);
  if role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(private.venue_json(venue) order by venue.created_at desc)
    from public.venues venue
    where venue.community_id = community.id
  ), '[]'::jsonb);
end;
$$;

create function private.list_venue_meetups(
  p_venue_id uuid,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.venues%rowtype;
  role text;
  rows jsonb;
  total integer;
begin
  actor := private.require_actor();
  if p_limit is null or p_limit < 1 or p_limit > 20
    or p_offset is null or p_offset < 0 then
    raise exception 'invalid page' using errcode = 'P0001';
  end if;
  select * into found from public.venues where id = p_venue_id;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if found.community_id is null then
    if found.created_by is distinct from actor then
      raise exception 'not found' using errcode = 'P0001';
    end if;
  else
    role := private.active_community_role(found.community_id, actor);
    if role is null then
      raise exception 'not found' using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer into total
  from public.meetups meetup
  where meetup.venue_id = found.id
    and private.can_read_meetup(meetup.id);

  select coalesce(pg_catalog.jsonb_agg(item.payload), '[]'::jsonb) into rows
  from (
    select pg_catalog.jsonb_build_object(
      'id', meetup.id,
      'title', meetup.title,
      'status', meetup.status,
      'starts_at', meetup.starts_at,
      'location_name', meetup.location_name,
      'location_address', meetup.location_address
    ) as payload
    from public.meetups meetup
    where meetup.venue_id = found.id
      and private.can_read_meetup(meetup.id)
    order by meetup.starts_at desc, meetup.id
    limit p_limit offset p_offset
  ) item;

  return pg_catalog.jsonb_build_object(
    'meetups', rows,
    'total', total
  );
end;
$$;

drop function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer);
drop function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer);
drop function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer);
drop function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid);

create function private.create_meetup(
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
  p_community_id uuid default null,
  p_venue_id uuid default null
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
  chosen public.venues%rowtype;
  place_name text;
  place_address text;
  place_details text;
begin
  actor := private.require_actor();
  if p_max_participants is null
    or p_max_participants < 2
    or p_max_participants > 64 then
    raise exception 'invalid meetup field' using errcode = 'P0001';
  end if;

  perform private.assert_schedule(p_starts_at, p_ends_at, p_time_zone, true);
  perform private.assert_active_format(p_sport_format_id);
  perform private.assert_rule_for_format(p_scoring_rule_version_id, p_sport_format_id);

  if p_community_id is not null then
    select communities.id into community
    from public.communities
    where communities.id = p_community_id
    for update;
    if community is null then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    perform 1
    from public.community_members
    where community_members.community_id = community
      and community_members.user_id = actor
    for update;
    if private.active_community_role(community, actor) is null then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    perform private.assert_community_sport(community, p_sport_format_id);
  end if;

  if p_venue_id is null then
    place_name := private.bounded_text(p_location_name, 1, 120, true);
    place_address := private.bounded_text(p_location_address, 1, 200, false);
    place_details := null;
  else
    chosen := private.lock_usable_venue(p_venue_id, actor, p_community_id);
    place_name := chosen.name;
    place_address := chosen.address;
    place_details := chosen.details;
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetups (
    organizer_id, community_id, sport_format_id, scoring_rule_version_id,
    title, description, starts_at, ends_at, time_zone,
    location_name, location_address, location_details, venue_id,
    max_participants, status
  ) values (
    actor, p_community_id, p_sport_format_id, p_scoring_rule_version_id,
    private.bounded_text(p_title, 1, 80, true),
    private.bounded_text(p_description, 1, 500, false),
    p_starts_at, p_ends_at, p_time_zone,
    place_name, place_address, place_details, p_venue_id,
    p_max_participants, 'scheduled'
  )
  returning meetups.id into created_id;
  insert into public.meetup_participants (meetup_id, user_id, status)
  values (created_id, actor, 'confirmed');
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);
  return created_id;
end;
$$;

create function private.create_community_meetup(
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
  p_max_participants integer,
  p_venue_id uuid default null
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
  select * into found from public.communities where communities.slug = p_slug;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  actor_role := private.reject_private_stranger(found.id, found.visibility, actor);
  if actor_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.create_meetup(
    p_sport_format_id, p_scoring_rule_version_id, p_title, p_description,
    p_starts_at, p_ends_at, p_time_zone, p_location_name, p_location_address,
    p_max_participants, found.id, p_venue_id
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
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if locked.status <> 'scheduled' then
    raise exception 'meetup cancelled' using errcode = 'P0001';
  end if;
  if p_max_participants is null
    or p_max_participants < 2
    or p_max_participants > 64 then
    raise exception 'invalid meetup field' using errcode = 'P0001';
  end if;
  if p_max_participants < private.confirmed_count(locked.id) then
    raise exception 'capacity below confirmed' using errcode = 'P0001';
  end if;

  structural := p_sport_format_id is distinct from locked.sport_format_id
    or p_scoring_rule_version_id is distinct from locked.scoring_rule_version_id
    or date_trunc('milliseconds', p_starts_at) is distinct from date_trunc('milliseconds', locked.starts_at)
    or date_trunc('milliseconds', p_ends_at) is distinct from date_trunc('milliseconds', locked.ends_at)
    or p_time_zone is distinct from locked.time_zone;

  if structural and private.confirmed_count(locked.id) > 1 then
    raise exception 'structural change locked' using errcode = 'P0001';
  end if;

  perform private.assert_schedule(p_starts_at, p_ends_at, p_time_zone, structural);
  if structural then
    perform private.assert_active_format(p_sport_format_id);
    perform private.assert_rule_for_format(p_scoring_rule_version_id, p_sport_format_id);
    if locked.community_id is not null then
      perform private.assert_community_sport(locked.community_id, p_sport_format_id);
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
      max_participants = p_max_participants
  where meetups.id = locked.id;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);
  return locked.id;
end;
$$;

create function private.set_meetup_place(
  p_meetup_id uuid,
  p_venue_id uuid,
  p_location_name text,
  p_location_address text,
  p_location_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.meetups%rowtype;
  chosen public.venues%rowtype;
  place_name text;
  place_address text;
  place_details text;
begin
  actor := private.require_actor();
  locked := private.lock_meetup(p_meetup_id);
  if locked.organizer_id <> actor then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if locked.status <> 'scheduled' then
    raise exception 'meetup cancelled' using errcode = 'P0001';
  end if;
  if private.confirmed_count(locked.id) > 1 then
    raise exception 'structural change locked' using errcode = 'P0001';
  end if;

  if p_venue_id is null then
    place_name := private.bounded_text(p_location_name, 1, 120, true);
    place_address := private.bounded_text(p_location_address, 1, 200, false);
    place_details := private.venue_text(p_location_details, 1, 500, false);
  else
    chosen := private.lock_usable_venue(p_venue_id, actor, locked.community_id);
    place_name := chosen.name;
    place_address := chosen.address;
    place_details := chosen.details;
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetups
  set venue_id = p_venue_id,
      location_name = place_name,
      location_address = place_address,
      location_details = place_details
  where meetups.id = locked.id;
  perform pg_catalog.set_config('padre.meetup_write', 'off', true);
  return locked.id;
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
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into locked from public.meetups where meetups.id = p_meetup_id;

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
    'location_details', locked.location_details,
    'venue_id', locked.venue_id,
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

create function public.create_venue(
  name text,
  address text,
  details text,
  latitude numeric,
  longitude numeric,
  community_slug text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_venue(name, address, details, latitude, longitude, community_slug);
$$;

create function public.update_venue(venue_id uuid, name text, details text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_venue(venue_id, name, details);
$$;

create function public.archive_venue(venue_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.archive_venue(venue_id);
$$;

create function public.list_my_venues()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_my_venues();
$$;

create function public.list_community_venues(slug text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_community_venues(slug);
$$;

create function public.list_venue_meetups(
  venue_id uuid,
  result_limit integer,
  result_offset integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_venue_meetups(venue_id, result_limit, result_offset);
$$;

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
  max_participants integer,
  venue_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_meetup(
    sport_format_id, scoring_rule_version_id, title, description,
    starts_at, ends_at, time_zone, location_name, location_address,
    max_participants, null, venue_id
  );
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
  max_participants integer,
  venue_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_community_meetup(
    community_slug, sport_format_id, scoring_rule_version_id, title, description,
    starts_at, ends_at, time_zone, location_name, location_address,
    max_participants, venue_id
  );
$$;

create function public.set_meetup_place(
  meetup_id uuid,
  venue_id uuid,
  location_name text,
  location_address text,
  location_details text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.set_meetup_place(
    meetup_id, venue_id, location_name, location_address, location_details
  );
$$;

revoke all on function private.venue_text(text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function private.assert_coordinates(numeric, numeric) from public, anon, authenticated;
revoke all on function private.protect_venue_write() from public, anon, authenticated;
revoke all on function private.venue_json(public.venues) from public, anon, authenticated;
revoke all on function private.lock_usable_venue(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_venue(text, text, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function private.update_venue(uuid, text, text) from public, anon, authenticated;
revoke all on function private.archive_venue(uuid) from public, anon, authenticated;
revoke all on function private.list_my_venues() from public, anon, authenticated;
revoke all on function private.list_community_venues(text) from public, anon, authenticated;
revoke all on function private.list_venue_meetups(uuid, integer, integer) from public, anon, authenticated;
revoke all on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function private.set_meetup_place(uuid, uuid, text, text, text) from public, anon, authenticated;

revoke all on function public.create_venue(text, text, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.update_venue(uuid, text, text) from public, anon, authenticated;
revoke all on function public.archive_venue(uuid) from public, anon, authenticated;
revoke all on function public.list_my_venues() from public, anon, authenticated;
revoke all on function public.list_community_venues(text) from public, anon, authenticated;
revoke all on function public.list_venue_meetups(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.set_meetup_place(uuid, uuid, text, text, text) from public, anon, authenticated;

grant execute on function private.create_venue(text, text, text, numeric, numeric, text) to authenticated;
grant execute on function private.update_venue(uuid, text, text) to authenticated;
grant execute on function private.archive_venue(uuid) to authenticated;
grant execute on function private.list_my_venues() to authenticated;
grant execute on function private.list_community_venues(text) to authenticated;
grant execute on function private.list_venue_meetups(uuid, integer, integer) to authenticated;
grant execute on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, uuid) to authenticated;
grant execute on function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) to authenticated;
grant execute on function private.set_meetup_place(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.create_venue(text, text, text, numeric, numeric, text) to authenticated;
grant execute on function public.update_venue(uuid, text, text) to authenticated;
grant execute on function public.archive_venue(uuid) to authenticated;
grant execute on function public.list_my_venues() to authenticated;
grant execute on function public.list_community_venues(text) to authenticated;
grant execute on function public.list_venue_meetups(uuid, integer, integer) to authenticated;
grant execute on function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) to authenticated;
grant execute on function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid) to authenticated;
grant execute on function public.set_meetup_place(uuid, uuid, text, text, text) to authenticated;
