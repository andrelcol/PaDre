-- Detalhes pessoais opcionais e cartinhas da comunidade.
-- A foto guarda só o caminho do objeto. Este ambiente local não tem Storage.
-- A cartinha é avaliação subjetiva. Não altera partida nem estatística.

create table public.profile_personal_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  height_cm integer,
  sex text,
  show_height boolean not null default false,
  show_sex boolean not null default false,
  show_avatar boolean not null default false,
  avatar_path text,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profile_personal_details_height_check check (
    height_cm is null or height_cm between 50 and 250
  ),
  constraint profile_personal_details_sex_check check (
    sex is null or sex in ('female', 'male', 'intersex')
  ),
  constraint profile_personal_details_avatar_check check (
    avatar_path is null
    or (
      char_length(avatar_path) between 1 and 200
      and avatar_path !~ '[[:cntrl:]/\\]'
    )
  )
);

alter table public.profile_personal_details enable row level security;
alter table public.profile_personal_details force row level security;
revoke all on table public.profile_personal_details from public, anon, authenticated;

create table public.community_card_templates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  version integer not null,
  status text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  published_at timestamptz,
  constraint community_card_templates_status_check check (
    status in ('draft', 'active', 'retired')
  ),
  constraint community_card_templates_version_check check (version >= 1),
  unique (community_id, version)
);

create unique index community_card_templates_one_draft
  on public.community_card_templates (community_id)
  where status = 'draft';

create unique index community_card_templates_one_active
  on public.community_card_templates (community_id)
  where status = 'active';

create table public.community_card_attributes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.community_card_templates (id) on delete cascade,
  name text not null,
  description text,
  position integer not null,
  name_key text not null,
  constraint community_card_attributes_name_check check (
    char_length(name) between 2 and 40 and name !~ '[[:cntrl:]]'
  ),
  constraint community_card_attributes_description_check check (
    description is null
    or (char_length(description) between 1 and 200 and description !~ '[[:cntrl:]]')
  ),
  constraint community_card_attributes_position_check check (position between 1 and 8),
  unique (template_id, position),
  unique (template_id, name_key)
);

create table public.community_card_participations (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (community_id, user_id)
);

create table public.community_player_ratings (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  template_id uuid not null references public.community_card_templates (id) on delete cascade,
  attribute_id uuid not null references public.community_card_attributes (id) on delete cascade,
  rated_user_id uuid not null references public.profiles (id) on delete cascade,
  voter_user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint community_player_ratings_score_check check (score between 1 and 99),
  constraint community_player_ratings_not_self check (rated_user_id <> voter_user_id),
  unique (template_id, attribute_id, rated_user_id, voter_user_id)
);

create index community_player_ratings_rated_idx
  on public.community_player_ratings (template_id, rated_user_id);

alter table public.community_card_templates enable row level security;
alter table public.community_card_templates force row level security;
alter table public.community_card_attributes enable row level security;
alter table public.community_card_attributes force row level security;
alter table public.community_card_participations enable row level security;
alter table public.community_card_participations force row level security;
alter table public.community_player_ratings enable row level security;
alter table public.community_player_ratings force row level security;

revoke all on table public.community_card_templates from public, anon, authenticated;
revoke all on table public.community_card_attributes from public, anon, authenticated;
revoke all on table public.community_card_participations from public, anon, authenticated;
revoke all on table public.community_player_ratings from public, anon, authenticated;

create function private.card_rating_minimum()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

create function private.card_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.translate(
    pg_catalog.lower(pg_catalog.btrim(p_name)),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
$$;

create function private.reject_sensitive_card_name(p_name text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := private.card_name_key(p_name);
  token text;
begin
  foreach token in array array[
    'aparencia', 'beleza', 'corpo', 'sexual', 'sexualidade', 'nudez',
    'peito', 'bunda', 'bumbum', 'gordo', 'gorda', 'magro', 'magra',
    'feio', 'feia', 'bonito', 'bonita', 'genero', 'etnia', 'religiao',
    'penis', 'vagina', 'seio'
  ]
  loop
    if normalized ~ ('(^|[^a-z])' || token || '([^a-z]|$)') then
      raise exception 'sensitive attribute' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

create function private.protect_card_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.card_write', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;
  raise exception 'direct card writes are not allowed' using errcode = '42501';
end;
$$;

create trigger community_card_templates_protect
  before insert or update or delete on public.community_card_templates
  for each row execute function private.protect_card_write();
create trigger community_card_attributes_protect
  before insert or update or delete on public.community_card_attributes
  for each row execute function private.protect_card_write();
create trigger community_card_participations_protect
  before insert or update or delete on public.community_card_participations
  for each row execute function private.protect_card_write();
create trigger community_player_ratings_protect
  before insert or update or delete on public.community_player_ratings
  for each row execute function private.protect_card_write();

create function private.drop_voter_ratings_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status is distinct from 'active' then
    perform pg_catalog.set_config('padre.card_write', 'on', true);
    delete from public.community_player_ratings
    where community_id = old.community_id
      and voter_user_id = old.user_id;
    perform pg_catalog.set_config('padre.card_write', 'off', true);
  end if;
  return null;
end;
$$;

create trigger community_members_drop_voter_ratings
  after update of status on public.community_members
  for each row execute function private.drop_voter_ratings_on_leave();

create function private.update_profile_details(
  p_height integer,
  p_sex text,
  p_show_height boolean,
  p_show_sex boolean,
  p_show_avatar boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  chosen_sex text;
begin
  actor := private.require_actor();
  if p_height is not null and (p_height < 50 or p_height > 250) then
    raise exception 'invalid height' using errcode = 'P0001';
  end if;
  chosen_sex := nullif(pg_catalog.btrim(coalesce(p_sex, '')), '');
  if chosen_sex is not null and chosen_sex not in ('female', 'male', 'intersex') then
    raise exception 'invalid sex' using errcode = 'P0001';
  end if;
  insert into public.profile_personal_details (
    user_id, height_cm, sex, show_height, show_sex, show_avatar
  ) values (
    actor, p_height, chosen_sex,
    coalesce(p_show_height, false),
    coalesce(p_show_sex, false),
    coalesce(p_show_avatar, false)
  )
  on conflict (user_id) do update
  set height_cm = excluded.height_cm,
      sex = excluded.sex,
      show_height = excluded.show_height,
      show_sex = excluded.show_sex,
      show_avatar = excluded.show_avatar,
      updated_at = pg_catalog.now();
  return private.own_profile_details(actor);
end;
$$;

create function private.own_profile_details(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  details public.profile_personal_details%rowtype;
begin
  if p_user_id is distinct from private.require_actor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into details
  from public.profile_personal_details
  where user_id = p_user_id;
  return pg_catalog.jsonb_build_object(
    'height_cm', details.height_cm,
    'sex', details.sex,
    'show_height', coalesce(details.show_height, false),
    'show_sex', coalesce(details.show_sex, false),
    'show_avatar', coalesce(details.show_avatar, false),
    'avatar_path', details.avatar_path
  );
end;
$$;

create function private.visible_profile_details(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.profiles%rowtype;
  details public.profile_personal_details%rowtype;
begin
  actor := private.require_actor();
  select * into found
  from public.profiles
  where username = pg_catalog.lower(pg_catalog.btrim(p_username));
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if found.id is distinct from actor and found.visibility is distinct from 'public' then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  select * into details
  from public.profile_personal_details
  where user_id = found.id;
  if found.id = actor then
    return private.own_profile_details(actor) || pg_catalog.jsonb_build_object(
      'username', found.username,
      'display_name', found.display_name
    );
  end if;
  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'username', found.username,
    'display_name', found.display_name,
    'height_cm', case when details.show_height then details.height_cm else null end,
    'sex', case when details.show_sex then details.sex else null end,
    'show_avatar', details.show_avatar and details.avatar_path is not null,
    'avatar_path', case
      when details.show_avatar then details.avatar_path
      else null
    end
  ));
end;
$$;

create function private.save_community_card_draft(p_slug text, p_attributes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  role text;
  draft_id uuid;
  next_version integer;
  count_attributes integer;
  item jsonb;
  position integer := 0;
  item_name text;
  item_key text;
begin
  actor := private.require_actor();
  if pg_catalog.jsonb_typeof(p_attributes) is distinct from 'array' then
    raise exception 'invalid attributes' using errcode = 'P0001';
  end if;
  count_attributes := pg_catalog.jsonb_array_length(p_attributes);
  if count_attributes < 3 or count_attributes > 8 then
    raise exception 'invalid attributes' using errcode = 'P0001';
  end if;
  found := private.lock_community(p_slug);
  role := private.active_community_role(found.id, actor);
  if role is null or role not in ('owner', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select version + 1 into next_version
  from public.community_card_templates
  where community_id = found.id
  order by version desc
  limit 1;
  next_version := coalesce(next_version, 1);

  perform pg_catalog.set_config('padre.card_write', 'on', true);
  delete from public.community_card_templates
  where community_id = found.id and status = 'draft';
  insert into public.community_card_templates (
    community_id, version, status, created_by
  ) values (found.id, next_version, 'draft', actor)
  returning id into draft_id;

  for item in select value from pg_catalog.jsonb_array_elements(p_attributes)
  loop
    position := position + 1;
    item_name := pg_catalog.btrim(item ->> 'name');
    if item_name is null or char_length(item_name) < 2 then
      raise exception 'invalid attributes' using errcode = 'P0001';
    end if;
    perform private.reject_sensitive_card_name(item_name);
    item_key := private.card_name_key(item_name);
    insert into public.community_card_attributes (
      template_id, name, description, position, name_key
    ) values (
      draft_id,
      item_name,
      nullif(pg_catalog.btrim(coalesce(item ->> 'description', '')), ''),
      position,
      item_key
    );
  end loop;
  perform pg_catalog.set_config('padre.card_write', 'off', true);
  return private.community_card_template_json(found.id, actor);
end;
$$;

create function private.publish_community_card_template(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  role text;
  draft_id uuid;
  attribute_count integer;
begin
  actor := private.require_actor();
  found := private.lock_community(p_slug);
  role := private.active_community_role(found.id, actor);
  if role is null or role not in ('owner', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into draft_id
  from public.community_card_templates
  where community_id = found.id and status = 'draft'
  for update;
  if draft_id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  select count(*) into attribute_count
  from public.community_card_attributes
  where template_id = draft_id;
  if attribute_count < 3 or attribute_count > 8 then
    raise exception 'invalid attributes' using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('padre.card_write', 'on', true);
  update public.community_card_templates
  set status = 'retired'
  where community_id = found.id and status = 'active';
  update public.community_card_templates
  set status = 'active', published_at = pg_catalog.now()
  where id = draft_id;
  perform pg_catalog.set_config('padre.card_write', 'off', true);
  return private.community_card_template_json(found.id, actor);
end;
$$;

create function private.community_card_template_json(p_community_id uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  role text;
begin
  role := private.active_community_role(p_community_id, p_actor);
  if role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'active', (
      select private.template_payload(template.id)
      from public.community_card_templates as template
      where template.community_id = p_community_id and template.status = 'active'
    ),
    'draft', case when role in ('owner', 'admin') then (
      select private.template_payload(template.id)
      from public.community_card_templates as template
      where template.community_id = p_community_id and template.status = 'draft'
    ) else null end
  );
end;
$$;

create function private.template_payload(p_template_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', template.id,
    'version', template.version,
    'status', template.status,
    'attributes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', attribute.id,
        'name', attribute.name,
        'description', attribute.description,
        'position', attribute.position
      ) order by attribute.position)
      from public.community_card_attributes as attribute
      where attribute.template_id = template.id
    ), '[]'::jsonb)
  )
  from public.community_card_templates as template
  where template.id = p_template_id;
$$;

create function private.set_my_community_card_participation(p_slug text, p_active boolean)
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
  if p_active is null then
    raise exception 'invalid participation' using errcode = 'P0001';
  end if;
  found := private.lock_community(p_slug);
  if private.active_community_role(found.id, actor) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('padre.card_write', 'on', true);
  if not p_active then
    delete from public.community_player_ratings
    where community_id = found.id and rated_user_id = actor;
  end if;
  insert into public.community_card_participations (community_id, user_id, active)
  values (found.id, actor, p_active)
  on conflict (community_id, user_id) do update
  set active = excluded.active, updated_at = pg_catalog.now();
  perform pg_catalog.set_config('padre.card_write', 'off', true);
  return pg_catalog.jsonb_build_object('active', p_active);
end;
$$;

create function private.rate_community_player(
  p_slug text,
  p_username text,
  p_attribute_id uuid,
  p_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  rated uuid;
  active_template uuid;
  recent integer;
begin
  actor := private.require_actor();
  if p_score is null or p_score < 1 or p_score > 99 then
    raise exception 'invalid score' using errcode = 'P0001';
  end if;
  found := private.lock_community(p_slug);
  if private.active_community_role(found.id, actor) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into rated
  from public.profiles
  where username = pg_catalog.lower(pg_catalog.btrim(p_username));
  if rated is null or rated = actor then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if private.active_community_role(found.id, rated) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.community_card_participations
    where community_id = found.id and user_id = rated and active
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into active_template
  from public.community_card_templates
  where community_id = found.id and status = 'active'
  for update;
  if active_template is null or not exists (
    select 1 from public.community_card_attributes as attribute
    where attribute.id = p_attribute_id
      and attribute.template_id = active_template
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select count(*) into recent
  from public.community_player_ratings
  where community_id = found.id
    and voter_user_id = actor
    and updated_at > pg_catalog.now() - interval '1 hour';
  if recent >= 120 then
    raise exception 'rating limit' using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('padre.card_write', 'on', true);
  insert into public.community_player_ratings (
    community_id, template_id, attribute_id, rated_user_id, voter_user_id, score
  ) values (
    found.id, active_template, p_attribute_id, rated, actor, p_score
  )
  on conflict (template_id, attribute_id, rated_user_id, voter_user_id)
  do update set score = excluded.score, updated_at = pg_catalog.now();
  perform pg_catalog.set_config('padre.card_write', 'off', true);
  return private.my_rating_json(found.id, actor, rated);
end;
$$;

create function private.my_rating_json(
  p_community_id uuid,
  p_actor uuid,
  p_rated uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_actor is distinct from private.require_actor() then '[]'::jsonb
    else coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'attribute_id', ratings.attribute_id,
      'score', ratings.score
    ) order by attributes.position)
    from public.community_player_ratings as ratings
    join public.community_card_attributes as attributes
      on attributes.id = ratings.attribute_id
    join public.community_card_templates as template
      on template.id = ratings.template_id and template.status = 'active'
    where ratings.community_id = p_community_id
      and ratings.voter_user_id = p_actor
      and ratings.rated_user_id = p_rated
  ), '[]'::jsonb)
  end;
$$;

create function private.player_card_json(
  p_community_id uuid,
  p_username text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rated uuid;
  template public.community_card_templates%rowtype;
  actor uuid;
  attribute_count integer;
  ready_count integer;
  overall numeric;
  attributes jsonb;
begin
  actor := private.require_actor();
  if private.active_community_role(p_community_id, actor) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into rated
  from public.profiles
  where username = pg_catalog.lower(pg_catalog.btrim(p_username));
  if rated is null
    or private.active_community_role(p_community_id, rated) is null
    or not exists (
      select 1 from public.community_card_participations
      where community_id = p_community_id and user_id = rated and active
    ) then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  select * into template
  from public.community_card_templates
  where community_id = p_community_id and status = 'active';
  if template.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  select count(*) into attribute_count
  from public.community_card_attributes as attribute
  where attribute.template_id = template.id;

  select coalesce(pg_catalog.jsonb_agg(row_payload order by position), '[]'::jsonb),
         count(*) filter (where published)
  into attributes, ready_count
  from (
    select
      attribute.position,
      stats.voters >= private.card_rating_minimum() as published,
      pg_catalog.jsonb_build_object(
        'id', attribute.id,
        'name', attribute.name,
        'description', attribute.description,
        'voters', coalesce(stats.voters, 0),
        'average', case
          when coalesce(stats.voters, 0) >= private.card_rating_minimum()
            then pg_catalog.round(stats.raw_average, 1)
          else null
        end,
        'state', case
          when coalesce(stats.voters, 0) >= private.card_rating_minimum()
            then 'published'
          else 'pending'
        end
      ) as row_payload
    from public.community_card_attributes as attribute
    left join (
      select
        ratings.attribute_id,
        count(distinct ratings.voter_user_id)::integer as voters,
        avg(ratings.score) as raw_average
      from public.community_player_ratings as ratings
      join public.community_members as voter
        on voter.community_id = ratings.community_id
       and voter.user_id = ratings.voter_user_id
       and voter.status = 'active'
      where ratings.template_id = template.id
        and ratings.rated_user_id = rated
      group by ratings.attribute_id
    ) as stats on stats.attribute_id = attribute.id
    where attribute.template_id = template.id
  ) as lines;

  if ready_count = attribute_count and attribute_count > 0 then
    select pg_catalog.round(avg(stats.raw_average), 0) into overall
    from (
      select avg(ratings.score) as raw_average
      from public.community_player_ratings as ratings
      join public.community_members as voter
        on voter.community_id = ratings.community_id
       and voter.user_id = ratings.voter_user_id
       and voter.status = 'active'
      join public.community_card_attributes as attribute
        on attribute.id = ratings.attribute_id
      where ratings.template_id = template.id
        and ratings.rated_user_id = rated
      group by ratings.attribute_id
      having count(distinct ratings.voter_user_id) >= private.card_rating_minimum()
    ) as stats;
  end if;

  return pg_catalog.jsonb_build_object(
    'username', (select username from public.profiles where id = rated),
    'display_name', (select display_name from public.profiles where id = rated),
    'template_version', template.version,
    'overall', overall,
    'state', case when overall is null then 'pending' else 'published' end,
    'attributes', attributes
  );
end;
$$;

create function private.list_community_player_cards(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
begin
  actor := private.require_actor();
  select * into found from public.communities where slug = p_slug;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if private.reject_private_stranger(found.id, found.visibility, actor) is null then
    if found.visibility = 'private' then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'community_name', found.name,
    'cards', coalesce((
      select pg_catalog.jsonb_agg(
        private.player_card_json(found.id, profiles.username)
        order by profiles.username
      )
      from public.community_card_participations as participation
      join public.community_members as member
        on member.community_id = participation.community_id
       and member.user_id = participation.user_id
       and member.status = 'active'
      join public.profiles on profiles.id = participation.user_id
      where participation.community_id = found.id
        and participation.active
    ), '[]'::jsonb)
  );
end;
$$;

create function public.update_profile_details(
  height_cm integer,
  sex text,
  show_height boolean,
  show_sex boolean,
  show_avatar boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_profile_details(height_cm, sex, show_height, show_sex, show_avatar);
$$;

create function public.get_own_profile_details()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.own_profile_details(auth.uid());
$$;

create function public.get_visible_profile_details(username text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.visible_profile_details(username);
$$;

create function public.save_community_card_draft(slug text, attributes jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_community_card_draft(slug, attributes);
$$;

create function public.publish_community_card_template(slug text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.publish_community_card_template(slug);
$$;

create function private.get_community_card_template(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
begin
  actor := private.require_actor();
  select * into found from public.communities where communities.slug = p_slug;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if private.reject_private_stranger(found.id, found.visibility, actor) is null then
    if found.visibility = 'private' then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.community_card_template_json(found.id, actor);
end;
$$;

create function public.get_community_card_template(slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_community_card_template(slug);
$$;

create function public.set_my_community_card_participation(slug text, active boolean)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_my_community_card_participation(slug, active);
$$;

create function public.rate_community_player(
  slug text,
  username text,
  attribute_id uuid,
  score integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.rate_community_player(slug, username, attribute_id, score);
$$;

create function private.get_my_community_player_rating(p_slug text, p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
  rated uuid;
begin
  actor := private.require_actor();
  select * into found from public.communities where communities.slug = p_slug;
  if found.id is null or private.active_community_role(found.id, actor) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into rated
  from public.profiles
  where profiles.username = pg_catalog.lower(pg_catalog.btrim(p_username));
  if rated is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  return private.my_rating_json(found.id, actor, rated);
end;
$$;

create function private.get_community_player_card(p_slug text, p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.communities%rowtype;
begin
  actor := private.require_actor();
  select * into found from public.communities where communities.slug = p_slug;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  if private.reject_private_stranger(found.id, found.visibility, actor) is null then
    if found.visibility = 'private' then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.player_card_json(found.id, p_username)
    || pg_catalog.jsonb_build_object('community_name', found.name);
end;
$$;

create function public.get_my_community_player_rating(slug text, username text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_my_community_player_rating(slug, username);
$$;

create function public.get_community_player_card(slug text, username text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_community_player_card(slug, username);
$$;

create function public.list_community_player_cards(slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.list_community_player_cards(slug);
$$;

revoke all on function private.card_rating_minimum() from public, anon, authenticated;
revoke all on function private.card_name_key(text) from public, anon, authenticated;
revoke all on function private.reject_sensitive_card_name(text) from public, anon, authenticated;
revoke all on function private.protect_card_write() from public, anon, authenticated;
revoke all on function private.drop_voter_ratings_on_leave() from public, anon, authenticated;
revoke all on function private.update_profile_details(integer, text, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function private.own_profile_details(uuid) from public, anon, authenticated;
revoke all on function private.visible_profile_details(text) from public, anon, authenticated;
revoke all on function private.save_community_card_draft(text, jsonb) from public, anon, authenticated;
revoke all on function private.publish_community_card_template(text) from public, anon, authenticated;
revoke all on function private.community_card_template_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.template_payload(uuid) from public, anon, authenticated;
revoke all on function private.set_my_community_card_participation(text, boolean) from public, anon, authenticated;
revoke all on function private.rate_community_player(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function private.my_rating_json(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.player_card_json(uuid, text) from public, anon, authenticated;
revoke all on function private.list_community_player_cards(text) from public, anon, authenticated;
revoke all on function private.get_community_card_template(text) from public, anon, authenticated;
revoke all on function private.get_my_community_player_rating(text, text) from public, anon, authenticated;
revoke all on function private.get_community_player_card(text, text) from public, anon, authenticated;

revoke all on function public.update_profile_details(integer, text, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.get_own_profile_details() from public, anon, authenticated;
revoke all on function public.get_visible_profile_details(text) from public, anon, authenticated;
revoke all on function public.save_community_card_draft(text, jsonb) from public, anon, authenticated;
revoke all on function public.publish_community_card_template(text) from public, anon, authenticated;
revoke all on function public.get_community_card_template(text) from public, anon, authenticated;
revoke all on function public.set_my_community_card_participation(text, boolean) from public, anon, authenticated;
revoke all on function public.rate_community_player(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.get_my_community_player_rating(text, text) from public, anon, authenticated;
revoke all on function public.get_community_player_card(text, text) from public, anon, authenticated;
revoke all on function public.list_community_player_cards(text) from public, anon, authenticated;

grant execute on function private.update_profile_details(integer, text, boolean, boolean, boolean) to authenticated;
grant execute on function private.own_profile_details(uuid) to authenticated;
grant execute on function private.visible_profile_details(text) to authenticated;
grant execute on function private.save_community_card_draft(text, jsonb) to authenticated;
grant execute on function private.publish_community_card_template(text) to authenticated;
grant execute on function private.community_card_template_json(uuid, uuid) to authenticated;
grant execute on function private.set_my_community_card_participation(text, boolean) to authenticated;
grant execute on function private.rate_community_player(text, text, uuid, integer) to authenticated;
grant execute on function private.my_rating_json(uuid, uuid, uuid) to authenticated;
grant execute on function private.player_card_json(uuid, text) to authenticated;
grant execute on function private.list_community_player_cards(text) to authenticated;
grant execute on function private.get_community_card_template(text) to authenticated;
grant execute on function private.get_my_community_player_rating(text, text) to authenticated;
grant execute on function private.get_community_player_card(text, text) to authenticated;

grant execute on function public.update_profile_details(integer, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.get_own_profile_details() to authenticated;
grant execute on function public.get_visible_profile_details(text) to authenticated;
grant execute on function public.save_community_card_draft(text, jsonb) to authenticated;
grant execute on function public.publish_community_card_template(text) to authenticated;
grant execute on function public.get_community_card_template(text) to authenticated;
grant execute on function public.set_my_community_card_participation(text, boolean) to authenticated;
grant execute on function public.rate_community_player(text, text, uuid, integer) to authenticated;
grant execute on function public.get_my_community_player_rating(text, text) to authenticated;
grant execute on function public.get_community_player_card(text, text) to authenticated;
grant execute on function public.list_community_player_cards(text) to authenticated;
