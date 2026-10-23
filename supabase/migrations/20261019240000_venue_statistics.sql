-- Desempenho por local cadastrado.
-- A fonte continua sendo match_player_statistics. Não há tabela de totais.
-- O agrupamento é venue_id. Nome, endereço e snapshot não identificam o local.
-- venue_id nulo fica fora de qualquer local. Partida que não está confirmed não entra.
-- Os índices atuais cobrem o caminho: usuário, partida, encontro e venue_id.
-- Se o volume crescer, o próximo passo é uma projeção por (user_id, venue_id, sport_id),
-- reconstruída pela mesma project_match_statistics, sem contador editável.

create function private.resolve_statistic_filter(
  p_sport_id uuid,
  p_format_id uuid
)
returns table (sport_id uuid, format_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  format_sport uuid;
begin
  if p_format_id is not null then
    select sport_formats.sport_id into format_sport
    from public.sport_formats
    where sport_formats.id = p_format_id;
    if format_sport is null
      or (p_sport_id is not null and p_sport_id is distinct from format_sport) then
      raise exception 'invalid statistic filter' using errcode = 'P0001';
    end if;
    sport_id := format_sport;
    format_id := p_format_id;
    return next;
    return;
  end if;

  if p_sport_id is not null and not exists (
    select 1 from public.sports where sports.id = p_sport_id
  ) then
    raise exception 'invalid statistic filter' using errcode = 'P0001';
  end if;
  sport_id := p_sport_id;
  format_id := null;
  return next;
end;
$$;

create function private.contribution_sports(
  p_user_id uuid,
  p_scope text,
  p_venue_id uuid,
  p_sport_id uuid,
  p_format_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      stats.result,
      stats.points_for,
      stats.points_against,
      stats.goals_for,
      stats.goals_against,
      stats.sets_won,
      stats.sets_lost,
      stats.games_won,
      stats.games_lost,
      stats.deciding_points_for,
      stats.deciding_points_against,
      stats.sport_id,
      stats.sport_format_id,
      sports.name as sport_name,
      formats.name as format_name,
      rules.rule_type
    from public.match_player_statistics as stats
    join public.matches
      on matches.id = stats.match_id
     and matches.status = 'confirmed'
    join public.meetups on meetups.id = matches.meetup_id
    join public.sports on sports.id = stats.sport_id
    join public.sport_formats as formats on formats.id = stats.sport_format_id
    join public.scoring_rule_versions as rules
      on rules.id = stats.scoring_rule_version_id
    where stats.user_id = p_user_id
      and (
        (p_scope = 'unassigned' and meetups.venue_id is null)
        or (p_scope = 'venue' and meetups.venue_id = p_venue_id)
      )
      and (p_sport_id is null or stats.sport_id = p_sport_id)
      and (p_format_id is null or stats.sport_format_id = p_format_id)
  ),
  format_rows as (
    select
      filtered.sport_id,
      filtered.rule_type,
      filtered.sport_format_id,
      filtered.format_name,
      count(*)::integer as matches_played,
      count(*) filter (where filtered.result = 'win')::integer as wins,
      count(*) filter (where filtered.result = 'loss')::integer as losses,
      count(*) filter (where filtered.result = 'draw')::integer as draws,
      pg_catalog.round(
        (count(*) filter (where filtered.result = 'win'))::numeric
          / count(*) * 100,
        1
      ) as win_rate,
      case when count(filtered.points_for) = 0 then null
        else sum(filtered.points_for)::integer end as points_for,
      case when count(filtered.points_against) = 0 then null
        else sum(filtered.points_against)::integer end as points_against,
      case when count(filtered.goals_for) = 0 then null
        else sum(filtered.goals_for)::integer end as goals_for,
      case when count(filtered.goals_against) = 0 then null
        else sum(filtered.goals_against)::integer end as goals_against,
      case when count(filtered.sets_won) = 0 then null
        else sum(filtered.sets_won)::integer end as sets_won,
      case when count(filtered.sets_lost) = 0 then null
        else sum(filtered.sets_lost)::integer end as sets_lost,
      case when count(filtered.games_won) = 0 then null
        else sum(filtered.games_won)::integer end as games_won,
      case when count(filtered.games_lost) = 0 then null
        else sum(filtered.games_lost)::integer end as games_lost,
      case when count(filtered.deciding_points_for) = 0 then null
        else sum(filtered.deciding_points_for)::integer end as deciding_points_for,
      case when count(filtered.deciding_points_against) = 0 then null
        else sum(filtered.deciding_points_against)::integer end as deciding_points_against
    from filtered
    group by
      filtered.sport_id,
      filtered.rule_type,
      filtered.sport_format_id,
      filtered.format_name
  ),
  sport_rows as (
    select
      filtered.sport_id,
      filtered.sport_name,
      filtered.rule_type,
      count(*)::integer as matches_played,
      count(*) filter (where filtered.result = 'win')::integer as wins,
      count(*) filter (where filtered.result = 'loss')::integer as losses,
      count(*) filter (where filtered.result = 'draw')::integer as draws,
      pg_catalog.round(
        (count(*) filter (where filtered.result = 'win'))::numeric
          / count(*) * 100,
        1
      ) as win_rate,
      case when count(filtered.points_for) = 0 then null
        else sum(filtered.points_for)::integer end as points_for,
      case when count(filtered.points_against) = 0 then null
        else sum(filtered.points_against)::integer end as points_against,
      case when count(filtered.goals_for) = 0 then null
        else sum(filtered.goals_for)::integer end as goals_for,
      case when count(filtered.goals_against) = 0 then null
        else sum(filtered.goals_against)::integer end as goals_against,
      case when count(filtered.sets_won) = 0 then null
        else sum(filtered.sets_won)::integer end as sets_won,
      case when count(filtered.sets_lost) = 0 then null
        else sum(filtered.sets_lost)::integer end as sets_lost,
      case when count(filtered.games_won) = 0 then null
        else sum(filtered.games_won)::integer end as games_won,
      case when count(filtered.games_lost) = 0 then null
        else sum(filtered.games_lost)::integer end as games_lost,
      case when count(filtered.deciding_points_for) = 0 then null
        else sum(filtered.deciding_points_for)::integer end as deciding_points_for,
      case when count(filtered.deciding_points_against) = 0 then null
        else sum(filtered.deciding_points_against)::integer end as deciding_points_against
    from filtered
    group by filtered.sport_id, filtered.sport_name, filtered.rule_type
  )
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sport_id', sport_rows.sport_id,
        'sport_name', sport_rows.sport_name,
        'rule_type', sport_rows.rule_type,
        'matches_played', sport_rows.matches_played,
        'wins', sport_rows.wins,
        'losses', sport_rows.losses,
        'draws', sport_rows.draws,
        'win_rate', sport_rows.win_rate,
        'points_for', sport_rows.points_for,
        'points_against', sport_rows.points_against,
        'goals_for', sport_rows.goals_for,
        'goals_against', sport_rows.goals_against,
        'sets_won', sport_rows.sets_won,
        'sets_lost', sport_rows.sets_lost,
        'games_won', sport_rows.games_won,
        'games_lost', sport_rows.games_lost,
        'deciding_points_for', sport_rows.deciding_points_for,
        'deciding_points_against', sport_rows.deciding_points_against,
        'formats', (
          select coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'sport_format_id', format_rows.sport_format_id,
              'format_name', format_rows.format_name,
              'matches_played', format_rows.matches_played,
              'wins', format_rows.wins,
              'losses', format_rows.losses,
              'draws', format_rows.draws,
              'win_rate', format_rows.win_rate,
              'points_for', format_rows.points_for,
              'points_against', format_rows.points_against,
              'goals_for', format_rows.goals_for,
              'goals_against', format_rows.goals_against,
              'sets_won', format_rows.sets_won,
              'sets_lost', format_rows.sets_lost,
              'games_won', format_rows.games_won,
              'games_lost', format_rows.games_lost,
              'deciding_points_for', format_rows.deciding_points_for,
              'deciding_points_against', format_rows.deciding_points_against
            )) order by format_rows.format_name
          ), '[]'::jsonb)
          from format_rows
          where format_rows.sport_id = sport_rows.sport_id
            and format_rows.rule_type = sport_rows.rule_type
        )
      )) order by sport_rows.sport_name, sport_rows.rule_type
    )
    from sport_rows
  ), '[]'::jsonb);
$$;

create function private.venue_statistic_row(
  p_actor uuid,
  p_venue public.venues,
  p_sport_id uuid,
  p_format_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  visible boolean;
  slug text;
begin
  visible := (
    p_venue.community_id is null and p_venue.created_by = p_actor
  ) or (
    p_venue.community_id is not null
    and private.active_community_role(p_venue.community_id, p_actor) is not null
  );
  if visible and p_venue.community_id is not null then
    select communities.slug into slug
    from public.communities
    where communities.id = p_venue.community_id;
  end if;

  if not visible then
    return pg_catalog.jsonb_build_object(
      'venue_id', p_venue.id,
      'visible', false,
      'sports', private.contribution_sports(
        p_actor, 'venue', p_venue.id, p_sport_id, p_format_id
      )
    );
  end if;

  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'venue_id', p_venue.id,
    'visible', true,
    'name', p_venue.name,
    'address', p_venue.address,
    'status', p_venue.status,
    'scope', case when p_venue.community_id is null then 'personal' else 'community' end,
    'latitude', p_venue.latitude::float8,
    'longitude', p_venue.longitude::float8,
    'community_slug', slug,
    'sports', private.contribution_sports(
      p_actor, 'venue', p_venue.id, p_sport_id, p_format_id
    )
  ));
end;
$$;

create function private.my_venue_statistics(
  p_sport_id uuid default null,
  p_format_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  chosen_sport uuid;
  chosen_format uuid;
  rows jsonb;
  total integer;
begin
  actor := private.require_actor();
  select resolved.sport_id, resolved.format_id
  into chosen_sport, chosen_format
  from private.resolve_statistic_filter(p_sport_id, p_format_id) as resolved;

  select count(*)::integer into total
  from (
    select meetups.venue_id
    from public.match_player_statistics as stats
    join public.matches
      on matches.id = stats.match_id
     and matches.status = 'confirmed'
    join public.meetups on meetups.id = matches.meetup_id
    where stats.user_id = actor
      and meetups.venue_id is not null
      and (chosen_sport is null or stats.sport_id = chosen_sport)
      and (chosen_format is null or stats.sport_format_id = chosen_format)
    group by meetups.venue_id
  ) as venues_played;

  select coalesce(pg_catalog.jsonb_agg(ranked.row order by ranked.matches_played desc, ranked.venue_id), '[]'::jsonb)
  into rows
  from (
    select
      meetups.venue_id,
      count(*)::integer as matches_played,
      private.venue_statistic_row(actor, venue, chosen_sport, chosen_format) as row
    from public.match_player_statistics as stats
    join public.matches
      on matches.id = stats.match_id
     and matches.status = 'confirmed'
    join public.meetups on meetups.id = matches.meetup_id
    join public.venues as venue on venue.id = meetups.venue_id
    where stats.user_id = actor
      and (chosen_sport is null or stats.sport_id = chosen_sport)
      and (chosen_format is null or stats.sport_format_id = chosen_format)
    group by meetups.venue_id, venue.id
    order by count(*) desc, meetups.venue_id
    limit 100
  ) as ranked;

  return pg_catalog.jsonb_build_object(
    'venues', rows,
    'truncated', total > 100,
    'unassigned', pg_catalog.jsonb_build_object(
      'sports', private.contribution_sports(
        actor, 'unassigned', null, chosen_sport, chosen_format
      )
    )
  );
end;
$$;

create function private.my_venue_statistic(
  p_venue_id uuid,
  p_sport_id uuid default null,
  p_format_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  chosen_sport uuid;
  chosen_format uuid;
  found public.venues%rowtype;
  played boolean;
begin
  actor := private.require_actor();
  if p_venue_id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  select resolved.sport_id, resolved.format_id
  into chosen_sport, chosen_format
  from private.resolve_statistic_filter(p_sport_id, p_format_id) as resolved;

  select * into found from public.venues where id = p_venue_id;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  played := exists (
    select 1
    from public.match_player_statistics as stats
    join public.matches
      on matches.id = stats.match_id
     and matches.status = 'confirmed'
    join public.meetups on meetups.id = matches.meetup_id
    where stats.user_id = actor
      and meetups.venue_id = found.id
  );
  if not played and not (
    (found.community_id is null and found.created_by = actor)
    or (
      found.community_id is not null
      and private.active_community_role(found.community_id, actor) is not null
    )
  ) then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  return private.venue_statistic_row(actor, found, chosen_sport, chosen_format);
end;
$$;

create function private.community_venue_usage(p_slug text)
returns jsonb
language plpgsql
stable
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

  return pg_catalog.jsonb_build_object(
    'venues',
    coalesce((
      select pg_catalog.jsonb_agg(usage.row order by usage.name, usage.venue_id)
      from (
        select
          venue.id as venue_id,
          venue.name,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'venue_id', venue.id,
            'name', venue.name,
            'address', venue.address,
            'status', venue.status,
            'latitude', venue.latitude::float8,
            'longitude', venue.longitude::float8,
            'scheduled_meetups', (
              select count(*)::integer
              from public.meetups
              where meetups.venue_id = venue.id
                and meetups.status = 'scheduled'
            ),
            'cancelled_meetups', (
              select count(*)::integer
              from public.meetups
              where meetups.venue_id = venue.id
                and meetups.status = 'cancelled'
            ),
            'meetups_with_confirmed_matches', (
              select count(distinct meetups.id)::integer
              from public.meetups
              join public.matches on matches.meetup_id = meetups.id
              where meetups.venue_id = venue.id
                and matches.status = 'confirmed'
            ),
            'confirmed_matches', (
              select count(distinct matches.id)::integer
              from public.meetups
              join public.matches on matches.meetup_id = meetups.id
              where meetups.venue_id = venue.id
                and matches.status = 'confirmed'
            ),
            'sports', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'sport_id', played.sport_id,
                'sport_name', played.sport_name,
                'confirmed_matches', played.confirmed_matches
              ) order by played.sport_name)
              from (
                select
                  sports.id as sport_id,
                  sports.name as sport_name,
                  count(distinct matches.id)::integer as confirmed_matches
                from public.meetups
                join public.matches on matches.meetup_id = meetups.id
                join public.scoring_rule_versions as rules
                  on rules.id = matches.scoring_rule_version_id
                join public.sport_formats as formats on formats.id = rules.format_id
                join public.sports on sports.id = formats.sport_id
                where meetups.venue_id = venue.id
                  and matches.status = 'confirmed'
                group by sports.id, sports.name
              ) as played
            ), '[]'::jsonb)
          )) as row
        from public.venues as venue
        where venue.community_id = community.id
        order by venue.name, venue.id
        limit 100
      ) as usage
    ), '[]'::jsonb)
  );
end;
$$;

create function public.my_venue_statistics(
  sport_id uuid default null,
  sport_format_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.my_venue_statistics(sport_id, sport_format_id);
$$;

create function public.my_venue_statistic(
  venue_id uuid,
  sport_id uuid default null,
  sport_format_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.my_venue_statistic(venue_id, sport_id, sport_format_id);
$$;

create function public.community_venue_usage(slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.community_venue_usage(slug);
$$;

revoke all on function private.resolve_statistic_filter(uuid, uuid) from public, anon, authenticated;
revoke all on function private.contribution_sports(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.venue_statistic_row(uuid, public.venues, uuid, uuid) from public, anon, authenticated;
revoke all on function private.my_venue_statistics(uuid, uuid) from public, anon, authenticated;
revoke all on function private.my_venue_statistic(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.community_venue_usage(text) from public, anon, authenticated;
revoke all on function public.my_venue_statistics(uuid, uuid) from public, anon, authenticated;
revoke all on function public.my_venue_statistic(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.community_venue_usage(text) from public, anon, authenticated;

grant execute on function private.my_venue_statistics(uuid, uuid) to authenticated;
grant execute on function private.my_venue_statistic(uuid, uuid, uuid) to authenticated;
grant execute on function private.community_venue_usage(text) to authenticated;
grant execute on function public.my_venue_statistics(uuid, uuid) to authenticated;
grant execute on function public.my_venue_statistic(uuid, uuid, uuid) to authenticated;
grant execute on function public.community_venue_usage(text) to authenticated;
