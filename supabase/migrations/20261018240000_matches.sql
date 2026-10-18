-- Partidas dentro de um encontro.
-- A regra copiada é a versão do encontro, não a regra ativa do catálogo.
-- O placar não traz vencedor: a função calcula o desfecho.
-- Confirmação exige um jogador de cada lado, na mesma revisão, com a linha travada.
-- O tiebreak e o super tiebreak usam só o alvo gravado (primeiro a N).
-- A versão atual não tem diferença mínima desses pontos.

create or replace function private.match_finished_score(
  p_left integer,
  p_right integer,
  p_target integer,
  p_difference integer,
  p_cap integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  hi integer;
  lo integer;
  needed integer;
begin
  if p_left is null or p_right is null or p_target is null or p_difference is null then
    return null;
  end if;
  if p_left < 0 or p_right < 0 or p_left > 99 or p_right > 99 or p_left = p_right then
    return null;
  end if;
  if p_cap is not null and (p_left > p_cap or p_right > p_cap) then
    return null;
  end if;

  if p_left > p_right then
    hi := p_left;
    lo := p_right;
  else
    hi := p_right;
    lo := p_left;
  end if;

  needed := p_target;
  if lo + p_difference > needed then
    needed := lo + p_difference;
  end if;

  if p_cap is not null
    and hi = p_cap
    and lo < p_cap
    and lo + p_difference > p_cap
    and hi >= p_target then
    if p_left > p_right then
      return 1;
    end if;
    return 2;
  end if;

  if hi <> needed then
    return null;
  end if;

  if p_left > p_right then
    return 1;
  end if;
  return 2;
end;
$$;

create or replace function private.resolve_match_outcome(
  p_rule_type text,
  p_config jsonb,
  p_payload jsonb
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  keys text[];
  sets jsonb;
  set_count integer;
  set_index integer;
  wins_1 integer := 0;
  wins_2 integer := 0;
  sets_to_win integer;
  max_sets integer;
  target integer;
  deciding_points integer;
  point_cap integer;
  min_diff integer;
  games_to_win integer;
  tiebreak_points integer;
  elem jsonb;
  winner integer;
  left_score integer;
  right_score integer;
  goals_1 integer;
  goals_2 integer;
begin
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;

  select pg_catalog.array_agg(entry.key order by entry.key)
  into keys
  from pg_catalog.jsonb_object_keys(p_payload) as entry(key);

  if p_rule_type = 'set_based' then
    if keys is distinct from array['sets']::text[]
      or pg_catalog.jsonb_typeof(p_payload -> 'sets') is distinct from 'array' then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
    sets := p_payload -> 'sets';
    set_count := pg_catalog.jsonb_array_length(sets);
    sets_to_win := private.jsonb_whole_number(p_config -> 'sets_to_win');
    min_diff := private.jsonb_whole_number(p_config -> 'minimum_point_difference');
    deciding_points := private.jsonb_whole_number(p_config -> 'deciding_set_points');
    if pg_catalog.jsonb_typeof(p_config -> 'point_cap') = 'null' then
      point_cap := null;
    else
      point_cap := private.jsonb_whole_number(p_config -> 'point_cap');
    end if;
    max_sets := sets_to_win * 2 - 1;
    if sets_to_win is null or set_count < sets_to_win or set_count > max_sets then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;

    for set_index in 0 .. set_count - 1 loop
      if wins_1 >= sets_to_win or wins_2 >= sets_to_win then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      elem := sets -> set_index;
      if pg_catalog.jsonb_typeof(elem) is distinct from 'array'
        or pg_catalog.jsonb_array_length(elem) <> 2 then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      if set_index = max_sets - 1 and deciding_points is not null then
        target := deciding_points;
      else
        target := private.jsonb_whole_number(p_config -> 'points_to_win_set');
      end if;
      winner := private.match_finished_score(
        private.jsonb_whole_number(elem -> 0),
        private.jsonb_whole_number(elem -> 1),
        target,
        min_diff,
        point_cap
      );
      if winner is null then
        raise exception 'invalid match result' using errcode = 'P0001';
      elsif winner = 1 then
        wins_1 := wins_1 + 1;
      else
        wins_2 := wins_2 + 1;
      end if;
    end loop;
  elsif p_rule_type = 'goal_based' then
    if keys is distinct from array['goals']::text[]
      or pg_catalog.jsonb_typeof(p_payload -> 'goals') is distinct from 'array'
      or pg_catalog.jsonb_array_length(p_payload -> 'goals') <> 2 then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
    goals_1 := private.jsonb_whole_number(p_payload -> 'goals' -> 0);
    goals_2 := private.jsonb_whole_number(p_payload -> 'goals' -> 1);
    if goals_1 is null or goals_2 is null or goals_1 > 99 or goals_2 > 99 then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
    if goals_1 > goals_2 then
      return 'side_1';
    elsif goals_2 > goals_1 then
      return 'side_2';
    elsif (p_config -> 'allows_draw') = 'true'::jsonb then
      return 'draw';
    else
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
  elsif p_rule_type = 'game_based' then
    if keys is distinct from array['sets']::text[]
      or pg_catalog.jsonb_typeof(p_payload -> 'sets') is distinct from 'array' then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
    sets := p_payload -> 'sets';
    set_count := pg_catalog.jsonb_array_length(sets);
    sets_to_win := private.jsonb_whole_number(p_config -> 'sets_to_win');
    games_to_win := private.jsonb_whole_number(p_config -> 'games_to_win_set');
    min_diff := private.jsonb_whole_number(p_config -> 'minimum_game_difference');
    tiebreak_points := private.jsonb_whole_number(p_config -> 'tiebreak_points');
    deciding_points := private.jsonb_whole_number(p_config -> 'deciding_set_points');
    max_sets := sets_to_win * 2 - 1;
    if sets_to_win is null or set_count < sets_to_win or set_count > max_sets then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;

    for set_index in 0 .. set_count - 1 loop
      if wins_1 >= sets_to_win or wins_2 >= sets_to_win then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      elem := sets -> set_index;
      if pg_catalog.jsonb_typeof(elem) is distinct from 'object' then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      if set_index = max_sets - 1 and deciding_points is not null then
        if elem ? 'games' or not (elem ? 'points') then
          raise exception 'invalid match result' using errcode = 'P0001';
        end if;
        winner := private.match_finished_score(
          private.jsonb_whole_number(elem -> 'points' -> 0),
          private.jsonb_whole_number(elem -> 'points' -> 1),
          deciding_points,
          1,
          null
        );
      else
        if elem ? 'points'
          or not (elem ? 'games')
          or not (elem ? 'tiebreak')
          or pg_catalog.jsonb_typeof(elem -> 'games') is distinct from 'array'
          or pg_catalog.jsonb_array_length(elem -> 'games') <> 2 then
          raise exception 'invalid match result' using errcode = 'P0001';
        end if;
        left_score := private.jsonb_whole_number(elem -> 'games' -> 0);
        right_score := private.jsonb_whole_number(elem -> 'games' -> 1);
        if tiebreak_points is not null
          and left_score = games_to_win
          and right_score = games_to_win then
          if pg_catalog.jsonb_typeof(elem -> 'tiebreak') is distinct from 'array'
            or pg_catalog.jsonb_array_length(elem -> 'tiebreak') <> 2 then
            raise exception 'invalid match result' using errcode = 'P0001';
          end if;
          winner := private.match_finished_score(
            private.jsonb_whole_number(elem -> 'tiebreak' -> 0),
            private.jsonb_whole_number(elem -> 'tiebreak' -> 1),
            tiebreak_points,
            1,
            null
          );
        else
          if pg_catalog.jsonb_typeof(elem -> 'tiebreak') is distinct from 'null' then
            raise exception 'invalid match result' using errcode = 'P0001';
          end if;
          winner := private.match_finished_score(
            left_score,
            right_score,
            games_to_win,
            min_diff,
            null
          );
        end if;
      end if;

      if winner is null then
        raise exception 'invalid match result' using errcode = 'P0001';
      elsif winner = 1 then
        wins_1 := wins_1 + 1;
      else
        wins_2 := wins_2 + 1;
      end if;
    end loop;
  else
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;

  if wins_1 = sets_to_win and wins_2 < sets_to_win then
    return 'side_1';
  elsif wins_2 = sets_to_win and wins_1 < sets_to_win then
    return 'side_2';
  end if;
  raise exception 'invalid match result' using errcode = 'P0001';
end;
$$;
create or replace function private.protect_match_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  match_status text;
begin
  if pg_catalog.current_setting('padre.match_write', true) = 'on' then
    if tg_op = 'UPDATE' and tg_table_name = 'matches' then
      if new.id is distinct from old.id
        or new.meetup_id is distinct from old.meetup_id
        or new.scoring_rule_version_id is distinct from old.scoring_rule_version_id
        or new.created_by is distinct from old.created_by
        or new.created_at is distinct from old.created_at
        or (
          old.status in ('confirmed', 'voided')
          and new.status is distinct from old.status
        ) then
        raise exception 'match timestamps are protected'
          using errcode = '42501';
      end if;
      new.updated_at := pg_catalog.statement_timestamp();
    elsif tg_table_name in ('match_teams', 'match_players', 'match_results') then
      select matches.status
      into match_status
      from public.matches
      where matches.id = coalesce(new.match_id, old.match_id);

      if match_status in ('confirmed', 'voided') then
        raise exception 'match timestamps are protected'
          using errcode = '42501';
      end if;

      if tg_op = 'UPDATE' and tg_table_name = 'match_teams' then
        if new.id is distinct from old.id
          or new.match_id is distinct from old.match_id
          or new.side is distinct from old.side then
          raise exception 'match timestamps are protected'
            using errcode = '42501';
        end if;
      elsif tg_op = 'UPDATE' and tg_table_name = 'match_results' then
        if new.id is distinct from old.id
          or new.match_id is distinct from old.match_id
          or new.revision is distinct from old.revision
          or new.created_by is distinct from old.created_by
          or new.created_at is distinct from old.created_at
          or (
            old.superseded_at is not null
            and new.superseded_at is distinct from old.superseded_at
          ) then
          raise exception 'match timestamps are protected'
            using errcode = '42501';
        end if;
      elsif tg_table_name = 'match_players'
        and match_status is distinct from 'draft' then
        raise exception 'match timestamps are protected'
          using errcode = '42501';
      end if;
    elsif tg_table_name = 'match_confirmations' and tg_op <> 'INSERT' then
      raise exception 'match timestamps are protected'
        using errcode = '42501';
    elsif tg_table_name = 'match_audit_logs' and tg_op <> 'INSERT' then
      raise exception 'match timestamps are protected'
        using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct match writes are not allowed'
    using errcode = '42501';
end;
$$;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  scoring_rule_version_id uuid not null references public.scoring_rule_versions (id) on delete restrict,
  status text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  confirmed_at timestamptz,
  voided_at timestamptz,
  constraint matches_status_check check (
    status in (
      'draft',
      'pending_confirmation',
      'disputed',
      'confirmed',
      'voided'
    )
  ),
  constraint matches_confirmed_check check (
    (status = 'confirmed') = (confirmed_at is not null)
  ),
  constraint matches_voided_check check (
    (status = 'voided') = (voided_at is not null)
  )
);

create table public.match_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  side smallint not null,
  name text not null,
  constraint match_teams_side_check check (side in (1, 2)),
  constraint match_teams_name_check check (
    char_length(name) between 1 and 40
    and name !~ '[[:cntrl:]]'
  ),
  constraint match_teams_side_unique unique (match_id, side),
  constraint match_teams_id_match_unique unique (id, match_id)
);

create table public.match_players (
  match_id uuid not null,
  team_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (match_id, user_id),
  constraint match_players_team_match_fkey
    foreign key (team_id, match_id)
    references public.match_teams (id, match_id)
    on delete cascade
);

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  revision integer not null,
  payload jsonb not null,
  outcome text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  superseded_at timestamptz,
  constraint match_results_revision_check check (revision >= 1),
  constraint match_results_outcome_check check (
    outcome in ('side_1', 'side_2', 'draw')
  ),
  constraint match_results_revision_unique unique (match_id, revision),
  constraint match_results_id_match_unique unique (id, match_id)
);

create unique index match_results_one_open
on public.match_results (match_id)
where superseded_at is null;

create table public.match_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  result_id uuid not null,
  team_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint match_confirmations_result_user_unique unique (result_id, user_id),
  constraint match_confirmations_result_team_unique unique (result_id, team_id),
  constraint match_confirmations_result_match_fkey
    foreign key (result_id, match_id)
    references public.match_results (id, match_id)
    on delete cascade,
  constraint match_confirmations_team_match_fkey
    foreign key (team_id, match_id)
    references public.match_teams (id, match_id)
    on delete cascade
);

create table public.match_audit_logs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  revision integer,
  created_at timestamptz not null default pg_catalog.now(),
  constraint match_audit_logs_action_check check (
    action in (
      'created',
      'lineup_changed',
      'result_changed',
      'submitted',
      'confirmation',
      'disputed',
      'revised',
      'confirmed',
      'voided'
    )
  )
);

create index matches_meetup_idx on public.matches (meetup_id);
create index match_audit_logs_match_idx on public.match_audit_logs (match_id, created_at);

create trigger matches_protect_write
before insert or update or delete on public.matches
for each row execute function private.protect_match_write();

create trigger match_teams_protect_write
before insert or update or delete on public.match_teams
for each row execute function private.protect_match_write();

create trigger match_players_protect_write
before insert or update or delete on public.match_players
for each row execute function private.protect_match_write();

create trigger match_results_protect_write
before insert or update or delete on public.match_results
for each row execute function private.protect_match_write();

create trigger match_confirmations_protect_write
before insert or update or delete on public.match_confirmations
for each row execute function private.protect_match_write();

create trigger match_audit_logs_protect_write
before insert or update or delete on public.match_audit_logs
for each row execute function private.protect_match_write();

alter table public.matches enable row level security;
alter table public.matches force row level security;
alter table public.match_teams enable row level security;
alter table public.match_teams force row level security;
alter table public.match_players enable row level security;
alter table public.match_players force row level security;
alter table public.match_results enable row level security;
alter table public.match_results force row level security;
alter table public.match_confirmations enable row level security;
alter table public.match_confirmations force row level security;
alter table public.match_audit_logs enable row level security;
alter table public.match_audit_logs force row level security;

revoke all on table public.matches from public, anon, authenticated;
revoke all on table public.match_teams from public, anon, authenticated;
revoke all on table public.match_players from public, anon, authenticated;
revoke all on table public.match_results from public, anon, authenticated;
revoke all on table public.match_confirmations from public, anon, authenticated;
revoke all on table public.match_audit_logs from public, anon, authenticated;
create or replace function private.lock_match(target uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.matches%rowtype;
begin
  select *
  into found
  from public.matches
  where matches.id = target
  for update;

  if found.id is null then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  return found;
end;
$$;

create or replace function private.audit_match(
  p_match_id uuid,
  p_actor uuid,
  p_action text,
  p_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.match_audit_logs (match_id, actor_id, action, revision)
  values (p_match_id, p_actor, p_action, p_revision);
end;
$$;

create or replace function private.require_match_organizer(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.matches%rowtype;
  meetup public.meetups%rowtype;
begin
  actor := private.require_actor();
  select meetup_id into found.meetup_id from public.matches where id = p_match_id;
  if found.meetup_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  meetup := private.lock_meetup(found.meetup_id);
  found := private.lock_match(p_match_id);
  if meetup.organizer_id <> actor then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return found;
end;
$$;

create or replace function private.create_match(p_meetup_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  meetup public.meetups%rowtype;
  created uuid;
begin
  actor := private.require_actor();
  meetup := private.lock_meetup(p_meetup_id);
  if meetup.organizer_id <> actor then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if meetup.status <> 'scheduled' then
    raise exception 'meetup cancelled' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  insert into public.matches (
    meetup_id, scoring_rule_version_id, status, created_by
  )
  values (meetup.id, meetup.scoring_rule_version_id, 'draft', actor)
  returning id into created;

  insert into public.match_teams (match_id, side, name)
  values (created, 1, 'Lado 1'), (created, 2, 'Lado 2');
  perform private.audit_match(created, actor, 'created', null);
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return created;
end;
$$;

create or replace function private.set_match_lineup(
  p_match_id uuid,
  p_side_1_name text,
  p_side_1_players uuid[],
  p_side_2_name text,
  p_side_2_players uuid[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.matches%rowtype;
  name_1 text;
  name_2 text;
  minimum_players integer;
  maximum_players integer;
  team_1 uuid;
  team_2 uuid;
begin
  found := private.require_match_organizer(p_match_id);
  actor := private.require_actor();
  if found.status <> 'draft' then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;
  if p_side_1_players is null or p_side_2_players is null then
    raise exception 'invalid lineup' using errcode = 'P0001';
  end if;

  name_1 := private.bounded_text(p_side_1_name, 1, 40, true);
  name_2 := private.bounded_text(p_side_2_name, 1, 40, true);

  select sport_formats.players_per_side_min, sport_formats.players_per_side_max
  into minimum_players, maximum_players
  from public.meetups
  join public.sport_formats on sport_formats.id = meetups.sport_format_id
  where meetups.id = found.meetup_id;

  if coalesce(cardinality(p_side_1_players), 0) < minimum_players
    or cardinality(p_side_1_players) > maximum_players
    or coalesce(cardinality(p_side_2_players), 0) < minimum_players
    or cardinality(p_side_2_players) > maximum_players
    or cardinality(p_side_1_players) <> (
      select count(distinct player) from unnest(p_side_1_players) as player
    )
    or cardinality(p_side_2_players) <> (
      select count(distinct player) from unnest(p_side_2_players) as player
    )
    or p_side_1_players && p_side_2_players
    or (
      select count(*)
      from public.meetup_participants
      where meetup_participants.meetup_id = found.meetup_id
        and meetup_participants.status = 'confirmed'
        and meetup_participants.user_id = any(p_side_1_players || p_side_2_players)
    ) <> cardinality(p_side_1_players) + cardinality(p_side_2_players) then
    raise exception 'invalid lineup' using errcode = 'P0001';
  end if;

  select id into team_1 from public.match_teams
  where match_id = found.id and side = 1;
  select id into team_2 from public.match_teams
  where match_id = found.id and side = 2;

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  delete from public.match_players where match_id = found.id;
  update public.match_teams set name = name_1 where id = team_1;
  update public.match_teams set name = name_2 where id = team_2;
  insert into public.match_players (match_id, team_id, user_id)
  select found.id, team_1, player from unnest(p_side_1_players) as player
  union all
  select found.id, team_2, player from unnest(p_side_2_players) as player;
  perform private.audit_match(found.id, actor, 'lineup_changed', null);
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return 'ok';
end;
$$;

create or replace function private.write_match_result(
  p_match public.matches,
  p_actor uuid,
  p_payload jsonb,
  p_replace boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.scoring_rule_versions%rowtype;
  outcome text;
  current_result public.match_results%rowtype;
  next_revision integer;
begin
  select * into rule
  from public.scoring_rule_versions
  where id = p_match.scoring_rule_version_id;

  outcome := private.resolve_match_outcome(rule.rule_type, rule.config, p_payload);

  select * into current_result
  from public.match_results
  where match_id = p_match.id and superseded_at is null
  for update;

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  if p_replace and current_result.id is not null then
    update public.match_results
    set payload = p_payload, outcome = outcome
    where id = current_result.id;
    next_revision := current_result.revision;
    perform private.audit_match(p_match.id, p_actor, 'result_changed', next_revision);
  else
    next_revision := coalesce(current_result.revision, 0) + 1;
    if current_result.id is not null then
      update public.match_results
      set superseded_at = pg_catalog.now()
      where id = current_result.id;
    end if;
    insert into public.match_results (
      match_id, revision, payload, outcome, created_by
    )
    values (p_match.id, next_revision, p_payload, outcome, p_actor);
    perform private.audit_match(
      p_match.id,
      p_actor,
      case when current_result.id is null then 'result_changed' else 'revised' end,
      next_revision
    );
  end if;
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return next_revision;
end;
$$;

create or replace function private.set_match_result(p_match_id uuid, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.matches%rowtype;
begin
  found := private.require_match_organizer(p_match_id);
  if found.status <> 'draft' then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;
  perform private.write_match_result(found, private.require_actor(), p_payload, true);
  return 'ok';
end;
$$;

create or replace function private.submit_match(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.matches%rowtype;
  meetup public.meetups%rowtype;
  minimum_players integer;
  maximum_players integer;
begin
  found := private.require_match_organizer(p_match_id);
  actor := private.require_actor();
  if found.status = 'pending_confirmation' then
    return 'pending_confirmation';
  end if;
  if found.status <> 'draft' then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;

  select * into meetup from public.meetups where id = found.meetup_id;
  if meetup.status <> 'scheduled' then
    raise exception 'meetup cancelled' using errcode = 'P0001';
  end if;
  if meetup.starts_at > pg_catalog.now() then
    raise exception 'meetup not started' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.match_results
    where match_id = found.id and superseded_at is null
  ) then
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;

  select sport_formats.players_per_side_min, sport_formats.players_per_side_max
  into minimum_players, maximum_players
  from public.sport_formats
  join public.meetups on meetups.sport_format_id = sport_formats.id
  where meetups.id = found.meetup_id;

  if exists (
    select 1
    from public.match_teams
    left join public.match_players on match_players.team_id = match_teams.id
    where match_teams.match_id = found.id
    group by match_teams.id
    having count(match_players.user_id) < minimum_players
      or count(match_players.user_id) > maximum_players
  ) then
    raise exception 'invalid lineup' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  update public.matches set status = 'pending_confirmation' where id = found.id;
  perform private.audit_match(found.id, actor, 'submitted', (
    select revision from public.match_results
    where match_id = found.id and superseded_at is null
  ));
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return 'pending_confirmation';
end;
$$;

create or replace function private.confirm_match(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.matches%rowtype;
  meetup public.meetups%rowtype;
  actor_team uuid;
  open_result uuid;
  sides integer;
begin
  actor := private.require_actor();
  select meetup_id into found.meetup_id from public.matches where id = p_match_id;
  if found.meetup_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  meetup := private.lock_meetup(found.meetup_id);
  found := private.lock_match(p_match_id);
  if meetup.status <> 'scheduled' then
    raise exception 'meetup cancelled' using errcode = 'P0001';
  end if;
  if meetup.starts_at > pg_catalog.now() then
    raise exception 'meetup not started' using errcode = 'P0001';
  end if;
  if found.status = 'confirmed' then
    return 'confirmed';
  end if;
  if found.status <> 'pending_confirmation' then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;

  select match_players.team_id into actor_team
  from public.match_players
  where match_players.match_id = found.id
    and match_players.user_id = actor;
  if actor_team is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select id into open_result
  from public.match_results
  where match_id = found.id and superseded_at is null
  for update;

  if exists (
    select 1 from public.match_confirmations
    where match_confirmations.result_id = open_result
      and match_confirmations.user_id = actor
  ) then
    return found.status;
  end if;
  if exists (
    select 1 from public.match_confirmations
    where match_confirmations.result_id = open_result
      and match_confirmations.team_id = actor_team
  ) then
    raise exception 'side already confirmed' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  insert into public.match_confirmations (match_id, result_id, team_id, user_id)
  values (found.id, open_result, actor_team, actor);
  perform private.audit_match(found.id, actor, 'confirmation', (
    select revision from public.match_results where id = open_result
  ));

  select count(distinct match_confirmations.team_id) into sides
  from public.match_confirmations
  where match_confirmations.result_id = open_result;

  if sides = 2 then
    update public.matches
    set status = 'confirmed', confirmed_at = pg_catalog.now()
    where id = found.id;
    perform private.audit_match(found.id, actor, 'confirmed', (
      select revision from public.match_results where id = open_result
    ));
    perform pg_catalog.set_config('padre.match_write', 'off', true);
    return 'confirmed';
  end if;

  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return 'pending_confirmation';
end;
$$;

create or replace function private.dispute_match(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.matches%rowtype;
begin
  actor := private.require_actor();
  select meetup_id into found.meetup_id from public.matches where id = p_match_id;
  if found.meetup_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform private.lock_meetup(found.meetup_id);
  found := private.lock_match(p_match_id);
  if found.status = 'disputed' then
    return 'disputed';
  end if;
  if found.status <> 'pending_confirmation' then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.match_players
    where match_id = found.id and user_id = actor
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.match_write', 'on', true);
  update public.matches set status = 'disputed' where id = found.id;
  perform private.audit_match(found.id, actor, 'disputed', (
    select revision from public.match_results
    where match_id = found.id and superseded_at is null
  ));
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return 'disputed';
end;
$$;

create or replace function private.revise_match_result(p_match_id uuid, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.matches%rowtype;
  revision integer;
begin
  found := private.require_match_organizer(p_match_id);
  if found.status not in ('pending_confirmation', 'disputed') then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;
  revision := private.write_match_result(
    found, private.require_actor(), p_payload, false
  );
  perform pg_catalog.set_config('padre.match_write', 'on', true);
  update public.matches set status = 'pending_confirmation' where id = found.id;
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return revision;
end;
$$;

create or replace function private.void_match(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.matches%rowtype;
begin
  found := private.require_match_organizer(p_match_id);
  actor := private.require_actor();
  if found.status = 'voided' then
    return 'voided';
  end if;
  if found.status not in ('draft', 'pending_confirmation', 'disputed') then
    raise exception 'match frozen' using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('padre.match_write', 'on', true);
  update public.matches
  set status = 'voided', voided_at = pg_catalog.now()
  where id = found.id;
  perform private.audit_match(found.id, actor, 'voided', null);
  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return 'voided';
end;
$$;

create or replace function private.list_meetup_matches(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not private.can_read_meetup(p_meetup_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', participants.user_id,
        'username', profiles.username
      ) order by profiles.username)
      from public.meetup_participants as participants
      join public.profiles on profiles.id = participants.user_id
      where participants.meetup_id = p_meetup_id
        and participants.status = 'confirmed'
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', matches.id,
        'status', matches.status,
        'confirmed_at', matches.confirmed_at,
        'rule_type', rules.rule_type,
        'config', rules.config,
        'teams', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', teams.id,
            'side', teams.side,
            'name', teams.name,
            'players', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'user_id', players.user_id,
                'username', player_profile.username
              ) order by player_profile.username), '[]'::jsonb)
              from public.match_players as players
              join public.profiles as player_profile on player_profile.id = players.user_id
              where players.team_id = teams.id
            )
          ) order by teams.side), '[]'::jsonb)
          from public.match_teams as teams
          where teams.match_id = matches.id
        ),
        'result', (
          select jsonb_build_object(
            'id', results.id,
            'revision', results.revision,
            'payload', results.payload,
            'outcome', results.outcome
          )
          from public.match_results as results
          where results.match_id = matches.id
            and results.superseded_at is null
        ),
        'confirmations', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'team_id', confirmations.team_id,
            'user_id', confirmations.user_id,
            'username', confirmation_profile.username
          )), '[]'::jsonb)
          from public.match_confirmations as confirmations
          join public.match_results as current_result
            on current_result.id = confirmations.result_id
           and current_result.superseded_at is null
          join public.profiles as confirmation_profile
            on confirmation_profile.id = confirmations.user_id
          where confirmations.match_id = matches.id
        ),
        'my_team_side', (
          select teams.side
          from public.match_players as mine
          join public.match_teams as teams on teams.id = mine.team_id
          where mine.match_id = matches.id and mine.user_id = actor
        ),
        'audit', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'action', logs.action,
            'revision', logs.revision,
            'created_at', logs.created_at,
            'username', actor_profile.username
          ) order by logs.created_at), '[]'::jsonb)
          from public.match_audit_logs as logs
          join public.profiles as actor_profile on actor_profile.id = logs.actor_id
          where logs.match_id = matches.id
        )
      ) order by matches.created_at)
      from public.matches
      join public.scoring_rule_versions as rules
        on rules.id = matches.scoring_rule_version_id
      where matches.meetup_id = p_meetup_id
    ), '[]'::jsonb)
  );
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
    raise exception 'not allowed' using errcode = '42501';
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

revoke all on function private.match_finished_score(integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function private.resolve_match_outcome(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.protect_match_write() from public, anon, authenticated;
revoke all on function private.lock_match(uuid) from public, anon, authenticated;
revoke all on function private.audit_match(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function private.require_match_organizer(uuid) from public, anon, authenticated;
revoke all on function private.write_match_result(public.matches, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function private.create_match(uuid) from public, anon, authenticated;
revoke all on function private.set_match_lineup(uuid, text, uuid[], text, uuid[]) from public, anon, authenticated;
revoke all on function private.set_match_result(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.submit_match(uuid) from public, anon, authenticated;
revoke all on function private.confirm_match(uuid) from public, anon, authenticated;
revoke all on function private.dispute_match(uuid) from public, anon, authenticated;
revoke all on function private.revise_match_result(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.void_match(uuid) from public, anon, authenticated;
revoke all on function private.list_meetup_matches(uuid) from public, anon, authenticated;

grant execute on function private.create_match(uuid) to authenticated;
grant execute on function private.set_match_lineup(uuid, text, uuid[], text, uuid[]) to authenticated;
grant execute on function private.set_match_result(uuid, jsonb) to authenticated;
grant execute on function private.submit_match(uuid) to authenticated;
grant execute on function private.confirm_match(uuid) to authenticated;
grant execute on function private.dispute_match(uuid) to authenticated;
grant execute on function private.revise_match_result(uuid, jsonb) to authenticated;
grant execute on function private.void_match(uuid) to authenticated;
grant execute on function private.list_meetup_matches(uuid) to authenticated;

create function public.create_match(meetup_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.create_match(meetup_id); $$;

create function public.set_match_lineup(
  match_id uuid,
  side_1_name text,
  side_1_players uuid[],
  side_2_name text,
  side_2_players uuid[]
)
returns text language sql security invoker set search_path = ''
as $$
  select private.set_match_lineup(
    match_id, side_1_name, side_1_players, side_2_name, side_2_players
  );
$$;

create function public.set_match_result(match_id uuid, payload jsonb)
returns text language sql security invoker set search_path = ''
as $$ select private.set_match_result(match_id, payload); $$;

create function public.submit_match(match_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select private.submit_match(match_id); $$;

create function public.confirm_match(match_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select private.confirm_match(match_id); $$;

create function public.dispute_match(match_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select private.dispute_match(match_id); $$;

create function public.revise_match_result(match_id uuid, payload jsonb)
returns integer language sql security invoker set search_path = ''
as $$ select private.revise_match_result(match_id, payload); $$;

create function public.void_match(match_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select private.void_match(match_id); $$;

create function public.list_meetup_matches(meetup_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.list_meetup_matches(meetup_id); $$;

revoke all on function public.create_match(uuid) from public, anon, authenticated;
revoke all on function public.set_match_lineup(uuid, text, uuid[], text, uuid[]) from public, anon, authenticated;
revoke all on function public.set_match_result(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_match(uuid) from public, anon, authenticated;
revoke all on function public.confirm_match(uuid) from public, anon, authenticated;
revoke all on function public.dispute_match(uuid) from public, anon, authenticated;
revoke all on function public.revise_match_result(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.void_match(uuid) from public, anon, authenticated;
revoke all on function public.list_meetup_matches(uuid) from public, anon, authenticated;

grant execute on function public.create_match(uuid) to authenticated;
grant execute on function public.set_match_lineup(uuid, text, uuid[], text, uuid[]) to authenticated;
grant execute on function public.set_match_result(uuid, jsonb) to authenticated;
grant execute on function public.submit_match(uuid) to authenticated;
grant execute on function public.confirm_match(uuid) to authenticated;
grant execute on function public.dispute_match(uuid) to authenticated;
grant execute on function public.revise_match_result(uuid, jsonb) to authenticated;
grant execute on function public.void_match(uuid) to authenticated;
grant execute on function public.list_meetup_matches(uuid) to authenticated;
