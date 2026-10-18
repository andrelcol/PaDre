-- Catálogo esportivo. A partida futura referencia scoring_rule_versions.id.
-- O cliente lê o que está ativo. Escrita fica nas migrations.
-- Slugs usam hífen, como os identificadores já publicados na aplicação.

create schema if not exists private;

create or replace function private.jsonb_whole_number(value jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text;
  num numeric;
begin
  if pg_catalog.jsonb_typeof(value) is distinct from 'number' then
    return null;
  end if;

  raw := value #>> '{}';
  num := raw::numeric;

  if num <> trunc(num) or num < 0 or num > 1000 then
    return null;
  end if;

  return num::integer;
end;
$$;

create or replace function private.scoring_config_is_valid(rule_type text, config jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  keys text[];
  sets_to_win integer;
  points_to_win_set integer;
  minimum_point_difference integer;
  deciding_set_points integer;
  point_cap integer;
  tie_break text;
  games_to_win_set integer;
  minimum_game_difference integer;
  tiebreak_points integer;
begin
  if pg_catalog.jsonb_typeof(config) is distinct from 'object' then
    return false;
  end if;

  select pg_catalog.array_agg(entry.key order by entry.key)
  into keys
  from pg_catalog.jsonb_object_keys(config) as entry(key);

  if rule_type = 'set_based' then
    if keys is distinct from array[
      'deciding_set_points',
      'minimum_point_difference',
      'point_cap',
      'points_to_win_set',
      'sets_to_win'
    ]::text[] then
      return false;
    end if;

    sets_to_win := private.jsonb_whole_number(config -> 'sets_to_win');
    points_to_win_set := private.jsonb_whole_number(config -> 'points_to_win_set');
    minimum_point_difference := private.jsonb_whole_number(config -> 'minimum_point_difference');

    if sets_to_win is null or sets_to_win < 1 or sets_to_win > 5 then
      return false;
    end if;

    if points_to_win_set is null or points_to_win_set < 1 or points_to_win_set > 99 then
      return false;
    end if;

    if minimum_point_difference is null
      or minimum_point_difference < 1
      or minimum_point_difference > 10 then
      return false;
    end if;

    if pg_catalog.jsonb_typeof(config -> 'deciding_set_points') = 'null' then
      deciding_set_points := null;
    elsif pg_catalog.jsonb_typeof(config -> 'deciding_set_points') = 'number' then
      deciding_set_points := private.jsonb_whole_number(config -> 'deciding_set_points');
      if deciding_set_points is null or deciding_set_points < 1 or deciding_set_points > 99 then
        return false;
      end if;
    else
      return false;
    end if;

    if pg_catalog.jsonb_typeof(config -> 'point_cap') = 'null' then
      point_cap := null;
    elsif pg_catalog.jsonb_typeof(config -> 'point_cap') = 'number' then
      point_cap := private.jsonb_whole_number(config -> 'point_cap');
      if point_cap is null or point_cap < points_to_win_set or point_cap > 99 then
        return false;
      end if;
    else
      return false;
    end if;

    return true;
  end if;

  if rule_type = 'goal_based' then
    if keys is distinct from array['allows_draw', 'tie_break']::text[] then
      return false;
    end if;

    if pg_catalog.jsonb_typeof(config -> 'allows_draw') is distinct from 'boolean' then
      return false;
    end if;

    if pg_catalog.jsonb_typeof(config -> 'tie_break') is distinct from 'string' then
      return false;
    end if;

    tie_break := config ->> 'tie_break';

    if tie_break not in ('none', 'extra_time', 'penalties') then
      return false;
    end if;

    if (config -> 'allows_draw') = 'true'::jsonb then
      return tie_break = 'none';
    end if;

    return tie_break in ('extra_time', 'penalties');
  end if;

  if rule_type = 'game_based' then
    if keys is distinct from array[
      'deciding_set_points',
      'games_to_win_set',
      'minimum_game_difference',
      'sets_to_win',
      'tiebreak_points'
    ]::text[] then
      return false;
    end if;

    games_to_win_set := private.jsonb_whole_number(config -> 'games_to_win_set');
    minimum_game_difference := private.jsonb_whole_number(config -> 'minimum_game_difference');
    sets_to_win := private.jsonb_whole_number(config -> 'sets_to_win');

    if games_to_win_set is null or games_to_win_set < 1 or games_to_win_set > 21 then
      return false;
    end if;

    if minimum_game_difference is null
      or minimum_game_difference < 1
      or minimum_game_difference > 4 then
      return false;
    end if;

    if sets_to_win is null or sets_to_win < 1 or sets_to_win > 3 then
      return false;
    end if;

    if pg_catalog.jsonb_typeof(config -> 'tiebreak_points') = 'null' then
      tiebreak_points := null;
    elsif pg_catalog.jsonb_typeof(config -> 'tiebreak_points') = 'number' then
      tiebreak_points := private.jsonb_whole_number(config -> 'tiebreak_points');
      if tiebreak_points is null or tiebreak_points < 1 or tiebreak_points > 99 then
        return false;
      end if;
    else
      return false;
    end if;

    if pg_catalog.jsonb_typeof(config -> 'deciding_set_points') = 'null' then
      deciding_set_points := null;
    elsif pg_catalog.jsonb_typeof(config -> 'deciding_set_points') = 'number' then
      deciding_set_points := private.jsonb_whole_number(config -> 'deciding_set_points');
      if deciding_set_points is null or deciding_set_points < 1 or deciding_set_points > 99 then
        return false;
      end if;
    else
      return false;
    end if;

    if sets_to_win = 1 and deciding_set_points is not null then
      return false;
    end if;

    return true;
  end if;

  return false;
end;
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.statement_timestamp();
  return new;
end;
$$;

create or replace function private.protect_scoring_rule_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'scoring rule versions are immutable'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.format_id is distinct from old.format_id
    or new.version is distinct from old.version
    or new.rule_type is distinct from old.rule_type
    or new.config is distinct from old.config
    or new.origin is distinct from old.origin
    or new.created_at is distinct from old.created_at then
    raise exception 'scoring rule versions are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.jsonb_whole_number(jsonb) from public;
revoke all on function private.scoring_config_is_valid(text, jsonb) from public;
revoke all on function private.touch_updated_at() from public;
revoke all on function private.protect_scoring_rule_version() from public;

create table public.sports (
  id uuid primary key,
  slug text not null,
  name text not null,
  description text,
  display_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sports_slug_unique unique (slug),
  constraint sports_display_order_unique unique (display_order),
  constraint sports_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint sports_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint sports_description_length check (
    description is null or char_length(btrim(description)) between 1 and 400
  ),
  constraint sports_display_order_positive check (display_order >= 1)
);

create table public.sport_formats (
  id uuid primary key,
  sport_id uuid not null references public.sports (id) on delete restrict,
  slug text not null,
  name text not null,
  side_count integer not null,
  players_per_side_min integer not null,
  players_per_side_max integer not null,
  display_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sport_formats_slug_unique unique (sport_id, slug),
  constraint sport_formats_display_order_unique unique (sport_id, display_order),
  constraint sport_formats_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint sport_formats_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint sport_formats_side_count check (side_count between 2 and 4),
  constraint sport_formats_players_min check (players_per_side_min >= 1),
  constraint sport_formats_players_max check (
    players_per_side_max >= players_per_side_min
    and players_per_side_max <= 30
  ),
  constraint sport_formats_display_order_positive check (display_order >= 1)
);

create table public.scoring_rule_versions (
  id uuid primary key,
  format_id uuid not null references public.sport_formats (id) on delete restrict,
  version integer not null,
  rule_type text not null,
  config jsonb not null,
  origin text not null,
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  constraint scoring_rule_versions_format_version_unique unique (format_id, version),
  constraint scoring_rule_versions_version_positive check (version >= 1),
  constraint scoring_rule_versions_rule_type check (
    rule_type in ('set_based', 'goal_based', 'game_based')
  ),
  constraint scoring_rule_versions_origin check (
    origin in ('official_summary', 'app_proposal')
  ),
  constraint scoring_rule_versions_config_valid check (
    private.scoring_config_is_valid(rule_type, config)
  )
);

create unique index scoring_rule_versions_one_active
on public.scoring_rule_versions (format_id)
where active;

create index sport_formats_sport_id_idx on public.sport_formats (sport_id);
create index scoring_rule_versions_format_id_idx on public.scoring_rule_versions (format_id);

create trigger sports_touch_updated_at
before update on public.sports
for each row
execute function private.touch_updated_at();

create trigger sport_formats_touch_updated_at
before update on public.sport_formats
for each row
execute function private.touch_updated_at();

create trigger scoring_rule_versions_protect
before update or delete on public.scoring_rule_versions
for each row
execute function private.protect_scoring_rule_version();

alter table public.sports enable row level security;
alter table public.sports force row level security;
alter table public.sport_formats enable row level security;
alter table public.sport_formats force row level security;
alter table public.scoring_rule_versions enable row level security;
alter table public.scoring_rule_versions force row level security;

create policy sports_select_active
on public.sports
for select
to anon, authenticated
using (active);

create policy sport_formats_select_active
on public.sport_formats
for select
to anon, authenticated
using (
  active
  and exists (
    select 1
    from public.sports
    where sports.id = sport_formats.sport_id
      and sports.active
  )
);

create policy scoring_rule_versions_select_active
on public.scoring_rule_versions
for select
to anon, authenticated
using (
  active
  and exists (
    select 1
    from public.sport_formats
    join public.sports on sports.id = sport_formats.sport_id
    where sport_formats.id = scoring_rule_versions.format_id
      and sport_formats.active
      and sports.active
  )
);

revoke all on table public.sports from public, anon, authenticated;
revoke all on table public.sport_formats from public, anon, authenticated;
revoke all on table public.scoring_rule_versions from public, anon, authenticated;

grant select (
  id,
  slug,
  name,
  description,
  display_order,
  active,
  created_at,
  updated_at
) on table public.sports to anon, authenticated;

grant select (
  id,
  sport_id,
  slug,
  name,
  side_count,
  players_per_side_min,
  players_per_side_max,
  display_order,
  active,
  created_at,
  updated_at
) on table public.sport_formats to anon, authenticated;

grant select (
  id,
  format_id,
  version,
  rule_type,
  config,
  origin,
  active,
  created_at
) on table public.scoring_rule_versions to anon, authenticated;

grant usage on schema public to anon, authenticated;

insert into public.sports (id, slug, name, description, display_order) values
  (
    'a1000000-0000-4000-8000-000000000001',
    'volleyball',
    'Vôlei',
    'Esporte de quadra jogado com as mãos, por cima de uma rede.',
    1
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'beach-volleyball',
    'Vôlei de areia',
    'Esporte de areia jogado com as mãos. O formato de duplas é o de competição; o 4x4 é recreativo.',
    2
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'futsal',
    'Futsal',
    'Esporte de quadra jogado com os pés. Esta versão registra gols e admite empate.',
    3
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'beach-tennis',
    'Beach tennis',
    'Esporte de areia jogado com raquete, em simples ou em duplas.',
    4
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'footvolley',
    'Futevôlei',
    'Esporte de areia com a rede do vôlei e o toque do futebol. Não é um formato do vôlei de areia.',
    5
  );

insert into public.sport_formats (
  id,
  sport_id,
  slug,
  name,
  side_count,
  players_per_side_min,
  players_per_side_max,
  display_order
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'indoor-6x6',
    'Vôlei 6x6',
    2, 6, 6, 1
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'indoor-4x4',
    'Vôlei 4x4',
    2, 4, 4, 2
  ),
  (
    'a2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000002',
    'beach-2x2',
    'Vôlei de areia 2x2',
    2, 2, 2, 1
  ),
  (
    'a2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000002',
    'beach-4x4',
    'Vôlei de areia 4x4',
    2, 4, 4, 2
  ),
  (
    'a2000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000003',
    'futsal-5x5',
    'Futsal 5x5',
    2, 5, 5, 1
  ),
  (
    'a2000000-0000-4000-8000-000000000006',
    'a1000000-0000-4000-8000-000000000004',
    'singles',
    'Beach tennis individual',
    2, 1, 1, 1
  ),
  (
    'a2000000-0000-4000-8000-000000000007',
    'a1000000-0000-4000-8000-000000000004',
    'doubles',
    'Beach tennis em duplas',
    2, 2, 2, 2
  ),
  (
    'a2000000-0000-4000-8000-000000000008',
    'a1000000-0000-4000-8000-000000000005',
    'footvolley-2x2',
    'Futevôlei 2x2',
    2, 2, 2, 1
  );

insert into public.scoring_rule_versions (
  id, format_id, version, rule_type, origin, config
) values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    1,
    'set_based',
    'official_summary',
    jsonb_build_object(
      'sets_to_win', 3,
      'points_to_win_set', 25,
      'minimum_point_difference', 2,
      'deciding_set_points', 15,
      'point_cap', null
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002',
    1,
    'set_based',
    'app_proposal',
    jsonb_build_object(
      'sets_to_win', 3,
      'points_to_win_set', 25,
      'minimum_point_difference', 2,
      'deciding_set_points', 15,
      'point_cap', null
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000003',
    1,
    'set_based',
    'official_summary',
    jsonb_build_object(
      'sets_to_win', 2,
      'points_to_win_set', 21,
      'minimum_point_difference', 2,
      'deciding_set_points', 15,
      'point_cap', null
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000004',
    'a2000000-0000-4000-8000-000000000004',
    1,
    'set_based',
    'app_proposal',
    jsonb_build_object(
      'sets_to_win', 2,
      'points_to_win_set', 21,
      'minimum_point_difference', 2,
      'deciding_set_points', 15,
      'point_cap', null
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000005',
    'a2000000-0000-4000-8000-000000000005',
    1,
    'goal_based',
    'official_summary',
    jsonb_build_object(
      'allows_draw', true,
      'tie_break', 'none'
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000006',
    'a2000000-0000-4000-8000-000000000006',
    1,
    'game_based',
    'app_proposal',
    jsonb_build_object(
      'games_to_win_set', 6,
      'minimum_game_difference', 2,
      'sets_to_win', 1,
      'tiebreak_points', 7,
      'deciding_set_points', null
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000007',
    'a2000000-0000-4000-8000-000000000007',
    1,
    'game_based',
    'app_proposal',
    jsonb_build_object(
      'games_to_win_set', 6,
      'minimum_game_difference', 2,
      'sets_to_win', 2,
      'tiebreak_points', 7,
      'deciding_set_points', 10
    )
  ),
  (
    'a3000000-0000-4000-8000-000000000008',
    'a2000000-0000-4000-8000-000000000008',
    1,
    'set_based',
    'app_proposal',
    jsonb_build_object(
      'sets_to_win', 2,
      'points_to_win_set', 18,
      'minimum_point_difference', 2,
      'deciding_set_points', 15,
      'point_cap', null
    )
  );
