-- Relações sociais são consulta sobre as contribuições confirmadas.
-- Não há tabela de totais por dupla.
-- Companheiro: o mesmo lado em match_teams. Adversário: lados diferentes.
-- Cada par conta uma vez por partida, porque a chave da contribuição é (match_id, user_id).

create or replace function private.relationship_highlight_minimum()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select 5
$$;

create index match_player_statistics_user_sport_idx
on public.match_player_statistics (user_id, sport_id);

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
  perform pg_catalog.set_config('padre.statistic_write', 'on', true);
  delete from public.match_player_statistics as stats
  where stats.user_id = p_user_id
    and not exists (
      select 1
      from public.matches
      join public.match_players
        on match_players.match_id = matches.id
       and match_players.user_id = p_user_id
      where matches.id = stats.match_id
        and matches.status = 'confirmed'
    );
  perform pg_catalog.set_config('padre.statistic_write', 'off', true);

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
  perform pg_catalog.set_config('padre.statistic_write', 'on', true);
  delete from public.match_player_statistics as stats
  where not exists (
    select 1
    from public.matches
    where matches.id = stats.match_id
      and matches.status = 'confirmed'
  );
  perform pg_catalog.set_config('padre.statistic_write', 'off', true);

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

create or replace function private.relationship_json(
  p_user_id uuid,
  p_username text,
  p_matches integer,
  p_wins integer,
  p_losses integer,
  p_draws integer,
  p_win_rate numeric
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'username', p_username,
    'matches_played', p_matches,
    'wins', p_wins,
    'losses', p_losses,
    'draws', p_draws,
    'win_rate', p_win_rate
  )
$$;

create or replace function private.player_pair_statistics(
  p_user_id uuid,
  p_sport_id uuid,
  p_sport_format_id uuid,
  p_relation text,
  p_peer_ids uuid[]
)
returns table (
  user_id uuid,
  username text,
  matches_played integer,
  wins integer,
  losses integer,
  draws integer,
  win_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    other_stats.user_id,
    profiles.username,
    count(*)::integer,
    count(*) filter (where mine.result = 'win')::integer,
    count(*) filter (where mine.result = 'loss')::integer,
    count(*) filter (where mine.result = 'draw')::integer,
    pg_catalog.round(
      (count(*) filter (where mine.result = 'win'))::numeric / count(*) * 100,
      1
    )
  from public.match_player_statistics as mine
  join public.match_players as mine_players
    on mine_players.match_id = mine.match_id
   and mine_players.user_id = mine.user_id
  join public.match_teams as mine_teams
    on mine_teams.id = mine_players.team_id
  join public.match_player_statistics as other_stats
    on other_stats.match_id = mine.match_id
   and other_stats.user_id <> mine.user_id
   and other_stats.sport_id = mine.sport_id
  join public.match_players as other_players
    on other_players.match_id = other_stats.match_id
   and other_players.user_id = other_stats.user_id
  join public.match_teams as other_teams
    on other_teams.id = other_players.team_id
  join public.profiles on profiles.id = other_stats.user_id
  where mine.user_id = p_user_id
    and mine.sport_id = p_sport_id
    and (
      p_sport_format_id is null
      or mine.sport_format_id = p_sport_format_id
    )
    and (
      (p_relation = 'teammate' and other_teams.side = mine_teams.side)
      or (p_relation = 'opponent' and other_teams.side <> mine_teams.side)
    )
    and (
      p_peer_ids is null
      or other_stats.user_id = any (p_peer_ids)
    )
  group by other_stats.user_id, profiles.username
$$;

create or replace function private.list_relationships(
  p_user_id uuid,
  p_sport_id uuid,
  p_sport_format_id uuid,
  p_relation text,
  p_limit integer,
  p_offset integer,
  p_peer_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := coalesce(p_limit, 20);
  bounded_offset integer := coalesce(p_offset, 0);
  total integer;
  relationships jsonb;
begin
  if p_sport_id is null then
    raise exception 'sport required' using errcode = 'P0001';
  end if;
  if p_relation not in ('teammate', 'opponent') then
    raise exception 'invalid relationship' using errcode = 'P0001';
  end if;
  if bounded_limit < 1 then
    bounded_limit := 1;
  end if;
  if bounded_limit > 64 then
    bounded_limit := 64;
  end if;
  if bounded_offset < 0 then
    bounded_offset := 0;
  end if;

  select count(*)::integer into total
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, p_relation, p_peer_ids
  );

  select coalesce(pg_catalog.jsonb_agg(
    private.relationship_json(
      picked.user_id,
      picked.username,
      picked.matches_played,
      picked.wins,
      picked.losses,
      picked.draws,
      picked.win_rate
    )
    order by picked.matches_played desc, picked.wins desc, picked.losses desc,
      picked.username asc, picked.user_id asc
  ), '[]'::jsonb)
  into relationships
  from (
    select *
    from private.player_pair_statistics(
      p_user_id, p_sport_id, p_sport_format_id, p_relation, p_peer_ids
    )
    order by matches_played desc, wins desc, losses desc, username asc, user_id asc
    limit bounded_limit
    offset bounded_offset
  ) as picked;

  return pg_catalog.jsonb_build_object(
    'sport_id', p_sport_id,
    'sport_format_id', p_sport_format_id,
    'total', total,
    'limit', bounded_limit,
    'offset', bounded_offset,
    'relationships', relationships
  );
end;
$$;

create or replace function private.relationship_highlights(
  p_user_id uuid,
  p_sport_id uuid,
  p_sport_format_id uuid,
  p_peer_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  minimum integer := private.relationship_highlight_minimum();
  teammate_count integer;
  teammate_eligible integer;
  opponent_count integer;
  opponent_eligible integer;
  frequent_teammate jsonb;
  best_teammate jsonb;
  best_status text;
  frequent_opponent jsonb;
  defeated_opponent jsonb;
  defeated_status text;
  hardest_opponent jsonb;
  hardest_status text;
begin
  if p_sport_id is null then
    raise exception 'sport required' using errcode = 'P0001';
  end if;

  select count(*)::integer into teammate_count
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'teammate', p_peer_ids
  );
  select count(*)::integer into teammate_eligible
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'teammate', p_peer_ids
  )
  where matches_played >= minimum;
  select count(*)::integer into opponent_count
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'opponent', p_peer_ids
  );
  select count(*)::integer into opponent_eligible
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'opponent', p_peer_ids
  )
  where matches_played >= minimum;

  select private.relationship_json(
    pairs.user_id, pairs.username, pairs.matches_played,
    pairs.wins, pairs.losses, pairs.draws, pairs.win_rate
  )
  into frequent_teammate
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'teammate', p_peer_ids
  ) as pairs
  order by pairs.matches_played desc, pairs.wins desc, pairs.losses desc,
    pairs.username asc, pairs.user_id asc
  limit 1;

  if teammate_count = 0 then
    best_status := 'none';
  elsif teammate_eligible = 0 then
    best_status := 'insufficient_sample';
  else
    best_status := 'selected';
    select private.relationship_json(
      pairs.user_id, pairs.username, pairs.matches_played,
      pairs.wins, pairs.losses, pairs.draws, pairs.win_rate
    )
    into best_teammate
    from private.player_pair_statistics(
      p_user_id, p_sport_id, p_sport_format_id, 'teammate', p_peer_ids
    ) as pairs
    where pairs.matches_played >= minimum
    order by pairs.win_rate desc, pairs.matches_played desc, pairs.wins desc,
      pairs.username asc, pairs.user_id asc
    limit 1;
  end if;

  select private.relationship_json(
    pairs.user_id, pairs.username, pairs.matches_played,
    pairs.wins, pairs.losses, pairs.draws, pairs.win_rate
  )
  into frequent_opponent
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'opponent', p_peer_ids
  ) as pairs
  order by pairs.matches_played desc, pairs.wins desc, pairs.losses desc,
    pairs.username asc, pairs.user_id asc
  limit 1;

  select private.relationship_json(
    pairs.user_id, pairs.username, pairs.matches_played,
    pairs.wins, pairs.losses, pairs.draws, pairs.win_rate
  )
  into defeated_opponent
  from private.player_pair_statistics(
    p_user_id, p_sport_id, p_sport_format_id, 'opponent', p_peer_ids
  ) as pairs
  where pairs.wins > 0
  order by pairs.wins desc, pairs.matches_played desc, pairs.losses asc,
    pairs.username asc, pairs.user_id asc
  limit 1;
  defeated_status := case when defeated_opponent is null then 'none' else 'selected' end;

  if opponent_count = 0 then
    hardest_status := 'none';
  elsif opponent_eligible = 0 then
    hardest_status := 'insufficient_sample';
  else
    hardest_status := 'selected';
    select private.relationship_json(
      pairs.user_id, pairs.username, pairs.matches_played,
      pairs.wins, pairs.losses, pairs.draws, pairs.win_rate
    )
    into hardest_opponent
    from private.player_pair_statistics(
      p_user_id, p_sport_id, p_sport_format_id, 'opponent', p_peer_ids
    ) as pairs
    where pairs.matches_played >= minimum
    order by pairs.win_rate asc, pairs.losses desc, pairs.matches_played desc,
      pairs.username asc, pairs.user_id asc
    limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'sport_id', p_sport_id,
    'sport_format_id', p_sport_format_id,
    'minimum_matches', minimum,
    'most_frequent_teammate', frequent_teammate,
    'most_frequent_teammate_status',
      case when frequent_teammate is null then 'none' else 'selected' end,
    'best_teammate', best_teammate,
    'best_teammate_status', best_status,
    'most_frequent_opponent', frequent_opponent,
    'most_frequent_opponent_status',
      case when frequent_opponent is null then 'none' else 'selected' end,
    'most_defeated_opponent', defeated_opponent,
    'most_defeated_opponent_status', defeated_status,
    'hardest_opponent', hardest_opponent,
    'hardest_opponent_status', hardest_status
  );
end;
$$;

create or replace function private.my_teammate_statistics(
  p_sport_id uuid,
  p_sport_format_id uuid,
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
  bounded integer := coalesce(p_limit, 20);
begin
  actor := private.require_actor();
  if bounded > 50 then
    bounded := 50;
  end if;
  return private.list_relationships(
    actor, p_sport_id, p_sport_format_id, 'teammate', bounded, p_offset, null
  );
end;
$$;

create or replace function private.my_opponent_statistics(
  p_sport_id uuid,
  p_sport_format_id uuid,
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
  bounded integer := coalesce(p_limit, 20);
begin
  actor := private.require_actor();
  if bounded > 50 then
    bounded := 50;
  end if;
  return private.list_relationships(
    actor, p_sport_id, p_sport_format_id, 'opponent', bounded, p_offset, null
  );
end;
$$;

create or replace function private.my_relationship_highlights(
  p_sport_id uuid,
  p_sport_format_id uuid
)
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
  return private.relationship_highlights(
    actor, p_sport_id, p_sport_format_id, null
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

revoke all on function private.relationship_highlight_minimum() from public, anon, authenticated;
revoke all on function private.relationship_json(uuid, text, integer, integer, integer, integer, numeric) from public, anon, authenticated;
revoke all on function private.player_pair_statistics(uuid, uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function private.list_relationships(uuid, uuid, uuid, text, integer, integer, uuid[]) from public, anon, authenticated;
revoke all on function private.relationship_highlights(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.my_teammate_statistics(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function private.my_opponent_statistics(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function private.my_relationship_highlights(uuid, uuid) from public, anon, authenticated;
revoke all on function private.meetup_player_relationships(uuid, uuid) from public, anon, authenticated;

grant execute on function private.my_teammate_statistics(uuid, uuid, integer, integer) to authenticated;
grant execute on function private.my_opponent_statistics(uuid, uuid, integer, integer) to authenticated;
grant execute on function private.my_relationship_highlights(uuid, uuid) to authenticated;
grant execute on function private.meetup_player_relationships(uuid, uuid) to authenticated;

create function public.my_teammate_statistics(
  sport_id uuid,
  sport_format_id uuid default null,
  result_limit integer default 20,
  result_offset integer default 0
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.my_teammate_statistics(
    sport_id, sport_format_id, result_limit, result_offset
  )
$$;

create function public.my_opponent_statistics(
  sport_id uuid,
  sport_format_id uuid default null,
  result_limit integer default 20,
  result_offset integer default 0
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.my_opponent_statistics(
    sport_id, sport_format_id, result_limit, result_offset
  )
$$;

create function public.my_relationship_highlights(
  sport_id uuid,
  sport_format_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.my_relationship_highlights(sport_id, sport_format_id)
$$;

create function public.meetup_player_relationships(
  meetup_id uuid,
  player_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.meetup_player_relationships(meetup_id, player_id)
$$;

revoke all on function public.my_teammate_statistics(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.my_opponent_statistics(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.my_relationship_highlights(uuid, uuid) from public, anon, authenticated;
revoke all on function public.meetup_player_relationships(uuid, uuid) from public, anon, authenticated;

grant execute on function public.my_teammate_statistics(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.my_opponent_statistics(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.my_relationship_highlights(uuid, uuid) to authenticated;
grant execute on function public.meetup_player_relationships(uuid, uuid) to authenticated;
