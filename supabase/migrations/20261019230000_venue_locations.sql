-- Posição geográfica opcional dos locais e snapshot do encontro.
-- A posição de um local entra uma vez e não muda.
-- O encontro guarda a própria cópia e não acompanha o cadastro depois.

alter table public.venues
  add column location_set_at timestamptz,
  add column location_set_by uuid;

select pg_catalog.set_config('padre.venue_write', 'on', true);

update public.venues
set location_set_at = updated_at,
    location_set_by = created_by
where latitude is not null
  and longitude is not null
  and created_by is not null
  and location_set_at is null;

select pg_catalog.set_config('padre.venue_write', 'off', true);

alter table public.venues
  add constraint venues_location_audit_check check (
    (
      latitude is null
      and longitude is null
      and location_set_at is null
      and location_set_by is null
    )
    or (
      latitude is not null
      and longitude is not null
      and location_set_at is not null
      and location_set_by is not null
    )
  );

alter table public.meetups
  add column location_latitude numeric(9, 6),
  add column location_longitude numeric(9, 6),
  add constraint meetups_coordinates_check check (
    (
      location_latitude is null
      and location_longitude is null
    )
    or (
      location_latitude between -90 and 90
      and location_longitude between -180 and 180
    )
  );

create or replace function private.protect_venue_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.venue_write', true) = 'on' then
    if tg_op = 'INSERT' then
      if new.latitude is not null or new.longitude is not null then
        perform private.assert_coordinates(new.latitude, new.longitude);
        new.location_set_at := pg_catalog.statement_timestamp();
        new.location_set_by := new.created_by;
      end if;
      return new;
    end if;

    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id
        or new.created_by is distinct from old.created_by
        or new.community_id is distinct from old.community_id
        or new.address is distinct from old.address
        or new.created_at is distinct from old.created_at then
        raise exception 'venue identity is protected' using errcode = '42501';
      end if;

      if old.latitude is null
        and old.longitude is null
        and new.latitude is not null
        and new.longitude is not null then
        perform private.assert_coordinates(new.latitude, new.longitude);
        if new.location_set_at is null
          or new.location_set_by is null
          or new.location_set_by::text
            is distinct from pg_catalog.current_setting('request.jwt.claim.sub', true) then
          raise exception 'venue identity is protected' using errcode = '42501';
        end if;
      elsif new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
        or new.location_set_at is distinct from old.location_set_at
        or new.location_set_by is distinct from old.location_set_by then
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
    and new.location_set_at is not distinct from old.location_set_at
    and new.location_set_by is not distinct from old.location_set_by
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

create or replace function private.venue_json(p_venue public.venues)
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
    'location_set_at', p_venue.location_set_at,
    'status', p_venue.status,
    'scope', case
      when p_venue.community_id is null then 'personal'
      else 'community'
    end,
    'created_at', p_venue.created_at,
    'updated_at', p_venue.updated_at
  );
$$;

create function private.set_venue_location(
  p_venue_id uuid,
  p_latitude numeric,
  p_longitude numeric
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
  perform private.assert_coordinates(p_latitude, p_longitude);
  if p_latitude is null or p_longitude is null then
    raise exception 'invalid coordinates' using errcode = 'P0001';
  end if;

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
  if found.latitude is not null or found.longitude is not null then
    raise exception 'location already set' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.venue_write', 'on', true);
  update public.venues
  set latitude = p_latitude,
      longitude = p_longitude,
      location_set_at = pg_catalog.statement_timestamp(),
      location_set_by = actor
  where id = found.id
  returning * into found;
  perform pg_catalog.set_config('padre.venue_write', 'off', true);
  return private.venue_json(found);
end;
$$;

drop function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid);
drop function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid);
drop function public.set_meetup_place(uuid, uuid, text, text, text);
drop function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid);
drop function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, uuid);
drop function private.set_meetup_place(uuid, uuid, text, text, text);

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
  p_venue_id uuid default null,
  p_latitude numeric default null,
  p_longitude numeric default null
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
  place_latitude numeric;
  place_longitude numeric;
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
    perform private.assert_coordinates(p_latitude, p_longitude);
    place_latitude := p_latitude;
    place_longitude := p_longitude;
  else
    chosen := private.lock_usable_venue(p_venue_id, actor, p_community_id);
    place_name := chosen.name;
    place_address := chosen.address;
    place_details := chosen.details;
    place_latitude := chosen.latitude;
    place_longitude := chosen.longitude;
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  insert into public.meetups (
    organizer_id, community_id, sport_format_id, scoring_rule_version_id,
    title, description, starts_at, ends_at, time_zone,
    location_name, location_address, location_details, venue_id,
    location_latitude, location_longitude,
    max_participants, status
  ) values (
    actor, p_community_id, p_sport_format_id, p_scoring_rule_version_id,
    private.bounded_text(p_title, 1, 80, true),
    private.bounded_text(p_description, 1, 500, false),
    p_starts_at, p_ends_at, p_time_zone,
    place_name, place_address, place_details, p_venue_id,
    place_latitude, place_longitude,
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
  p_venue_id uuid default null,
  p_latitude numeric default null,
  p_longitude numeric default null
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
    p_max_participants, found.id, p_venue_id, p_latitude, p_longitude
  );
end;
$$;

create function private.set_meetup_place(
  p_meetup_id uuid,
  p_venue_id uuid,
  p_location_name text,
  p_location_address text,
  p_location_details text,
  p_latitude numeric default null,
  p_longitude numeric default null
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
  place_latitude numeric;
  place_longitude numeric;
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
    perform private.assert_coordinates(p_latitude, p_longitude);
    place_latitude := p_latitude;
    place_longitude := p_longitude;
  else
    chosen := private.lock_usable_venue(p_venue_id, actor, locked.community_id);
    place_name := chosen.name;
    place_address := chosen.address;
    place_details := chosen.details;
    place_latitude := chosen.latitude;
    place_longitude := chosen.longitude;
  end if;

  perform pg_catalog.set_config('padre.meetup_write', 'on', true);
  update public.meetups
  set venue_id = p_venue_id,
      location_name = place_name,
      location_address = place_address,
      location_details = place_details,
      location_latitude = place_latitude,
      location_longitude = place_longitude
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
    'location_latitude', locked.location_latitude,
    'location_longitude', locked.location_longitude,
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

create function public.set_venue_location(
  venue_id uuid,
  latitude numeric,
  longitude numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_venue_location(venue_id, latitude, longitude);
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
  venue_id uuid default null,
  location_latitude numeric default null,
  location_longitude numeric default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_meetup(
    sport_format_id, scoring_rule_version_id, title, description,
    starts_at, ends_at, time_zone, location_name, location_address,
    max_participants, null, venue_id, location_latitude, location_longitude
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
  venue_id uuid default null,
  location_latitude numeric default null,
  location_longitude numeric default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_community_meetup(
    community_slug, sport_format_id, scoring_rule_version_id, title, description,
    starts_at, ends_at, time_zone, location_name, location_address,
    max_participants, venue_id, location_latitude, location_longitude
  );
$$;

create function public.set_meetup_place(
  meetup_id uuid,
  venue_id uuid,
  location_name text,
  location_address text,
  location_details text,
  location_latitude numeric default null,
  location_longitude numeric default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.set_meetup_place(
    meetup_id, venue_id, location_name, location_address, location_details,
    location_latitude, location_longitude
  );
$$;

revoke all on function private.set_venue_location(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function private.set_meetup_place(uuid, uuid, text, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.set_venue_location(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.set_meetup_place(uuid, uuid, text, text, text, numeric, numeric) from public, anon, authenticated;

grant execute on function private.set_venue_location(uuid, numeric, numeric) to authenticated;
grant execute on function private.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, uuid, numeric, numeric) to authenticated;
grant execute on function private.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, numeric, numeric) to authenticated;
grant execute on function private.set_meetup_place(uuid, uuid, text, text, text, numeric, numeric) to authenticated;
grant execute on function public.set_venue_location(uuid, numeric, numeric) to authenticated;
grant execute on function public.create_meetup(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, numeric, numeric) to authenticated;
grant execute on function public.create_community_meetup(text, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, integer, uuid, numeric, numeric) to authenticated;
grant execute on function public.set_meetup_place(uuid, uuid, text, text, text, numeric, numeric) to authenticated;
