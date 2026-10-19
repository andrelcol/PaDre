-- Enquetes da comunidade. Um mecanismo de opções e votos para todas as categorias.
-- O prazo é um instante absoluto. A leitura calcula o estado efetivo com now().
-- Voto individual não sai da função. Não há contador separado da tabela de votos.
-- created_by e closed_by ficam nulos se a conta for excluída. O voto sai com a conta.
-- A enquete não entra na trava de histórico esportivo.

create table public.community_polls (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  question text not null,
  description text not null default '',
  kind text not null,
  selection_mode text not null,
  max_selections integer not null,
  status text not null default 'open',
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  constraint community_polls_question_check check (
    char_length(question) between 3 and 140
  ),
  constraint community_polls_description_check check (
    char_length(description) <= 500
  ),
  constraint community_polls_kind_check check (
    kind in ('general', 'sport', 'schedule', 'location')
  ),
  constraint community_polls_mode_check check (
    selection_mode in ('single', 'multiple')
  ),
  constraint community_polls_status_check check (
    status in ('open', 'closed', 'cancelled')
  ),
  constraint community_polls_max_check check (
    (
      selection_mode = 'single'
      and max_selections = 1
    )
    or (
      selection_mode = 'multiple'
      and max_selections between 1 and 10
    )
  ),
  constraint community_polls_closed_check check (
    (
      status = 'open'
      and closed_at is null
    )
    or (
      status in ('closed', 'cancelled')
      and closed_at is not null
    )
  )
);

create table public.community_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  label text not null,
  position integer not null,
  sport_id uuid references public.sports (id) on delete restrict,
  starts_at timestamptz,
  time_zone text,
  constraint community_poll_options_label_check check (
    char_length(label) between 1 and 80
  ),
  constraint community_poll_options_position_check check (
    position between 1 and 10
  ),
  constraint community_poll_options_schedule_check check (
    (
      starts_at is null
      and time_zone is null
    )
    or (
      starts_at is not null
      and time_zone is not null
      and private.is_iana_time_zone(time_zone)
    )
  ),
  constraint community_poll_options_position_unique unique (poll_id, position)
);

create unique index community_poll_options_label_unique
  on public.community_poll_options (poll_id, lower(label));

create unique index community_poll_options_sport_unique
  on public.community_poll_options (poll_id, sport_id)
  where sport_id is not null;

create unique index community_poll_options_instant_unique
  on public.community_poll_options (poll_id, starts_at)
  where starts_at is not null;

create table public.community_poll_votes (
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_id uuid not null references public.community_poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option_id)
);

create index community_polls_community_created_idx
  on public.community_polls (community_id, created_at desc, id desc);

create index community_polls_author_recent_idx
  on public.community_polls (community_id, created_by, created_at desc);

create index community_poll_votes_option_idx
  on public.community_poll_votes (option_id);

alter table public.community_polls enable row level security;
alter table public.community_polls force row level security;
alter table public.community_poll_options enable row level security;
alter table public.community_poll_options force row level security;
alter table public.community_poll_votes enable row level security;
alter table public.community_poll_votes force row level security;

revoke all on table public.community_polls from public, anon, authenticated;
revoke all on table public.community_poll_options from public, anon, authenticated;
revoke all on table public.community_poll_votes from public, anon, authenticated;

create function private.poll_label(p_label text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_label, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if normalized = ''
    or pg_catalog.char_length(normalized) > 80
    or normalized ~ '[[:cntrl:]]' then
    raise exception 'invalid option' using errcode = 'P0001';
  end if;
  return normalized;
end;
$$;

create function private.poll_question(p_question text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_question, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if pg_catalog.char_length(normalized) < 3
    or pg_catalog.char_length(normalized) > 140
    or normalized ~ '[[:cntrl:]]' then
    raise exception 'invalid poll' using errcode = 'P0001';
  end if;
  return normalized;
end;
$$;

create function private.poll_description(p_description text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := pg_catalog.btrim(coalesce(p_description, ''));
  if pg_catalog.char_length(normalized) > 500
    or normalized ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'invalid poll' using errcode = 'P0001';
  end if;
  return normalized;
end;
$$;

create function private.poll_effective_status(
  p_status text,
  p_closes_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when p_status = 'closed' or p_closes_at <= pg_catalog.now() then 'closed'
    else 'open'
  end;
$$;

create or replace function private.protect_community_poll_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  poll_status text;
  poll_closes_at timestamptz;
  poll_kind text;
  poll_max integer;
  vote_count integer;
begin
  if pg_catalog.current_setting('padre.poll_write', true) = 'on' then
    if tg_table_name = 'community_polls' then
      if tg_op = 'UPDATE' then
        if old.status <> 'open'
          or new.status not in ('closed', 'cancelled')
          or new.closed_at is null
          or new.closed_by is null
          or new.id is distinct from old.id
          or new.community_id is distinct from old.community_id
          or new.created_by is distinct from old.created_by
          or new.question is distinct from old.question
          or new.description is distinct from old.description
          or new.kind is distinct from old.kind
          or new.selection_mode is distinct from old.selection_mode
          or new.max_selections is distinct from old.max_selections
          or new.closes_at is distinct from old.closes_at
          or new.created_at is distinct from old.created_at then
          raise exception 'poll is immutable' using errcode = '42501';
        end if;
      elsif tg_op <> 'INSERT' then
        raise exception 'poll is immutable' using errcode = '42501';
      end if;
      return coalesce(new, old);
    end if;

    if tg_table_name = 'community_poll_options' then
      if tg_op <> 'INSERT' then
        raise exception 'poll is immutable' using errcode = '42501';
      end if;
      select kind into poll_kind
      from public.community_polls
      where id = new.poll_id;
      if poll_kind is null then
        raise exception 'invalid option' using errcode = 'P0001';
      end if;
      if poll_kind = 'sport' then
        if new.sport_id is null
          or new.starts_at is not null
          or new.time_zone is not null then
          raise exception 'invalid option' using errcode = 'P0001';
        end if;
      elsif new.sport_id is not null then
        raise exception 'invalid option' using errcode = 'P0001';
      elsif poll_kind = 'schedule' then
        if (new.starts_at is null) <> (new.time_zone is null) then
          raise exception 'invalid schedule' using errcode = 'P0001';
        end if;
      elsif new.starts_at is not null or new.time_zone is not null then
        raise exception 'invalid option' using errcode = 'P0001';
      end if;
      return new;
    end if;

    if tg_table_name = 'community_poll_votes' then
      if tg_op = 'UPDATE' then
        raise exception 'poll is immutable' using errcode = '42501';
      end if;
      if tg_op = 'INSERT' then
        if session_user <> 'postgres'
          and new.user_id is distinct from auth.uid() then
          raise exception 'not allowed' using errcode = '42501';
        end if;
        if not exists (
          select 1
          from public.community_poll_options option
          where option.id = new.option_id
            and option.poll_id = new.poll_id
        ) then
          raise exception 'option is not in poll' using errcode = 'P0001';
        end if;
        select status, closes_at, max_selections
          into poll_status, poll_closes_at, poll_max
        from public.community_polls
        where id = new.poll_id;
        if poll_status = 'cancelled' then
          raise exception 'poll cancelled' using errcode = 'P0001';
        end if;
        if poll_status is distinct from 'open'
          or poll_closes_at <= pg_catalog.clock_timestamp() then
          raise exception 'poll closed' using errcode = 'P0001';
        end if;
        select count(*)::integer into vote_count
        from public.community_poll_votes vote
        where vote.poll_id = new.poll_id
          and vote.user_id = new.user_id;
        if vote_count + 1 > poll_max then
          raise exception 'too many selections' using errcode = 'P0001';
        end if;
        return new;
      end if;
      if session_user <> 'postgres'
        and (
          old.user_id is distinct from auth.uid()
          or not exists (
            select 1
            from public.community_polls poll
            where poll.id = old.poll_id
              and poll.status = 'open'
              and poll.closes_at > pg_catalog.clock_timestamp()
          )
        ) then
        raise exception 'not allowed' using errcode = '42501';
      end if;
      return old;
    end if;
  end if;

  if tg_op = 'UPDATE' and tg_table_name = 'community_polls' then
    if (
        new.created_by is distinct from old.created_by
        or new.closed_by is distinct from old.closed_by
      )
      and (new.created_by is null or new.created_by is not distinct from old.created_by)
      and (new.closed_by is null or new.closed_by is not distinct from old.closed_by)
      and new.id is not distinct from old.id
      and new.community_id is not distinct from old.community_id
      and new.question is not distinct from old.question
      and new.description is not distinct from old.description
      and new.kind is not distinct from old.kind
      and new.selection_mode is not distinct from old.selection_mode
      and new.max_selections is not distinct from old.max_selections
      and new.status is not distinct from old.status
      and new.closes_at is not distinct from old.closes_at
      and new.created_at is not distinct from old.created_at
      and new.closed_at is not distinct from old.closed_at then
      return new;
    end if;

    if session_user = 'postgres'
      and new.closes_at is distinct from old.closes_at
      and new.id is not distinct from old.id
      and new.community_id is not distinct from old.community_id
      and new.created_by is not distinct from old.created_by
      and new.question is not distinct from old.question
      and new.description is not distinct from old.description
      and new.kind is not distinct from old.kind
      and new.selection_mode is not distinct from old.selection_mode
      and new.max_selections is not distinct from old.max_selections
      and new.status is not distinct from old.status
      and new.created_at is not distinct from old.created_at
      and new.closed_at is not distinct from old.closed_at
      and new.closed_by is not distinct from old.closed_by then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' and session_user = 'postgres' then
    return old;
  end if;

  raise exception 'direct poll writes are not allowed' using errcode = '42501';
end;
$$;

create trigger community_polls_protect
  before insert or update or delete on public.community_polls
  for each row execute function private.protect_community_poll_write();

create trigger community_poll_options_protect
  before insert or update or delete on public.community_poll_options
  for each row execute function private.protect_community_poll_write();

create trigger community_poll_votes_protect
  before insert or update or delete on public.community_poll_votes
  for each row execute function private.protect_community_poll_write();

create function private.community_poll_json(p_poll_id uuid, p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found public.community_polls%rowtype;
  actor_role text;
  participants integer;
  top_votes integer;
  effective text;
  options jsonb := '[]'::jsonb;
  mine jsonb;
  author_name text;
  option_row record;
begin
  select * into found
  from public.community_polls
  where id = p_poll_id;
  if found.id is null then
    return null;
  end if;

  actor_role := private.active_community_role(found.community_id, p_actor);
  effective := private.poll_effective_status(found.status, found.closes_at);

  select count(distinct vote.user_id)::integer into participants
  from public.community_poll_votes vote
  where vote.poll_id = found.id;

  select coalesce(max(tally.votes), 0)::integer into top_votes
  from (
    select count(*)::integer as votes
    from public.community_poll_votes vote
    where vote.poll_id = found.id
    group by vote.option_id
  ) tally;

  for option_row in
    select
      option.id,
      coalesce(sport.name, option.label) as label,
      option.position,
      option.sport_id,
      option.starts_at,
      option.time_zone,
      coalesce(tally.votes, 0)::integer as vote_count
    from public.community_poll_options option
    left join public.sports sport on sport.id = option.sport_id
    left join (
      select vote.option_id, count(*)::integer as votes
      from public.community_poll_votes vote
      where vote.poll_id = found.id
      group by vote.option_id
    ) tally on tally.option_id = option.id
    where option.poll_id = found.id
    order by option.position
  loop
    options := options || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', option_row.id,
        'label', option_row.label,
        'position', option_row.position,
        'sport_id', option_row.sport_id,
        'starts_at', option_row.starts_at,
        'time_zone', option_row.time_zone,
        'vote_count', option_row.vote_count,
        'percent', case
          when participants = 0 then null
          else round(option_row.vote_count::numeric / participants * 100, 1)
        end,
        'leading', effective = 'closed'
          and participants > 0
          and option_row.vote_count = top_votes
          and top_votes > 0
      )
    );
  end loop;

  select coalesce(
    pg_catalog.jsonb_agg(option.id order by option.position),
    '[]'::jsonb
  ) into mine
  from public.community_poll_votes vote
  join public.community_poll_options option on option.id = vote.option_id
  where vote.poll_id = found.id
    and vote.user_id = p_actor;

  select profile.username into author_name
  from public.profiles profile
  where profile.id = found.created_by;

  return pg_catalog.jsonb_build_object(
    'id', found.id,
    'question', found.question,
    'description', found.description,
    'kind', found.kind,
    'selection_mode', found.selection_mode,
    'max_selections', found.max_selections,
    'status', found.status,
    'effective_status', effective,
    'closes_at', found.closes_at,
    'closed_at', found.closed_at,
    'created_at', found.created_at,
    'created_by_username', author_name,
    'participant_count', participants,
    'my_option_ids', mine,
    'can_close', effective = 'open' and (
      found.created_by = p_actor
      or coalesce(actor_role in ('owner', 'admin'), false)
    ),
    'can_cancel', effective = 'open' and (
      found.created_by = p_actor
      or coalesce(actor_role in ('owner', 'admin'), false)
    ),
    'options', options
  );
end;
$$;

create function private.require_poll_member(p_poll_id uuid, p_actor uuid)
returns public.community_polls
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.community_polls%rowtype;
  community public.communities%rowtype;
  actor_role text;
  member_status text;
begin
  select * into found
  from public.community_polls
  where id = p_poll_id
  for update;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  select * into community
  from public.communities
  where id = found.community_id;

  select member.status into member_status
  from public.community_members member
  where member.community_id = found.community_id
    and member.user_id = p_actor
  for update;

  if member_status is distinct from 'active' then
    actor_role := private.reject_private_stranger(
      community.id,
      community.visibility,
      p_actor
    );
    if actor_role is null then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;

  return found;
end;
$$;

create or replace function private.create_community_poll(
  p_slug text,
  p_question text,
  p_description text,
  p_kind text,
  p_selection_mode text,
  p_max_selections integer,
  p_closes_at timestamptz,
  p_options jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  community public.communities%rowtype;
  member_role text;
  question text;
  description text;
  option_count integer;
  max_selections integer;
  poll_id uuid;
  item jsonb;
  position integer := 0;
  label text;
  chosen_sport uuid;
  starts_at timestamptz;
  time_zone text;
  seen text[] := '{}';
  seen_sports uuid[] := '{}';
  seen_instants timestamptz[] := '{}';
begin
  actor := private.require_actor();
  community := private.lock_community(p_slug);

  select member.role into member_role
  from public.community_members member
  where member.community_id = community.id
    and member.user_id = actor
    and member.status = 'active'
  for update;
  if member_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.community_polls poll
    where poll.community_id = community.id
      and poll.created_by = actor
      and poll.created_at > pg_catalog.clock_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception 'too many polls' using errcode = 'P0001';
  end if;

  question := private.poll_question(p_question);
  description := private.poll_description(p_description);
  if p_kind not in ('general', 'sport', 'schedule', 'location') then
    raise exception 'invalid category' using errcode = 'P0001';
  end if;
  if p_selection_mode not in ('single', 'multiple') then
    raise exception 'invalid selection' using errcode = 'P0001';
  end if;
  if pg_catalog.jsonb_typeof(p_options) is distinct from 'array' then
    raise exception 'too few options' using errcode = 'P0001';
  end if;
  option_count := pg_catalog.jsonb_array_length(p_options);
  if option_count < 2 then
    raise exception 'too few options' using errcode = 'P0001';
  end if;
  if option_count > 10 then
    raise exception 'too many options' using errcode = 'P0001';
  end if;
  if p_selection_mode = 'single' then
    if p_max_selections is distinct from 1 then
      raise exception 'invalid selection' using errcode = 'P0001';
    end if;
    max_selections := 1;
  elsif p_max_selections is null
    or p_max_selections < 1
    or p_max_selections > option_count then
    raise exception 'invalid selection' using errcode = 'P0001';
  else
    max_selections := p_max_selections;
  end if;
  if p_closes_at is null
    or p_closes_at <= pg_catalog.clock_timestamp() + interval '15 minutes'
    or p_closes_at > pg_catalog.clock_timestamp() + interval '30 days' then
    raise exception 'invalid closing time' using errcode = 'P0001';
  end if;

  poll_id := pg_catalog.gen_random_uuid();
  perform pg_catalog.set_config('padre.poll_write', 'on', true);
  insert into public.community_polls (
    id,
    community_id,
    created_by,
    question,
    description,
    kind,
    selection_mode,
    max_selections,
    status,
    closes_at
  ) values (
    poll_id,
    community.id,
    actor,
    question,
    description,
    p_kind,
    p_selection_mode,
    max_selections,
    'open',
    p_closes_at
  );

  for item in
    select value
    from pg_catalog.jsonb_array_elements(p_options)
  loop
    position := position + 1;
    chosen_sport := null;
    starts_at := null;
    time_zone := null;

    if p_kind = 'sport' then
      begin
        chosen_sport := nullif(item ->> 'sport_id', '')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'invalid option' using errcode = 'P0001';
      end;
      if chosen_sport is null then
        raise exception 'invalid option' using errcode = 'P0001';
      end if;
      if chosen_sport = any (seen_sports) then
        raise exception 'duplicate option' using errcode = 'P0001';
      end if;
      select sport.name into label
      from public.sports sport
      join public.community_sports link
        on link.sport_id = sport.id
       and link.community_id = community.id
      where sport.id = chosen_sport;
      if label is null then
        raise exception 'sport not in community' using errcode = 'P0001';
      end if;
      seen_sports := seen_sports || chosen_sport;
    else
      label := private.poll_label(item ->> 'label');
      if p_kind = 'schedule' then
        begin
          if nullif(item ->> 'starts_at', '') is not null then
            starts_at := (item ->> 'starts_at')::timestamptz;
          end if;
        exception
          when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
            raise exception 'invalid schedule' using errcode = 'P0001';
        end;
        time_zone := nullif(pg_catalog.btrim(coalesce(item ->> 'time_zone', '')), '');
        if (starts_at is null) <> (time_zone is null) then
          raise exception 'invalid schedule' using errcode = 'P0001';
        end if;
        if time_zone is not null and not private.is_iana_time_zone(time_zone) then
          raise exception 'invalid schedule' using errcode = 'P0001';
        end if;
        if starts_at is not null and starts_at = any (seen_instants) then
          raise exception 'duplicate option' using errcode = 'P0001';
        end if;
        if starts_at is not null then
          seen_instants := seen_instants || starts_at;
        end if;
      elsif item ? 'sport_id'
        or nullif(item ->> 'starts_at', '') is not null
        or nullif(item ->> 'time_zone', '') is not null then
        raise exception 'invalid option' using errcode = 'P0001';
      end if;
    end if;

    if pg_catalog.lower(label) = any (seen) then
      raise exception 'duplicate option' using errcode = 'P0001';
    end if;
    seen := seen || pg_catalog.lower(label);

    insert into public.community_poll_options (
      poll_id,
      label,
      position,
      sport_id,
      starts_at,
      time_zone
    ) values (
      poll_id,
      label,
      position,
      chosen_sport,
      starts_at,
      time_zone
    );
  end loop;

  perform pg_catalog.set_config('padre.poll_write', 'off', true);
  return private.community_poll_json(poll_id, actor);
end;
$$;

create function private.list_community_polls(
  p_slug text,
  p_status text,
  p_page_limit integer,
  p_before_created_at timestamptz,
  p_before_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  community public.communities%rowtype;
  actor_role text;
  collected jsonb := '[]'::jsonb;
  seen integer := 0;
  poll_row record;
begin
  actor := private.require_actor();
  select * into community
  from public.communities
  where slug = p_slug;
  if community.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  actor_role := private.reject_private_stranger(
    community.id,
    community.visibility,
    actor
  );
  if actor_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed', 'cancelled')
    or p_page_limit is null
    or p_page_limit < 1
    or p_page_limit > 20
    or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid page' using errcode = 'P0001';
  end if;

  for poll_row in
    select poll.id
    from public.community_polls poll
    where poll.community_id = community.id
      and private.poll_effective_status(poll.status, poll.closes_at) = p_status
      and (
        p_before_created_at is null
        or (poll.created_at, poll.id) < (p_before_created_at, p_before_id)
      )
    order by poll.created_at desc, poll.id desc
    limit p_page_limit + 1
  loop
    seen := seen + 1;
    if seen <= p_page_limit then
      collected := collected || pg_catalog.jsonb_build_array(
        private.community_poll_json(poll_row.id, actor)
      );
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'polls', collected,
    'has_older', seen > p_page_limit
  );
end;
$$;

create function private.get_community_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.community_polls%rowtype;
  community public.communities%rowtype;
  actor_role text;
begin
  actor := private.require_actor();
  select * into found
  from public.community_polls
  where id = p_poll_id;
  if found.id is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;
  select * into community
  from public.communities
  where id = found.community_id;
  actor_role := private.reject_private_stranger(
    community.id,
    community.visibility,
    actor
  );
  if actor_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.community_poll_json(found.id, actor);
end;
$$;

create function private.vote_community_poll(
  p_poll_id uuid,
  p_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.community_polls%rowtype;
  requested integer;
begin
  actor := private.require_actor();
  found := private.require_poll_member(p_poll_id, actor);
  if p_option_ids is null then
    raise exception 'invalid option' using errcode = 'P0001';
  end if;
  if found.status = 'cancelled' then
    raise exception 'poll cancelled' using errcode = 'P0001';
  end if;
  if found.status <> 'open'
    or found.closes_at <= pg_catalog.clock_timestamp() then
    raise exception 'poll closed' using errcode = 'P0001';
  end if;

  requested := coalesce(pg_catalog.cardinality(p_option_ids), 0);
  if requested > found.max_selections then
    raise exception 'too many selections' using errcode = 'P0001';
  end if;
  if (
    select count(distinct option_id)
    from pg_catalog.unnest(p_option_ids) option_id
  ) <> requested then
    raise exception 'duplicate option' using errcode = 'P0001';
  end if;
  if (
    select count(*)
    from public.community_poll_options option
    where option.poll_id = found.id
      and option.id = any (p_option_ids)
  ) <> requested then
    raise exception 'option is not in poll' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.poll_write', 'on', true);
  delete from public.community_poll_votes vote
  where vote.poll_id = found.id
    and vote.user_id = actor;
  insert into public.community_poll_votes (poll_id, option_id, user_id)
  select found.id, option_id, actor
  from pg_catalog.unnest(p_option_ids) option_id;
  perform pg_catalog.set_config('padre.poll_write', 'off', true);
  return private.community_poll_json(found.id, actor);
end;
$$;

create function private.finish_community_poll(
  p_poll_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  found public.community_polls%rowtype;
  member_role text;
begin
  actor := private.require_actor();
  found := private.require_poll_member(p_poll_id, actor);
  select member.role into member_role
  from public.community_members member
  where member.community_id = found.community_id
    and member.user_id = actor
    and member.status = 'active';

  if found.created_by is distinct from actor
    and coalesce(member_role in ('owner', 'admin'), false) = false then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if found.status = 'cancelled' then
    if p_next_status = 'cancelled' then
      return private.community_poll_json(found.id, actor);
    end if;
    raise exception 'poll cancelled' using errcode = 'P0001';
  end if;
  if found.status = 'closed' then
    if p_next_status = 'closed' then
      return private.community_poll_json(found.id, actor);
    end if;
    raise exception 'poll closed' using errcode = 'P0001';
  end if;
  if p_next_status = 'cancelled'
    and found.closes_at <= pg_catalog.clock_timestamp() then
    raise exception 'poll closed' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('padre.poll_write', 'on', true);
  update public.community_polls
  set status = p_next_status,
      closed_at = pg_catalog.clock_timestamp(),
      closed_by = actor
  where id = found.id;
  perform pg_catalog.set_config('padre.poll_write', 'off', true);
  return private.community_poll_json(found.id, actor);
end;
$$;

create function private.close_community_poll(p_poll_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.finish_community_poll(p_poll_id, 'closed');
$$;

create function private.cancel_community_poll(p_poll_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.finish_community_poll(p_poll_id, 'cancelled');
$$;

create function public.create_community_poll(
  slug text,
  question text,
  description text,
  kind text,
  selection_mode text,
  max_selections integer,
  closes_at timestamptz,
  options jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_community_poll(
    slug,
    question,
    description,
    kind,
    selection_mode,
    max_selections,
    closes_at,
    options
  );
$$;

create function public.list_community_polls(
  slug text,
  status text,
  page_limit integer,
  before_created_at timestamptz,
  before_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_community_polls(
    slug,
    status,
    page_limit,
    before_created_at,
    before_id
  );
$$;

create function public.get_community_poll(poll_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_community_poll(poll_id);
$$;

create function public.vote_community_poll(poll_id uuid, option_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.vote_community_poll(poll_id, option_ids);
$$;

create function public.close_community_poll(poll_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.close_community_poll(poll_id);
$$;

create function public.cancel_community_poll(poll_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_community_poll(poll_id);
$$;

revoke all on function private.poll_label(text) from public, anon, authenticated;
revoke all on function private.poll_question(text) from public, anon, authenticated;
revoke all on function private.poll_description(text) from public, anon, authenticated;
revoke all on function private.poll_effective_status(text, timestamptz) from public, anon, authenticated;
revoke all on function private.protect_community_poll_write() from public, anon, authenticated;
revoke all on function private.community_poll_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.require_poll_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.finish_community_poll(uuid, text) from public, anon, authenticated;
revoke all on function private.create_community_poll(text, text, text, text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function private.list_community_polls(text, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.get_community_poll(uuid) from public, anon, authenticated;
revoke all on function private.vote_community_poll(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.close_community_poll(uuid) from public, anon, authenticated;
revoke all on function private.cancel_community_poll(uuid) from public, anon, authenticated;

revoke all on function public.create_community_poll(text, text, text, text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.list_community_polls(text, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_community_poll(uuid) from public, anon, authenticated;
revoke all on function public.vote_community_poll(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.close_community_poll(uuid) from public, anon, authenticated;
revoke all on function public.cancel_community_poll(uuid) from public, anon, authenticated;

grant execute on function private.create_community_poll(text, text, text, text, text, integer, timestamptz, jsonb) to authenticated;
grant execute on function private.list_community_polls(text, text, integer, timestamptz, uuid) to authenticated;
grant execute on function private.get_community_poll(uuid) to authenticated;
grant execute on function private.vote_community_poll(uuid, uuid[]) to authenticated;
grant execute on function private.close_community_poll(uuid) to authenticated;
grant execute on function private.cancel_community_poll(uuid) to authenticated;
grant execute on function public.create_community_poll(text, text, text, text, text, integer, timestamptz, jsonb) to authenticated;
grant execute on function public.list_community_polls(text, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_community_poll(uuid) to authenticated;
grant execute on function public.vote_community_poll(uuid, uuid[]) to authenticated;
grant execute on function public.close_community_poll(uuid) to authenticated;
grant execute on function public.cancel_community_poll(uuid) to authenticated;
