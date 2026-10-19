-- Contribuição de cada jogador em cada partida confirmada.
-- A consulta agrega estas linhas. Não há contador editável.
-- Tiebreak de games não entra em games_won. O super tiebreak fica em deciding_points.
-- Reprocessar apaga o que deixou de valer e regrava a partir do resultado vigente.

create or replace function private.protect_statistic_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('padre.statistic_write', true) = 'on' then
    if tg_op = 'UPDATE'
      and (
        new.match_id is distinct from old.match_id
        or new.user_id is distinct from old.user_id
      ) then
      raise exception 'statistic identity is protected'
        using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct statistic writes are not allowed'
    using errcode = '42501';
end;
$$;

create table public.match_player_statistics (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  sport_format_id uuid not null references public.sport_formats (id) on delete restrict,
  scoring_rule_version_id uuid not null references public.scoring_rule_versions (id) on delete restrict,
  result text not null,
  points_for integer,
  points_against integer,
  goals_for integer,
  goals_against integer,
  sets_won integer,
  sets_lost integer,
  games_won integer,
  games_lost integer,
  deciding_points_for integer,
  deciding_points_against integer,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (match_id, user_id),
  constraint match_player_statistics_result_check check (
    result in ('win', 'loss', 'draw')
  ),
  constraint match_player_statistics_points_check check (
    (points_for is null and points_against is null)
    or (points_for >= 0 and points_against >= 0)
  ),
  constraint match_player_statistics_goals_check check (
    (goals_for is null and goals_against is null)
    or (goals_for >= 0 and goals_against >= 0)
  ),
  constraint match_player_statistics_sets_check check (
    (sets_won is null and sets_lost is null)
    or (sets_won >= 0 and sets_lost >= 0)
  ),
  constraint match_player_statistics_games_check check (
    (games_won is null and games_lost is null)
    or (games_won >= 0 and games_lost >= 0)
  ),
  constraint match_player_statistics_deciding_check check (
    (deciding_points_for is null and deciding_points_against is null)
    or (deciding_points_for >= 0 and deciding_points_against >= 0)
  )
);

create index match_player_statistics_user_idx
on public.match_player_statistics (user_id);

create trigger match_player_statistics_protect_write
before insert or update or delete on public.match_player_statistics
for each row execute function private.protect_statistic_write();

alter table public.match_player_statistics enable row level security;
alter table public.match_player_statistics force row level security;
revoke all on table public.match_player_statistics from public, anon, authenticated;

create or replace function private.match_side_tally(
  p_rule_type text,
  p_config jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  sets jsonb;
  elem jsonb;
  index integer;
  length integer;
  left_score integer;
  right_score integer;
  tie jsonb;
  tie_left integer;
  tie_right integer;
  points_for integer;
  points_against integer;
  goals_for integer;
  goals_against integer;
  sets_for integer;
  sets_against integer;
  games_for integer;
  games_against integer;
  deciding_for integer;
  deciding_against integer;
  winner integer;
begin
  if p_rule_type = 'goal_based' then
    goals_for := private.jsonb_whole_number(p_payload -> 'goals' -> 0);
    goals_against := private.jsonb_whole_number(p_payload -> 'goals' -> 1);
    if goals_for is null or goals_against is null or goals_for > 99 or goals_against > 99 then
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
    if goals_for > goals_against then
      winner := 1;
    elsif goals_against > goals_for then
      winner := 2;
    else
      winner := 0;
    end if;
    return pg_catalog.jsonb_build_object(
      'winner', winner,
      'points_for', null,
      'points_against', null,
      'goals_for', goals_for,
      'goals_against', goals_against,
      'sets_for', null,
      'sets_against', null,
      'games_for', null,
      'games_against', null,
      'deciding_points_for', null,
      'deciding_points_against', null
    );
  end if;

  sets := p_payload -> 'sets';
  if pg_catalog.jsonb_typeof(sets) is distinct from 'array' then
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;
  length := pg_catalog.jsonb_array_length(sets);
  sets_for := 0;
  sets_against := 0;

  if p_rule_type = 'set_based' then
    points_for := 0;
    points_against := 0;
    for index in 0 .. length - 1 loop
      elem := sets -> index;
      left_score := private.jsonb_whole_number(elem -> 0);
      right_score := private.jsonb_whole_number(elem -> 1);
      if left_score is null or right_score is null then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      points_for := points_for + left_score;
      points_against := points_against + right_score;
      if left_score > right_score then
        sets_for := sets_for + 1;
      elsif right_score > left_score then
        sets_against := sets_against + 1;
      else
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
    end loop;
    if sets_for > sets_against then
      winner := 1;
    elsif sets_against > sets_for then
      winner := 2;
    else
      raise exception 'invalid match result' using errcode = 'P0001';
    end if;
    return pg_catalog.jsonb_build_object(
      'winner', winner,
      'points_for', points_for,
      'points_against', points_against,
      'goals_for', null,
      'goals_against', null,
      'sets_for', sets_for,
      'sets_against', sets_against,
      'games_for', null,
      'games_against', null,
      'deciding_points_for', null,
      'deciding_points_against', null
    );
  end if;

  if p_rule_type is distinct from 'game_based' then
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;

  games_for := 0;
  games_against := 0;
  if pg_catalog.jsonb_typeof(p_config -> 'deciding_set_points') = 'number' then
    deciding_for := 0;
    deciding_against := 0;
  end if;

  for index in 0 .. length - 1 loop
    elem := sets -> index;
    if elem ? 'points' then
      if elem ? 'games' or deciding_for is null then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      left_score := private.jsonb_whole_number(elem -> 'points' -> 0);
      right_score := private.jsonb_whole_number(elem -> 'points' -> 1);
      if left_score is null or right_score is null or left_score = right_score then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      deciding_for := deciding_for + left_score;
      deciding_against := deciding_against + right_score;
      if left_score > right_score then
        sets_for := sets_for + 1;
      else
        sets_against := sets_against + 1;
      end if;
    else
      left_score := private.jsonb_whole_number(elem -> 'games' -> 0);
      right_score := private.jsonb_whole_number(elem -> 'games' -> 1);
      if left_score is null or right_score is null then
        raise exception 'invalid match result' using errcode = 'P0001';
      end if;
      games_for := games_for + left_score;
      games_against := games_against + right_score;
      tie := elem -> 'tiebreak';
      if tie is not null and pg_catalog.jsonb_typeof(tie) = 'array' then
        tie_left := private.jsonb_whole_number(tie -> 0);
        tie_right := private.jsonb_whole_number(tie -> 1);
        if tie_left is null or tie_right is null or tie_left = tie_right then
          raise exception 'invalid match result' using errcode = 'P0001';
        end if;
        if tie_left > tie_right then
          sets_for := sets_for + 1;
        else
          sets_against := sets_against + 1;
        end if;
      elsif left_score = right_score then
        raise exception 'invalid match result' using errcode = 'P0001';
      elsif left_score > right_score then
        sets_for := sets_for + 1;
      else
        sets_against := sets_against + 1;
      end if;
    end if;
  end loop;

  if sets_for > sets_against then
    winner := 1;
  elsif sets_against > sets_for then
    winner := 2;
  else
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;

  return pg_catalog.jsonb_build_object(
    'winner', winner,
    'points_for', null,
    'points_against', null,
    'goals_for', null,
    'goals_against', null,
    'sets_for', sets_for,
    'sets_against', sets_against,
    'games_for', games_for,
    'games_against', games_against,
    'deciding_points_for', deciding_for,
    'deciding_points_against', deciding_against
  );
end;
$$;

create or replace function private.project_match_statistics(p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.matches%rowtype;
  open_result public.match_results%rowtype;
  rule public.scoring_rule_versions%rowtype;
  format_row public.sport_formats%rowtype;
  tally jsonb;
  expected integer;
  written integer;
begin
  select * into found
  from public.matches
  where id = p_match_id
  for update;

  if found.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('padre.statistic_write', 'on', true);
  if found.status is distinct from 'confirmed' then
    delete from public.match_player_statistics
    where match_id = found.id;
    perform pg_catalog.set_config('padre.statistic_write', 'off', true);
    return 0;
  end if;

  select * into open_result
  from public.match_results
  where match_id = found.id and superseded_at is null;

  select * into rule
  from public.scoring_rule_versions
  where id = found.scoring_rule_version_id;

  select * into format_row
  from public.sport_formats
  where id = rule.format_id;

  tally := private.match_side_tally(rule.rule_type, rule.config, open_result.payload);
  expected := case open_result.outcome
    when 'side_1' then 1
    when 'side_2' then 2
    else 0
  end;
  if (tally ->> 'winner')::integer is distinct from expected then
    raise exception 'invalid match result' using errcode = 'P0001';
  end if;

  insert into public.match_player_statistics (
    match_id,
    user_id,
    sport_id,
    sport_format_id,
    scoring_rule_version_id,
    result,
    points_for,
    points_against,
    goals_for,
    goals_against,
    sets_won,
    sets_lost,
    games_won,
    games_lost,
    deciding_points_for,
    deciding_points_against,
    updated_at
  )
  select
    found.id,
    players.user_id,
    format_row.sport_id,
    format_row.id,
    found.scoring_rule_version_id,
    case
      when open_result.outcome = 'draw' then 'draw'
      when teams.side = expected then 'win'
      else 'loss'
    end,
    case
      when (tally ->> 'points_for') is null then null
      when teams.side = 1 then (tally ->> 'points_for')::integer
      else (tally ->> 'points_against')::integer
    end,
    case
      when (tally ->> 'points_for') is null then null
      when teams.side = 1 then (tally ->> 'points_against')::integer
      else (tally ->> 'points_for')::integer
    end,
    case
      when (tally ->> 'goals_for') is null then null
      when teams.side = 1 then (tally ->> 'goals_for')::integer
      else (tally ->> 'goals_against')::integer
    end,
    case
      when (tally ->> 'goals_for') is null then null
      when teams.side = 1 then (tally ->> 'goals_against')::integer
      else (tally ->> 'goals_for')::integer
    end,
    case
      when (tally ->> 'sets_for') is null then null
      when teams.side = 1 then (tally ->> 'sets_for')::integer
      else (tally ->> 'sets_against')::integer
    end,
    case
      when (tally ->> 'sets_for') is null then null
      when teams.side = 1 then (tally ->> 'sets_against')::integer
      else (tally ->> 'sets_for')::integer
    end,
    case
      when (tally ->> 'games_for') is null then null
      when teams.side = 1 then (tally ->> 'games_for')::integer
      else (tally ->> 'games_against')::integer
    end,
    case
      when (tally ->> 'games_for') is null then null
      when teams.side = 1 then (tally ->> 'games_against')::integer
      else (tally ->> 'games_for')::integer
    end,
    case
      when (tally ->> 'deciding_points_for') is null then null
      when teams.side = 1 then (tally ->> 'deciding_points_for')::integer
      else (tally ->> 'deciding_points_against')::integer
    end,
    case
      when (tally ->> 'deciding_points_for') is null then null
      when teams.side = 1 then (tally ->> 'deciding_points_against')::integer
      else (tally ->> 'deciding_points_for')::integer
    end,
    pg_catalog.now()
  from public.match_players as players
  join public.match_teams as teams on teams.id = players.team_id
  where players.match_id = found.id
  on conflict (match_id, user_id) do update set
    sport_id = excluded.sport_id,
    sport_format_id = excluded.sport_format_id,
    scoring_rule_version_id = excluded.scoring_rule_version_id,
    result = excluded.result,
    points_for = excluded.points_for,
    points_against = excluded.points_against,
    goals_for = excluded.goals_for,
    goals_against = excluded.goals_against,
    sets_won = excluded.sets_won,
    sets_lost = excluded.sets_lost,
    games_won = excluded.games_won,
    games_lost = excluded.games_lost,
    deciding_points_for = excluded.deciding_points_for,
    deciding_points_against = excluded.deciding_points_against,
    updated_at = excluded.updated_at;

  delete from public.match_player_statistics as stats
  where stats.match_id = found.id
    and not exists (
      select 1 from public.match_players as players
      where players.match_id = found.id
        and players.user_id = stats.user_id
    );

  select count(*)::integer into written
  from public.match_player_statistics
  where match_id = found.id;

  perform pg_catalog.set_config('padre.statistic_write', 'off', true);
  return written;
end;
$$;

create or replace function private.reproject_user_statistics(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  total integer := 0;
begin
  for target in
    select distinct matches.id
    from public.matches
    join public.match_players on match_players.match_id = matches.id
    where matches.status = 'confirmed'
      and match_players.user_id = p_user_id
    order by matches.id
  loop
    total := total + private.project_match_statistics(target);
  end loop;
  return total;
end;
$$;

create or replace function private.reproject_all_statistics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  total integer := 0;
begin
  for target in
    select matches.id
    from public.matches
    where matches.status = 'confirmed'
    order by matches.id
  loop
    total := total + private.project_match_statistics(target);
  end loop;
  return total;
end;
$$;

create or replace function private.aggregate_statistics(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sports jsonb := '[]'::jsonb;
  sport record;
  formats jsonb;
begin
  for sport in
    select
      stats.sport_id,
      sports_table.name as sport_name,
      rules.rule_type,
      count(*)::integer as matches_played,
      count(*) filter (where stats.result = 'win')::integer as wins,
      count(*) filter (where stats.result = 'loss')::integer as losses,
      count(*) filter (where stats.result = 'draw')::integer as draws,
      pg_catalog.round(
        (count(*) filter (where stats.result = 'win'))::numeric / count(*) * 100,
        1
      ) as win_rate,
      case when count(stats.points_for) = 0 then null else sum(stats.points_for)::integer end as points_for,
      case when count(stats.points_against) = 0 then null else sum(stats.points_against)::integer end as points_against,
      case when count(stats.goals_for) = 0 then null else sum(stats.goals_for)::integer end as goals_for,
      case when count(stats.goals_against) = 0 then null else sum(stats.goals_against)::integer end as goals_against,
      case when count(stats.sets_won) = 0 then null else sum(stats.sets_won)::integer end as sets_won,
      case when count(stats.sets_lost) = 0 then null else sum(stats.sets_lost)::integer end as sets_lost,
      case when count(stats.games_won) = 0 then null else sum(stats.games_won)::integer end as games_won,
      case when count(stats.games_lost) = 0 then null else sum(stats.games_lost)::integer end as games_lost,
      case when count(stats.deciding_points_for) = 0 then null else sum(stats.deciding_points_for)::integer end as deciding_points_for,
      case when count(stats.deciding_points_against) = 0 then null else sum(stats.deciding_points_against)::integer end as deciding_points_against
    from public.match_player_statistics as stats
    join public.sports as sports_table on sports_table.id = stats.sport_id
    join public.scoring_rule_versions as rules
      on rules.id = stats.scoring_rule_version_id
    where stats.user_id = p_user_id
    group by stats.sport_id, sports_table.name, rules.rule_type
    order by sports_table.name, rules.rule_type
  loop
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sport_format_id', format_row.sport_format_id,
        'format_name', format_row.format_name,
        'matches_played', format_row.matches_played,
        'wins', format_row.wins,
        'losses', format_row.losses,
        'draws', format_row.draws,
        'win_rate', format_row.win_rate,
        'points_for', format_row.points_for,
        'points_against', format_row.points_against,
        'goals_for', format_row.goals_for,
        'goals_against', format_row.goals_against,
        'sets_won', format_row.sets_won,
        'sets_lost', format_row.sets_lost,
        'games_won', format_row.games_won,
        'games_lost', format_row.games_lost,
        'deciding_points_for', format_row.deciding_points_for,
        'deciding_points_against', format_row.deciding_points_against
      )) order by format_row.format_name
    ), '[]'::jsonb)
    into formats
    from (
      select
        stats.sport_format_id,
        formats_table.name as format_name,
        count(*)::integer as matches_played,
        count(*) filter (where stats.result = 'win')::integer as wins,
        count(*) filter (where stats.result = 'loss')::integer as losses,
        count(*) filter (where stats.result = 'draw')::integer as draws,
        pg_catalog.round(
          (count(*) filter (where stats.result = 'win'))::numeric / count(*) * 100,
          1
        ) as win_rate,
        case when count(stats.points_for) = 0 then null else sum(stats.points_for)::integer end as points_for,
        case when count(stats.points_against) = 0 then null else sum(stats.points_against)::integer end as points_against,
        case when count(stats.goals_for) = 0 then null else sum(stats.goals_for)::integer end as goals_for,
        case when count(stats.goals_against) = 0 then null else sum(stats.goals_against)::integer end as goals_against,
        case when count(stats.sets_won) = 0 then null else sum(stats.sets_won)::integer end as sets_won,
        case when count(stats.sets_lost) = 0 then null else sum(stats.sets_lost)::integer end as sets_lost,
        case when count(stats.games_won) = 0 then null else sum(stats.games_won)::integer end as games_won,
        case when count(stats.games_lost) = 0 then null else sum(stats.games_lost)::integer end as games_lost,
        case when count(stats.deciding_points_for) = 0 then null else sum(stats.deciding_points_for)::integer end as deciding_points_for,
        case when count(stats.deciding_points_against) = 0 then null else sum(stats.deciding_points_against)::integer end as deciding_points_against
      from public.match_player_statistics as stats
      join public.sport_formats as formats_table
        on formats_table.id = stats.sport_format_id
      join public.scoring_rule_versions as rules
        on rules.id = stats.scoring_rule_version_id
      where stats.user_id = p_user_id
        and stats.sport_id = sport.sport_id
        and rules.rule_type = sport.rule_type
      group by stats.sport_format_id, formats_table.name
    ) as format_row;

    sports := sports || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sport_id', sport.sport_id,
        'sport_name', sport.sport_name,
        'rule_type', sport.rule_type,
        'matches_played', sport.matches_played,
        'wins', sport.wins,
        'losses', sport.losses,
        'draws', sport.draws,
        'win_rate', sport.win_rate,
        'points_for', sport.points_for,
        'points_against', sport.points_against,
        'goals_for', sport.goals_for,
        'goals_against', sport.goals_against,
        'sets_won', sport.sets_won,
        'sets_lost', sport.sets_lost,
        'games_won', sport.games_won,
        'games_lost', sport.games_lost,
        'deciding_points_for', sport.deciding_points_for,
        'deciding_points_against', sport.deciding_points_against,
        'formats', formats
      ))
    );
  end loop;

  return pg_catalog.jsonb_build_object('sports', sports);
end;
$$;

create or replace function private.my_statistics()
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
  return private.aggregate_statistics(actor);
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
    perform private.project_match_statistics(found.id);
    perform pg_catalog.set_config('padre.match_write', 'off', true);
    return 'confirmed';
  end if;

  perform pg_catalog.set_config('padre.match_write', 'off', true);
  return 'pending_confirmation';
end;
$$;

revoke all on function private.protect_statistic_write() from public, anon, authenticated;
revoke all on function private.match_side_tally(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.project_match_statistics(uuid) from public, anon, authenticated;
revoke all on function private.reproject_user_statistics(uuid) from public, anon, authenticated;
revoke all on function private.reproject_all_statistics() from public, anon, authenticated;
revoke all on function private.aggregate_statistics(uuid) from public, anon, authenticated;
revoke all on function private.my_statistics() from public, anon, authenticated;
revoke all on function private.meetup_participant_statistics(uuid) from public, anon, authenticated;

grant execute on function private.my_statistics() to authenticated;
grant execute on function private.meetup_participant_statistics(uuid) to authenticated;

create function public.my_statistics()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.my_statistics(); $$;

create function public.meetup_participant_statistics(meetup_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.meetup_participant_statistics(meetup_id); $$;

revoke all on function public.my_statistics() from public, anon, authenticated;
revoke all on function public.meetup_participant_statistics(uuid) from public, anon, authenticated;
grant execute on function public.my_statistics() to authenticated;
grant execute on function public.meetup_participant_statistics(uuid) to authenticated;

select private.reproject_all_statistics();
